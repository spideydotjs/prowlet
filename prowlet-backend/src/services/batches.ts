import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { env } from "../config/env";
import { pool } from "../db/pool";
import { HttpError } from "../middleware/errors";
import { createCertificateSalt, createMerkleTree, hashCertificate } from "./merkle";
import { makeCertificatePdf } from "./certificates-pdf";
import { solanaRegistry } from "./solana";

export type RecipientInput = { name: string; email: string };
export type IssueBatchInput = {
  recipients: RecipientInput[];
  course: string;
  issuer: string;
  template: string;
  issueDate: string;
};

function batchId() {
  return `BATCH-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function certificateId() {
  return `PRW-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export async function startBatch(organizationId: string, input: IssueBatchInput) {
  if (!input.recipients.length || input.recipients.length > env.MAX_BATCH_SIZE) {
    throw new HttpError(400, "INVALID_BATCH_SIZE", `Batch size must be between 1 and ${env.MAX_BATCH_SIZE}.`);
  }
  const id = batchId();
  await pool.query(
    `INSERT INTO batches (id, organization_id, name, template_id, certificate_count)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, organizationId, input.course, input.template, input.recipients.length],
  );
  void processBatch(id, organizationId, input).catch((error: unknown) => markBatchFailed(id, error));
  return { id, batchId: id, status: "GENERATING", progress: 5 };
}

async function processBatch(id: string, organizationId: string, input: IssueBatchInput) {
  const organization = await pool.query("SELECT name, status FROM organizations WHERE id = $1", [organizationId]);
  if (!organization.rowCount || organization.rows[0].status !== "approved") {
    throw new HttpError(403, "ORGANIZATION_NOT_APPROVED", "Organization is not approved.");
  }

  const certs = input.recipients.map((recipient) => {
    const certId = certificateId();
    const salt = createCertificateSalt();
    const leaf = hashCertificate({
      id: certId,
      recipient: recipient.name,
      email: recipient.email,
      course: input.course,
      issueDate: input.issueDate,
      salt,
    });
    return { id: certId, recipient, salt, leaf };
  });

  const tree = createMerkleTree(certs.map(({ leaf }) => leaf));
  const root = tree.getRoot();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE batches SET status = 'BUILDING_TREE', progress_stage = 'BUILDING_TREE', merkle_root = $1 WHERE id = $2",
      [root.toString("hex"), id],
    );
    for (const cert of certs) {
      const proof = tree.getProof(cert.leaf).map(({ data }) => data.toString("hex"));
      await client.query(
        `INSERT INTO certificates
         (id, organization_id, batch_id, recipient_name, recipient_email, course_name,
          issuer_name, issuer_verified, issue_date, salt, leaf_hash, merkle_proof, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11::jsonb,'pending')`,
        [
          cert.id,
          organizationId,
          id,
          cert.recipient.name,
          cert.recipient.email,
          input.course,
          input.issuer || organization.rows[0].name,
          input.issueDate,
          cert.salt,
          cert.leaf.toString("hex"),
          JSON.stringify(proof),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const storageDir = path.resolve(env.UPLOAD_DIR, "certificates");
  await mkdir(storageDir, { recursive: true });
  for (const cert of certs) {
    const filePath = await makeCertificatePdf({
      id: cert.id,
      recipient: cert.recipient.name,
      course: input.course,
      issuer: input.issuer || organization.rows[0].name,
      issueDate: input.issueDate,
    });
    await pool.query("UPDATE certificates SET pdf_path = $1 WHERE id = $2", [filePath, cert.id]);
  }

  await pool.query(
    "UPDATE batches SET status = 'SUBMITTING', progress_stage = 'SUBMITTING' WHERE id = $1",
    [id],
  );
  let txSignature: string;
  let slot: number | null = null;
  if (env.BLOCKCHAIN_MODE === "solana") {
    const result = await solanaRegistry.registerBatch(root, certs.length, id, organizationId);
    txSignature = result.signature;
    slot = result.slot;
  } else {
    txSignature = `mock:${randomBytes(32).toString("hex")}`;
  }

  await pool.query(
    `UPDATE batches SET status = 'CONFIRMED', progress_stage = 'CONFIRMED',
     tx_signature = $1, block_number = $2, confirmed_at = now() WHERE id = $3`,
    [txSignature, slot, id],
  );
  await pool.query("UPDATE certificates SET status = 'issued' WHERE batch_id = $1", [id]);
}

async function markBatchFailed(id: string, error: unknown) {
  console.error("Certificate batch failed:", error);
  await pool.query(
    "UPDATE batches SET status = 'FAILED', progress_stage = 'FAILED', failure_reason = $1 WHERE id = $2",
    [error instanceof Error ? error.message.slice(0, 500) : "Batch processing failed.", id],
  );
  await pool.query("UPDATE certificates SET status = 'pending' WHERE batch_id = $1", [id]);
}

async function processSavedBatch(batchId: string, organizationId: string) {
  try {
    const batchResult = await pool.query(
      `SELECT b.merkle_root, o.name AS organization_name, o.status AS organization_status
       FROM batches b JOIN organizations o ON o.id = b.organization_id
       WHERE b.id = $1 AND b.organization_id = $2`,
      [batchId, organizationId],
    );
    const batch = batchResult.rows[0];
    if (!batch || batch.organization_status !== "approved") throw new Error("Organization is not approved.");
    if (!batch.merkle_root) throw new Error("The failed batch has no Merkle root to retry.");
    const root = Buffer.from(batch.merkle_root, "hex");
    const certificates = await pool.query(
      `SELECT id, recipient_name, course_name, issuer_name, issue_date
       FROM certificates WHERE batch_id = $1 AND organization_id = $2`,
      [batchId, organizationId],
    );
    if (!certificates.rowCount) throw new Error("No saved certificate records are available for retry.");

    await pool.query(
      "UPDATE batches SET status = 'BUILDING_TREE', progress_stage = 'BUILDING_TREE', failure_reason = NULL WHERE id = $1",
      [batchId],
    );
    for (const certificate of certificates.rows) {
      const pdfPath = await makeCertificatePdf({
        id: certificate.id,
        recipient: certificate.recipient_name,
        course: certificate.course_name,
        issuer: certificate.issuer_name || batch.organization_name,
        issueDate: String(certificate.issue_date).slice(0, 10),
      });
      await pool.query(
        "UPDATE certificates SET pdf_path = $1, status = 'pending' WHERE id = $2",
        [pdfPath, certificate.id],
      );
    }

    await pool.query(
      "UPDATE batches SET status = 'SUBMITTING', progress_stage = 'SUBMITTING' WHERE id = $1",
      [batchId],
    );
    let txSignature: string;
    let slot: number | null = null;
    if (env.BLOCKCHAIN_MODE === "solana") {
      const result = await solanaRegistry.registerBatch(root, certificates.rows.length, batchId, organizationId);
      txSignature = result.signature;
      slot = result.slot;
    } else {
      txSignature = `mock:${randomBytes(32).toString("hex")}`;
    }
    await pool.query(
      `UPDATE batches SET status = 'CONFIRMED', progress_stage = 'CONFIRMED',
       tx_signature = $1, block_number = $2, confirmed_at = now() WHERE id = $3`,
      [txSignature, slot, batchId],
    );
    await pool.query("UPDATE certificates SET status = 'issued' WHERE batch_id = $1", [batchId]);
  } catch (error) {
    await markBatchFailed(batchId, error);
  }
}

export async function getBatch(id: string, organizationId: string) {
  const result = await pool.query(
    `SELECT id, name, template_id, status, progress_stage, merkle_root, tx_signature,
            block_number, certificate_count, failure_reason, created_at, confirmed_at
     FROM batches WHERE id = $1 AND organization_id = $2`,
    [id, organizationId],
  );
  if (!result.rowCount) throw new HttpError(404, "BATCH_NOT_FOUND", "Batch not found.");
  const batch = result.rows[0];
  return {
    ...batch,
    batchId: batch.id,
    progress: batch.status === "CONFIRMED" ? 100 : batch.status === "FAILED" ? 0 : 50,
    transactionHash: batch.tx_signature,
  };
}

export async function listBatches(organizationId: string) {
  const result = await pool.query(
    `SELECT id, name, template_id, status, progress_stage, merkle_root, tx_signature,
            certificate_count, created_at
     FROM batches WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [organizationId],
  );
  return result.rows;
}

export async function retryBatch(id: string, organizationId: string) {
  const batch = await pool.query(
    `SELECT id, organization_id, name, template_id, certificate_count, status FROM batches
     WHERE id = $1 AND organization_id = $2`,
    [id, organizationId],
  );
  if (!batch.rowCount) throw new HttpError(404, "BATCH_NOT_FOUND", "Batch not found.");
  if (batch.rows[0].status !== "FAILED") throw new HttpError(409, "BATCH_NOT_FAILED", "Only failed batches can be retried.");
  const certificates = await pool.query(
    "SELECT count(*)::int AS count FROM certificates WHERE batch_id = $1 AND organization_id = $2",
    [id, organizationId],
  );
  if (!certificates.rows[0].count) {
    throw new HttpError(409, "BATCH_NOT_RETRYABLE", "No saved certificate records are available; submit the batch again.");
  }
  await pool.query(
    "UPDATE batches SET status = 'GENERATING', progress_stage = 'GENERATING', failure_reason = NULL WHERE id = $1",
    [id],
  );
  void processSavedBatch(id, organizationId);
  return { id, batchId: id, status: "GENERATING", progress: 5 };
}
