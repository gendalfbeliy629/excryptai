FROM node:24-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS build
WORKDIR /app

COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --filter @crypto-ai/api... --frozen-lockfile=false

COPY . .

RUN pnpm --filter @crypto-ai/api build

FROM base AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --filter @crypto-ai/api --prod --frozen-lockfile=false

COPY --from=build /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["node", "dist/index.js"]