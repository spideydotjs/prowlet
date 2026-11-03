import { Router } from "express";
import { z } from "zod";

import { requireAdmin, requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errors";
import { pool } from "../db/pool";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/organizations", async (req, res) => {
  const status = z.enum(["pending", "approved", "rejected"]).optional().parse(req.query.status);
  const result = await pool.query(
    `SELECT id, name, email, domain, website, status, created_at
     FROM organizations WHERE ($1::text IS NULL OR status = $1)
     ORDER BY created_at DESC LIMIT 200`,
    [status ?? null],
  );
  res.json(result.rows);
});

adminRouter.patch("/organizations/:id/:action", async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const action = z.enum(["approve", "reject"]).parse(req.params.action);
  const result = await pool.query(
    `UPDATE organizations SET status = $1, updated_at = now()
     WHERE id = $2 RETURNING id, name, email, domain, website, status, created_at`,
    [action === "approve" ? "approved" : "rejected", id],
  );
  if (!result.rowCount) throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  res.json(result.rows[0]);
});
