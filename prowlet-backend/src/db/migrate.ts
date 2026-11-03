import { pool } from "./pool";

const migrations = `
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  domain TEXT,
  website TEXT,
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'issuer' CHECK (role IN ('admin', 'issuer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'GENERATING' CHECK (status IN ('GENERATING', 'BUILDING_TREE', 'SUBMITTING', 'CONFIRMED', 'FAILED')),
  progress_stage TEXT NOT NULL DEFAULT 'GENERATING',
  merkle_root TEXT,
  tx_signature TEXT,
  block_number BIGINT,
  certificate_count INTEGER NOT NULL,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  batch_id TEXT NOT NULL REFERENCES batches(id),
  recipient_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  course_name TEXT NOT NULL,
  issuer_name TEXT NOT NULL,
  issuer_verified BOOLEAN NOT NULL DEFAULT false,
  issue_date DATE NOT NULL,
  salt BYTEA NOT NULL,
  leaf_hash TEXT NOT NULL,
  merkle_proof JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('issued', 'pending', 'revoked')),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT,
  pdf_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS certificates_org_status_idx ON certificates(organization_id, status);
CREATE INDEX IF NOT EXISTS certificates_org_created_idx ON certificates(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS batches_org_created_idx ON batches(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS verification_events (
  id BIGSERIAL PRIMARY KEY,
  certificate_id TEXT REFERENCES certificates(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result TEXT NOT NULL
);
`;

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(migrations);
    await client.query("COMMIT");
    console.log("Database migrations complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
});
