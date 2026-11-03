import {
  batches,
  certificates,
  type Certificate,
  invalidCertificateId,
  organizations,
} from "@/lib/mock/data";

const delay = (minimum = 380, maximum = 720) =>
  new Promise<void>((resolve) =>
    setTimeout(resolve, minimum + Math.random() * (maximum - minimum)),
  );

const apiBase = process.env.NEXT_PUBLIC_PROWLET_API_URL?.replace(/\/$/, "");

type VerificationResult =
  | { status: "verified" | "pending" | "revoked"; certificate: Certificate }
  | { status: "not-found" | "tampered"; certificate: null };

type DashboardSummary = {
  totalIssued: number;
  thisMonth: number;
  revoked: number;
  verifications: number;
  recent: Certificate[];
  batches: Array<{ id: string; name: string; count: number; status: string }>;
  chart: number[];
};

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined"
    ? JSON.parse(window.localStorage.getItem("prowlet-session") ?? "null")?.token
    : undefined;
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error?.message ?? "The Prowlet API request failed.");
  }
  return result as T;
}

export async function verifyCertificate(id: string) {
  if (apiBase) {
    return requestApi<VerificationResult>(`/verify/${encodeURIComponent(id)}`);
  }
  await delay(500, 900);
  if (id.trim().toUpperCase() === invalidCertificateId) {
    return { status: "tampered" as const, certificate: null };
  }
  const certificate = certificates.find(
    (item) => item.id.toLowerCase() === id.trim().toLowerCase(),
  );
  if (!certificate) return { status: "not-found" as const, certificate: null };
  return {
    status:
      certificate.status === "revoked"
        ? "revoked" as const
        : certificate.status === "pending"
          ? "pending" as const
          : "verified" as const,
    certificate,
  };
}

export async function getCertificates() {
  if (apiBase) {
    const result = await requestApi<{ items: Certificate[] }>("/certificates?limit=100");
    return result.items;
  }
  await delay(240, 450);
  return certificates;
}

export async function getCertificate(id: string) {
  if (apiBase) {
    try {
      return await requestApi<Certificate>(`/certificates/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof Error && error.message === "Certificate not found.") return null;
      throw error;
    }
  }
  await delay(220, 420);
  return certificates.find((certificate) => certificate.id === id) ?? null;
}

export async function revokeCertificate(id: string, reason: string) {
  if (apiBase) {
    return requestApi<Certificate>(`/certificates/${encodeURIComponent(id)}/revoke`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }
  await delay(420, 700);
  const certificate = certificates.find((item) => item.id === id);
  if (!certificate) throw new Error("Certificate not found.");
  certificate.status = "revoked";
  certificate.revokedAt = new Date().toISOString().slice(0, 10);
  certificate.revokeReason = reason.trim() || "Revoked by the issuing organization.";
  return certificate;
}

export async function issueBatch(input: {
  recipients: Array<{ name: string; email: string }>;
  course: string;
  issuer: string;
  template: string;
  issueDate: string;
}) {
  if (apiBase) {
    const submitted = await requestApi<{ batchId: string; id: string }>("/batches", {
      method: "POST",
      body: JSON.stringify(input),
    });
    const id = submitted.batchId ?? submitted.id;
    let status = "GENERATING";
    let failureReason: string | null = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const progress = await requestApi<{ status: string; failure_reason?: string; transactionHash?: string }>(
        `/batches/${encodeURIComponent(id)}`,
      );
      status = progress.status;
      failureReason = progress.failure_reason ?? null;
      if (status === "CONFIRMED") {
        const created = await requestApi<Certificate[]>(
          `/batches/${encodeURIComponent(id)}/certificates`,
        );
        return {
          batchId: id,
          certificates: created,
          transactionHash: progress.transactionHash ?? "",
          template: input.template,
        };
      }
      if (status === "FAILED") throw new Error(failureReason ?? "Certificate batch failed.");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Certificate batch is still processing. Check its status in the dashboard.");
  }
  await delay(800, 1400);
  const batchId = `BATCH-${Date.now()}`;
  const created: Certificate[] = input.recipients.map((recipient, index) => ({
    id: `PRW-${2026}-${String(2000 + certificates.length + index)}`,
    recipient: recipient.name,
    email: recipient.email,
    course: input.course,
    issuer: input.issuer,
    issuerVerified: true,
    status: "issued",
    issueDate: input.issueDate,
    network: "Solana Devnet (mock)",
    transactionHash: `0x${Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64)}`,
    merkleRoot: `0x${Math.random().toString(16).slice(2).padEnd(64, "a").slice(0, 64)}`,
    batchId,
  }));
  certificates.unshift(...created);
  batches.unshift({
    id: batchId,
    name: input.course,
    count: created.length,
    status: "Anchored",
  });
  return {
    batchId,
    certificates: created,
    transactionHash: created[0]?.transactionHash ?? "0x0",
    template: input.template,
  };
}

export async function downloadBatchZip(batchId: string) {
  if (!apiBase) throw new Error("Batch ZIP downloads require the backend API.");
  const token = JSON.parse(window.localStorage.getItem("prowlet-session") ?? "null")?.token;
  const response = await fetch(`${apiBase}/batches/${encodeURIComponent(batchId)}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error?.message ?? "Could not download this batch.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${batchId}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function signIn(email: string, password: string) {
  if (apiBase) {
    return requestApi<{
      id: string;
      name: string;
      email: string;
      website: string;
      status: string;
      token: string;
      user: { id: string; email: string; role: string };
    }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  }
  await delay(350, 600);
  if (!email.includes("@") || password.length < 6) {
    throw new Error("Enter a valid email and a password of at least 6 characters.");
  }
  const organization =
    organizations.find((item) => item.email.toLowerCase() === email.toLowerCase()) ??
    organizations[0];
  return { ...organization, token: "mock-session" };
}

export async function registerOrganization(input: {
  name: string;
  email: string;
  website: string;
  password?: string;
  logo?: File;
}) {
  if (apiBase) {
    const body = input.logo
      ? (() => {
          const form = new FormData();
          form.append("name", input.name);
          form.append("email", input.email);
          form.append("website", input.website);
          form.append("password", input.password ?? "");
          form.append("logo", input.logo);
          return form;
        })()
      : JSON.stringify({
          name: input.name,
          email: input.email,
          website: input.website,
          password: input.password,
        });
    return requestApi<{
      id: string;
      name: string;
      email: string;
      website: string;
      status: string;
    }>("/auth/register", { method: "POST", body });
  }
  await delay(450, 750);
  if (!input.name.trim() || !input.email.includes("@")) {
    throw new Error("Enter an organization name and a valid official email.");
  }
  return {
    id: `org-${Date.now()}`,
    ...input,
    status: "pending verification" as const,
  };
}

export async function getDashboardSummary() {
  if (apiBase) return requestApi<DashboardSummary>("/stats/overview");
  await delay(200, 400);
  const issued = certificates.filter((item) => item.status === "issued").length;
  return {
    totalIssued: certificates.length,
    thisMonth: 14,
    revoked: certificates.filter((item) => item.status === "revoked").length,
    verifications: 1248,
    recent: certificates.slice(0, 6),
    batches,
    chart: [9, 14, 11, 18, 15, 23, 19, 27, 21, 30, 26, issued],
  };
}
