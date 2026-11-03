"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { useEffect, useState } from "react";

import CertificatePreview from "@/components/certificate-preview";
import { getCertificate, revokeCertificate } from "@/lib/api";
import type { Certificate } from "@/lib/mock/data";

export default function CertificateDetailPage() {
  return (
    <Suspense fallback={<div className="dashboard-loading"><div className="skeleton-line" /><p>Opening certificate record...</p></div>}>
      <CertificateDetail />
    </Suspense>
  );
}

function CertificateDetail() {
  const { id } = useParams<{ id: string }>();
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getCertificate(id)
      .then(setCertificate)
      .catch(() => setError("Could not load this certificate."))
      .finally(() => setLoaded(true));
  }, [id]);

  async function revoke() {
    if (!certificate) return;
    try {
      setCertificate(await revokeCertificate(certificate.id, "Revoked by issuer from certificate detail."));
    } catch {
      setError("Could not revoke this certificate.");
    }
  }

  if (!loaded) return <div className="dashboard-loading"><div className="skeleton-line" /><p>Loading certificate details...</p></div>;
  if (error || !certificate) {
    return <div className="route-empty"><h1 className="route-title">Certificate not found.</h1><p>{error || "No certificate matches this ID."}</p><Link href="/dashboard/certificates">Return to certificates</Link></div>;
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <Link className="dashboard-back" href="/dashboard/certificates">{"<"} Certificates</Link>
          <h1 className="dashboard-title">{certificate.recipient}</h1>
          <p className="route-intro">{certificate.id} / {certificate.course}</p>
        </div>
        {certificate.status === "issued" && <button className="action action-secondary" type="button" onClick={revoke}>Revoke certificate</button>}
      </div>
      <div className="certificate-showcase">
        <div className="detail-preview">
          <div className="preview-caption"><span>Credential preview</span><span>{certificate.id}</span></div>
          <CertificatePreview recipient={certificate.recipient} course={certificate.course} issuer={certificate.issuer} />
        </div>
        <section className="dashboard-panel">
          <div className="panel-heading-row">
            <div>
              <p className="eyebrow">Certificate record</p>
              <h2 className="route-subtitle">A credential with a public proof.</h2>
            </div>
            <span className={`status-badge status-${certificate.status}`}>{certificate.status}</span>
          </div>
          <dl className="metadata-grid">
            <div><dt>Issue date</dt><dd>{certificate.issueDate}</dd></div>
            <div><dt>Issuer</dt><dd>{certificate.issuer}</dd></div>
            <div><dt>Network</dt><dd>{certificate.network}</dd></div>
            <div className="metadata-wide"><dt>Transaction hash</dt><dd className="break-hash">{certificate.transactionHash}</dd></div>
            <div className="metadata-wide"><dt>Merkle root</dt><dd className="break-hash">{certificate.merkleRoot}</dd></div>
            <div className="metadata-wide"><dt>Verification link</dt><dd><Link href={`/verify/${certificate.id}`}>/verify/{certificate.id}</Link></dd></div>
          </dl>
          <div className="result-actions">
            <button type="button" className="action action-secondary" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/verify/${certificate.id}`)}>Copy verification link</button>
            <Link className="action action-secondary" href={`/verify/${certificate.id}`}>Open verification</Link>
          </div>
        </section>
      </div>
      <section className="dashboard-panel timeline-panel">
        <div className="panel-heading-row">
          <div>
            <p className="eyebrow">Record history</p>
            <h2>Activity</h2>
          </div>
          <span className="timeline-marker" aria-hidden="true">●</span>
        </div>
        <ol className="timeline">
          <li><span>Certificate record created</span><time>{certificate.issueDate}</time></li>
          <li><span>Batch anchored on {certificate.network}</span><time>{certificate.issueDate}</time></li>
          {certificate.status === "revoked" && <li><span>Revoked: {certificate.revokeReason}</span><time>{certificate.revokedAt}</time></li>}
        </ol>
      </section>
    </div>
  );
}
