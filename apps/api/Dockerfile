FROM node:26-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /workspace

FROM base AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pnpm install --frozen-lockfile
RUN DATABASE_URL="postgresql://build:build-only@127.0.0.1:5432/build?schema=public" \
  pnpm --filter api exec prisma generate --config prisma7.config.ts
RUN pnpm --filter api build

FROM build AS migrate
WORKDIR /workspace/apps/api
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma7.config.ts"]

FROM base AS production-dependencies
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pnpm install --prod --filter api --frozen-lockfile

FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV="production"
ENV PORT="4000"
WORKDIR /workspace/apps/api
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl libstdc++6 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=production-dependencies --chown=node:node /workspace/node_modules /workspace/node_modules
COPY --from=production-dependencies --chown=node:node /workspace/apps/api/node_modules /workspace/apps/api/node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./package.json
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
