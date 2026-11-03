import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";

import { env } from "./config/env";
import { errorHandler, notFound } from "./middleware/errors";
import { apiRouter } from "./routes";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(morgan("tiny"));
  app.use(cors({
    origin: env.FRONTEND_URL,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/uploads/logos", express.static(path.resolve(env.UPLOAD_DIR, "logos"), {
    dotfiles: "deny",
    immutable: true,
    maxAge: "1h",
  }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true }));
  app.use("/api/verify", rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true }));
  app.use("/api", apiRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
