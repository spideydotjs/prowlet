import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { pool } from "../src/db/pool";
import { hashCertificate, verifyMerkleProof } from "../src/services/merkle";

const app = createApp();
const email = `api-${randomUUID()}@prowlet.test`;
let organizationId = "";
let secondOrganizationId = "";
let token = "";
let certificateId = "";

describe("Prowlet API with PostgreSQL and mock Solana mode", () => {
  beforeAll(async () => {
    await pool.query("SELECT 1");
  });

  afterAll(async () => {
    if (organizationId) {
      await pool.query("DELETE FROM verification_events WHERE certificate_id IN (SELECT id FROM certificates WHERE organization_id = $1)", [organizationId]);
      await pool.query("DELETE FROM certificates WHERE organization_id = $1", [organizationId]);
      await pool.query("DELETE FROM batches WHERE organization_id = $1", [organizationId]);
      await pool.query("DELETE FROM users WHERE organization_id = $1", [organizationId]);
      await pool.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
    }
    if (secondOrganizationId) {
      await pool.query("DELETE FROM users WHERE organization_id = $1", [secondOrganizationId]);
      await pool.query("DELETE FROM organizations WHERE id = $1", [secondOrganizationId]);
    }
    await pool.end();
  });

  it("registers an organization, limits access until approval, then issues and verifies a certificate", async () => {
    const registration = await request(app).post("/api/auth/register").send({
      name: "API Test Organization",
      email,
      website: "https://prowlet.test",
      password: "A-secure-test-password",
    }).expect(201);
    organizationId = registration.body.id;
    expect(registration.body.status).toBe("pending verification");

    const pendingLogin = await request(app).post("/api/auth/login").send({
      email,
      password: "A-secure-test-password",
    }).expect(200);
    await request(app)
      .get("/api/stats/overview")
      .set("Authorization", `Bearer ${pendingLogin.body.token}`)
      .expect(403);

    await pool.query("UPDATE organizations SET status = 'approved' WHERE id = $1", [organizationId]);
    const approvedLogin = await request(app).post("/api/auth/login").send({
      email,
      password: "A-secure-test-password",
    }).expect(200);
    token = approvedLogin.body.token;
    expect(approvedLogin.body.id).toBe(organizationId);

    const preview = await request(app).post("/api/batches/preview")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("name,email\nAvery Sample,avery@example.org\nInvalid Row,not-an-email\n"), {
        filename: "preview.csv",
        contentType: "text/csv",
      })
      .expect(200);
    expect(preview.body.valid).toBe(1);
    expect(preview.body.invalid).toBe(1);

    const submission = await request(app).post("/api/batches")
      .set("Authorization", `Bearer ${token}`)
      .send({
        recipients: [{ name: "Sample Recipient", email: "sample@example.org" }],
        course: "API Integration",
        issuer: "API Test Organization",
        template: "classic",
        issueDate: "2026-04-15",
      })
      .expect(202);
    const batchId = submission.body.batchId as string;
    let batchStatus = "";
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const progress = await request(app).get(`/api/batches/${batchId}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      batchStatus = progress.body.status;
      if (batchStatus === "CONFIRMED" || batchStatus === "FAILED") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(batchStatus).toBe("CONFIRMED");

    await pool.query("UPDATE batches SET status = 'FAILED', progress_stage = 'FAILED' WHERE id = $1", [batchId]);
    await pool.query("UPDATE certificates SET status = 'pending' WHERE batch_id = $1", [batchId]);
    await request(app).post(`/api/batches/${batchId}/retry`)
      .set("Authorization", "Bearer " + token)
      .expect(202);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const progress = await request(app).get(`/api/batches/${batchId}`)
        .set("Authorization", "Bearer " + token)
        .expect(200);
      if (progress.body.status === "CONFIRMED") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const retried = await request(app).get(`/api/batches/${batchId}`)
      .set("Authorization", "Bearer " + token)
      .expect(200);
    expect(retried.body.status).toBe("CONFIRMED");

    await request(app).get(`/api/batches/${batchId}/download`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect("Content-Type", /application\/zip/);

    const issued = await request(app).get(`/api/batches/${batchId}/certificates`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    certificateId = issued.body[0].id;
    const stored = await pool.query(
      `SELECT c.leaf_hash, c.merkle_proof, c.salt, c.recipient_name, c.recipient_email,
        c.course_name, c.issue_date, b.merkle_root
       FROM certificates c JOIN batches b ON b.id = c.batch_id WHERE c.id = $1`,
      [certificateId],
    );
    const storedLeaf = hashCertificate({
      id: certificateId,
      recipient: stored.rows[0].recipient_name,
      email: stored.rows[0].recipient_email,
      course: stored.rows[0].course_name,
      issueDate: stored.rows[0].issue_date instanceof Date
        ? stored.rows[0].issue_date.toISOString().slice(0, 10)
        : String(stored.rows[0].issue_date).slice(0, 10),
      salt: stored.rows[0].salt,
    });
    expect(storedLeaf.toString("hex")).toBe(stored.rows[0].leaf_hash);
    expect(verifyMerkleProof(
      Buffer.from(stored.rows[0].leaf_hash, "hex"),
      (stored.rows[0].merkle_proof as string[]).map((proof) => Buffer.from(proof, "hex")),
      Buffer.from(stored.rows[0].merkle_root, "hex"),
    )).toBe(true);
    const verified = await request(app).get(`/api/verify/${certificateId}`).expect(200);
    expect(verified.body.status).toBe("verified");
    expect(verified.body.certificate.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    await request(app).get(`/api/certificates/${certificateId}/pdf`)
      .expect(200)
      .expect("Content-Type", /application\/pdf/);
    const pdf = await pool.query("SELECT pdf_path FROM certificates WHERE id = $1", [certificateId]);
    const uploadedPdf = await request(app).post("/api/verify/upload")
      .attach("file", pdf.rows[0].pdf_path)
      .expect(200);
    expect(uploadedPdf.body.status).toBe("verified");

    await request(app).post(`/api/certificates/${certificateId}/revoke`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Test revocation" })
      .expect(200);
    const revoked = await request(app).get(`/api/verify/${certificateId}`).expect(200);
    expect(revoked.body.status).toBe("revoked");

    const otherOrg = await request(app).post("/api/auth/register").send({
      name: "Another Test Organization",
      email: `other-${randomUUID()}@prowlet.test`,
      website: "https://other.prowlet.test",
      password: "A-secure-test-password",
    }).expect(201);
    secondOrganizationId = otherOrg.body.id;
    await pool.query("UPDATE organizations SET status = 'approved' WHERE id = $1", [secondOrganizationId]);
    const otherLogin = await request(app).post("/api/auth/login").send({
      email: otherOrg.body.email,
      password: "A-secure-test-password",
    }).expect(200);
    await request(app).get(`/api/certificates/${certificateId}`)
      .set("Authorization", `Bearer ${otherLogin.body.token}`)
      .expect(404);
    await request(app).get("/api/openapi.json").expect(200);
    await request(app).get("/api/verify/invalid").expect(200).expect((response) => {
      expect(response.body.status).toBe("tampered");
    });
    await pool.query("DELETE FROM users WHERE organization_id = $1", [secondOrganizationId]);
    await pool.query("DELETE FROM organizations WHERE id = $1", [secondOrganizationId]);
    secondOrganizationId = "";
  }, 30_000);

  it("rejects missing bearer credentials", async () => {
    await request(app).get("/api/certificates").expect(401);
  });
});
