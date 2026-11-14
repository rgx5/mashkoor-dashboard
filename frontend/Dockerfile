# Build context is the dashboard repo root:
#   docker build -f frontend/Dockerfile .
FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.31.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY frontend ./frontend

RUN pnpm install --frozen-lockfile --filter @mashkoor/frontend...
RUN pnpm --filter @mashkoor/shared build \
 && pnpm --filter @mashkoor/frontend build

FROM nginx:alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
