import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

import { env } from "../config/env";

export async function makeCertificatePdf(input: {
  id: string;
  recipient: string;
  course: string;
  issuer: string;
  issueDate: string;
}) {
  const directory = path.resolve(env.UPLOAD_DIR, "certificates");
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, `${input.id}.pdf`);
  const pdf = await PDFDocument.create();
  pdf.setKeywords([input.id, "Prowlet certificate"]);
  const page = pdf.addPage([842, 595]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({
    x: 24,
    y: 24,
    width: 794,
    height: 547,
    borderWidth: 2,
    borderColor: rgb(0.13, 0.62, 0.35),
  });
  page.drawText("CERTIFICATE OF COMPLETION", {
    x: 105,
    y: 465,
    size: 23,
    font: bold,
    color: rgb(0.06, 0.16, 0.1),
  });
  page.drawText("This certifies that", { x: 105, y: 405, size: 14, font, color: rgb(0.25, 0.3, 0.27) });
  page.drawText(input.recipient, { x: 105, y: 354, size: 30, font: bold, color: rgb(0.05, 0.12, 0.08) });
  page.drawText(`has completed ${input.course}`, {
    x: 105,
    y: 310,
    size: 16,
    font,
    color: rgb(0.18, 0.24, 0.2),
    maxWidth: 610,
  });
  page.drawText(`${input.issuer}   |   ${input.issueDate}`, {
    x: 105,
    y: 180,
    size: 12,
    font,
    color: rgb(0.25, 0.3, 0.27),
  });
  page.drawText(`Certificate ID: ${input.id}`, {
    x: 105,
    y: 110,
    size: 10,
    font,
    color: rgb(0.25, 0.3, 0.27),
  });
  const qr = await QRCode.toBuffer(`${env.FRONTEND_PUBLIC_URL}/verify/${input.id}`, {
    type: "png",
    margin: 1,
    width: 120,
  });
  page.drawImage(await pdf.embedPng(qr), { x: 670, y: 78, width: 100, height: 100 });
  const bytes = await pdf.save();
  await writeFile(filePath, bytes, { mode: 0o600 });
  return filePath;
}

export async function readPdf(filePath: string) {
  return readFile(filePath);
}
