import { Router } from "express";

import { authRouter } from "./auth";
import { adminRouter } from "./admin";
import { batchRouter } from "./batches";
import { certificateRouter, publicCertificateRouter } from "./certificates";
import { statsRouter } from "./stats";
import { templateRouter } from "./templates";
import { verificationRouter } from "./verify";

export const apiRouter = Router();

apiRouter.get("/openapi.json", (_req, res) => {
  res.json({
    openapi: "3.1.0",
    info: { title: "Prowlet API", version: "1.0.0" },
    servers: [{ url: "/api" }],
    paths: {
      "/auth/register": { post: { summary: "Register an organization (pending approval)" } },
      "/auth/login": { post: { summary: "Create a JWT session" } },
      "/auth/me": { get: { summary: "Get the current account" } },
      "/batches": { get: { summary: "List organization batches" }, post: { summary: "Issue and anchor a certificate batch" } },
      "/batches/preview": { post: { summary: "Validate a CSV recipient file" } },
      "/certificates": { get: { summary: "Search and paginate certificates" } },
      "/verify/{certificateId}": { get: { summary: "Publicly verify a certificate" } },
      "/certificates/{id}/revoke": { post: { summary: "Revoke a certificate" } },
    },
  });
});
apiRouter.get("/docs", (_req, res) => res.redirect("/api/openapi.json"));

apiRouter.use("/auth", authRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use("/batches", batchRouter);
apiRouter.use("/certificates", publicCertificateRouter);
apiRouter.use("/certificates", certificateRouter);
apiRouter.use("/stats", statsRouter);
apiRouter.use("/templates", templateRouter);
apiRouter.use("/verify", verificationRouter);
