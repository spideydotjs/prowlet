import { Router } from "express";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { z } from "zod";

import { getCurrentUser, registerOrganization, signIn } from "../services/auth";
import { requireAuth } from "../middleware/auth";
import { env } from "../config/env";
import { pool } from "../db/pool";
import { HttpError } from "../middleware/errors";

export const authRouter = Router();
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) {
      callback(new HttpError(400, "INVALID_FILE_TYPE", "Logo must be a PNG, JPEG, or WebP image."));
      return;
    }
    callback(null, true);
  },
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  website: z.string().url().max(2048),
  domain: z.string().trim().max(253).optional(),
  password: z.string().min(8).max(128),
});

authRouter.post("/register", logoUpload.single("logo"), async (req, res) => {
  const input = registerSchema.parse(req.body);
  const file = req.file;
  let extension: string | undefined;
  if (file) {
    if (file.mimetype === "image/png" && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) extension = "png";
    if (file.mimetype === "image/jpeg" && file.buffer[0] === 255 && file.buffer[1] === 216 && file.buffer[2] === 255) extension = "jpg";
    if (file.mimetype === "image/webp" && file.buffer.toString("ascii", 0, 4) === "RIFF" && file.buffer.toString("ascii", 8, 12) === "WEBP") extension = "webp";
    if (!extension) throw new HttpError(400, "INVALID_IMAGE", "The uploaded file is not a valid supported image.");
  }
  const organization = await registerOrganization(input);
  if (file && extension) {
    const directory = path.resolve(env.UPLOAD_DIR, "logos");
    const filename = `${randomUUID()}.${extension}`;
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), file.buffer, { mode: 0o600 });
    await pool.query("UPDATE organizations SET logo_url = $1 WHERE id = $2", [`/uploads/logos/${filename}`, organization.id]);
    organization.logo_url = `/uploads/logos/${filename}`;
  }
  res.status(201).json({ ...organization, status: "pending verification" });
});

authRouter.post("/login", async (req, res) => {
  const input = z.object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(128),
  }).parse(req.body);
  res.json(await signIn(input.email, input.password));
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json(await getCurrentUser(req.user!.id));
});
