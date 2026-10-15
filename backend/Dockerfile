# Build context is the dashboard repo root (the pnpm workspace + packages/shared live there):
#   docker build -f backend/Dockerfile .
FROM node:22-bookworm-slim

# Prisma's query engine needs openssl; ca-certificates for outbound HTTPS (MSG91 etc.).
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.31.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY backend ./backend

# Dev dependencies stay installed on purpose: `prisma migrate deploy` and the ts-node seed run inside this container.
# The backend's postinstall (prisma generate) needs backend/prisma, which is why backend/ is copied before install.
RUN pnpm install --frozen-lockfile --filter @mashkoor/backend...

RUN pnpm --filter @mashkoor/shared build \
 && pnpm --filter @mashkoor/backend exec prisma generate \
 && pnpm --filter @mashkoor/backend build

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
WORKDIR /app/backend

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply pending migrations, then start the API. Keep ONE replica: scheduled jobs run in-process.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
