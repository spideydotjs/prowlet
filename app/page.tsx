import Link from "next/link";

import CertificatePreview from "@/components/certificate-preview";
import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";

const steps = [
  {
    title: "Issue",
    description:
      "Create a certificate once, then prepare a whole recipient batch together.",
  },
  {
    title: "Anchor on-chain",
    description:
      "Prowlet is designed to anchor a verifiable record for each issued batch.",
  },
  {
    title: "Verify instantly",
    description:
      "Recipients can check a certificate with its ID or a direct verification link.",
  },
];

const features = [
  {
    title: "Tamper-evident records",
    description:
      "Give every certificate a verifiable record that makes later changes detectable.",
    marker: "01",
  },
  {
    title: "Bulk issuing",
    description:
      "Prepare certificates for a full class, event, or cohort in one workflow.",
    marker: "02",
  },
  {
    title: "QR-ready verification",
    description:
      "Let recipients open a certificate check from a scannable link.",
    marker: "03",
  },
  {
    title: "No wallet needed",
    description:
      "Keep certificate checks simple. Recipients do not need a crypto wallet.",
    marker: "04",
  },
  {
    title: "Clear revocation",
    description:
      "Mark a certificate revoked and make its current status clear to anyone checking it.",
    marker: "05",
  },
];

export default function Home() {
  return (
    <div className="site-frame prowlet-site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />

      <main id="main" className="main-content landing-main">
        <section className="hero landing-hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">Certificates, built for proof</p>
            <h1 id="hero-title">
              Credentials that
              <br />
              <span>prove themselves.</span>
            </h1>
            <p className="hero-description">
              Issue tamper-evident certificates and give every recipient a
              straightforward way to verify them.
            </p>
            <div className="actions">
              <Link className="action action-primary" href="/verify">
                Verify a Certificate <span aria-hidden="true">↗</span>
              </Link>
              <Link className="action action-secondary" href="/register">
                Issue Certificates <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <p className="preview-notice">
              Frontend preview. Blockchain and verification services are not
              connected yet.
            </p>
          </div>

          <div className="hero-art">
            <span className="preview-label">Certificate preview</span>
            <CertificatePreview />
            <span className="hero-art-index" aria-hidden="true">
              PROWLET / CREDENTIALS
            </span>
          </div>
        </section>

        <section
          id="how-it-works"
          className="landing-section process-section"
          aria-labelledby="process-title"
        >
          <div className="section-heading">
            <h2 id="process-title">From issue to proof.</h2>
            <p>
              A clear path from a recipient list to a certificate anyone can
              check.
            </p>
          </div>
          <ol className="process-list">
            {steps.map((step, index) => (
              <li className="process-step" key={step.title}>
                <span className="process-number" aria-hidden="true">
                  0{index + 1}
                </span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="features"
          className="landing-section features-section"
          aria-labelledby="features-title"
        >
          <div className="section-heading">
            <h2 id="features-title">Everything a credential needs.</h2>
            <p>
              Tools for issuers, with a verification experience recipients can
              use without extra setup.
            </p>
          </div>
          <ul className="feature-grid">
            {features.map((feature) => (
              <li className="feature-item" key={feature.title}>
                <span className="feature-marker" aria-hidden="true">
                  {feature.marker}
                </span>
                <div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="closing-section" aria-labelledby="closing-title">
          <div>
            <h2 id="closing-title">Make every achievement easy to trust.</h2>
            <p>Start with a certificate. Give it a way to be checked.</p>
          </div>
          <Link className="action action-primary" href="/register">
            Issue Certificates <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
