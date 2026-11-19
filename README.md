# 📚 Book Lending Library

A back office for a lending library, built with NestJS and TypeScript:

- a **GraphQL API** with real lending rules (loans, due dates, overdue status, fines, renewals and lost books)
- a **React-Admin panel** whose screens change with the user's role
- **book covers** in S3-compatible storage
- a **Help chat** that explains the admin forms from their own field definitions

**Live demo:** https://book-lending-68y1.onrender.com. The demo logins (one Admin, one Librarian) are in the submission email. The free tier sleeps after 15 idle minutes, so the first visit can take about a minute.

Production runs on Render as one container, the API serving the admin too, with Neon Postgres and Neon Object Storage. Locally, Docker Compose runs the same app behind Caddy with HTTPS, against Neon or local containers.

```
browser ──HTTPS──▶ Render / Caddy ──▶ API (NestJS: GraphQL + REST uploads, serves the admin SPA)
                                        ├─▶ PostgreSQL   (Neon / local container)
                                        ├─▶ S3 storage   (Neon Object Storage / local container)
                                        └─▶ LLM for Help chat (Groq free tier, optional)
```

## Why this stack

- **TypeScript end to end.** One language for the API, the admin and the validation rules shared between them.
- **NestJS.** Modules, guards and pipes give a clear place for each concern. Role checks are declared once per resolver instead of scattered through handlers.
- **GraphQL (code-first).** The admin gets one typed, self-documenting API. The input types double as the source of the forms' field help.
- **React-Admin.** NestJS has no built-in admin, so this is the admin framework that provides the generated tooling:
  - list views with filters, search and sorting
  - inline editing of related records
  - bulk actions
  - role-aware menus

  It works through the API instead of writing to the database directly, so every admin action goes through the same rules, locks and permission checks.

- **TypeORM.** The ORM NestJS documents, with decorator-defined relations and versioned migrations.
- **Neon + Render.** Neon provides managed Postgres and S3-compatible object storage in one free account. Render hosts the single container for free with HTTPS. Both are free tiers, so the whole deployment costs nothing.

Full reference (business rules, roles, admin features, security, logging, tests): **[docs/DETAILS.md](docs/DETAILS.md)**. Deployment guide: **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## Setup

**You need** Docker with Compose 2.20 or newer. That's all: Node, Postgres and S3 storage run in containers.

```bash
cp .env.example .env        # then fill in every empty secret (see the comments in the file)
docker compose up --build   # first start runs migrations and seeds demo data (~1 min)
```

Open **https://localhost**. On the first visit, accept the browser's certificate warning; Caddy uses its own local certificate authority.

| Sign in as | Email                     | Password                          |
| ---------- | ------------------------- | --------------------------------- |
| Admin      | `admin@library.local`     | `SEED_ADMIN_PASSWORD` from `.env` |
| Librarian  | `librarian@library.local` | `SEED_STAFF_PASSWORD` from `.env` |

## Architecture decisions

- **GraphQL, code-first (NestJS + Apollo).** The API is one typed, self-documenting schema, and all of the admin's data goes through it.
  - Cover uploads are the one REST endpoint, because multipart GraphQL makes CSRF protection awkward.
- **React-Admin over the API.**
  - AdminJS writes straight to the database, which would bypass the lending rules, row locks and role checks.
  - With React-Admin, every admin action goes through the same services and guards as any other client. The cost is more code per screen.
- **Book → BookCopy → Loan.** A library lends physical copies, not titles. This gives real availability counts.
  - A partial unique index guarantees one active loan per copy.
  - **The many-to-many relationship is Member ↔ BookCopy through Loan.** A member borrows many copies over time, and a copy is borrowed by many members. The join is a full entity, not a bare join table, because it carries data: dates, status, renewals and fines.
  - Book → Author is a plain foreign key (one author per book); see [Deliberately skipped](#deliberately-skipped).
- **Overdue is computed, never stored.** `ACTIVE and dueDate < now()` can't go stale, so no cron job is needed, and it's still filterable in SQL.
- **TypeORM.** It's the integration NestJS documents. Relations are declared with decorators, migrations are versioned, and QueryBuilder is used only where the find API can't express a query (EXISTS subqueries, aggregates).
- **Server-side sessions, not JWT.** Sessions live in Postgres behind an HttpOnly `__Host-` cookie, so deactivating a user or changing a role takes effect immediately.
  - The price is CSRF protection: double-submit tokens on every write.
  - Passwords are hashed with argon2id.
- **Uploads are re-encoded, not trusted.** The file type is checked from the actual bytes, size is capped at 2 MB, and every image is re-encoded to WebP, which strips any embedded payload. Covers are stored under random keys.
- **Help chat.**
  - The forms show that help, and the chat gets it in its prompt together with the real validation rules, so the two can't disagree.
  - It uses any OpenAI-compatible API through plain `fetch`, Groq's free tier by default, so it costs nothing and changing provider is only configuration.
- **Where data lives is configuration only.** The same images run against local containers or managed Neon (Postgres + Object Storage). The API logs which one it's using at startup, so it never silently falls back to local.
  - If storage or the AI provider is down, only those features stop working.
- **One place for errors.** Services throw, and one function decides what each error means and what the user sees.
  - Unexpected errors show the user a reference id, and the log has the full stack trace under that same id.
- **Neon Object Storage.** 
  - Book covers are stored in object storage, not on the server’s disk. I used Neon Object Storage, which is S3-compatible and comes with the same Neon project as the database. I choose it because: 
    - One provider and one deploy, a single neon deploy creates both the database and the bucket and writes their credentials as environment variables, so there’s no second account or set of keys to manage.

## What I'd do differently with more time

- **Commits** If I started again, the biggest change would be to commit in small, feature-sized steps from day one. The first commit contains the whole foundation (database, auth and API), which makes individual decisions harder to review. I’d also add a CI pipeline early, running the tests, lint and a check on every push.
- **Generated GraphQL types for the admin.** The admin's queries are hand-written strings. I'd use GraphQL Code Generator from the start, so a schema change breaks the build instead at runtime.
- **Multiple API instances.** Rate limits are kept in memory. Running more than one API instance would need Redis for those (sessions are already in Postgres).
- **Observability:** error tracking (Sentry) and tracing and metrics (OpenTelemetry) on top of the current request log.
  - An **audit log** of staff actions such as waived fines, deactivations and role changes.
- **Product features:**
  - overdue reminder emails (a job queue)
  - reservations and holds
  - multiple branches, in case the project is growing
