import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env";

export type AuthUser = {
  id: string;
  organizationId: string | null;
  role: "admin" | "issuer";
  email: string;
  organizationStatus: string | null;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const value = req.header("authorization");
  if (!value?.startsWith("Bearer ")) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } });
    return;
  }
  try {
    req.user = jwt.verify(value.slice(7), env.JWT_SECRET, { issuer: "prowlet-api" }) as AuthUser;
    next();
  } catch {
    res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Your session has expired." } });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Administrator access is required." } });
    return;
  }
  next();
}

export function requireApprovedIssuer(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "issuer" || req.user.organizationStatus !== "approved") {
    res.status(403).json({
      error: { code: "ORGANIZATION_NOT_APPROVED", message: "Your organization must be approved before using issuer tools." },
    });
    return;
  }
  next();
}
