export type CertificateStatus = "issued" | "pending" | "revoked";

export type Certificate = {
  id: string;
  recipient: string;
  email: string;
  course: string;
  issuer: string;
  issuerVerified: boolean;
  status: CertificateStatus;
  issueDate: string;
  network: string;
  transactionHash: string;
  merkleRoot: string;
  batchId: string;
  revokedAt?: string;
  revokeReason?: string;
};

export const organizations = [
  {
    id: "org-northline",
    name: "Northline Learning Lab",
    email: "credentials@northline.example",
    status: "verified",
  },
  {
    id: "org-fieldwork",
    name: "Fieldwork Institute",
    email: "admin@fieldwork.example",
    status: "pending verification",
  },
];

export const batches = [
  { id: "BATCH-2026-041", name: "Data Ethics Spring Cohort", count: 18, status: "Anchored" },
  { id: "BATCH-2026-039", name: "Community Health Workshop", count: 12, status: "Anchored" },
  { id: "BATCH-2026-033", name: "Applied Research Methods", count: 9, status: "Anchored" },
  { id: "BATCH-2026-028", name: "Climate Field School", count: 15, status: "Anchored" },
  { id: "BATCH-2026-021", name: "Facilitation Fundamentals", count: 11, status: "Anchored" },
];

const names = [
  "Mara Ellison", "Ibrahim Okafor", "Sofia Almeida", "Noah Kim", "Priya Nair",
  "Mateo Alvarez", "Amina Yusuf", "Theo March", "Leila Haddad", "Jonah Price",
  "Nadia Petrov", "Ravi Menon", "Camille Laurent", "Adrian Flores", "Zara Ahmed",
  "Elliot Chen", "Grace Osei", "Rafael Costa", "Mina Park", "Owen Brooks",
  "Luca Romano", "Talia Green", "Samira Khan", "Felix Bauer", "Ines Duarte",
  "Dev Patel", "Amara Diallo", "Hugo Silva", "Yuki Tanaka", "Elena Markovic",
  "Daniel Reyes", "Nia Campbell",
];

const courses = [
  "Foundations of Data Ethics",
  "Community Health Workshop",
  "Applied Research Methods",
  "Climate Field School",
];

const transactionHash = "mock:seeded-certificate-transaction";
const merkleRoot = "0x7f3b2c1d9a8e6540f123bcde9876543210aabbccddeeff001122334455667788";

export const certificates: Certificate[] = names.map((recipient, index) => {
  const isRevoked = index === 7;
  const isPending = index === 25 || index === 29;
  return {
    id: `PRW-${2026}-${String(1001 + index)}`,
    recipient,
    email: `${recipient.toLowerCase().replaceAll(" ", ".")}@example.org`,
    course: courses[index % courses.length],
    issuer: index % 3 === 0 ? "Fieldwork Institute" : "Northline Learning Lab",
    issuerVerified: index % 3 !== 0,
    status: isRevoked ? "revoked" : isPending ? "pending" : "issued",
    issueDate: `2026-0${(index % 5) + 1}-${String((index * 3) % 27 + 1).padStart(2, "0")}`,
    network: "Solana Devnet (mock)",
    transactionHash,
    merkleRoot,
    batchId: batches[index % batches.length].id,
    ...(isRevoked
      ? {
          revokedAt: "2026-04-14",
          revokeReason: "Issued with an incorrect course completion date.",
        }
      : {}),
  };
});

export const templates = [
  { id: "modern", name: "Modern", detail: "Open layout with a strong type hierarchy." },
  { id: "classic", name: "Classic", detail: "A formal frame for academic credentials." },
  { id: "field", name: "Field study", detail: "A compact design for workshops and events." },
  { id: "minimal", name: "Minimal", detail: "A simple record with room for your mark." },
];

export const invalidCertificateId = "PRW-2026-INVALID";
