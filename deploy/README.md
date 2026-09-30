# Deploying Mashkoor to a Hostinger VPS

Two independent services on one Ubuntu VPS. Only the **database runs in Docker**; everything else runs directly on the server.

> **Currently staging.** Only `deploy/nginx/dashboard.conf`'s `mashkoor.rapidrabbit.cloud` server block is active
> (dashboard only); the real `app.mashkoor.co.in` block in the same file, and all of `deploy/nginx/website.conf`,
> are commented out. The steps below still apply — just read `mashkoor.rapidrabbit.cloud` wherever
> `app.mashkoor.co.in` appears until the real domains are switched on.
>
> **HTTPS is via nginx + certbot, not Caddy.** This server already runs nginx for other sites, so Mashkoor is added
> as its own nginx server block (`deploy/nginx/*.conf`) rather than taking over ports 80/443 with a second proxy.
> `server-setup.sh` only installs nginx if it isn't already there, and never touches your other sites' configs.

```
Internet ─► nginx (host, ports 80/443; already running other sites) + certbot for HTTPS
             ├─ mashkoor.rapidrabbit.cloud (staging) ─► static React app in /var/www/mashkoor-app
             │                                            └─ /api/*  ─► pm2 "mashkoor-api" (NestJS, 127.0.0.1:4000) ─► Postgres
             │
             │  ── once switched over to the real domains ──
             ├─ app.mashkoor.co.in  ─► static React app in /var/www/mashkoor-app (same as above)
             ├─ www.mashkoor.co.in  ─► pm2 "mashkoor-website" (Next.js, 127.0.0.1:3000) ──► API (127.0.0.1:4000)
             └─ mashkoor.co.in      ─► redirects to www

Docker: postgres:17 only, bound to 127.0.0.1:5432 (volume `pgdata`)
```

The dashboard and the website are deployed, restarted and rolled back **separately**. They only talk to each other over localhost:
the website reads `/api/v1/public/*` from the API, and the API tells the website to refresh pages after catalog edits.

| What | Where on the server |
|---|---|
| Code | `/var/www/mashkoor/mashkoor-dashboard`, `/var/www/mashkoor/mashkoor-website`, `/var/www/mashkoor/mashkoor-dashboard/deploy` |
| API settings | `/var/www/mashkoor/mashkoor-dashboard/backend/.env` |
| Website settings | `/var/www/mashkoor/mashkoor-website/.env.production` |
| Database settings | `/var/www/mashkoor/mashkoor-dashboard/deploy/postgres/.env` |
| Static React build | `/var/www/mashkoor-app` |
| nginx config | `/etc/nginx/sites-available/mashkoor-dashboard.conf`, `mashkoor-website.conf` (symlinked from `deploy/nginx/`) |
| Backups | `/var/backups/mashkoor` |

## What you need first
- A Hostinger **VPS with Ubuntu 22.04 or 24.04** (2 vCPU / 4 GB RAM or more; building the apps needs the memory, the script adds swap).
- A DNS **A record** for the staging domain, `mashkoor.rapidrabbit.cloud`, pointing at the server's IP. certbot only issues a certificate after it resolves. (`app.mashkoor.co.in`, `www.mashkoor.co.in` and `mashkoor.co.in` are for later — see the note above.)
- An SSH login to the server.
- The production secrets (step 4). Nothing secret is stored in the repository.

