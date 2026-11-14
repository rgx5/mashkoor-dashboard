# Deploying the Dashboard on Dokploy (Unified Docker Compose)

This deploys the complete Mashkoor Dashboard (**PostgreSQL 17 + NestJS Backend + React Frontend**) as a single Docker Compose stack in Dokploy.

```
Internet ─► Traefik (Dokploy) ─► mashkoor-web (Port 80)
                                   ├─ /      ──► React SPA (Vite)
                                   └─ /api/* ──► Proxied internally to mashkoor-api (Port 4000) ──► mashkoor-postgres
```

---

## 1. Quick Deploy Steps in Dokploy

1. In Dokploy, click **Create Service** → **Compose**.
2. **Name:** `mashkoor`
3. **Source:** Select **GitHub**, choose repo `mashkoor-dashboard`, branch `main` (or your active branch).
4. **Compose Path:** `docker-compose.prod.yml`
5. Go to the **Environment** tab:
   - Copy the template from `.env.production.example`.
   - Fill in your values (make sure **`FIELD_ENCRYPTION_KEY`** matches your old server if migrating!).
6. Go to the **Domains** tab:
   - Add your domain: e.g. `mashkoor.rapidrabbit.cloud` or `app.mashkoor.co.in`.
   - Port: `80` (points to `frontend`).
   - Enable HTTPS (Let's Encrypt).
7. Click **Deploy**!

The database will initialize, run `prisma migrate deploy` automatically, and launch the application.

---

## 2. Restoring Migrated Data (If migrating from Old VPS)

1. Dump and copy your data from the old server:
   ```bash
   docker cp /tmp/mashkoor-db.dump mashkoor-postgres:/tmp/
   docker exec -i mashkoor-postgres pg_restore -U mashkoor -d mashkoor --clean --if-exists /tmp/mashkoor-db.dump
   ```
2. Restore uploaded files into the volume:
   ```bash
   docker run --rm -v mashkoor_uploads_data:/data -v /tmp:/backup alpine tar xzf /backup/mashkoor-uploads.tar.gz --strip-components=1 -C /data
   ```
3. Restart backend:
   ```bash
   docker restart mashkoor-api
   ```

| Old setup | Dokploy |
|---|---|
| Docker Postgres on 127.0.0.1 | PostgreSQL 17 database service, internal only |
| pm2 `mashkoor-api` | Application from `backend/Dockerfile` |
| nginx serving `/var/www/mashkoor-app` | Application from `frontend/Dockerfile` |
| nginx `/api/` proxy | Domain with path `/api` |
| certbot | Traefik + Let's Encrypt |
| `deploy-dashboard.sh` | Auto-deploy on push |
| `backup.sh` | Dokploy S3 backups + volume backup for uploads |

## 0. Before you start

1. Push this repo (`mashkoor-dashboard`) to GitHub and connect GitHub in Dokploy under **Settings → Git**.
2. Point the DNS **A record** for `mashkoor.rapidrabbit.cloud` at the Dokploy server's IP.
3. Generate fresh secrets (run each once, store them in a password manager):

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT_ACCESS_SECRET
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # TOKEN_PEPPER
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # FIELD_ENCRYPTION_KEY
   ```

   **FIELD_ENCRYPTION_KEY cannot be recovered.** Losing it makes stored passport numbers and every uploaded document
   unreadable. Back it up before the first deploy.

## 1. Create the project

Create a Dokploy project called `mashkoor` with three services.

### 1.1 Database

- Type: **PostgreSQL**, version 17.
- Database `mashkoor`, user `mashkoor`, strong password.
- Leave **external port off**. Deploy it, then copy the **internal host** from its settings.

### 1.2 Backend (`mashkoor-api`)

- Type: **Application**, source **GitHub**, repo `mashkoor-dashboard`, branch `main`.
- Build type **Dockerfile**, Dockerfile path `backend/Dockerfile`, docker context path `.` (repo root).
- **Replicas: 1.** Scheduled jobs (payment-link expiry, reminders, seat-hold release) run in-process, so a second
  replica would run them twice.
- **Environment:** start from `deploy/env/backend.env.example` and set:

  | Variable | Value |
  |---|---|
  | `NODE_ENV` | `production` |
  | `PORT` | `4000` |
  | `TRUST_PROXY_HOPS` | `1` (Traefik only). Use `2` if Cloudflare is added in front later |
  | `DATABASE_URL` | `postgresql://mashkoor:<password>@<internal-host>:5432/mashkoor?schema=public` |
  | `APP_URL` / `CORS_ORIGINS` | `https://mashkoor.rapidrabbit.cloud` |
  | `JWT_ACCESS_SECRET`, `TOKEN_PEPPER`, `FIELD_ENCRYPTION_KEY` | the generated values from step 0 |
  | `UPLOAD_DIR` | `/data/uploads` |
  | `STORAGE_ENCRYPT` | `true` |
  | `PAYMENT_GATEWAY` | `mock` (online payments stay off in production until a real gateway is connected) |
  | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | first Super Admin; used once by the seed |
  | `MSG91_*` | real MSG91 values if email is needed now |
  | `WEBSITE_URL`, `REVALIDATE_SECRET` | leave as is / blank until the public website exists |

- **Volume mount:** persistent volume mounted at `/data/uploads`. Without it, uploaded visas and tickets are lost on
  every redeploy.
- **Domain:** host `mashkoor.rapidrabbit.cloud`, **path `/api`**, container port `4000`, HTTPS on (Let's Encrypt),
  **Strip Path off** (the routes already start with `/api/v1`).

The container runs `prisma migrate deploy` on every start, then the API. It has a Docker health check on
`/api/v1/health`.

### 1.3 Frontend (`mashkoor-web`)

- Type: **Application**, same repo and branch.
- Build type **Dockerfile**, Dockerfile path `frontend/Dockerfile`, docker context path `.` (repo root).
- **Domain:** host `mashkoor.rapidrabbit.cloud`, path `/`, container port `80`, HTTPS on.
- Traefik gives the longer `/api` path priority over `/`.

## 2. First deploy

1. Deploy the database, then `mashkoor-api`, then `mashkoor-web`.
2. Watch the API logs: `prisma migrate deploy` should apply every migration, then Nest should start.
3. Create the first admin from the API service's **Terminal** tab:

   ```bash
   pnpm exec prisma db seed
   ```

   It uses `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. Run it **once**.
4. Check `https://mashkoor.rapidrabbit.cloud/api/v1/health` returns `{"status":"ok",...}` and
   `.../api/v1/health/ready` returns `{"status":"ok","database":"up"}`.
5. Open `https://mashkoor.rapidrabbit.cloud`, log in as the admin, and change the seeded password.
6. Turn on **auto-deploy** on both applications so a push to `main` redeploys.

## 3. Backups

- **Database:** on the database service, open **Backups**, add an S3 destination (R2 or B2) and schedule a daily backup.
- **Uploads:** schedule a volume backup of `/data/uploads` to the same destination.
- **Restore test:** do one real restore into a scratch database within the first week.

## 4. Rolling back

Dokploy keeps previous deployments. Redeploy the previous one from the application's **Deployments** tab. Database
migrations are forward-only: if a migration ran, roll back the code only when it is compatible with the newer schema.

## Gotchas

- Staying at **one API replica** is a correctness requirement, not a sizing choice.
- Uploads written by an old server are encrypted with that server's `FIELD_ENCRYPTION_KEY`. They are only readable if
  the same key is set here.
- `.dockerignore` keeps `.env*` files out of the image. All configuration comes from Dokploy's environment tab.
- Image builds install dev dependencies on purpose: the API container needs `prisma` and `ts-node` for migrations and
  the seed.
