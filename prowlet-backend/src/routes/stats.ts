import { Router } from "express";

import { requireApprovedIssuer, requireAuth } from "../middleware/auth";
import { env } from "../config/env";
import { pool } from "../db/pool";

export const statsRouter = Router();
statsRouter.use(requireAuth, requireApprovedIssuer);

statsRouter.get("/overview", async (req, res) => {
  const organizationId = req.user!.organizationId!;
  const [totals, monthly, recent, batches] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS total,
        count(*) FILTER (WHERE c.status = 'revoked')::int AS revoked,
        count(*) FILTER (WHERE c.status = 'issued')::int AS issued,
        count(*) FILTER (WHERE c.created_at >= date_trunc('month', now()))::int AS this_month
       FROM certificates c JOIN batches b ON b.id = c.batch_id WHERE b.organization_id = $1`,
      [organizationId],
    ),
    pool.query(
      `SELECT to_char(date_trunc('month', c.created_at), 'YYYY-MM') AS month, count(*)::int AS count
       FROM certificates c JOIN batches b ON b.id = c.batch_id
       WHERE b.organization_id = $1 AND c.created_at >= now() - interval '11 months'
       GROUP BY 1 ORDER BY 1`,
      [organizationId],
    ),
    pool.query(
      `SELECT c.id, c.recipient_name, c.recipient_email, c.course_name, c.issuer_name,
        c.issuer_verified, c.status, c.issue_date, c.batch_id, c.revoked_at, c.revoke_reason,
        b.merkle_root, b.tx_signature
       FROM certificates c JOIN batches b ON b.id = c.batch_id
       WHERE b.organization_id = $1 ORDER BY c.created_at DESC LIMIT 6`,
      [organizationId],
    ),
    pool.query(
      `SELECT id, name, certificate_count AS count, status AS "status"
       FROM batches WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [organizationId],
    ),
  ]);
  const total = totals.rows[0].total as number;
  const chartByMonth = new Map<string, number>(
    monthly.rows.map((row) => [row.month as string, row.count as number] as const),
  );
  const chart: number[] = [];
  for (let offset = 11; offset >= 0; offset--) {
    const date = new Date();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - offset);
    chart.push(chartByMonth.get(date.toISOString().slice(0, 7)) ?? 0);
  }
  res.json({
    totalIssued: total,
    thisMonth: totals.rows[0].this_month,
    revoked: totals.rows[0].revoked,
    verifications: (await pool.query(
      `SELECT count(*)::int AS count FROM verification_events e
       JOIN certificates c ON c.id = e.certificate_id
       JOIN batches b ON b.id = c.batch_id WHERE b.organization_id = $1`,
      [organizationId],
    )).rows[0].count,
    recent: recent.rows.map((row) => ({
      id: row.id,
      recipient: row.recipient_name,
      email: row.recipient_email,
      course: row.course_name,
      issuer: row.issuer_name,
      issuerVerified: row.issuer_verified,
      status: row.status,
      issueDate: new Date(row.issue_date).toISOString().slice(0, 10),
      network: `Solana ${env.SOLANA_CLUSTER === "mainnet-beta" ? "Mainnet" : env.SOLANA_CLUSTER[0]!.toUpperCase() + env.SOLANA_CLUSTER.slice(1)}${env.BLOCKCHAIN_MODE === "mock" ? " (mock)" : ""}`,
      transactionHash: row.tx_signature ?? "",
      merkleRoot: row.merkle_root ?? "",
      batchId: row.batch_id,
      ...(row.revoked_at ? { revokedAt: new Date(row.revoked_at).toISOString().slice(0, 10) } : {}),
      ...(row.revoke_reason ? { revokeReason: row.revoke_reason } : {}),
    })),
    batches: batches.rows.map((row) => ({ ...row, status: row.status === "CONFIRMED" ? "Anchored" : row.status })),
    chart,
  });
});
