# Один образ для сервера и воркера + отдельный образ Caddy со статикой приложений.

FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/student/package.json apps/student/
COPY apps/admin/package.json apps/admin/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @hud/student build && pnpm --filter @hud/admin build

FROM node:22-slim AS api
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=deps /app /app
COPY . .
USER node
EXPOSE 3000
WORKDIR /app/apps/api
CMD ["node", "--import", "tsx", "src/main.ts"]

FROM caddy:2 AS web
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/student/dist /srv/student
COPY --from=build /app/apps/admin/dist /srv/admin
