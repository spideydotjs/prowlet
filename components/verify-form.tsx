"use client";

import { useState, type FormEvent } from "react";

import { verifyCertificate } from "@/lib/api";
import type { Certificate } from "@/lib/mock/data";

type Verification =
  | { status: "verified" | "revoked" | "pending"; certificate: Certificate }
  | { status: "not-found" | "tampered"; certificate: null };

export default function VerifyForm({ initialId = "" }: { initialId?: string }) {
  const [id, setId] = useState(initialId);
  const [result, setResult] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setResult(null);
    if (!id.trim()) {
      setMessage("Enter a certificate ID to continue.");
      return;
    }
    setLoading(true);
    try {
      setResult(await verifyCertificate(id));
    } catch {
      setMessage("We could not check this certificate. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="verify-layout">
      <section className="route-panel verify-form-panel" aria-labelledby="verify-title">
        <p className="eyebrow">Public verification</p>
        <h1 className="route-title" id="verify-title">Check a certificate.</h1>
        <p className="route-intro">
          Enter the certificate ID or open a certificate link to check its current
          record.
        </p>
        <form className="field-stack" onSubmit={submit}>
          <label htmlFor="certificate-id">Certificate ID</label>
          <div className="input-row">
            <input
              id="certificate-id"
              name="certificateId"
              autoComplete="off"
              value={id}
              onChange={(event) => setId(event.target.value)}
              placeholder="For example, PRW-2026-1001"
            />
            <button className="action action-primary" type="submit" disabled={loading}>
              {loading ? "Checking..." : "Verify"}
            </button>
          </div>
          {message && <p className="form-message form-error" role="alert">{message}</p>}
        </form>

        <div className="verify-options">
          <label className="upload-option">
            <span>Upload a PDF</span>
            <span className="option-hint">Choose a certificate file</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setMessage(file ? `${file.name} selected. PDF checks are a frontend preview.` : "");
              }}
            />
          </label>
          <div className="upload-option">
            <span>Scan a QR code</span>
            <span className="option-hint">Camera scanning is not connected in this preview.</span>
          </div>
        </div>
        <p className="preview-notice">
          Demo data only. Verification does not contact a blockchain.
        </p>
      </section>

      <section className="verify-result" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <div className="route-panel">
            <p className="eyebrow">Checking record</p>
            <h2 className="route-subtitle">Verifying certificate...</h2>
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-short" />
            <p className="option-hint">Looking up the mock certificate record.</p>
          </div>
        ) : result ? (
          <VerificationResult result={result} />
        ) : (
          <div className="route-empty">
            <span className="empty-mark" aria-hidden="true">?</span>
            <h2>Certificate details appear here.</h2>
            <p>Try a sample ID: PRW-2026-1001 or PRW-2026-1008.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function VerificationResult({ result }: { result: Verification }) {
  if (!result.certificate) {
    return (
      <div className="route-panel state-error" role="status">
        <p className="eyebrow">{result.status === "tampered" ? "Record mismatch" : "No match"}</p>
        <h2 className="route-subtitle">
          {result.status === "tampered" ? "This record could not be verified." : "Certificate not found."}
        </h2>
        <p className="route-intro">
          {result.status === "tampered"
            ? "The submitted ID is marked as an invalid sample in this demo."
            : "Check the ID for typing errors or ask the issuer for a valid certificate link."}
        </p>
      </div>
    );
  }

  const certificate = result.certificate;
  return (
    <article className={`route-panel verification-card ${result.status === "revoked" ? "state-warning" : "state-success"}`}>
      <div className="verification-header">
        <div>
          <p className="eyebrow">{result.status === "revoked" ? "Revoked certificate" : result.status === "pending" ? "Pending certificate" : "Verified certificate"}</p>
          <h2 className="route-subtitle">
            {result.status === "revoked"
              ? "This certificate is no longer valid."
              : result.status === "pending"
                ? "This certificate is awaiting issuer confirmation."
                : "This certificate is valid."}
          </h2>
        </div>
        <span className="verification-signal" aria-label={result.status} />
      </div>
      <div className="verification-identity">
        <span className="verification-initial" aria-hidden="true">{certificate.recipient.slice(0, 1).toUpperCase()}</span>
        <div>
          <span className="certificate-meta-label">Credential holder</span>
          <strong>{certificate.recipient}</strong>
          <span>{certificate.course}</span>
        </div>
      </div>
      <dl className="metadata-grid">
        <div>
          <dt>Issuer</dt>
          <dd>{certificate.issuer} {certificate.issuerVerified && <span className="verified-badge">Verified issuer</span>}</dd>
        </div>
        <div><dt>Issue date</dt><dd>{certificate.issueDate}</dd></div>
        <div><dt>Certificate ID</dt><dd>{certificate.id}</dd></div>
        {result.status === "revoked" ? (
          <>
            <div><dt>Revoked on</dt><dd>{certificate.revokedAt}</dd></div>
            <div className="metadata-wide"><dt>Reason</dt><dd>{certificate.revokeReason}</dd></div>
          </>
        ) : (
          <>
            <div><dt>Network</dt><dd><span className="network-badge">{certificate.network}</span></dd></div>
            <div className="metadata-wide"><dt>Transaction hash</dt><dd>{certificate.transactionHash}</dd></div>
            <div className="metadata-wide"><dt>Merkle root</dt><dd>{certificate.merkleRoot}</dd></div>
          </>
        )}
      </dl>
      <div className="result-actions">
        <button className="action action-secondary" type="button" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Share</button>
        <button className="action action-secondary" type="button" onClick={() => window.print()}>Download PDF</button>
      </div>
    </article>
  );
}
