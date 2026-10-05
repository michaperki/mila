# Mila account deployment

Production: https://mila-hebrew.netlify.app/

- `/login` and `/signup` contain the account forms. Guests can reach them from the header, Settings, and capture/vocabulary prompts.
- Local web configuration is read from `apps/web/.env`, not the repository root `.env`.
- Netlify Functions need `MONGODB_URI`, `MONGODB_DB_NAME` (defaults to `mila`), and `JWT_SECRET` in the production environment. Redeploy after changing environment variables.
- After replacing an Atlas cluster, update both the local and Netlify connection strings. Configure a database user and the Atlas network access list for the clients that connect. A new empty cluster requires new Mila accounts unless data is restored from a backup.
- The Vite dev server alone does not run the account functions; use Netlify dev for local full-stack authentication.

## Diagnosing errors

Incorrect credentials return 401; an existing account during signup returns 409. Service failures include a reference ID that matches the auth function log entry.

- `AUTH_CONFIG`: missing signing configuration (`JWT_SECRET`).
- `DATABASE_CONFIG`: missing or malformed `MONGODB_URI`.
- `DATABASE_UNAVAILABLE`: storage connection failed. Check the Atlas cluster, URI, database user, and network access. The database log includes the error name/code without connection strings. `ENOTFOUND` can indicate a deleted cluster or stale hostname.
- `AUTH_INTERNAL`: unexpected failure. Find the reference ID in Netlify's auth function logs.

Tests: from `apps/web`, run `pnpm exec vitest run tests/auth.test.ts tests/mongo.test.ts src/state/useAuthStore.test.ts`, then `pnpm build`.

On Windows/WSL, install dependencies for the environment running the build; Windows esbuild binaries cannot run inside WSL.
