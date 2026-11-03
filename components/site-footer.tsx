import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="directory site-footer">
      <Link className="footer-wordmark" href="/" aria-label="Prowlet home">
        <span aria-hidden="true">P</span>rowlet
      </Link>
      <nav className="directory-links" aria-label="Footer navigation">
        <Link href="/verify">Verify a certificate</Link>
        <Link href="/register">For issuers</Link>
        <Link href="/login">Sign in</Link>
      </nav>
      <span className="footer-note">Certificates made verifiable.</span>
    </footer>
  );
}
