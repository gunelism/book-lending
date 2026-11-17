# 📚 Book Lending Library

A library back office: a **NestJS + GraphQL** API with real lending rules, a **React-Admin** panel with role-based screens, **PostgreSQL**, and **S3-compatible object storage** for book covers. Everything runs in Docker over HTTPS.

```
                         https://localhost
                                │
                     ┌──────────▼──────────┐
                     │ caddy (HTTPS, local │  serves the admin SPA,
                     │ CA, security hdrs)  │  proxies /graphql /api /auth
                     └──────────┬──────────┘
                                │
                     ┌──────────▼──────────┐
                     │ api  (NestJS 11)    │  GraphQL (code-first, Apollo)
                     │ sessions · CSRF ·   │  REST for cover uploads
                     │ roles · validation  │  business rules in services
                     └─────┬──────────┬────┘
                           │          │
                ┌──────────▼───┐  ┌───▼──────────┐
                │ postgres 17  │  │ minio (S3)   │  cover images
                └──────────────┘  └──────────────┘
```

## Quick start

```bash
cp .env.example .env          # then replace every "change-me" value
docker compose up --build     # first start migrates the DB and seeds demo data (~1 min)
```

Open **https://localhost**. Caddy uses its own local certificate authority, so the browser warns about the certificate the first time. Either accept the warning, or trust Caddy's root certificate once (macOS):

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain caddy-root.crt
```

| Account | Email | Password |
|---|---|---|
| Admin | `admin@library.local` (or `SEED_ADMIN_EMAIL`) | `SEED_ADMIN_PASSWORD` from `.env` |
| Librarian | `librarian@library.local`, `librarian2@library.local` | `SEED_STAFF_PASSWORD` from `.env` |
| Inactive librarian | `former.staff@library.local` | can't sign in (shows that deactivation works) |

Other local endpoints: the object-storage console is at http://localhost:9001 (log in with `S3_ACCESS_KEY` / `S3_SECRET_KEY`), and Postgres is published on `localhost:5433` (the containers still talk to it on 5432 internally). Both bind to 127.0.0.1 only.

## Everyday commands

```bash
docker compose exec api npm run seed       # wipe all data + covers and seed again
docker compose exec api npm run db:reset   # drop the schema, re-run migrations, seed
docker compose --profile test run --rm api-test   # unit + e2e tests (separate library_test DB)
docker compose logs -f api
docker compose down -v                      # stop and delete all data volumes
```

The seed uses a fixed Faker seed, so it produces the same data every run. Dates are relative to "now", so there are always active, overdue and recently returned loans. Pass `--covers=none` to skip cover generation, or set `SEED_SCALE=2` to double the dataset.

**What gets seeded:**

| Data | Count |
|---|---|
| Authors | 400 |
| Books | 5,000 |
| Physical copies | ~10,300 |
| Members | 1,500 |
| Loans (2 years of history) | ~62,000 |

The loans break down as ~2,300 active, ~400 overdue and ~250 lost, plus late returns with paid and unpaid fines. Generated covers for about 92% of the books are uploaded to object storage.

## Domain model

```
Author 1──* Book 1──* BookCopy 1──* Loan *──1 Member          User (staff accounts)
                │                     │
            coverKey (S3)      status ACTIVE|RETURNED|LOST, dueDate, returnedAt,
                               renewCount, fineCents, finePaid
