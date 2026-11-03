"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getDashboardSummary } from "@/lib/api";
import type { Certificate } from "@/lib/mock/data";

type Summary = {
  totalIssued: number;
  thisMonth: number;
  revoked: number;
  verifications: number;
  recent: Certificate[];
  chart: number[];
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getDashboardSummary()
      .then(setSummary)
      .catch(() => setError("Could not load overview. Refresh to try again."));
  }, []);

  if (error) return <p className="form-message form-error" role="alert">{error}</p>;
  if (!summary) {
    return (
      <div className="dashboard-loading" aria-live="polite">
        <div className="skeleton-line" />
        <div className="skeleton-line" />
        <p>Loading workspace summary...</p>
      </div>
    );
  }

  const stats = [
    ["Total issued", summary.totalIssued],
    ["This month", summary.thisMonth],
    ["Revoked", summary.revoked],
    ["Verifications", summary.verifications.toLocaleString()],
  ];

  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h1 className="dashboard-title">Issuer workspace</h1>
          <p className="route-intro">Your certificate activity at a glance.</p>
        </div>
        <Link className="action action-primary" href="/dashboard/issue">Issue certificates <span aria-hidden="true">↗</span></Link>
      </div>
      <section className="stats-grid" aria-label="Certificate statistics">
        {stats.map(([label, value]) => (
          <article className="stat-panel" key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <div className="overview-grid">
        <section className="dashboard-panel chart-panel">
          <div className="panel-heading">
            <h2>Issuance over time</h2>
            <span className="option-hint">Monthly activity</span>
          </div>
          <div className="chart" role="img" aria-label="Issuance by month, January to December">
            {summary.chart.map((value, index) => (
              <div className="chart-column" key={`${index}-${value}`}>
                <span className="chart-bar" style={{ height: `${Math.max(14, (value / 30) * 100)}%` }} />
                <span>{new Date(2026, index).toLocaleString("en", { month: "short" })}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="dashboard-panel recent-panel">
          <div className="panel-heading">
            <h2>Recent activity</h2>
            <Link href="/dashboard/certificates">All certificates ↗</Link>
          </div>
          <ul className="activity-list">
            {summary.recent.map((certificate) => (
              <li key={certificate.id}>
                <span><strong>{certificate.recipient}</strong><small>{certificate.course}</small></span>
                <span className={`status-badge status-${certificate.status}`}>{certificate.status}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <p className="preview-notice">All counts and issuance history shown here are sample data.</p>
    </div>
  );
}
