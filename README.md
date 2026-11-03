# Prowlet

Prowlet is a frontend-only certificate issuing and verification preview built with Next.js App Router, TypeScript, and Tailwind CSS v4. Certificate, organization, and issuer-session data is local mock data. Blockchain access, PDF generation, camera scanning, and email delivery are not connected.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/verify` | Verify by certificate ID, select a PDF, or view the QR scan placeholder |
| `/verify/[id]` | Open verification for a certificate ID |
| `/login` | Mock issuer sign in |
| `/register` | Mock organization registration and pending-verification state |
| `/dashboard` | Issuer overview and issuance activity |
| `/dashboard/issue` | Five-step mock certificate batch wizard |
| `/dashboard/certificates` | Searchable and filterable certificate list with copy and revoke actions |
| `/dashboard/certificates/[id]` | Certificate preview, proof metadata, and activity |
| `/dashboard/templates` | Sample certificate designs |
| `/dashboard/settings` | Mock organization settings |

Issuer routes use a browser-local mock session and redirect to `/login` when no session exists. Sign in with `credentials@northline.example` and any password of at least six characters.

## Mock data and services

- `lib/mock/data.ts` seeds two organizations, five batches, and 32 certificates across issued, pending, and revoked states.
- `lib/api/index.ts` is the data-access boundary. Its async functions simulate latency and return or mutate mock data.
- `components/` contains reusable public navigation, certificate preview, forms, the dashboard shell, and the issue wizard.

## Mock-to-real API mapping

| Mock function | Future integration |
| --- | --- |
| `verifyCertificate(id)` | Certificate lookup API, integrity proof verification, and chain read |
| `getCertificates()` / `getCertificate(id)` | Authenticated issuer certificate list and detail endpoints |
| `revokeCertificate(id, reason)` | Revocation service plus on-chain revocation transaction |
| `issueBatch(input)` | PDF generation, batch/Merkle computation, transaction submission, and batch persistence |
| `signIn(email, password)` | Organization authentication and session/token creation |
| `registerOrganization(input)` | Organization registration and verification workflow |
| `getDashboardSummary()` | Issuer analytics and activity endpoints |

Replace the implementations in `lib/api/index.ts` with service calls while retaining their typed interfaces. The issue wizard's CSV parser, PDF selection, share/download placeholders, and email actions are frontend demonstrations only.

## Run locally

```bash
npm install
npm run dev
```
