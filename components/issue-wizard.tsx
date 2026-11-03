"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type FormEvent } from "react";

import CertificatePreview from "@/components/certificate-preview";
import { downloadBatchZip, issueBatch } from "@/lib/api";
import { templates } from "@/lib/mock/data";

type Recipient = { name: string; email: string; issue?: string };

const stages = ["Choose template", "Add recipients", "Customize", "Review", "Anchor"];

export default function IssueWizard() {
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState(templates[0].id);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [course, setCourse] = useState("");
  const [issuer, setIssuer] = useState("Northline Learning Lab");
  const [signatory, setSignatory] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(-1);
  const [batch, setBatch] = useState<{ batchId: string; transactionHash: string } | null>(null);

  function addRecipient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !email.includes("@")) {
      setError("Enter a recipient name and valid email.");
      return;
    }
    setRecipients((current) => [...current, { name: name.trim(), email: email.trim() }]);
    setName("");
    setEmail("");
    setError("");
  }

  function parseCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result ?? "").trim().split(/\r?\n/);
      const rows = lines.slice(1).map((line) => line.split(",").map((part) => part.trim()));
      const parsed = rows.map(([recipientName, recipientEmail]) => ({
        name: recipientName ?? "",
        email: recipientEmail ?? "",
        ...(!recipientName || !recipientEmail?.includes("@") ? { issue: "Name and valid email required" } : {}),
      }));
      setRecipients(parsed);
      setError(parsed.some((row) => row.issue) ? "Some CSV rows need correction before issue." : "");
    };
    reader.onerror = () => setError("Could not read this CSV. Check the file and try again.");
    reader.readAsText(file);
  }

  function downloadSample() {
    const csv = "name,email\nMara Ellison,mara@example.org\nIbrahim Okafor,ibrahim@example.org\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "prowlet-recipients-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function anchorBatch() {
    setError("");
    setProgress(0);
    try {
      await new Promise((resolve) => setTimeout(resolve, 420));
      setProgress(1);
      await new Promise((resolve) => setTimeout(resolve, 420));
      setProgress(2);
      await new Promise((resolve) => setTimeout(resolve, 420));
      const created = await issueBatch({
        recipients: recipients.map(({ name: recipientName, email: recipientEmail }) => ({ name: recipientName, email: recipientEmail })),
        course,
        issuer,
        template,
        issueDate,
      });
      setBatch(created);
      setProgress(3);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the certificate batch.");
      setProgress(-1);
    }
  }

  function next() {
    setError("");
    if (step === 1 && (!recipients.length || recipients.some((recipient) => recipient.issue))) {
      setError("Add at least one valid recipient before continuing.");
      return;
    }
    if (step === 2 && (!course.trim() || !signatory.trim())) {
      setError("Enter the course or event name and signatory.");
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  }

  return (
    <div className="dashboard-page issue-page">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">New batch</p>
          <h1 className="dashboard-title">Issue certificates</h1>
          <p className="route-intro">Prepare a batch of recipient credentials.</p>
        </div>
      </div>
      <ol className="wizard-steps" aria-label="Issue certificate steps">
        {stages.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined} className={index <= step ? "step-active" : ""}>
            <span>{index + 1}</span>{label}
          </li>
        ))}
      </ol>
      <section className="dashboard-panel wizard-panel">
        {step === 0 && (
          <>
            <h2 className="route-subtitle">Choose a template.</h2>
            <div className="template-grid">
              {templates.map((item) => (
                <button className={`template-option ${template === item.id ? "selected" : ""}`} type="button" key={item.id} onClick={() => setTemplate(item.id)}>
                  <CertificatePreview recipient="Recipient name" course="Course or event" issuer="Your organization" />
                  <strong>{item.name}</strong><span>{item.detail}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h2 className="route-subtitle">Add recipients.</h2>
            <div className="recipient-columns">
              <form className="field-stack" onSubmit={addRecipient}>
                <h3>Add one recipient</h3>
                <label htmlFor="recipient-name">Full name</label>
                <input id="recipient-name" value={name} onChange={(event) => setName(event.target.value)} />
                <label htmlFor="recipient-email">Email address</label>
                <input id="recipient-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                <button className="action action-secondary" type="submit">Add recipient</button>
              </form>
              <div className="field-stack">
                <h3>Upload a CSV</h3>
                <p className="option-hint">Use columns named name and email.</p>
                <label htmlFor="recipient-csv">Recipient CSV file</label>
                <input id="recipient-csv" type="file" accept=".csv,text/csv" onChange={parseCsv} />
                <button className="text-button" type="button" onClick={downloadSample}>Download sample CSV</button>
              </div>
            </div>
            <p className="recipient-count">{recipients.length} recipient{recipients.length === 1 ? "" : "s"} added</p>
            {recipients.length > 0 && <div className="recipient-list">{recipients.map((recipient, index) => <p key={`${recipient.email}-${index}`} className={recipient.issue ? "recipient-invalid" : ""}>{recipient.name || "Missing name"} / {recipient.email || "Missing email"} {recipient.issue && <strong>{recipient.issue}</strong>}</p>)}</div>}
          </>
        )}
        {step === 2 && (
          <>
            <h2 className="route-subtitle">Customize the certificate.</h2>
            <div className="customize-grid">
              <div className="field-stack">
                <label htmlFor="course">Course or event name</label>
                <input id="course" value={course} onChange={(event) => setCourse(event.target.value)} />
                <label htmlFor="issued-date">Issue date</label>
                <input id="issued-date" type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
                <label htmlFor="issuer-name">Organization</label>
                <input id="issuer-name" value={issuer} onChange={(event) => setIssuer(event.target.value)} />
                <label htmlFor="signatory">Signatory name and title</label>
                <input id="signatory" value={signatory} onChange={(event) => setSignatory(event.target.value)} />
                <label htmlFor="issuer-logo">Organization logo</label>
                <input id="issuer-logo" type="file" accept="image/*" />
              </div>
              <div className="customize-preview">
                <p className="eyebrow">Live preview</p>
                <CertificatePreview recipient={recipients[0]?.name || "Recipient name"} course={course || "Course or event"} issuer={issuer || "Your organization"} />
              </div>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <h2 className="route-subtitle">Review your batch.</h2>
            <dl className="metadata-grid">
              <div><dt>Recipients</dt><dd>{recipients.length}</dd></div>
              <div><dt>Template</dt><dd>{templates.find((item) => item.id === template)?.name}</dd></div>
              <div><dt>Course or event</dt><dd>{course}</dd></div>
              <div><dt>Organization</dt><dd>{issuer}</dd></div>
              <div><dt>Signatory</dt><dd>{signatory}</dd></div>
              <div><dt>Issue date</dt><dd>{issueDate}</dd></div>
            </dl>
          </>
        )}
        {step === 4 && (
          <section aria-live="polite">
            {!batch ? (
              <>
                <h2 className="route-subtitle">Anchor certificate batch.</h2>
                <p className="route-intro">Generate certificate PDFs and Merkle proofs, then anchor the batch on the configured Solana cluster.</p>
                {progress >= 0 && <ol className="anchor-progress">{["Generating PDFs", "Building Merkle tree", "Submitting transaction", "Confirmed"].map((stage, index) => <li className={index <= progress ? "complete" : ""} key={stage}><span>{index < progress ? "✓" : index + 1}</span>{stage}</li>)}</ol>}
                <button className="action action-primary" type="button" onClick={anchorBatch} disabled={progress >= 0}>Start issue flow</button>
              </>
            ) : (
              <>
                <p className="eyebrow">Batch confirmed</p>
                <h2 className="route-subtitle">Your batch is ready.</h2>
                <p className="route-intro">Batch {batch.batchId} / {recipients.length} certificates</p>
                <p className="hash-value">{batch.transactionHash}</p>
                <div className="result-actions">
                  <button className="action action-secondary" type="button" onClick={() => void downloadBatchZip(batch.batchId).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not download this batch."))}>Download all (ZIP)</button>
                  <button className="action action-secondary" type="button" onClick={() => setError("Email delivery is not configured yet.")}>Send emails</button>
                  <Link className="action action-primary" href="/dashboard/certificates">View certificates</Link>
                </div>
              </>
            )}
          </section>
        )}
        {error && <p className="form-message form-error" role="alert">{error}</p>}
        {step < 4 && (
          <div className="wizard-actions">
            {step > 0 && <button className="action action-secondary" type="button" onClick={() => setStep((current) => current - 1)}>Back</button>}
            <button className="action action-primary" type="button" onClick={next}>{step === 3 ? "Continue to anchor" : "Continue"} <span aria-hidden="true">→</span></button>
          </div>
        )}
      </section>
    </div>
  );
}
