import type { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { ZodError } from "zod";

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  void _next;
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: error.issues[0]?.message ?? "Invalid request." } });
    return;
  }
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: { code: "UPLOAD_ERROR", message: error.message } });
    return;
  }
  const status = Number((error as { status?: number }).status) || 500;
  const code = (error as { code?: string }).code ?? (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR");
  if (status >= 500) console.error("API request failed:", error);
  res.status(status).json({
    error: { code, message: status >= 500 ? "An unexpected error occurred." : (error as Error).message },
  });
};

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "HttpError";
  }
}
