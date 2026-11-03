type CertificatePreviewProps = {
  course?: string;
  recipient?: string;
  issuer?: string;
};

export default function CertificatePreview({
  course = "Foundations of Data Ethics",
  recipient = "Harshit Rozera",
  issuer = "Northline Learning Lab",
}: CertificatePreviewProps) {
  return (
    <article
      className="certificate-preview"
      aria-label={`Example certificate for ${recipient}`}
    >
      <div className="certificate-topline">
        <div className="certificate-brand">
          <span className="certificate-monogram" aria-hidden="true">P</span>
          <span>
            <strong>PROWLET</strong>
            <small>VERIFIABLE RECORD</small>
          </span>
        </div>
        <span className="certificate-type">Certificate of completion</span>
      </div>
      <div className="certificate-signal" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
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
        <div className="certificate-signature">
          <span className="certificate-signature-line" aria-hidden="true" />
          <span className="certificate-meta-label">Digitally issued</span>
        </div>
        <span className="certificate-stamp" aria-hidden="true">P</span>
      </div>
      <span className="certificate-code">CERT / VERIFIED / 01</span>
    </article>
  );
}
