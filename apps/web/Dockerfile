FROM node:26-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /workspace

FROM base AS build
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL}"
ENV NODE_ENV="production"
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build

FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV="production"
ENV PORT="3000"
ENV HOSTNAME="0.0.0.0"
WORKDIR /workspace
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /workspace/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
