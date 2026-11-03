"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getCertificates, revokeCertificate } from "@/lib/api";
import type { Certificate, CertificateStatus } from "@/lib/mock/data";

export default function CertificatesPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | CertificateStatus>("all");
  const [sort, setSort] = useState<"date-desc" | "recipient-asc">("date-desc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Certificate | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getCertificates()
      .then(setCertificates)
      .catch(() => setError("Could not load certificates. Refresh to try again."))
      .finally(() => setLoaded(true));
  }, []);

  const filtered = useMemo(() => certificates
    .filter((certificate) => {
      const matchesText = `${certificate.id} ${certificate.recipient} ${certificate.course}`.toLowerCase().includes(search.toLowerCase());
      return matchesText && (filter === "all" || certificate.status === filter);
    })
    .sort((left, right) => sort === "recipient-asc"
      ? left.recipient.localeCompare(right.recipient)
      : right.issueDate.localeCompare(left.issueDate)), [certificates, filter, search, sort]);
  const pageSize = 10;
  const pageCount = Math.ceil(filtered.length / pageSize);
  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize);

  async function confirmRevoke() {
    if (!selected) return;
    try {
      const updated = await revokeCertificate(selected.id, reason);
      setCertificates((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelected(null);
      setReason("");
      setNotice(`${updated.id} has been marked revoked.`);
    } catch {
      setError("Could not revoke this certificate. Try again.");
    }
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Records</p>
          <h1 className="dashboard-title">Certificates</h1>
          <p className="route-intro">Search and manage issued certificate records.</p>
        </div>
        <Link className="action action-primary" href="/dashboard/issue">Issue certificates</Link>
      </div>
      {notice && <p className="form-message form-success" role="status">{notice}</p>}
      {error && <p className="form-message form-error" role="alert">{error}</p>}
      <div className="table-controls">
        <label className="sr-only" htmlFor="certificate-search">Search certificates</label>
        <input id="certificate-search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Search by ID, recipient, or course" />
        <label className="sr-only" htmlFor="status-filter">Filter by status</label>
        <select id="status-filter" value={filter} onChange={(event) => { setFilter(event.target.value as "all" | CertificateStatus); setPage(0); }}>
          <option value="all">All statuses</option>
          <option value="issued">Issued</option>
          <option value="pending">Pending</option>
          <option value="revoked">Revoked</option>
        </select>
        <label className="sr-only" htmlFor="certificate-sort">Sort certificates</label>
        <select id="certificate-sort" value={sort} onChange={(event) => setSort(event.target.value as "date-desc" | "recipient-asc")}>
          <option value="date-desc">Newest first</option>
          <option value="recipient-asc">Recipient name</option>
        </select>
      </div>
      {!loaded ? (
        <div className="dashboard-panel"><div className="skeleton-line" /><div className="skeleton-line" /><p>Loading certificate records...</p></div>
      ) : filtered.length ? (
        <div className="table-wrap">
          <table className="certificates-table">
            <thead>
              <tr><th>Recipient</th><th>Certificate</th><th>Course or event</th><th>Issued</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {pageItems.map((certificate) => (
                <tr key={certificate.id}>
                  <td>{certificate.recipient}<small>{certificate.email}</small></td>
                  <td><Link href={`/dashboard/certificates/${certificate.id}`}>{certificate.id}</Link></td>
                  <td>{certificate.course}</td>
                  <td>{certificate.issueDate}</td>
                  <td><span className={`status-badge status-${certificate.status}`}>{certificate.status}</span></td>
                  <td className="row-actions">
                    <Link href={`/dashboard/certificates/${certificate.id}`}>View</Link>
                    <button type="button" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/verify/${certificate.id}`)}>Copy link</button>
                    <button type="button" onClick={() => window.print()}>Download</button>
                    {certificate.status === "issued" && <button type="button" onClick={() => setSelected(certificate)}>Revoke</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="route-empty"><h2>No certificates match.</h2><p>Change your search or status filter.</p></div>
      )}
      {loaded && pageCount > 1 && (
        <nav className="pagination" aria-label="Certificate pages">
          <button type="button" className="action action-secondary" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button>
          <span>Page {page + 1} of {pageCount}</span>
          <button type="button" className="action action-secondary" disabled={page >= pageCount - 1} onClick={() => setPage((current) => current + 1)}>Next</button>
        </nav>
      )}
      {selected && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="revoke-title">
            <p className="eyebrow">Confirm action</p>
            <h2 className="route-subtitle" id="revoke-title">Revoke {selected.id}?</h2>
            <p className="route-intro">This changes the public status shown for this mock certificate.</p>
            <label htmlFor="revoke-reason">Reason</label>
            <textarea id="revoke-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
            <div className="result-actions">
              <button className="action action-secondary" type="button" onClick={() => setSelected(null)}>Cancel</button>
              <button className="action action-primary" type="button" onClick={confirmRevoke}>Confirm revoke</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