To switch from staging to the real domains later: in `deploy/nginx/dashboard.conf`, comment out the staging `server` block and
uncomment the `app.mashkoor.co.in` one (and set up `deploy/nginx/website.conf` the same way for the website), symlink and
`certbot --nginx -d app.mashkoor.co.in` (and the website's domains) as in step 7, then repeat the domain substitution in
`deploy/env/backend.env.example` (`APP_URL`, `CORS_ORIGINS`) and `deploy/scripts/deploy-dashboard.sh` (the final `curl` hint).

## 1. Prepare the server (once)
SSH in as root and run:
```bash
apt-get update && apt-get install -y git
git clone <dashboard-repo-url> /tmp/setup   # or copy deploy/scripts/server-setup.sh up with scp
bash /tmp/setup/deploy/scripts/server-setup.sh
```
This installs Node 22, pnpm, pm2, Docker, nginx + certbot (only if nginx isn't already installed — it won't touch an
existing nginx or its other sites), a firewall (SSH, 80, 443 only), swap and automatic security updates, creates the
unprivileged `mashkoor` user, and makes pm2 start on reboot.
Log in as `mashkoor` from now on (`su - mashkoor`, or add your SSH key to `/home/mashkoor/.ssh/authorized_keys`).

## 2. Put the code on the server
As `mashkoor`:
```bash
mkdir -p /var/www/mashkoor
cd /var/www/mashkoor
git clone <dashboard-repo-url> mashkoor-dashboard
git clone <website-repo-url> mashkoor-website
```
`deploy/` lives inside the dashboard repo, so cloning it brings along `/var/www/mashkoor/mashkoor-dashboard/deploy` automatically —
nothing extra to copy.

## 3. Start the database
```bash
cd /var/www/mashkoor/mashkoor-dashboard/deploy/postgres
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"   # paste the output as POSTGRES_PASSWORD
nano .env
docker compose up -d
docker compose ps        # postgres should say "healthy"
```

## 4. Configure the two services
```bash
cp /var/www/mashkoor/mashkoor-dashboard/deploy/env/backend.env.example /var/www/mashkoor/mashkoor-dashboard/backend/.env
cp /var/www/mashkoor/mashkoor-dashboard/deploy/env/website.env.production.example /var/www/mashkoor/mashkoor-website/.env.production
chmod 600 /var/www/mashkoor/mashkoor-dashboard/backend/.env /var/www/mashkoor/mashkoor-website/.env.production
nano /var/www/mashkoor/mashkoor-dashboard/backend/.env
nano /var/www/mashkoor/mashkoor-website/.env.production
```
Fill in every blank. Generate each secret with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`:

- Backend: `DATABASE_URL` (the database password from step 3), `JWT_ACCESS_SECRET`, `TOKEN_PEPPER`, `FIELD_ENCRYPTION_KEY`
  (32 random bytes, base64 — **back it up; it encrypts stored passport numbers AND every uploaded document on disk, so
  losing it, or changing it later, makes both permanently unreadable**), the MSG91 email values, `REVALIDATE_SECRET`,
  and `SEED_ADMIN_PASSWORD` (10+ characters). `UPLOAD_DIR` defaults to `/var/lib/mashkoor/uploads`, already created
  and owned correctly by `server-setup.sh` — leave it as is unless you have a reason to move it.
- Website: `REVALIDATE_SECRET` — **exactly the same value as the backend's**.

## 5. Deploy the dashboard
```bash
bash /var/www/mashkoor/mashkoor-dashboard/deploy/scripts/deploy-dashboard.sh
```
Installs, builds, applies database migrations, publishes the React app to `/var/www/mashkoor-app` and starts the API in pm2.

Create the first Super Admin (once):
```bash
cd /var/www/mashkoor/mashkoor-dashboard && NODE_ENV=production pnpm --filter @mashkoor/backend prisma:seed
```
In production the seed creates only that one admin (no demo data). Then remove `SEED_ADMIN_PASSWORD` from `.env` and sign in at `/admin/login`.
Change the password, then fill in **Administration → Company profile** (letterhead, GST/PAN, bank and UPI details, logo, standard terms).

## 6. Deploy the website
```bash
bash /var/www/mashkoor/mashkoor-dashboard/deploy/scripts/deploy-website.sh
```

## 7. Turn on HTTPS
As root:
```bash
ln -s /var/www/mashkoor/mashkoor-dashboard/deploy/nginx/dashboard.conf /etc/nginx/sites-available/mashkoor-dashboard.conf
ln -s /etc/nginx/sites-available/mashkoor-dashboard.conf /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d mashkoor.rapidrabbit.cloud
```
`nginx -t` checks the config before nginx reloads with it — fix any error it reports before continuing (a typo here could
take down your other sites on this nginx). `certbot --nginx` gets the certificate and rewrites `dashboard.conf` itself to
add the HTTPS server block and the HTTP → HTTPS redirect; answer its prompts (email, agree to terms, redirect HTTP to HTTPS).
Watch for problems with `journalctl -u nginx -f`. Certificates auto-renew; certbot installs its own timer for that.

## 8. Check it works
On staging (dashboard only):
```bash
curl -s https://mashkoor.rapidrabbit.cloud/api/v1/health   # → status ok
pm2 status                                                 # mashkoor-api: online
```
Then sign in at `https://mashkoor.rapidrabbit.cloud/admin`.

Once the real domains are switched on and the website is deployed too (step 6), also check:
```bash
curl -s https://app.mashkoor.co.in/api/v1/health          # → status ok
curl -sI https://www.mashkoor.co.in | head -1              # → 200
curl -sI https://mashkoor.co.in | head -3                  # → 301 to www
pm2 status                                                 # mashkoor-api and mashkoor-website: online
```
Sign in to `https://app.mashkoor.co.in/admin`, publish a package and confirm it shows on the website within seconds
(that proves the API → website refresh works). The website builds without live data, so its first pages may briefly show no packages
until that first refresh or 5 minutes pass.

## 9. Backups (do this before go-live)
As root:
```bash
cp /var/www/mashkoor/mashkoor-dashboard/deploy/scripts/backup.sh /usr/local/bin/mashkoor-backup && chmod +x /usr/local/bin/mashkoor-backup
echo '15 2 * * * root /usr/local/bin/mashkoor-backup >> /var/log/mashkoor-backup.log 2>&1' > /etc/cron.d/mashkoor-backup
mashkoor-backup            # run once now to confirm it works
```
This writes **two** files each run: a Postgres dump (customers, bookings, payments, everything else) and a tarball of
`UPLOAD_DIR` (uploaded visas, tickets and vouchers — stored on disk, not in the database, encrypted with a key derived
from `FIELD_ENCRYPTION_KEY`). Both are needed for a real backup; the database alone is missing every document. Both keep
14 days on the server; **also copy `/var/backups/mashkoor` somewhere else** (Hostinger snapshots, or `scp`/`rclone` to
another machine) — a backup that only ever lives on the server it's backing up doesn't survive that server failing.

Test a database restore once, on a spare database, not on live data:
```bash
docker exec -i mashkoor-postgres createdb -U mashkoor restore_test
docker exec -i mashkoor-postgres pg_restore -U mashkoor -d restore_test < /var/backups/mashkoor/mashkoor-db-<stamp>.dump
docker exec -i mashkoor-postgres dropdb -U mashkoor restore_test
```
And confirm the uploads tarball is readable: `tar -tzf /var/backups/mashkoor/mashkoor-uploads-<stamp>.tar.gz | head`.

## Moving to another server later
The client's VPS becomes the real server; this one stops serving traffic. Nothing here is tied to this machine —
everything that matters is in the database, `UPLOAD_DIR`, and the `.env` files — but all three have to move together:

1. Run `server-setup.sh` and steps 2–4 on the new server as normal — **except** don't generate new secrets. Copy every
   value from the old `backend/.env` and `.env.production` across unchanged, **`FIELD_ENCRYPTION_KEY` above all**: a
   new key can't read data (or files) encrypted with the old one. `DATABASE_URL`'s password can differ if you like;
   everything else should match exactly.
2. Copy the data itself:
   ```bash
   # On the old server:
   mashkoor-backup   # makes a fresh db + uploads pair
   scp /var/backups/mashkoor/mashkoor-db-<stamp>.dump /var/backups/mashkoor/mashkoor-uploads-<stamp>.tar.gz newserver:/tmp/

   # On the new server, after step 3 (database is up, empty):
   docker exec -i mashkoor-postgres pg_restore -U mashkoor -d mashkoor --clean --if-exists /tmp/mashkoor-db-<stamp>.dump
   tar -xzf /tmp/mashkoor-uploads-<stamp>.tar.gz -C /var/lib/mashkoor
   chown -R mashkoor:mashkoor /var/lib/mashkoor/uploads
   ```
3. Point DNS at the new server's IP, run steps 5–7 there, confirm step 8's checks pass, **then** decommission the old
   server. Keep the old server's disk around (or one last backup off it) until you've confirmed logins, a booking's
   documents, and a quotation PDF all work correctly on the new one.

## Day to day
| Task | Command (as `mashkoor`) |
|---|---|
| Deploy a dashboard update | `cd /var/www/mashkoor/mashkoor-dashboard && git pull && bash /var/www/mashkoor/mashkoor-dashboard/deploy/scripts/deploy-dashboard.sh` |
| Deploy a website update | `cd /var/www/mashkoor/mashkoor-website && git pull && bash /var/www/mashkoor/mashkoor-dashboard/deploy/scripts/deploy-website.sh` |
| Logs | `pm2 logs mashkoor-api` · `pm2 logs mashkoor-website` · `journalctl -u nginx` |
| Restart one service | `pm2 restart mashkoor-api` |
| Roll back | `git checkout <previous-commit>` in that folder, then run its deploy script again (migrations are additive; never roll the database back without a restore) |
| Database shell | `docker exec -it mashkoor-postgres psql -U mashkoor mashkoor` |

## Things to know
- **Run exactly one API process.** The API runs its scheduled jobs (payment-link expiry, balance reminders, releasing unpaid seat holds) inside itself; pm2 is configured for a single instance on purpose.
- **Online payments are off.** Only the test gateway exists, and it is forced off in production. Staff record offline payments; direct website bookings create a payment link that cannot be paid online yet. Connect a real gateway before advertising that flow.
- **Email** needs the MSG91 template (`##subject##` and `##body_html##`) and a verified sender domain, plus SPF/DKIM/DMARC records for the mail domain.
- **Rupee sign on the quotation PDF** prints as "Rs." until the free Noto Sans font files (`NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`) are placed in `dashboard/backend/assets/fonts/`.
- **Security:** the firewall exposes only SSH, 80 and 443; Postgres and both Node apps listen on localhost. Use SSH keys and disable password login for SSH.
- **Two servers later:** each service already talks to the other only through a URL (`API_BASE_URL`, `WEBSITE_URL`). To split them, point those at the other server's public address (and add the website's address to nothing else — the API needs no CORS entry for it).
