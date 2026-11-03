import Link from "next/link";

import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";

export default function RouteFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="site-frame prowlet-site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="main-content route-main">
        {children}
        <p className="route-back">
          <Link href="/">← Back to Prowlet</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
