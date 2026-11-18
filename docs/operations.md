# Operating Stockroom

## Local production-stack development

Use Node 22+, .NET SDK 8, and Docker Compose (or an existing PostgreSQL 16). Commands below are for a POSIX shell. On Windows set equivalent environment variables in PowerShell or use WSL. Never copy the real `.env` into Git.

```sh
npm ci
node scripts/init-env.mjs
docker compose up -d --wait db
set -a; . ./.env; set +a
export ConnectionStrings__Stock="Host=127.0.0.1;Database=$POSTGRES_DB;Username=$POSTGRES_USER;Password=$POSTGRES_PASSWORD"
export ASPNETCORE_ENVIRONMENT=Development
dotnet run --project backend/src/StockMS.Api --urls http://0.0.0.0:5080
```

In another terminal:

```sh
API_ORIGIN=http://127.0.0.1:5080 npm run web
```

`API_ORIGIN` is **server-side only**; browser code always uses relative `/api` URLs. Open port 3000. This is **not** `npm run dev`, which intentionally uses isolated preview storage. For native backup/verify/restore outside the API container, install matching `pg_dump`, `pg_restore` and `psql` on the API server's PATH. `STORAGE_DIR` sets a private writable files directory outside the web root.

## Authentication and recovery

Single administrator, salted PBKDF2 hashes, 15-minute signed access tokens, rotated hashed refresh tokens, 12-hour absolute session and configurable idle limit. Reuse of a revoked refresh token invalidates the session family. Password changes/resets revoke all sessions. Five wrong logins lock the account for 15 minutes. Production cookies are Secure, HttpOnly and same-site. An additional root-path navigation marker is **not** an authentication token. Caddy is the only trusted forwarding proxy in the provided deployment.

First sign-in shows a recovery key and requires a new password. If a password is forgotten, use **Forgot your password?** with the saved key. A successful reset consumes it, and the next sign-in issues a new key. Save new recovery keys from Settings → Security. If the recovery key is lost too, a server operator can reset the password by piping a **new secret from stdin** (not a command-line argument):

```sh
# Bash: no typed password in shell history or process arguments.
read -rs -p 'New initial password (12+ characters): ' NEW_ADMIN_PASSWORD; echo
printf '%s\n' "$NEW_ADMIN_PASSWORD" | docker compose -f docker-compose.prod.yml exec -T api dotnet StockMS.Api.dll reset-admin
unset NEW_ADMIN_PASSWORD
```

This forces a password change, revokes existing sessions, logs recovery and issues a fresh recovery key at the next sign-in. In preview mode, opening a *new private workspace* creates a separate empty database; it never unlocks another workspace.

## Backups and restore drills

1. Backups → **Create backup**. The production API queues a durable InProgress record; its worker runs `pg_dump -Fc`. The list updates while the job is pending. No shell-expanded user input or database passwords in command-line arguments.
2. **Verify backup** recomputes SHA-256 and checks `pg_restore --list`. Download a copy to encrypted storage off the host. The checksum detects accidental corruption; it is not a digital signature. Treat the archive as sensitive.
3. Backups are **full database** archives, including admin password hashes, not a backup of the filesystem. Back up the `stockfiles` volume (especially `uploads/`) and deployment secrets separately. Uploaded paths are restored only if the corresponding files survive. Allow space for the archive, safety snapshot, and decompressed restore SQL.
4. In-place restore accepts **only an existing, locally generated archive selected by id**. Require the current password plus the literal `RESTORE`. The API verifies the archive, creates and verifies a pre-restore safety backup, and holds the single-instance maintenance barrier.
5. Native `pg_restore` prepares the clean restore SQL. `psql --single-transaction` applies it, preserves the local archive/restore catalog, checks ledger integrity, revokes restored sessions and logs completion **before commit**. If any SQL step fails, the old database remains. The safety snapshot is retained. Do not allow external writers or run multiple API replicas during restore.
6. Sign in using the credentials that belonged to the restored snapshot. Inspect the audit log, backup history and integrity check. In a disaster, restore the **full archive into a fresh PostgreSQL 16 database**, restore uploads, rotate `JWT_SECRET`, revoke all refresh tokens and verify `SELECT stock_integrity()` before exposing the service.

Preview archives are PGlite data-directory snapshots (`.tar.gz`), **not interchangeable** with native `.dump` archives. Each preview is isolated. Restore loads a new database directory, validates integrity and switches only on success.

## Release checklist

- [ ] Run `dotnet test backend/StockMS.sln -c Release` with Docker available.
- [ ] Run SQL and browser tests, and build the production Next.js bundle.
- [ ] Run the CI disposable Compose smoke test, including native PDF and restore.
- [ ] Review package/runtime support and upgrade to supported, patched versions before a public deployment. The requested .NET 8 target reached end of support in November 2026.
- [ ] Confirm QuestPDF licensing. Set `QUESTPDF_LICENSE` to Community only if eligible, otherwise use the licensed tier.
- [ ] Configure domain, TLS, trusted proxy address, secrets, firewall, file permissions and off-host encrypted storage. Only 80/443 should be public.
- [ ] Test wrong-password lockout, recovery, idle timeout, logout and upload restrictions in staging. Verify no preview provisioning endpoint is present.
- [ ] Rehearse restoring a backup in isolation, then inspect both stock balances and uploaded documents.
- [ ] Monitor free disk, failed backup jobs and restore temporary space. Keep independent off-host audit copies if stronger tamper resistance is required.
