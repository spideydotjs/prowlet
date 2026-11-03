import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="masthead site-header">
      <Link className="wordmark" href="/" aria-label="Prowlet home">
        <span aria-hidden="true">P</span>rowlet
      </Link>
      <nav className="site-nav" aria-label="Main navigation">
        <Link href="/verify">Verify</Link>
        <Link href="/#how-it-works">How it works</Link>
        <Link href="/#features">Features</Link>
        <Link className="nav-sign-in" href="/login">
          Sign in
        </Link>
        <Link className="action action-primary nav-cta" href="/register">
          Issue certificates
        </Link>
      </nav>
    </header>
  );
}
