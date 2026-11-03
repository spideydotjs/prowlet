"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/issue", label: "Issue" },
  { href: "/dashboard/certificates", label: "Certificates" },
  { href: "/dashboard/templates", label: "Templates" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [pathname, setPathname] = useState("");

  useEffect(() => {
    if (!window.localStorage.getItem("prowlet-session")) {
      router.replace("/login");
      return;
    }
    const timer = window.setTimeout(() => {
      setPathname(window.location.pathname);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router]);

  if (!ready) {
    return (
      <main className="dashboard-loading" aria-live="polite">
        <div className="skeleton-line" />
        <p>Opening issuer workspace...</p>
      </main>
    );
  }

  return (
    <div className="dashboard-frame">
      <aside className="dashboard-sidebar">
        <Link className="wordmark" href="/" aria-label="Prowlet home">
          <span aria-hidden="true">P</span>rowlet
        </Link>
        <p className="sidebar-label">ISSUER WORKSPACE</p>
        <nav className="sidebar-nav" aria-label="Issuer workspace">
          {links.map((link) => (
            <Link
              aria-current={
                pathname === link.href ||
                (link.href === "/dashboard/certificates" &&
                  pathname.startsWith("/dashboard/certificates/"))
                  ? "page"
                  : undefined
              }
              className={
                pathname === link.href ||
                (link.href === "/dashboard/certificates" &&
                  pathname.startsWith("/dashboard/certificates/"))
                  ? "active"
                  : ""
              }
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>Northline Learning Lab</span>
          <button
            type="button"
            className="sidebar-signout"
            onClick={() => {
              window.localStorage.removeItem("prowlet-session");
              router.push("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="dashboard-content">
        <header className="dashboard-topbar">
          <Link href="/" className="dashboard-back">← Public site</Link>
          <span className="preview-notice">Mock issuer workspace</span>
        </header>
        <main className="dashboard-main">{children}</main>
      </div>
    </div>
  );
}
