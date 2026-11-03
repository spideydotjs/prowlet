import bcrypt from "bcryptjs";
import { z } from "zod";

import { env } from "../config/env";
import { pool } from "./pool";

async function main() {
  const credentials = z.object({
    email: z.string().email(),
    password: z.string().min(16).max(128),
  }).parse({
    email: env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  const passwordHash = await bcrypt.hash(credentials.password, 12);
  const result = await pool.query(
    `INSERT INTO users (organization_id, email, password_hash, role)
     VALUES (NULL, lower($1), $2, 'admin')
     ON CONFLICT (email) DO UPDATE
     SET organization_id = NULL, password_hash = EXCLUDED.password_hash, role = 'admin'
     RETURNING id, email`,
    [credentials.email, passwordHash],
  );
  console.log(`Administrator account ready for ${result.rows[0].email}.`);
}

main()
  .catch((error: unknown) => {
    console.error("Could not provision administrator:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
