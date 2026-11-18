# Stockroom — Stock Management System

A single-admin, single-warehouse inventory application in **English and Somali**. The production stack is **Next.js 15 / React 19 → ASP.NET Core / EF Core → PostgreSQL 16**. The warehouse starts empty: only the administrator and system settings are initialized. There is no sample catalog, fabricated activity, or hard-coded admin password.

## Try it now

With Node.js 22+ and npm, from the repository root:

```sh
npm ci
npm run dev
```

Open the displayed port **3000** (or the live preview). This command runs the real Next.js interface with a **private, disposable database per browser**. It uses PGlite, a PostgreSQL engine, and the exact SQL schema, stock commands, queries and constraints used by the ASP.NET API. The preview-only HTTP adapter uses PDFKit and compressed PGlite archives instead of QuestPDF and `pg_dump`. No Docker or .NET installation is needed for this mode.

**First workflow:** Products → Add product → Stock in → Receive stock → Stock out → Cash sale. Then open the order, submit and approve a return, and check **Settings → Security → Run integrity check**. Save your private workspace password/recovery key from that same Security tab **before signing out**.

Preview data survives page reloads on the same browser/server, not sandbox replacement. It is kept in ignored `.local/private-workspaces/`. Inactive previews may be cleaned after seven days. **Do not put real business data in the disposable preview, expose it as your production server, or share its credentials.** Production has no auto-provision endpoint.

## Run the complete deployment

Requirements: Docker Engine with Compose v2, a domain pointing to the server, and inbound TCP ports 80/443. Node is only needed for the optional secret-generation helper.

```sh
node scripts/init-env.mjs        # creates .env with unique random secrets; never overwrites it
# Edit .env: set DOMAIN, confirm ADMIN_USERNAME and your QuestPDF license tier.
docker compose -f docker-compose.prod.yml up -d --build --wait
```

Visit `https://YOUR-DOMAIN`. Caddy serves both `/` and `/api` on the same origin. Sign in with the **initial password in your local `.env`**, save the recovery key offline, and change the password. Initialization variables do not reset an existing account. No credentials belong in Git, issue reports, or screenshots.

- Database: `StockManagementDB`, migrated on API startup. Persistent volumes for PostgreSQL, uploads/backups and TLS state.
- Only Caddy is exposed. The API image includes **matching PostgreSQL 16 client tools**, .NET runtime, and PDF fonts.
- This deployment is **one API instance**. The request maintenance barrier and backup worker assume a single administrator/server. If the dedicated Docker subnet conflicts with a LAN, update the subnet, Caddy IP and `TRUSTED_PROXY_IP` together.
- The project targets .NET 8 as specified. Review runtime support, dependency patches, QuestPDF license eligibility, encrypted storage, off-host backups, and the deployment checks before exposing business data. The Community license is not appropriate for every organization.

See [deployment and recovery](docs/operations.md) for local ASP.NET development, password recovery, and backups.

## What's included

| Area | Behavior |
|---|---|
| Dashboard | On-hand, reserved and available quantities; active catalog/customers; low/out-of-stock alerts; real activities, movements and daily totals |
| Catalog | Product/category/customer create, edit, search, filters, pagination, archive/reactivate, images, movement and customer history |
| Stock in | Multi-line receipts with optional source and invoice number; reasoned reversal only if unreserved stock permits |
| Stock out | One outgoing register for registered orders, cash sales, samples and gifts. Cash buyers do not create fictitious customer accounts |
| Orders | Pending reserves; confirming deducts once; delivery is terminal; cancelling a confirmed order restores stock. Only Pending is editable |
| Returns | Original order required. Pending and already approved quantities count against the return limit. Approval restocks **Good** lines only; damaged lines are reported separately |
| Adjustments | Absolute physical count, previous balance and signed difference, mandatory reason, reservation protection |
| Reports | 13 filterable reports, server-generated PDFs, print from the same PDF, document details, company identity, page numbers |
| Audit and backups | Append-only audit and movements; checksummed archives, verification, download, password + typed confirmation, pre-restore safety snapshot and restore log |
| Settings and access | Company/logo, currency, timezone, date format, low-stock threshold, timeout; bilingual UI, light/dark theme, responsive navigation, JWT/refresh rotation and recovery |

Intentionally excluded: transfers, multiple warehouses, purchase cost, charts, Excel, registration/roles, and payment processing.

## Repository guide

```text
backend/StockMS.sln         Domain, Application, Infrastructure, API, xUnit and Testcontainers
backend/src/StockMS.Api/    Auth, authorized endpoints, validation/errors, backup worker
backend/src/StockMS.Infrastructure/  EF mappings/migration, StockService, PDF and archive services
database/                  Versioned schema, transactional stock engine, read models and report labels
frontend/src/app/          Locale routes, navigation guard, local fonts, responsive styles
frontend/src/components/   Dashboard, shell, forms, details, lists, reports, backup and settings
frontend/src/messages/     English and Somali messages
preview/                   Isolated preview adapter; NOT in the production runtime
infra/                     Production images and Caddy HTTPS routing
scripts/                   Environment initialization, preview launcher, disposable deploy smoke test
tests/                     SQL invariants and Playwright workflows
```

[Architecture and API](docs/api.md) · [Operator guide / Hagaha isticmaalka](docs/guide.md) · [Operations](docs/operations.md)

## Verification

```sh
npm test                           # real PostgreSQL engine: reservations, rollback, returns, ledger, concurrency guards
npm run build                      # optimized Next.js build and TypeScript checks
npx playwright install chromium
npm run test:e2e                    # browser and API workflows against isolated preview workspaces
dotnet test backend/StockMS.sln     # .NET SDK 8 + Docker: validators and API against real PostgreSQL 16
```

For a system-installed Chromium, set `CHROMIUM_PATH`; for an existing preview server, set `E2E_URL`. `.github/workflows/verify.yml` also builds the production containers and runs a **disposable** native PDF / backup / restore smoke test. Do **not** run that smoke test against a live warehouse.

With native PostgreSQL 16 tools installed, `bash tests/native-postgres.sh` independently exercises concurrent sales on two connections and the exact pre/post-restore SQL using `pg_dump`, `pg_restore`, and `psql`. It creates and removes its own socket-only temporary cluster; run it as a non-root user.
