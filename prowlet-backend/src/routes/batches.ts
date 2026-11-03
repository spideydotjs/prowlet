import { Router } from "express";
import yazl from "yazl";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";

import { requireApprovedIssuer, requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errors";
import { getBatch, listBatches, retryBatch, startBatch } from "../services/batches";
import { presentCertificate } from "../services/certificates";
import { pool } from "../db/pool";

export const batchRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== "text/csv" && !file.originalname.toLowerCase().endsWith(".csv")) {
      callback(new HttpError(400, "INVALID_FILE_TYPE", "Upload a CSV file."));
      return;
    }
    callback(null, true);
  },
});
const recipientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(254),
});

batchRouter.use(requireAuth, requireApprovedIssuer);

batchRouter.post("/preview", upload.single("file"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "FILE_REQUIRED", "Upload a CSV file.");
  let rows: Record<string, string>[];
  try {
    rows = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      max_record_size: 10_000,
    }) as Record<string, string>[];
  } catch {
    throw new HttpError(400, "CSV_PARSE_ERROR", "Could not parse this CSV file.");
  }
  if (rows.length > 1000) throw new HttpError(400, "BATCH_TOO_LARGE", "CSV files may contain at most 1,000 recipients.");
  const preview = rows.slice(0, 1000).map((row, index) => {
    const parsed = recipientSchema.safeParse({ name: row.name, email: row.email });
    return parsed.success
      ? { row: index + 2, ...parsed.data, errors: [] }
      : { row: index + 2, name: row.name ?? "", email: row.email ?? "", errors: parsed.error.issues.map((item) => item.message) };
  });
  res.json({
    rows: preview,
    total: rows.length,
    valid: preview.filter((row) => row.errors.length === 0).length,
    invalid: preview.filter((row) => row.errors.length > 0).length,
  });
});

batchRouter.post("/", async (req, res) => {
  const input = z.object({
    recipients: z.array(recipientSchema).min(1).max(1000),
    course: z.string().trim().min(1).max(200),
    issuer: z.string().trim().min(1).max(160),
    template: z.string().trim().min(1).max(80),
    issueDate: z.string().date(),
  }).parse(req.body);
  const batch = await startBatch(req.user!.organizationId!, input);
  res.status(202).json(batch);
});

batchRouter.get("/", async (req, res) => {
  res.json(await listBatches(req.user!.organizationId!));
});

batchRouter.get("/:id", async (req, res) => {
  res.json(await getBatch(req.params.id!, req.user!.organizationId!));
});

batchRouter.post("/:id/retry", async (req, res) => {
  res.status(202).json(await retryBatch(req.params.id!, req.user!.organizationId!));
});

batchRouter.get("/:id/certificates", async (req, res) => {
  const batch = await getBatch(req.params.id!, req.user!.organizationId!);
  const result = await pool.query(
    `SELECT c.id, c.recipient_name, c.recipient_email, c.course_name, c.issuer_name,
       c.issuer_verified, c.status, c.issue_date, c.batch_id, c.revoked_at, c.revoke_reason,
       b.merkle_root, b.tx_signature
     FROM certificates c JOIN batches b ON b.id = c.batch_id
     WHERE c.batch_id = $1 AND b.organization_id = $2 ORDER BY c.created_at`,
    [batch.id, req.user!.organizationId],
  );
  res.json(result.rows.map(presentCertificate));
});

batchRouter.get("/:id/download", async (req, res, next) => {
  const batch = await getBatch(req.params.id!, req.user!.organizationId!);
  if (batch.status !== "CONFIRMED") throw new HttpError(409, "BATCH_NOT_READY", "Batch PDFs are not ready yet.");
  const result = await pool.query(
    "SELECT id, pdf_path FROM certificates WHERE batch_id = $1 AND organization_id = $2 AND pdf_path IS NOT NULL",
    [req.params.id, req.user!.organizationId],
  );
  if (!result.rowCount) throw new HttpError(404, "PDF_NOT_FOUND", "No PDFs are available for this batch.");
  const archive = new yazl.ZipFile();
  res.attachment(`${req.params.id}.zip`);
  archive.outputStream.on("error", next);
  archive.outputStream.pipe(res);
  for (const row of result.rows) archive.addFile(row.pdf_path, `${row.id}.pdf`);
  archive.end();
});
