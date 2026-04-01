FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS build
WORKDIR /app

COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --filter @crypto-ai/web... --frozen-lockfile=false

COPY . .

RUN pnpm --filter @crypto-ai/web build

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]