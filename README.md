# 📚 Book Lending Library

A library back office: a **NestJS + GraphQL** API with real lending rules, a **React-Admin** panel with role-based screens, a **form Help chat** grounded in the forms' own field definitions, **PostgreSQL**, and **S3-compatible object storage** for book covers. Everything runs in Docker over HTTPS, against managed services (Neon + Cloudflare R2) or local stand-ins.

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
                ┌──────────▼───┐  ┌───▼──────────┐       ┌─────────────────┐
                │ PostgreSQL   │  │ S3 storage   │       │ LLM, OpenAI-API │
                │ Neon / local │  │ R2 / local   │       │ Groq free tier  │
                └──────────────┘  └──────────────┘       └─────────────────┘
```

## Quick start

```bash
cp .env.example .env          # then replace every "change-me" value
docker compose up --build     # first start migrates the DB and seeds demo data (~1 min)
```

`.env.example` starts with `COMPOSE_PROFILES=local-services`, which runs Postgres and S3 storage as local containers. To use managed services instead (and to deploy), see **[DEPLOYMENT.md](DEPLOYMENT.md)**. If your `.env` predates this setting, add that line to keep the local containers.

To enable the **Help chat** (bottom-right on every page), get a free Groq API key at console.groq.com/keys (no credit card) and set `AI_API_KEY` in `.env`. Without a key everything else works and the chat says it is turned off. See [Help chat](#help-chat-how-do-i-fill-this-out).

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
docker compose --profile local-services --profile test run --rm api-test   # unit + e2e tests (throwaway library_test DB)
docker compose logs -f api                  # one line per request + errors; startup shows DB / storage / AI model
docker compose logs api | grep 3f9c2a1b7d04 # everything about one request (the id users see as "reference")
curl -k https://localhost/api/health        # {"status":"ok","database":"up","storage":"up","helpChat":"enabled"}
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

## Decisions & trade-offs

| Decision | Chosen | Why, and what I gave up |
|---|---|---|
| API style | **GraphQL** (NestJS code-first) + one REST endpoint for uploads | One typed schema that the admin consumes and that is self-documenting (`apps/api/schema.gql`). Uploads are plain multipart REST, because GraphQL multipart uploads need extra CSRF plumbing. |
| Admin | **React-Admin** over the GraphQL API | NestJS has no built-in admin. React-Admin is an admin *framework*: lists, filters, forms, inline references, bulk actions and permissions are its building blocks, and this project configures them. **AdminJS** (the closest thing to a generated admin) was rejected because it writes straight to the database, so the lending rules, locks and role checks would be bypassed or duplicated. The trade-off is more code per screen than a fully generated admin. |
| ORM | **TypeORM** with decorators and migrations | NestJS's documented integration. Prisma was the first plan, but its engine binaries couldn't be downloaded in the build environment, so I couldn't have tested it. |
| Framework version | **NestJS 11** | NestJS 12 is ESM-only, which makes Jest setup fragile. 11 is the current CommonJS line. |
| Auth | **Server-side sessions** in Postgres, not JWT | Sessions can be revoked instantly (deactivation, role change, password reset), and the cookie is HttpOnly so no token is readable by JS. The cost is CSRF protection, done with double-submit tokens. |
| Data model | **BookCopy** between Book and Loan | A library lends physical copies, not titles. This gives real availability counts and the inline copy editor. |
| Overdue | **Computed, never stored** | No cron job and no stale flags. It's still filterable in SQL (`status = ACTIVE AND dueDate < now()`). |
| Help chat | **One completion per question, grounded in the form definitions, any OpenAI-compatible provider** | The brief asks for "what does this field mean / how do I fill this out" grounded in the forms' help text. Field help lives once, as `description`s on the GraphQL input types (NestJS's equivalent of Django's `help_text`). The forms display it, and the chat is given it together with the real validation rules, so the two can't disagree. Calls go through plain `fetch` to the OpenAI-compatible Chat Completions API, so the provider is configuration: Groq's free tier by default (zero cost), or Gemini, OpenRouter or a self-hosted Ollama. No SDK, agents, tools or vector store. |
| Storage image | `pgsty/silo` for local S3 | MinIO stopped publishing images in 2026; silo is a drop-in build. The API only knows "an S3 endpoint", so R2/S3 need no code change. |
| Scope | Small, deep domain | No reservations, notifications or member self-service. I spent the time on correct rules, concurrency, security and tests instead. |

**Trade-offs made under time pressure (what I'd do next):**
* **Rate limits** (login, AI questions) are in memory, so they're per instance. Running several API instances would need Redis.
* **Cover images** are proxied through the API with a session check. At scale I'd serve signed URLs from a CDN.
* **The help chat** doesn't stream answers and keeps history only in the open panel. Free-tier rate limits apply (it shows a friendly "busy" message when hit).
* **Tests** cover business rules, security and the AI integration end to end, but there are no frontend component tests.
* **Overdue reminders** (email) and **reservations / holds** are the obvious next features.

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

## Help chat ("how do I fill this out?")

A **Help** button at the bottom right of every admin page opens a small chat that answers questions like *"What does Replacement cost mean?"*, *"What ISBN format is accepted?"* or *"How do I fill in the New loan form?"*.

* **Grounded in the real field definitions.** Each form field's help text is written once, as the `description` of the GraphQL input type field (e.g. `CreateBookInput.isbn`); this is the equivalent of Django's `help_text`. `FormsService` builds the form definitions from the live GraphQL schema (types, required, enum options, descriptions) and from the `class-validator` rules on the same DTOs (e.g. *1–300 characters*, *minimum 1450*). The same definitions serve two purposes:
  * the admin forms show them as the helper text under each input (`forms` query), and
  * the chat receives them in its system prompt: the current form in full, the other forms in brief.

  The model is told to answer only from them, using the labels the user sees.
* **Knows where you are.** The panel detects the form from the page (Book, Author, Member, New loan, Copies, Staff) and starts a fresh conversation when you move to another form.
* **Any model source, zero cost.** It uses the OpenAI-compatible Chat Completions API through plain `fetch`, so switching provider is only `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY`. The default is Groq's free tier with `openai/gpt-oss-20b`. Gemini's free tier and a self-hosted Ollama are documented in `.env.example`.
* **Failure handling.** With no key, the panel says the chat is turned off. On a timeout (20 s), provider error, free-tier limit (`429`), rejected key or retired model, the user gets a clear message (`ASSISTANT_UNAVAILABLE`, `ASSISTANT_BUSY`, `ASSISTANT_MISCONFIGURED`) and the admin keeps working. Provider details go to the server log only.
* **Security.** The key is read from the environment on the server and never sent to the browser. Questions are validated (max 500 characters, sanitised) and rate-limited to 10 per minute per user. Answers are rendered as plain text.
* **Small on purpose.** About 250 lines across `apps/api/src/forms/` and `apps/api/src/help-chat/`, plus `apps/admin/src/components/HelpChat.tsx`.

## Logging & error handling

Errors are not caught service by service. Services `throw`, and **one central place** decides what each error means, what the user sees and what gets logged (`describeError` in `src/common/errors.ts`). `try/catch` is used only where the code can actually do something about a failure:
* storage and the AI provider: turned into a clear `503` and the rest of the app keeps working
* GitHub sign-in: send the user back to the login page with a message
* cleanup of old covers: logged, but it doesn't fail the request
* database transactions: rolled back automatically

**Request log.** Every request gets a short random id (returned in the `X-Request-Id` header) and one line when it finishes. GraphQL requests are named by operation, because they are all `POST /graphql`:
```
LOG  [HTTP] POST /graphql query books → 200 · 26 ms · user 1 · req 9df4b6c38ffe
WARN [GraphQL] mutation checkout: NOT_FOUND — Member #999 was not found (req 6fbe179789eb)
WARN [HTTP] POST /graphql mutation checkout → 200 [NOT_FOUND] · 13 ms · user 1 · req 6fbe179789eb
WARN [AuthService] Failed sign-in for "admin@library.local": wrong password
WARN [HTTP] POST /auth/login → 401 [UNAUTHENTICATED] · 57 ms · ip 172.18.0.1 · req ddeb9ed10f6a
```
The log level follows the outcome:
* `log` for a success
* `warn` for an expected failure: bad input, a business rule, not signed in, CSRF, rate limit, not found
* `error` for a 5xx or a crash

GraphQL errors arrive with HTTP 200, so their codes are listed in brackets. Health checks are only logged at `LOG_LEVEL=debug`. Request bodies, variables, cookies and passwords are never logged.

**Unexpected errors** (a bug, the database going away…):
* the server logs them with the stack trace, the operation and the user, under the request id
* the user gets *"Something went wrong on our side. Please try again. (reference 6fbe179789eb)"*, and no SQL or stack trace reaches the browser

Searching the logs for the reference finds every line of that request. This covers GraphQL (Apollo plugin) and REST, such as login and uploads (global exception filter). Errors outside any request are logged instead of disappearing: unhandled promise rejections are logged, and an uncaught exception is logged and exits so Docker restarts the API.

**What the user sees.** Expected errors keep their specific, user-facing message, for example *"Loan #42 is already returned."* or *"A record with isbn "…" already exists"*. The admin also turns network failures and proxy error pages into plain sentences such as *"Can't reach the server…"*.

**Settings:**
* `LOG_LEVEL`: `error`, `warn`, `log` (default) or `debug`
* `LOG_FORMAT`: `pretty` (default) or `json` (one object per line, for log services like Better Stack, Datadog or CloudWatch)
* Docker rotates the API log at 3 × 10 MB.

Code: `apps/api/src/common/logging/` and `src/common/errors.ts`. Tests: `logging.e2e-spec.ts`.

## Security checklist

| Requirement | Implementation |
|---|---|
| Password hashing | **argon2id** (19 MiB, t=2). A dummy hash is checked for unknown emails so response timing doesn't reveal which accounts exist. Passwords need 12+ characters with mixed case and a digit. |
| Sessions | Server-side sessions in Postgres (`express-session` + `connect-pg-simple`). Cookie is `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`, 8 h rolling. The session ID is regenerated at login (prevents fixation). The user is re-loaded on every request, so deactivating an account takes effect immediately. Role changes and password resets delete that user's sessions. |
| CSRF | Double-submit token (`csrf-csrf`) bound to the session, required in `X-CSRF-Token` on **every** non-GET request (GraphQL, uploads, login, logout). Also Apollo's `csrfPrevention`, and `SameSite` cookies. GitHub OAuth uses a `state` parameter compared in constant time. |
| Input validation | Global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted` (unknown fields are rejected). Every input has `class-validator` rules, and text is trimmed with control characters stripped. Sorting is limited to real entity columns, read from TypeORM metadata; hidden columns are excluded. Lists are capped at 500 per page. GraphQL query depth is limited to 6. JSON bodies are capped at 200 KB. |
| Uploads | Limited to 2 MB with exactly one file (multer limits), held **in memory only**. The type is checked from the **actual bytes** via `sharp`, not the extension or Content-Type. Decompression bombs are rejected (pixel limit). The image is **re-encoded to WebP**, which strips metadata and any embedded payload. Files are stored in S3 under random keys and served with `nosniff` and `CSP: default-src 'none'`. Admin only. |
| Secrets | Only `.env.example` is committed; `.env` is git-ignored. The app refuses to start if a secret is missing or shorter than 32 characters. The AI provider key stays on the server. Tests generate random secrets per run, so none are hardcoded. |
| HTTPS | Caddy terminates TLS (local CA on `localhost`, automatic Let's Encrypt on a real domain), redirects HTTP to HTTPS, and sends HSTS. The API container isn't published to the host. |
| Authorization failures | API: `FORBIDDEN` with a message naming the required role. Admin: hidden menus and buttons, read-only pages, and an "Access denied" page if a librarian opens a Staff URL directly. |
| Outages | If storage is down, the API still starts, covers return `503 STORAGE_UNAVAILABLE`, and `/api/health` reports `degraded`. If the AI provider is down or rate-limited, the Help chat shows a friendly message and nothing else is affected. |
| Headers and other hardening | Helmet on the API; CSP, `X-Frame-Options` and `nosniff` from Caddy for the SPA. Login is rate-limited to 5 per minute per IP. Production hides introspection and GraphiQL and masks internal errors. The API container runs as a non-root user. |

## GitHub sign-in (optional)

1. Create an OAuth app at https://github.com/settings/developers. Set the callback URL to `https://localhost/auth/github/callback`.
2. Put `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`, then run `docker compose up -d`.
3. A **Sign in with GitHub** button appears on the login page:
   * A GitHub account whose verified primary email matches a staff user is linked to that user.
   * Anyone else gets an **inactive** Librarian account that an admin must activate under Staff. OAuth never grants access on its own.

## Tests

```bash
docker compose --profile local-services --profile test run --rm api-test
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
* sorting only works on real entity columns (never hidden ones like `passwordHash`)

`help-chat.e2e-spec.ts` runs against a local stub of an OpenAI-compatible provider (no key or network needed) and checks that:
* the `forms` query returns the book form's fields in form order, with their help text, rules and options
* the prompt contains the current form's field help and validation rules, and the key is sent only to the provider
* follow-up questions send the earlier turns
* provider HTTP 500 / 429 / 401 / 404 become friendly `ASSISTANT_UNAVAILABLE` / `ASSISTANT_BUSY` / `ASSISTANT_MISCONFIGURED` errors without leaking details, and the rest of the API keeps working

`logging.e2e-spec.ts` checks that:
* every request is logged once, with its GraphQL operation and the id returned in `X-Request-Id`
* an expected error is logged as a warning with its code, not as a crash
* an unexpected error (GraphQL or REST) reaches the user only as a generic message with a reference, while the log has the real message and stack under the same id
* a failed sign-in logs the reason but never the password

## Managed services & deployment

* **Where the data lives is decided only by `.env`.** `DATABASE_URL` (+ `DATABASE_SSL=true`) can point at a managed Postgres such as Neon or Supabase, and `S3_*` at Cloudflare R2 or AWS S3. The local containers start only when `COMPOSE_PROFILES=local-services` is set.
* **No silent fallback.** On startup the API logs the database host, the storage host and the AI model, each labelled *managed* or *LOCAL container*. It also warns if a production run is using the local stand-ins.
* **Startup behaviour.** Migrations run on container start; demo data is seeded only into an empty database.
* **Deploying:** step-by-step guide in **[DEPLOYMENT.md](DEPLOYMENT.md)** (VPS + Docker Compose + Neon + R2 + automatic HTTPS).

## Project layout

```
apps/api/                 NestJS API
  src/entities/           TypeORM entities (also GraphQL object types)
  src/database/           data source, migrations, migration runner
  src/loans/              loan-policy.ts (rules) · loans.service.ts (transactions) · resolver
  src/books/              books + covers (upload pipeline, REST controller)
  src/auth/               sessions, CSRF, guards, argon2, GitHub OAuth
  src/common/             error mapping (errors.ts), logging/ (request log, GraphQL plugin, exception filter)
  src/forms/              form definitions (field help = input-type descriptions + validator rules)
  src/help-chat/          help chat: prompt from form definitions, OpenAI-compatible client, errors
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