```

* **Foreign keys:** `Book.authorId`, `BookCopy.bookId`, `Loan.copyId` and `Loan.memberId`.
* **File field:** `Book.coverKey` holds an object-storage key. The image is served through `GET /api/books/:id/cover`, which requires a session.
* **Physical copies:** a library lends copies, not titles, so `BookCopy` exists. A database partial unique index guarantees **at most one active loan per copy**.

## Business logic

All the rules live in `apps/api/src/loans/loan-policy.ts` as pure functions, and `loans.service.ts` applies them inside transactions with row locks.

```
checkout ──▶ ACTIVE ──return──▶ RETURNED   (late fee: €0.25 per started day, capped at €20)
               │ ▲
               └─┘ renew   (max 2 times, +14 days each, never while overdue)
               │
               └──markLost──▶ LOST   (copy marked LOST, member charged the book's replacement cost)
```

* **Overdue is computed, never stored.** A loan is overdue when `status = ACTIVE AND dueDate < now()`, so it can't go stale. The API exposes it as `displayStatus`, `isOverdue`, `daysOverdue` and `accruedFineCents`, and you can filter on it (`filter: { status: OVERDUE }`).
* **Checkout is refused when** the member:
  * is inactive,
  * has any overdue loan,
  * owes more than €10, or
  * already has 5 active loans.

  The same rules feed `Member.borrowBlockReason`, so the admin can show *why* someone can't borrow before you even submit the form.
* **No double-lending under concurrency.** The member row is locked (`FOR UPDATE`), copies are picked with `FOR UPDATE SKIP LOCKED`, and the partial unique index is the final safety net. An e2e test fires two simultaneous checkouts at the last copy and asserts exactly one succeeds.
* **Other validation rules:**
  * ISBN checksums are verified (ISBN-10 and ISBN-13).
  * A due date can be at most 60 days away.
  * Copies on loan can't have their status changed by hand.
  * Records with loan history can't be deleted (deactivate or mark lost instead).

## Data access (TypeORM)

* **Entities declare the schema with decorators.** Relations use `@ManyToOne` / `@OneToMany` with `@JoinColumn`; constraints use `@Check`; indexes use `@Index`, including the partial unique index `UQ_loans_one_active_per_copy`. The trigram search indexes need a Postgres operator class that decorators can't express, so a migration creates them and the entities declare them with `synchronize: false`. `migration:generate` reports no differences between the entities and the migrated database.
* **Services use repositories, the find API and relations by default:**
  * `findAndCount` with `where` (an array where conditions are ORed), `relations` and nested `order`.
  * Sortable fields come from the entity metadata, not from per-service lists. A list can be sorted by any column of its entity, or by a column one step through a to-one relation (`author.lastName`, `member.lastName`). Anything else is rejected with `BAD_USER_INPUT`: computed fields, to-many relations, and hidden `select: false` columns such as `passwordHash`.
  * Operators such as `ILike`, `In`, `LessThan` and `Between`.
  * Filters through relations, e.g. `{ copy: { book: { id } } }`.
  * `save`, `merge` and `remove` on related entities. Checkout creates the loan with its `member` and `copy` objects; a return updates `loan.copy`.
  * Row locks through find options: `lock: { mode: 'pessimistic_write', tables: ['loans'] }`, and `onLocked: 'skip_locked'` when picking a copy.
* **QueryBuilder is used only where the find API can't express the query.** Each place has a comment saying why:
  * **Books list:** an `EXISTS` subquery for copy availability, plus a search across book and author.
  * **Members list:** `EXISTS` / `NOT EXISTS` subqueries over loans (has overdue loans, has unpaid fines).
  * **Aggregates:** loan statistics per member, and book and copy counts in the DataLoaders, which need `COUNT(*) FILTER (…)` with `GROUP BY`.
  * **Session revocation:** the user id sits inside the session's JSON column.
* **Raw SQL is limited to maintenance statements:** `TRUNCATE … CASCADE` and sequence resets in the seed and tests, `ANALYZE`, the health check's `SELECT 1`, and migrations.

## Roles

Both roles are checked twice: by `@Roles()` guards on every resolver and route, and in the admin UI, which registers different screens per role.

| | Admin | Librarian |
|---|---|---|
| Lend, return, renew, mark lost, record fine payment | ✅ | ✅ |
| Bulk "Mark returned" on loans | ✅ | ✅ |
| Create and edit members | ✅ | ✅ |
| Delete members, bulk activate/deactivate | ✅ | ❌ no checkboxes on the list |
| Books, authors, copies | full CRUD, cover upload, inline copy editor | **read-only "show" pages** with a lock badge, no create/edit/delete buttons |
| Bulk maintenance on copies | ✅ | ❌ |
| Waive fines | ✅ | ❌ button not shown |
| Staff accounts | ✅ | ❌ **"Staff" menu doesn't exist** |

The app bar always shows the current role, and the librarian dashboard explains what the role can do.

## Admin panel

React-Admin talks to the GraphQL API through a small custom data provider (`apps/admin/src/dataProvider.ts`). Every admin action therefore goes through the same services, rules and role checks as any other client.

* **List views with filters and search** on every resource (backed by trigram GIN indexes):
  * **Loans:** status including Overdue, member, book, unpaid fine, date range.
  * **Members:** active, has overdue loans, has unpaid fines.
  * **Books:** genre, author, availability, has cover, year range.
  * **Copies:** status, condition, book.
* **Inline editing of related models:**
  * **Book → Copies:** change condition and status in place, add N copies, delete never-lent copies.
  * **Member → Loans:** return, renew and settle fines row by row.
  * **Author → Books** and **Book → Loan history** are inline lists.
* **Custom bulk actions:**
  * **Mark returned** (loans): computes each loan's fine separately and reports per-row failures.
  * **Send to maintenance / Back on shelf** (copies): skips copies that are on loan.
  * **Activate / Deactivate** (members).
* **Checkout form:** pick a member and a book (or scan a barcode). It checks eligibility live, using the same rules as the API.

## Security checklist

| Requirement | Implementation |
|---|---|
| Password hashing | **argon2id** (19 MiB, t=2). A dummy hash is checked for unknown emails so response timing doesn't reveal which accounts exist. Passwords need 12+ characters with mixed case and a digit. |
| Sessions | Server-side sessions in Postgres (`express-session` + `connect-pg-simple`). Cookie is `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`, 8 h rolling. The session ID is regenerated at login (prevents fixation). The user is re-loaded on every request, so deactivating an account takes effect immediately. Role changes and password resets delete that user's sessions. |
| CSRF | Double-submit token (`csrf-csrf`) bound to the session, required in `X-CSRF-Token` on **every** non-GET request (GraphQL, uploads, login, logout). Also Apollo's `csrfPrevention`, and `SameSite` cookies. GitHub OAuth uses a `state` parameter compared in constant time. |
| Input validation | Global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` (unknown fields are rejected). Every input has `class-validator` rules, and text is trimmed with control characters stripped. Sorting is limited to real entity columns, read from TypeORM metadata; hidden columns are excluded. Lists are capped at 500 per page. GraphQL query depth is limited to 6. JSON bodies are capped at 200 KB. |
| Uploads | Limited to 2 MB with exactly one file (multer limits), held **in memory only**. The type is checked from the **actual bytes** via `sharp`, not the extension or Content-Type. Decompression bombs are rejected (pixel limit). The image is **re-encoded to WebP**, which strips metadata and any embedded payload. Files are stored in S3 under random keys and served with `nosniff` and `CSP: default-src 'none'`. Admin only. |
| Secrets | Only `.env.example` is committed; `.env` is git-ignored. The app refuses to start if a secret is missing or shorter than 32 characters. |
| HTTPS | Caddy terminates TLS with a local CA, redirects HTTP to HTTPS, and sends HSTS. The API container isn't published to the host. |
| Headers and other hardening | Helmet on the API; CSP, `X-Frame-Options` and `nosniff` from Caddy for the SPA. Login is rate-limited to 5 per minute per IP. Production hides introspection and GraphiQL and masks internal errors. The API container runs as a non-root user. |

## GitHub sign-in (optional)

1. Create an OAuth app at https://github.com/settings/developers. Set the callback URL to `https://localhost/auth/github/callback`.
2. Put `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`, then run `docker compose up -d`.
3. A **Sign in with GitHub** button appears on the login page:
   * A GitHub account whose verified primary email matches a staff user is linked to that user.
   * Anyone else gets an **inactive** Librarian account that an admin must activate under Staff. OAuth never grants access on its own.

## Tests

```bash
docker compose --profile test run --rm api-test
```

**Unit tests** (`loan-policy.spec.ts`) cover:
* fine calculation and the fine cap
* the derived overdue status
* every checkout refusal reason
* renewal limits
* due-date validation

**End-to-end tests** run the real app (same middleware, guards and pipes) against Postgres and MinIO.

`loans.e2e-spec.ts` checks that:
* a checkout lends the copy and takes it off the shelf
* a member with an overdue loan is refused
* a 6th active loan is refused
* two simultaneous requests can't both get the last copy
* an overdue return charges the capped fine
* a third renewal is refused

`security.e2e-spec.ts` checks that:
* passwords are stored as argon2id hashes
* a wrong password is rejected
* GraphQL requires a session
* requests without a CSRF token, or with a forged one, are rejected
* only an admin can delete a book or list staff accounts
* a fake image and a file over 2 MB are rejected
* a real image is re-encoded to WebP in S3, librarians can't upload, and covers need a session

## Production notes

* **Database:** point `DATABASE_URL` at a managed Postgres (Neon, Supabase, RDS…) and set `DATABASE_SSL=true`. There is no embedded database. Migrations run on container start; the seed only runs if the database is empty.
* **Object storage:** set `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` and `S3_BUCKET` for AWS S3 or Cloudflare R2. Set `S3_FORCE_PATH_STYLE=false` for AWS.
* **Object-storage image:** MinIO no longer publishes Docker images, so the `minio` service runs `pgsty/silo`, a maintained drop-in build of the same server. Any S3-compatible service works, because the API only needs the `S3_*` settings.
* **HTTPS:** for a public domain, replace `localhost` in `docker/caddy/Caddyfile` with the domain and remove `local_certs`. Caddy then gets a Let's Encrypt certificate automatically.

## Project layout

```
apps/api/                 NestJS API
  src/entities/           TypeORM entities (also GraphQL object types)
  src/database/           data source, migrations, migration runner
  src/loans/              loan-policy.ts (rules) · loans.service.ts (transactions) · resolver
  src/books/              books + covers (upload pipeline, REST controller)
  src/auth/               sessions, CSRF, guards, argon2, GitHub OAuth
  src/seed/               demo data generator (+ generated cover art)
  test/                   e2e tests
apps/admin/               React-Admin SPA (Vite)
  src/dataProvider.ts     GraphQL data provider
  src/resources/          screens per resource
docker/                   Caddyfile, Postgres init script
docker-compose.yml
```

## Running without Docker (development)

You need Postgres and an S3-compatible store running locally. Export the variables from `.env.example`, with `DATABASE_URL` and `S3_ENDPOINT` pointing at them and `COOKIE_SECURE=false`. Then:

```bash
npm install
npm run start:dev -w apps/api        # http://localhost:3000/graphql (GraphiQL in dev)
npm run seed:dev -w apps/api
npm run dev -w apps/admin            # http://localhost:5173 (proxies the API)
```

The generated GraphQL schema is in `apps/api/schema.gql`.
