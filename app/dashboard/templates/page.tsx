import CertificatePreview from "@/components/certificate-preview";
import { templates } from "@/lib/mock/data";

export default function TemplatesPage() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Design library</p>
          <h1 className="dashboard-title">Certificate templates</h1>
          <p className="route-intro">Choose a starting point for your next batch.</p>
        </div>
      </div>
      <div className="template-gallery">
        {templates.map((template) => (
          <article className="template-gallery-item" key={template.id}>
            <CertificatePreview recipient="Recipient name" course="Course or event" issuer="Your organization" />
            <h2>{template.name}</h2>
            <p>{template.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
