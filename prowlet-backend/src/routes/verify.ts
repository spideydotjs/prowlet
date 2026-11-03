import { Router } from "express";
import multer from "multer";
import { PDFDocument } from "pdf-lib";

import { HttpError } from "../middleware/errors";
import { verifyCertificate } from "../services/certificates";

export const verificationRouter = Router();
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== "application/pdf") {
      callback(new HttpError(400, "INVALID_FILE_TYPE", "Upload a PDF certificate."));
      return;
    }
    callback(null, true);
  },
});

verificationRouter.get("/:certificateId", async (req, res) => {
  res.json(await verifyCertificate(req.params.certificateId!));
});

verificationRouter.post("/upload", pdfUpload.single("file"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "FILE_REQUIRED", "Upload a PDF certificate.");
  let id = "";
  try {
    const pdf = await PDFDocument.load(req.file.buffer);
    id = (pdf.getKeywords() ?? "").match(/PRW-[A-Z0-9-]+/i)?.[0] ?? "";
  } catch {
    throw new HttpError(400, "INVALID_PDF", "This file is not a readable PDF certificate.");
  }
  if (!id) throw new HttpError(400, "CERTIFICATE_ID_MISSING", "The PDF does not contain a Prowlet certificate ID.");
  res.json(await verifyCertificate(id));
});
