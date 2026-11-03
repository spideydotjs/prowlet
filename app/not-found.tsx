import Link from "next/link";

import RouteFrame from "@/components/route-frame";

export default function NotFound() {
  return (
    <RouteFrame>
      <section className="route-empty not-found-panel">
        <p className="eyebrow">404 / Not found</p>
        <h1 className="route-title">This page is not here.</h1>
        <p className="route-intro">The address may have changed, or the link may be incorrect.</p>
        <Link className="action action-primary" href="/">Return to Prowlet</Link>
      </section>
    </RouteFrame>
  );
}
