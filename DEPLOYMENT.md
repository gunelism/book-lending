# Deployment guide

One deploy: a small Linux server runs the Docker Compose stack (Caddy for HTTPS, the API, the admin). **Neon** provides both managed services, set up by a single `neon deploy`:

| Piece | Service | Notes |
|---|---|---|
| Database | **Neon Postgres** (Frankfurt, `eu-central-1`) | Pooled URL for the app, direct URL for migrations |
| Object storage (covers) | **Neon Object Storage**, bucket `library-covers` | S3-compatible, private; declared in `neon.ts` |
| HTTPS | **Caddy** on the server | Free Let's Encrypt certificate, renewed automatically |
| Help chat (optional) | **Groq** free tier | Any OpenAI-compatible provider works |

Both Neon services fit the Free plan: about 35 MB of data and about 140 MB of covers.

## 1. On your computer: provision Neon

The repo is already linked to the Neon project (`neon.ts`, `.neon`). `neon.ts` declares the `library-covers` bucket.

```bash
npx neon@latest login     # once; finish the sign-in in the browser
npx neon@latest deploy    # creates the bucket, then writes the env vars into .env
```

`deploy` writes these into `.env`:

| Variables | What |
|---|---|
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | the database (pooled for the app, direct for migrations and the seed) |
| `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | the bucket |

The API uses Neon storage automatically whenever these `AWS_*` values are present and `S3_ENDPOINT` is not set.

## 2. Server and domain

1. **Server:** rent an Ubuntu 24.04 VPS in Europe with 2 vCPU and 4 GB RAM (Hetzner, DigitalOcean, Lightsail…). Install Docker from docs.docker.com/engine/install/ubuntu.
2. **Firewall:** `sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable`
3. **DNS:** create an **A record** from your domain (e.g. `library.example.com`) to the server's IP. If the domain is on Cloudflare, set it to *DNS only* (grey cloud) so Caddy can get its certificate.

## 3. On the server: code and `.env`

```bash
git clone git@github.com:gunelism/book-lending.git && cd book-lending   # private repo: add the server's SSH key as a read-only Deploy key
cp .env.example .env && nano .env
```

Fill in:

```bash
# Delete the COMPOSE_PROFILES line: no local database or storage containers on the server.

# Neon: copy these 6 lines from your local .env (written by `neon deploy`)
DATABASE_URL=...
DATABASE_URL_UNPOOLED=...
AWS_ENDPOINT_URL_S3=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...

# Domain
SITE_ADDRESS=library.example.com
PUBLIC_URL=https://library.example.com
CADDY_TLS=you@example.com

# New secrets for the server: run `openssl rand -base64 48` once for each (don't reuse local ones)
SESSION_SECRET=...
CSRF_SECRET=...

# Your own passwords for the seeded accounts (12+ characters)
SEED_ADMIN_PASSWORD=...
SEED_STAFF_PASSWORD=...

# Optional: Help chat (free key from console.groq.com/keys)
AI_API_KEY=gsk_...
```

## 4. Start

```bash
docker compose up -d --build
docker compose exec api npm run seed     # once: fresh demo data with your passwords, covers in Neon storage
docker compose logs -f api
```

The seed wipes and rebuilds the demo data, which takes about a minute. Run it once even if the first start already seeded, so the accounts get **your** passwords and every cover is in Neon's bucket. Both lines must say **managed**:

```
[Services] Database: ep-…-pooler.c-7.eu-central-1.aws.neon.tech (managed, TLS, pooled); migrations via direct ep-….neon.tech
[Services] Object storage: …, bucket "library-covers" (Neon Object Storage, managed)
```

## 5. Check

1. `curl https://library.example.com/api/health` returns `{"status":"ok","database":"up","storage":"up",...}`.
2. `https://library.example.com` opens with a valid padlock.
3. Sign in as `admin@library.local` with your `SEED_ADMIN_PASSWORD`. Upload a cover and refresh: the image loads.
4. Sign in as `librarian@library.local` with your `SEED_STAFF_PASSWORD`: there's no Staff menu, and books are read-only.

## Operating it

| Task | Command |
|---|---|
| Deploy a new version | `git pull && docker compose up -d --build` (migrations run automatically) |
| Logs | `docker compose logs -f api` / `docker compose logs -f caddy` |
| Investigate a user's error | They see *"… (reference 6fbe179789eb)"*: `docker compose logs api \| grep 6fbe179789eb` |
| Ship logs to a log service | Set `LOG_FORMAT=json` in `.env` and recreate the api container |
| Regenerate demo data | `docker compose exec api npm run seed` (**wipes all data**) |
| Backups | Neon keeps point-in-time history (restore from the Neon console) |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| API exits: "SESSION_SECRET is still an example value" / "must be at least 32 characters" | Generate real secrets: `openssl rand -base64 48`. |
| Seed fails: "SEED_ADMIN_PASSWORD must be set to your own password" | Set both seed passwords (12+ characters, not an example value). |
| Certificate error in the browser | DNS isn't pointing at the server yet, ports 80/443 are closed, or the record is proxied (orange cloud). Check `docker compose logs caddy`. |
| Log says `Database: … (LOCAL container)` or `Object storage: … (LOCAL container)` | The Neon lines are missing from the server's `.env`, or `COMPOSE_PROFILES` is still there. |
| `"storage":"down"` / "Bucket … does not exist in Neon Object Storage" | Run `npx neon@latest deploy` (it creates the bucket from `neon.ts`) and copy the `AWS_*` lines again. `S3_BUCKET` must be `library-covers`. |
| `Unable to connect to the database` | Wrong `DATABASE_URL`, or a URL without `?sslmode=require`. |
| `SQLSTATE 53000` / "exceeded the quota" | A Neon Free plan monthly limit ran out; see the Neon console's Billing page. |
| Help chat says "misconfigured" / "model not available" | Check `AI_API_KEY`, or set `AI_MODEL` to a current model of the provider. |
| Login works locally but not deployed | `PUBLIC_URL` / `SITE_ADDRESS` must be the exact `https://` domain you open (cookies are HTTPS-only). |

**Using another S3 store instead** (AWS S3, Cloudflare R2): set `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` and `S3_FORCE_PATH_STYLE` in `.env`. An explicit `S3_ENDPOINT` takes precedence over Neon.
