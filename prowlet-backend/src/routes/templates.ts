import { Router } from "express";

import { requireApprovedIssuer, requireAuth } from "../middleware/auth";

export const templateRouter = Router();
templateRouter.use(requireAuth, requireApprovedIssuer);
templateRouter.get("/", (_req, res) => {
  res.json([
    { id: "modern", name: "Modern", detail: "Open layout with a strong type hierarchy." },
    { id: "classic", name: "Classic", detail: "A formal frame for academic credentials." },
    { id: "field", name: "Field study", detail: "A compact design for workshops and events." },
    { id: "minimal", name: "Minimal", detail: "A simple record with room for your mark." },
  ]);
});
