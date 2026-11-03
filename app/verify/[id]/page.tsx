"use client";

import { useParams } from "next/navigation";
import { Suspense } from "react";

import RouteFrame from "@/components/route-frame";
import VerifyForm from "@/components/verify-form";

export default function VerifyCertificatePage() {
  return (
    <RouteFrame>
      <Suspense fallback={<p className="preview-notice">Opening certificate record...</p>}>
        <VerifyRoute />
      </Suspense>
    </RouteFrame>
  );
}

function VerifyRoute() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  return <VerifyForm initialId={id} />;
}
