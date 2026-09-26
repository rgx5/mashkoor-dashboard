# mashkoor-app

Mashkoor Travels platform — **NestJS backend** and **React dashboard** with three root portals:

| Portal | Frontend | API | Users |
|---|---|---|---|
| Admin | `/admin` | `/api/v1/admin/*` | Super Admin, Operations Manager, Sales Agent |
| B2B | `/b2b` | `/api/v1/b2b/*` | Partner Admin, Partner User |
| B2C | `/b2c` | `/api/v1/b2c/*` | Customers (email one-time code) |
| Public | `/i/:token`, `/pay/:token` | `/api/v1/public/*` | Shared links, website |

The public website is a separate codebase (`../website`) and only uses `/api/v1/public/*`.
Architecture, data model and roadmap: `../docs/PROJECT_PLAN.md` and `../docs/IMPLEMENTATION_ROADMAP.md`.

## Structure

```
backend/           NestJS API
  prisma/          schema, migrations, seed
  src/core/        auth (portal audiences, refresh rotation), rbac (CASL), prisma, audit, mail, http
  src/modules/     one folder per business module: domain/ + admin/ b2b/ b2c/ controllers
frontend/          React + Vite SPA
  src/core/        api client, portal sessions, ability, UI kit
  src/portals/     admin | b2b | b2c layouts, logins, module registries
  src/modules/     one folder per business module: api.ts + admin/ b2b/ b2c/ screens + index.ts manifest
packages/shared/   enums, constants and Zod schemas used by both
infra/             docker compose for local services
tools/generators/  pnpm gen:module
```

## Getting started

Requirements: Node 22+, pnpm 10, Docker Desktop.

```bash
pnpm install
pnpm db:up                                   # Postgres :5433, Redis :6380, Mailpit :8025
cp backend/.env.example backend/.env         # then set the secrets
pnpm --filter @mashkoor/shared build
pnpm db:migrate                              # creates tables
pnpm db:seed                                 # Super Admin + demo users (dev only)
pnpm dev                                     # API :4000, dashboard :5173
```

- Dashboard: http://localhost:5173/admin · /b2b · /b2c
- API docs (dev only): http://localhost:4000/api/docs
- Emails (invites, reset links, customer codes) are printed in the backend console in Phase 0.

Demo accounts (dev seed, password = `SEED_ADMIN_PASSWORD`): `ops@demo.mashkoor.local`, `sales@demo.mashkoor.local`, `partner@demo.mashkoor.local` (B2B). Customer `customer@demo.mashkoor.local` signs in to `/b2c` with an emailed code.

## Adding a module

```bash
pnpm gen:module leads --portals admin,b2b,b2c
```

Then register the Nest module in `backend/src/app.module.ts`, add the manifest to each portal registry, and add Prisma models, CASL subjects and shared schemas. Definition of done: `../docs/IMPLEMENTATION_ROADMAP.md` §13.

## Security rules

- Every non-public route belongs to a portal; the access token's audience must match (`AccessTokenGuard`, fail-closed).
- `partnerId` / `customerId` always come from the token, never from request input.
- Access tokens live in memory; refresh tokens are httpOnly cookies scoped per portal and rotated on every use with reuse detection.
- Sensitive actions are written to `AuditLog`.
