# Deploying the Book Lending Library

This guide deploys the **same Docker Compose stack you run locally** to one small Linux server. The data lives in **managed services**:

| Piece | Service | Why |
|---|---|---|
| App (Caddy + API + admin) | Any VPS with Docker (Hetzner, DigitalOcean, Lightsail…) | Same `docker compose up` as locally, so there are no surprises |
| Database | **Neon** (managed PostgreSQL, free tier) | Satisfies "managed DB", with backups and TLS |
| Object storage | **Cloudflare R2** (S3-compatible, free tier) | Satisfies "object storage"; covers never touch the server's disk |
| HTTPS | **Caddy + Let's Encrypt** (automatic) | Real certificate, auto-renewed, HTTP redirected to HTTPS |
| Help chat AI | **Groq free tier** (any OpenAI-compatible provider works) | "How do I fill this out?" chat, at zero cost |

Expect about 45–60 minutes the first time.

---

## 0. What you need

- A **domain or subdomain** whose DNS you control, e.g. `library.example.com`.
- Accounts at **Neon**, **Cloudflare** (for R2) and **Groq** (console.groq.com, free, no credit card) for the Help chat.
- A server: Ubuntu 24.04 LTS with 2 vCPU / 4 GB RAM is comfortable. 2 GB works but building the images is slow.

## 1. Database: Neon

The repo is already linked to the Neon project: `neon.ts` declares it and `.neon` (git-ignored) points at the project and its `production` branch. On a machine where you're signed in to Neon, run from the project root:

```bash
npx neon@latest login     # once; opens the browser
npx neon@latest deploy    # provisions what neon.ts declares, then writes the env vars into .env
```

`deploy` writes two connection strings into `.env`:

| Variable | Connection | Used by |
|---|---|---|
| `DATABASE_URL` | **pooled** (`-pooler` host, PgBouncer) | the API's queries and the session store |
| `DATABASE_URL_UNPOOLED` | **direct** | migrations, the seed and the TypeORM CLI, which need session state the pooler doesn't keep |

Both end in `?sslmode=require&channel_binding=require`. The app turns that into strict TLS (certificate checked) plus SCRAM channel binding, so `DATABASE_SSL` isn't needed.

