"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="error-boundary">
      <p className="eyebrow">Unexpected error</p>
      <h1 className="route-title">This page could not load.</h1>
      <p className="route-intro">Try again. If the problem continues, return to the homepage.</p>
      <button className="action action-primary" type="button" onClick={retry}>Try again</button>
    </main>
  );
}
