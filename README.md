# 📚 Book Lending Library

A back office for a lending library, built with NestJS and TypeScript:
- a **GraphQL API** with real lending rules (loans, due dates, overdue status, fines, renewals and lost books)
- a **React-Admin panel** whose screens change with the user's role
- **book covers** in S3-compatible storage
- a **Help chat** that explains the admin forms from their own field definitions

Everything runs in Docker behind HTTPS. Postgres and storage run either as local containers or as managed services (Neon and Cloudflare R2).

```
browser ──HTTPS──▶ Caddy ──▶ admin SPA (React-Admin)
                     └────▶ API (NestJS: GraphQL + REST uploads) ──▶ PostgreSQL   (Neon / local)
                                                                 ├─▶ S3 storage  (R2 / local)
                                                                 └─▶ LLM for Help chat (Groq free tier, optional)
```

Full reference (business rules, roles, admin features, security, logging, tests): **[docs/DETAILS.md](docs/DETAILS.md)**. Deployment guide: **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Setup

**You need** Docker with Compose 2.20 or newer. That's all: Node, Postgres and S3 storage run in containers.

```bash
cp .env.example .env        # replace every "change-me" value (secrets need 32+ characters)
docker compose up --build   # first start runs migrations and seeds demo data (~1 min)
```

Open **https://localhost**. On the first visit, accept the browser's certificate warning; Caddy uses its own local certificate authority.

| Sign in as | Email | Password |
|---|---|---|
| Admin | `admin@library.local` | `SEED_ADMIN_PASSWORD` from `.env` |
| Librarian | `librarian@library.local` | `SEED_STAFF_PASSWORD` from `.env` |

**Optional:**
- **Help chat:** get a free Groq key (no credit card) at console.groq.com/keys and set `AI_API_KEY` in `.env`. The **Help** button is at the bottom right of the admin.
- **GitHub sign-in:** set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`; see [details](docs/DETAILS.md#github-sign-in-optional).
- **Managed database and storage instead of local containers:** remove `COMPOSE_PROFILES=local-services` from `.env` and point `DATABASE_URL` / `S3_*` at Neon and R2 ([DEPLOYMENT.md](DEPLOYMENT.md)).

**Useful commands:**

```bash
docker compose exec api npm run seed        # wipe and re-seed demo data
docker compose exec api npm run db:reset    # drop schema, migrate, seed
docker compose --profile local-services --profile test run --rm api-test   # unit + e2e tests
docker compose logs -f api                  # request log; startup lists DB / storage / AI in use
curl -k https://localhost/api/health
```

**Seed data:** 400 authors, 5,000 books with generated covers, ~10,000 copies, 1,500 members, and ~62,000 loans over two years. The loans include active, overdue, lost and fined ones, and the seed is deterministic.

## Architecture decisions

- **GraphQL, code-first (NestJS + Apollo).** The API is one typed, self-documenting schema, and all of the admin's data goes through it.
  - Cover uploads are the one REST endpoint, because multipart GraphQL makes CSRF protection awkward.
- **React-Admin over the API rather than a database-level admin.** NestJS has no built-in admin.
  - AdminJS writes straight to the database, which would bypass the lending rules, row locks and role checks.
  - With React-Admin, every admin action goes through the same services and guards as any other client. The cost is more code per screen.
- **Book → BookCopy → Loan.** A library lends physical copies, not titles. This gives real availability counts.
  - A partial unique index guarantees one active loan per copy.
- **Overdue is computed, never stored.** `ACTIVE and dueDate < now()` can't go stale, so no cron job is needed, and it's still filterable in SQL.
- **Business rules are pure functions** (`loan-policy.ts`), applied inside transactions with row locks (`FOR UPDATE`, `SKIP LOCKED`). Two librarians can't lend the last copy twice, and a test proves it.
- **TypeORM.** It's the integration NestJS documents. Relations are declared with decorators, migrations are versioned, and QueryBuilder is used only where the find API can't express a query (EXISTS subqueries, aggregates).
- **Server-side sessions, not JWT.** Sessions live in Postgres behind an HttpOnly `__Host-` cookie, so deactivating a user or changing a role takes effect immediately.
  - The price is CSRF protection: double-submit tokens on every write.
  - Passwords are hashed with argon2id.
- **Two roles enforced twice:** by guards on every resolver and route, and in the admin, which registers different screens per role.
  - A librarian gets read-only catalogue pages and has no Staff menu.
- **Uploads are re-encoded, not trusted.** The file type is checked from the actual bytes, size is capped at 2 MB, and every image is re-encoded to WebP, which strips any embedded payload. Covers are stored under random keys.
- **Help chat grounded in the forms themselves.** Field help is written once, as descriptions on the GraphQL input types (NestJS's equivalent of Django's `help_text`).
  - The forms show that help, and the chat gets it in its prompt together with the real validation rules, so the two can't disagree.
  - It uses any OpenAI-compatible API through plain `fetch`, Groq's free tier by default, so it costs nothing and changing provider is only configuration.
- **Where data lives is configuration only.** The same images run against local containers or managed Neon and R2. The API logs which one it's using at startup, so it never silently falls back to local.
  - If storage or the AI provider is down, only those features stop working.
- **One place for errors.** Services throw, and one function decides what each error means and what the user sees.
  - Unexpected errors show the user a reference id, and the log has the full stack trace under that same id.

## What I'd do differently with more time

- **Frontend tests and CI.** The 39 tests cover the API's rules, security, the AI integration and error handling, but there are no admin component tests and no Playwright suite. There is also no CI pipeline running tests, lint and the migration-drift check on every push. I'd add those first.
- **Generated GraphQL types for the admin.** The admin's queries are hand-written strings. I'd use GraphQL Code Generator from the start, so a schema change breaks the build instead of a screen.
- **Cursor pagination** for the big lists, such as 62k loans. Offset pagination slows down on deep pages.
- **Multiple API instances.** Rate limits are kept in memory. Running more than one API instance would need Redis for those (sessions are already in Postgres).
  - Covers are streamed through the API; I'd serve them from a CDN with signed URLs.
- **Observability:** error tracking (Sentry) and tracing and metrics (OpenTelemetry) on top of the current request log.
  - An **audit log** of staff actions such as waived fines, deactivations and role changes.
- **Help chat robustness.** Groq retired the first model I used during development, which taught me to plan for that. I'd add:
  - a fallback model list
  - a small set of evaluation questions run in CI
  - streamed answers
- **Product features:**
  - overdue reminder emails (a job queue)
  - reservations and holds
  - multiple branches
  - a barcode-first checkout screen for the front desk, instead of generic admin forms
