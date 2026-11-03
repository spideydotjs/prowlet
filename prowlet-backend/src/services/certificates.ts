import { PublicKey } from "@solana/web3.js";

import { env } from "../config/env";
import { pool } from "../db/pool";
import { HttpError } from "../middleware/errors";
import { hashCertificate, verifyMerkleProof } from "./merkle";
import { solanaRegistry } from "./solana";

const certificateSelect = `
  SELECT c.id, c.recipient_name, c.recipient_email, c.course_name, c.issuer_name,
         c.issuer_verified, c.status, c.issue_date, c.batch_id, c.revoked_at,
         c.revoke_reason, c.leaf_hash, c.merkle_proof, c.pdf_path, c.salt,
         b.merkle_root, b.tx_signature, b.status AS batch_status,
         b.organization_id
  FROM certificates c JOIN batches b ON b.id = c.batch_id`;

export function presentCertificate(row: Record<string, unknown>) {
  return {
    id: row.id,
    recipient: row.recipient_name,
    email: row.recipient_email,
    course: row.course_name,
    issuer: row.issuer_name,
    issuerVerified: row.issuer_verified,
    status: row.status,
    issueDate: typeof row.issue_date === "string"
      ? row.issue_date.slice(0, 10)
      : (row.issue_date as Date).toISOString().slice(0, 10),
    network: `Solana ${env.SOLANA_CLUSTER === "mainnet-beta" ? "Mainnet" : env.SOLANA_CLUSTER[0]!.toUpperCase() + env.SOLANA_CLUSTER.slice(1)}${env.BLOCKCHAIN_MODE === "mock" ? " (mock)" : ""}`,
    transactionHash: row.tx_signature ?? "",
    merkleRoot: row.merkle_root ?? "",
    batchId: row.batch_id,
    ...(row.revoked_at ? { revokedAt: new Date(row.revoked_at as Date).toISOString().slice(0, 10) } : {}),
    ...(row.revoke_reason ? { revokeReason: row.revoke_reason } : {}),
  };
}

export async function listCertificates(
  organizationId: string,
  options: { search?: string; status?: string; page: number; limit: number },
) {
  const values: unknown[] = [organizationId];
  const filters = ["b.organization_id = $1"];
  if (options.status) {
    values.push(options.status);
    filters.push(`c.status = $${values.length}`);
  }
  if (options.search) {
    values.push(`%${options.search}%`);
    filters.push(`(c.id ILIKE $${values.length} OR c.recipient_name ILIKE $${values.length} OR c.course_name ILIKE $${values.length})`);
  }
  const where = filters.join(" AND ");
  const count = await pool.query(
    `SELECT count(*)::int AS total FROM certificates c JOIN batches b ON b.id = c.batch_id WHERE ${where}`,
    values,
  );
  values.push(options.limit, (options.page - 1) * options.limit);
  const result = await pool.query(
    `${certificateSelect} WHERE ${where}
     ORDER BY c.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return {
    items: result.rows.map(presentCertificate),
    page: options.page,
    limit: options.limit,
    total: count.rows[0].total as number,
  };
}

export async function getCertificate(id: string, organizationId?: string) {
  const values: unknown[] = [id];
  const scope = organizationId ? `AND b.organization_id = $2` : "";
  if (organizationId) values.push(organizationId);
  const result = await pool.query(`${certificateSelect} WHERE c.id = $1 ${scope}`, values);
  return result.rows[0] ?? null;
}

export async function verifyCertificate(id: string) {
  const certId = id.trim().toUpperCase();
  if (!/^PRW-[A-Z0-9-]{4,80}$/.test(certId)) {
    return { status: "tampered", certificate: null };
  }
  const row = await getCertificate(certId);
  if (!row) {
    await pool.query("INSERT INTO verification_events (certificate_id, result) VALUES (NULL, 'not-found')");
    return { status: "not-found", certificate: null };
  }
  const leaf = Buffer.from(String(row.leaf_hash), "hex");
  const root = Buffer.from(String(row.merkle_root ?? ""), "hex");
  const proof = (row.merkle_proof as string[]).map((value) => Buffer.from(value, "hex"));
  const recomputedLeaf = hashCertificate({
    id: certId,
    recipient: String(row.recipient_name),
    email: String(row.recipient_email),
    course: String(row.course_name),
    issueDate: row.issue_date instanceof Date
      ? row.issue_date.toISOString().slice(0, 10)
      : String(row.issue_date).slice(0, 10),
    salt: row.salt as Buffer,
  });
  const valid = root.length === 32
    && recomputedLeaf.equals(leaf)
    && verifyMerkleProof(leaf, proof, root);
  let status: string = valid ? String(row.status) : "tampered";
  if (valid && row.batch_status === "CONFIRMED" && env.BLOCKCHAIN_MODE === "solana") {
    const chainResult = await solanaRegistry.verify(root, leaf, proof);
    if (!chainResult.valid) status = "tampered";
    else status = chainResult.revoked ? "revoked" : "issued";
  }
  await pool.query(
    "INSERT INTO verification_events (certificate_id, result) VALUES ($1, $2)",
    [certId, status],
  );
  return {
    status: status === "issued" ? "verified" : status === "revoked" ? "revoked" : status === "pending" ? "pending" : status,
    certificate: presentCertificate(row),
    proof: valid
      ? {
          leafHash: leaf.toString("hex"),
          siblings: proof.map((sibling) => sibling.toString("hex")),
          merkleRoot: root.toString("hex"),
        }
      : null,
  };
}

export async function revokeCertificate(id: string, organizationId: string, reason: string) {
  const row = await getCertificate(id, organizationId);
  if (!row) throw new HttpError(404, "CERTIFICATE_NOT_FOUND", "Certificate not found.");
  if (row.status === "revoked") return presentCertificate(row);
  if (row.status !== "issued") throw new HttpError(409, "CERTIFICATE_NOT_ISSUED", "Only issued certificates can be revoked.");
  if (row.batch_status !== "CONFIRMED" || !row.merkle_root) {
    throw new HttpError(409, "BATCH_NOT_CONFIRMED", "Only confirmed certificates can be revoked.");
  }
  const root = Buffer.from(String(row.merkle_root), "hex");
  const leaf = Buffer.from(String(row.leaf_hash), "hex");
  if (env.BLOCKCHAIN_MODE === "solana") {
    await solanaRegistry.revoke(root, leaf);
  }
  const result = await pool.query(
    `UPDATE certificates SET status = 'revoked', revoked_at = now(), revoke_reason = $1
     WHERE id = $2 RETURNING *`,
    [reason.trim() || "Revoked by issuing organization.", id],
  );
  const refreshed = await getCertificate(id, organizationId);
  return presentCertificate(refreshed ?? result.rows[0]);
}

export async function certificateProof(id: string, organizationId?: string) {
  const row = await getCertificate(id, organizationId);
  if (!row) throw new HttpError(404, "CERTIFICATE_NOT_FOUND", "Certificate not found.");
  return {
    certificate: presentCertificate(row),
    leafHash: row.leaf_hash,
    merkleProof: row.merkle_proof,
    merkleRoot: row.merkle_root,
    network: env.SOLANA_CLUSTER,
    transactionHash: row.tx_signature,
    programId: new PublicKey(env.PROGRAM_ID).toBase58(),
  };
}
