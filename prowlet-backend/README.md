# Prowlet backend

TypeScript/Express API for issuer accounts, certificate batches, verification, and revocation. PostgreSQL stores auth and application records. Solana Devnet anchoring is supported through the existing Anchor registry; **mock mode is the default** because the local relayer wallet has no SOL and the program has not yet been deployed. Mock transactions are marked `mock:` and the response network includes `(mock)`; they are not on-chain proofs.

The program ID is `Hi76RFfVSD82bW3KLhUYWw5rLRf4xVLrS5JzdYEgKdcB`. The deployer keypair remains outside the repository at `~/.config/solana/prowlet-devnet-wallet.json` with restrictive local permissions. Never copy key material into `.env`, source, logs, or chat. The keypair currently has no SOL, so real deployment/transactions are not available yet.

## Requirements and local setup

- Node.js 20+
- PostgreSQL 16+ (the API role needs ownership of its own database)
- Solana CLI and Anchor CLI 0.32.1 only when building/deploying the program

Create a dedicated database and a restricted login; do not point the API at an unrelated application database or a Postgres superuser. For the existing local Docker container, the host mapping is `127.0.0.1:5435`:

```sql
CREATE ROLE prowlet_app LOGIN PASSWORD 'use-a-unique-secret';
CREATE DATABASE prowlet OWNER prowlet_app;
```

In `prowlet-backend/`, copy `.env.example` to `.env`, set a unique `JWT_SECRET` (at least 32 characters), the database URL, and the absolute wallet **path**. The private key itself does not belong in environment variables. `.env` is ignored and should be mode `600`.

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

The API listens on `http://localhost:4000`; health check: `GET /health`; OpenAPI JSON: `GET /api/docs` or `/api/openapi.json`. The seed creates an admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`), two approved issuer organizations, five batches, 32 certificates, and one revoked example. Demo issuer login is `credentials@northline.example` / `ProwletDemo-2026`; change demo credentials before exposing a shared environment.

From the project root, set `NEXT_PUBLIC_PROWLET_API_URL=http://localhost:4000/api` in the ignored frontend `.env.local`, then start Next.js. Without this setting, the existing frontend mock API remains active. Auth registration now collects a password; new organizations stay pending until an administrator approves them.

## Solana Devnet

The API uses the existing wallet file only when `BLOCKCHAIN_MODE=solana`; the default `mock` mode runs end-to-end issuance and auth tests without a funded wallet. For real mode, first fund the relayer with Devnet SOL, build/deploy the Anchor program, and initialize the registry:

```bash
cd prowlet-backend
npm run build
ANCHOR_WALLET="$HOME/.config/solana/prowlet-devnet-wallet.json" npm run deploy:devnet
```

Then set `BLOCKCHAIN_MODE=solana`, confirm `SOLANA_RPC_URL`, `SOLANA_KEYPAIR_PATH`, and `PROGRAM_ID`, restart the API, and confirm the registry is initialized. The same wallet acts as registry administrator, approved issuer, and gas payer. No deployment or real-chain transaction is represented as successful until the Devnet wallet is funded and the program is deployed.

The program stores batch roots, counts, issuer keys, and revocation leaf hashes only. Recipient data and the random 16-byte salt remain off-chain. The application recomputes each Keccak leaf from its stored certificate fields/salt, checks the sorted-pair Merkle proof, and in Solana mode simulates the on-chain `verify` instruction.

## Routes

All endpoints are under `/api`; protected issuer routes use `Authorization: Bearer <JWT>`. Errors use `{ "error": { "code": "...", "message": "..." } }`.

| Method and route | Access | Purpose |
|---|---|---|
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Public / JWT | Register pending organization, issue a session, inspect account |
| `GET /admin/organizations?status=pending` | Admin | Review organizations |
| `PATCH /admin/organizations/:id/approve` or `/reject` | Admin | Approve or reject an issuer |
| `POST /batches/preview` | Approved issuer | Parse and validate a CSV (`file`, max 5 MB) |
| `POST /batches` | Approved issuer | Start asynchronous batch issuance |
| `GET /batches`, `GET /batches/:id` | Approved issuer | List batches / poll progress |
| `POST /batches/:id/retry` | Approved issuer | Retry a failed batch using its saved, private salt/proof records |
| `GET /batches/:id/certificates`, `GET /batches/:id/download` | Approved issuer | List issued records / download a ZIP of PDFs |
| `GET /certificates?search=&status=&page=&limit=` | Approved issuer | Search, filter, and paginate own certificates |
| `GET /certificates/:id`, `/proof` | Approved issuer | Certificate record / Merkle proof data |
| `POST /certificates/:id/revoke` | Approved issuer | Revoke own certificate, anchoring on-chain in Solana mode |
| `GET /certificates/:id/pdf`, `/qr` | Public | Retrieve a certificate PDF or QR code |
| `GET /verify/:certificateId`, `POST /verify/upload` | Public | Verify an ID or a generated PDF |
| `GET /stats/overview`, `GET /templates` | Approved issuer | Dashboard data and template list |

Batch states are `GENERATING`, `BUILDING_TREE`, `SUBMITTING`, `CONFIRMED`, and `FAILED`. The server limits a batch to 1,000 recipients, uploads to configured size limits, validates inputs with Zod, rate-limits auth/public verification, restricts CORS to `FRONTEND_URL`, and scopes issuer queries to their organization. PDFs, QR images, and uploaded logos are stored locally under `UPLOAD_DIR`; use private durable storage before production.

## Frontend mock-to-real mapping

`lib/api/index.ts` keeps its existing exported function signatures and switches to HTTP when `NEXT_PUBLIC_PROWLET_API_URL` is set:

| Frontend function | Backend route |
|---|---|
| `registerOrganization` | `POST /auth/register` |
| `signIn` | `POST /auth/login` |
| `verifyCertificate` | `GET /verify/:certificateId` |
| `issueBatch` | `POST /batches`, poll `GET /batches/:id`, then `GET /batches/:id/certificates` |
| `revokeCertificate` | `POST /certificates/:id/revoke` |
| `getCertificates` | `GET /certificates` |
| `getCertificate` | `GET /certificates/:id` |
| `getDashboardSummary` | `GET /stats/overview` |
| Batch ZIP download | `GET /batches/:id/download` |

## Tests and scripts

```bash
npm run api:build      # Type-check/compile the Express API
npm test               # Apply migrations and run Postgres-backed API tests
npm run test:api       # Apply migrations and run the API tests only
npm run test:anchor    # Anchor local-validator contract tests only
npm run test:unit      # Rust program unit tests
```

`npm run test:anchor` and Devnet deployment require the Solana CLI/validator and `cargo-build-sbf`; those tools are not currently available in this environment. The Rust-level contract tests run with `npm run test:unit`.

The API test exercises registration, pending approval enforcement, issuance, Merkle verification, revocation, and public invalid-ID handling against the configured PostgreSQL database in mock-chain mode. It removes its temporary organization data.