On a server without the Neon CLI, copy both lines from your local `.env` (or from the Neon console's *Connect* dialog, pooled and direct) into the server's `.env`.

You don't need to create any tables: the API runs the migrations on its first start, then seeds demo data because the database is empty.

## 2. Object storage: Cloudflare R2

1. In the Cloudflare dashboard, go to **R2 → Create bucket** and name it `library-covers`. Keep it **private**; the app serves covers through its own authenticated endpoint.
2. Go to **R2 → Manage API tokens → Create API token**:
   - Permission: **Object Read & Write**
   - Scope: only the `library-covers` bucket
3. Copy the **Access Key ID** and **Secret Access Key** (they're shown once), and note your **Account ID**.
4. The S3 endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, and the region is `auto`.

## 3. Help chat key: Groq (free)

1. Sign up at **console.groq.com** (free; no credit card needed).
2. Go to **API Keys → Create API Key** and copy the key (it starts with `gsk_`).

If you skip this, the app still works and the Help panel says the chat is turned off. Prefer Gemini or a self-hosted model? Only `AI_BASE_URL`, `AI_MODEL` and `AI_API_KEY` change; see the examples in `.env.example`.

## 4. Server

1. Create the VPS (Ubuntu 24.04) and SSH in.
2. Install Docker Engine and the Compose plugin, following the official guide at docs.docker.com/engine/install/ubuntu. Then check:
   ```bash
   docker --version && docker compose version
   ```
3. Open only the ports you need:
   ```bash
   sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
   ```
4. **DNS:** create an **A record** for `library.example.com` pointing to the server's public IP. If you use Cloudflare DNS, set it to *DNS only* (grey cloud) for the first start, so Caddy can obtain its certificate directly.

## 5. Configure

```bash
git clone <your repo URL> book_lending && cd book_lending
cp .env.example .env
nano .env
```

In `.env`:

```bash
# Managed services: REMOVE the COMPOSE_PROFILES=local-services line entirely

DATABASE_URL=postgresql://USER:PASSWORD@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
DATABASE_URL_UNPOOLED=postgresql://USER:PASSWORD@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require

S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY=<R2 access key id>
S3_SECRET_KEY=<R2 secret access key>
S3_BUCKET=library-covers
S3_FORCE_PATH_STYLE=false

SITE_ADDRESS=library.example.com
CADDY_TLS=you@example.com            # email for the Let's Encrypt account
PUBLIC_URL=https://library.example.com

SESSION_SECRET=<openssl rand -base64 48>
CSRF_SECRET=<openssl rand -base64 48>

AI_API_KEY=gsk_...                    # Groq key (free)
AI_BASE_URL=https://api.groq.com/openai/v1
AI_MODEL=openai/gpt-oss-20b
AI_REASONING_EFFORT=low

SEED_ADMIN_EMAIL=admin@library.local
SEED_ADMIN_PASSWORD=<strong password, 12+ chars, upper/lower/digit>
SEED_STAFF_PASSWORD=<another strong password>
```

Generate the two secrets with `openssl rand -base64 48`. Never commit `.env`; it is git-ignored.

## 6. Start

```bash
docker compose up -d --build
docker compose logs -f api
```

The first start takes a few minutes: it builds the images, runs migrations on Neon, then seeds about 62k loans and uploads about 4.6k generated covers to R2. In the log, check that you see:

```
[Services] Database: ep-xxxx-pooler….neon.tech (managed, TLS, pooled); migrations via direct ep-xxxx….neon.tech
[Services] Object storage: <account>.r2.cloudflarestorage.com, bucket "library-covers" (managed)
[Services] Help chat: enabled (openai/gpt-oss-20b via api.groq.com)
[seed] Done in …
API listening on :3000
```

If it says **LOCAL container**, the `.env` values weren't picked up. Check the variable names and that `COMPOSE_PROFILES` is removed.

## 7. Verify

1. `https://library.example.com` loads with a valid certificate, and `http://` redirects to `https://`.
2. `curl https://library.example.com/api/health` returns `{"status":"ok","database":"up","storage":"up","helpChat":"enabled"}`.
3. Sign in as the admin:
   - open a book, upload a cover, and refresh: the image loads (it's stored in R2)
   - open **Books → Create**, click **Help** (bottom right) and ask *"What does Replacement cost mean?"*
4. Sign in as `librarian@library.local`: the Staff menu is gone and books are read-only.
5. The R2 bucket now contains objects under `covers/`.

## 8. Optional: GitHub sign-in

1. Create an OAuth app with callback URL `https://library.example.com/auth/github/callback`.
2. Put `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`.
3. Run `docker compose up -d`.

## Operating it

| Task | Command |
|---|---|
| Deploy a new version | `git pull && docker compose up -d --build` (migrations run automatically) |
| Logs | `docker compose logs -f api` (one line per request, warnings and errors) / `docker compose logs -f caddy` |
| Investigate a user's error | They see *"… (reference 6fbe179789eb)"*: `docker compose logs api \| grep 6fbe179789eb` shows the request and the stack trace |
| Ship logs to a log service | Set `LOG_FORMAT=json` in `.env` and recreate the api container |
| Regenerate demo data | `docker compose exec api npm run seed` (**wipes all data**) |
| Health | `curl https://library.example.com/api/health` |
| Backups | Neon keeps point-in-time history (restore from the Neon console) |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Browser shows a certificate error | DNS isn't pointing at the server yet, ports 80/443 are closed, or the record is proxied (orange cloud). Check `docker compose logs caddy`. |
| `Unable to connect to the database` | Wrong `DATABASE_URL`, or a URL without `?sslmode=require` (add it, or set `DATABASE_SSL=true`). |
| Log warns "pooled but DATABASE_URL_UNPOOLED is not set" | Add the direct URL (`npx neon@latest env pull`) so migrations don't go through the pooler. |
| `SQLSTATE 53000` / "exceeded the quota" | The Neon Free plan's monthly compute or transfer ran out; see the Neon console's Billing page. |
| `/api/health` says `"storage":"down"` | Wrong R2 endpoint or keys, the token isn't scoped to the bucket, or the bucket name differs from `S3_BUCKET`. The rest of the app keeps working meanwhile. |
| Help chat says "misconfigured" | The key was rejected: check `AI_API_KEY` (and that `AI_BASE_URL` matches the provider the key is from). |
| Help chat says "model not available" | The provider retired or doesn't have `AI_MODEL`. Pick a current model from the provider's list (Groq: console.groq.com/docs/models) and recreate the api container. |
| Help chat says "free-tier limit" | The provider's free rate limit was hit; wait a minute. Each question is one small request. |
| Login works locally but not deployed | `PUBLIC_URL` / `SITE_ADDRESS` must be the exact `https://` domain you open. Cookies are `__Host-` and HTTPS-only. |

## Alternative: a PaaS instead of a VPS

On Render, Railway or Fly.io, deploy `apps/api/Dockerfile` (target `runtime`) as a web service with the same environment variables. The platform terminates HTTPS, so Caddy isn't needed. Then serve the admin (`docker/caddy/Dockerfile`, or `npm run build -w apps/admin` as a static site) **on the same domain** with `/graphql`, `/api` and `/auth` routed to the API. The session and CSRF cookies are same-origin by design. The VPS route above keeps that wiring unchanged, which is why it's the recommended one.
