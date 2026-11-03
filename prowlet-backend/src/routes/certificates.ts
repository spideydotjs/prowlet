import { Router } from "express";
import { readFile } from "node:fs/promises";
import QRCode from "qrcode";
import { z } from "zod";

import { requireApprovedIssuer, requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errors";
import {
  certificateProof,
  getCertificate,
  listCertificates,
  presentCertificate,
  revokeCertificate,
} from "../services/certificates";
import { env } from "../config/env";

export const certificateRouter = Router();
certificateRouter.use(requireAuth, requireApprovedIssuer);

certificateRouter.get("/", async (req, res) => {
  const query = z.object({
    search: z.string().max(120).optional(),
    status: z.enum(["issued", "pending", "revoked"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }).parse(req.query);
  res.json(await listCertificates(req.user!.organizationId!, query));
});

certificateRouter.post("/:id/revoke", async (req, res) => {
  const input = z.object({ reason: z.string().trim().max(500).default("") }).parse(req.body);
  res.json(await revokeCertificate(req.params.id!, req.user!.organizationId!, input.reason));
});

certificateRouter.get("/:id/proof", async (req, res) => {
  res.json(await certificateProof(req.params.id!, req.user!.organizationId!));
});

certificateRouter.get("/:id", async (req, res) => {
  const row = await getCertificate(req.params.id!, req.user!.organizationId!);
  if (!row) throw new HttpError(404, "CERTIFICATE_NOT_FOUND", "Certificate not found.");
  res.json(presentCertificate(row));
});

export const publicCertificateRouter = Router();
publicCertificateRouter.get("/:id/pdf", async (req, res) => {
  const row = await getCertificate(req.params.id!);
  if (!row?.pdf_path) throw new HttpError(404, "PDF_NOT_FOUND", "Certificate PDF not found.");
  res.type("application/pdf").attachment(`${row.id}.pdf`).send(await readFile(row.pdf_path));
});
publicCertificateRouter.get("/:id/qr", async (req, res) => {
  if (!(await getCertificate(req.params.id!))) throw new HttpError(404, "CERTIFICATE_NOT_FOUND", "Certificate not found.");
  const png = await QRCode.toBuffer(`${env.FRONTEND_PUBLIC_URL}/verify/${req.params.id}`, { type: "png" });
  res.type("image/png").send(png);
});
