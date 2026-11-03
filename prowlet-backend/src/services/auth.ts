import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { env } from "../config/env";
import { pool } from "../db/pool";
import { HttpError } from "../middleware/errors";

export async function registerOrganization(input: {
  name: string;
  email: string;
  website: string;
  domain?: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const domain = input.domain?.trim() || new URL(input.website).hostname;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const org = await client.query(
      `INSERT INTO organizations (name, email, website, domain)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, website, domain, status, created_at`,
      [input.name.trim(), email, input.website, domain],
    );
    const organization = org.rows[0];
    const user = await client.query(
      `INSERT INTO users (organization_id, email, password_hash)
       VALUES ($1, $2, $3) RETURNING id`,
      [organization.id, email, passwordHash],
    );
    await client.query("COMMIT");
    return { ...organization, userId: user.rows[0].id };
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      throw new HttpError(409, "EMAIL_EXISTS", "An account with this email already exists.");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function signIn(email: string, password: string) {
  const result = await pool.query(
    `SELECT u.id, u.organization_id, u.email, u.password_hash, u.role,
            o.name AS organization_name, o.website, o.domain, o.status AS organization_status
     FROM users u LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE lower(u.email) = lower($1)`,
    [email.trim()],
  );
  const account = result.rows[0];
  if (!account || !(await bcrypt.compare(password, account.password_hash))) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  const user = {
    id: account.id as string,
    organizationId: account.organization_id as string | null,
    email: account.email as string,
    role: account.role as "admin" | "issuer",
    organizationStatus: account.organization_status as string | null,
  };
  const token = jwt.sign(user, env.JWT_SECRET, { expiresIn: "12h", issuer: "prowlet-api" });
  return {
    id: user.organizationId ?? user.id,
    name: account.organization_name ?? "Prowlet administrator",
    email: user.email,
    website: account.website ?? "",
    domain: account.domain ?? "",
    status: user.organizationStatus ?? "verified",
    token,
    user: { id: user.id, email: user.email, role: user.role },
  };
}

export async function getCurrentUser(id: string) {
  const result = await pool.query(
    `SELECT u.id, u.email, u.role, u.organization_id,
            o.name AS organization_name, o.status AS organization_status
     FROM users u LEFT JOIN organizations o ON o.id = u.organization_id
     WHERE u.id = $1`,
    [id],
  );
  if (!result.rowCount) throw new HttpError(401, "USER_NOT_FOUND", "This account no longer exists.");
  return result.rows[0];
}
