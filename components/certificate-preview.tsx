type CertificatePreviewProps = {
  course?: string;
  recipient?: string;
  issuer?: string;
};

export default function CertificatePreview({
  course = "Foundations of Data Ethics",
  recipient = "Mara Ellison",
  issuer = "Northline Learning Lab",
}: CertificatePreviewProps) {
  return (
    <article
      className="certificate-preview"
      aria-label={`Example certificate for ${recipient}`}
    >
      <div className="certificate-topline">
        <span className="certificate-monogram" aria-hidden="true">
          P
        </span>
        <span className="certificate-type">Certificate of completion</span>
      </div>
      <div className="certificate-content">
        <p className="certificate-kicker">This certifies that</p>
        <h2>{recipient}</h2>
        <p className="certificate-copy">has completed</p>
        <p className="certificate-course">{course}</p>
      </div>
      <div className="certificate-bottom">
        <div>
          <span className="certificate-meta-label">Issued by</span>
          <span className="certificate-issuer">{issuer}</span>
        </div>
        <span className="certificate-stamp" aria-hidden="true">
          P
        </span>
      </div>
    </article>
  );
}
