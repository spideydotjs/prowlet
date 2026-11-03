import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

import { env } from "../config/env";
import { pool } from "./pool";
import { createCertificateSalt, createMerkleTree, hashCertificate } from "../services/merkle";
import { makeCertificatePdf } from "../services/certificates-pdf";

async function seed() {
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  const admin = await pool.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'
     RETURNING id`,
    [env.ADMIN_EMAIL, passwordHash],
  );
  const orgDefinitions = [
    { name: "Northline Learning Lab", email: "credentials@northline.example", status: "approved" },
    { name: "Fieldwork Institute", email: "admin@fieldwork.example", status: "approved" },
  ];
  const orgs: Array<{ id: string; name: string; email: string }> = [];
  for (const definition of orgDefinitions) {
    const org = await pool.query(
      `INSERT INTO organizations (name, email, domain, website, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status
       RETURNING id, name, email`,
      [definition.name, definition.email, definition.email.split("@")[1], `https://${definition.email.split("@")[1]}`, definition.status],
    );
    const hash = await bcrypt.hash("ProwletDemo-2026", 12);
    await pool.query(
      `INSERT INTO users (organization_id, email, password_hash, role)
       VALUES ($1, $2, $3, 'issuer')
       ON CONFLICT (email) DO UPDATE SET organization_id = EXCLUDED.organization_id, password_hash = EXCLUDED.password_hash`,
      [org.rows[0].id, definition.email, hash],
    );
    orgs.push(org.rows[0] as { id: string; name: string; email: string });
  }

  const existing = await pool.query("SELECT count(*)::int AS count FROM batches");
  if (existing.rows[0].count > 0) {
    console.log(`Seed users are ready; existing certificate data was preserved. Admin user: ${admin.rows[0].id}`);
    return;
  }

  const today = new Date();
  const dates = Array.from({ length: 32 }, (_, index) => {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - (index * 4));
    return date.toISOString().slice(0, 10);
  });
  const recipients = Array.from({ length: 32 }, (_, index) => ({
    id: `PRW-${today.getUTCFullYear()}-${String(index + 1).padStart(6, "0")}`,
    name: `Recipient ${String(index + 1).padStart(2, "0")}`,
    email: `recipient${index + 1}@example.org`,
    course: index % 2 ? "Applied Data Foundations" : "Community Leadership Workshop",
    issuer: index < 20 ? orgs[0]!.name : orgs[1]!.name,
    organizationId: index < 20 ? orgs[0]!.id : orgs[1]!.id,
    date: dates[index]!,
    salt: createCertificateSalt(),
  }));
  const groups = [7, 7, 6, 6, 6];
  let cursor = 0;
  for (const [groupIndex, count] of groups.entries()) {
    const selected = recipients.slice(cursor, cursor + count);
    cursor += count;
    const batch = `BATCH-SEED-${groupIndex + 1}`;
    const leaves = selected.map((recipient) => hashCertificate({
      id: recipient.id,
      recipient: recipient.name,
      email: recipient.email,
      course: recipient.course,
      issueDate: recipient.date,
      salt: recipient.salt,
    }));
    const tree = createMerkleTree(leaves);
    const root = tree.getRoot().toString("hex");
    const organizationId = selected[0]!.organizationId;
    await pool.query(
      `INSERT INTO batches (id, organization_id, name, template_id, status, progress_stage,
         merkle_root, tx_signature, certificate_count, confirmed_at)
       VALUES ($1, $2, $3, 'classic', 'CONFIRMED', 'CONFIRMED', $4, $5, $6, now())`,
      [batch, organizationId, "Prowlet sample credentials", root, `mock:${randomUUID().replace(/-/g, "")}`, selected.length],
    );
    for (const [offset, recipient] of selected.entries()) {
      const leaf = leaves[offset]!;
      const revoked = recipient.id.endsWith("000001");
      await pool.query(
        `INSERT INTO certificates
         (id, organization_id, batch_id, recipient_name, recipient_email, course_name, issuer_name,
          issuer_verified, issue_date, salt, leaf_hash, merkle_proof, status, revoked_at, revoke_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$11::jsonb,$12,$13,$14)`,
        [
          recipient.id,
          recipient.organizationId,
          batch,
          recipient.name,
          recipient.email,
          recipient.course,
          recipient.issuer,
          recipient.date,
          recipient.salt,
          leaf.toString("hex"),
          JSON.stringify(tree.getProof(leaf).map(({ data }) => data.toString("hex"))),
          revoked ? "revoked" : "issued",
          revoked ? new Date().toISOString() : null,
          revoked ? "Credential issued in error." : null,
        ],
      );
      const pdfPath = await makeCertificatePdf({
        id: recipient.id,
        recipient: recipient.name,
        course: recipient.course,
        issuer: recipient.issuer,
        issueDate: recipient.date,
      });
      await pool.query("UPDATE certificates SET pdf_path = $1 WHERE id = $2", [pdfPath, recipient.id]);
    }
  }
  console.log("Seed complete: 1 admin, 2 approved organizations, 5 batches, 32 certificates.");
}

seed()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
