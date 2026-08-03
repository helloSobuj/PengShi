# syntax=docker/dockerfile:1.8

# Multi-stage build for the Next.js web UI.
# Uses pnpm as the package manager per the `packageManager` field in package.json.
ARG NODE_VERSION=22-bookworm-slim
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

# --- Dependencies stage: install deps once and cache layer ---
FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends libc6 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
# Install with frozen lockfile for reproducible builds.
RUN pnpm install --frozen-lockfile --ignore-scripts

# --- Build stage: compile Next.js production bundle ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Disable it to avoid network egress during build.
ENV NEXT_TELEMETRY_DISABLED=1

# Required so Next.js can build standalone output when a hostname is not
# available to the build container (it will fall back to localhost).
RUN pnpm build

# --- Production stage: minimal runtime image with non-root user ---
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone output not used — simpler: keep .next + deps + public + app files
# and copy with correct ownership. node_modules is pruned to prod only below.
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/postcss.config.mjs ./postcss.config.mjs
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/components.json ./components.json
COPY --from=builder /app/app-config.ts ./app-config.ts
COPY --from=builder /app/middleware.ts ./middleware.ts
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts
COPY --from=builder /app/vercel.json ./vercel.json
COPY --from=builder /app/.eslintrc.json ./.eslintrc.json
COPY --from=builder /app/eslint.config.mjs ./eslint.config.mjs
COPY --from=builder /app/.prettierrc ./.prettierrc
COPY --from=builder /app/.prettierignore ./.prettierignore
COPY --from=builder /app/renovate.json ./renovate.json

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/styles ./styles
COPY --from=builder /app/fonts ./fonts
COPY --from=builder /app/messages ./messages
COPY --from=builder /app/hooks ./hooks
COPY --from=builder /app/i18n ./i18n
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/components ./components
COPY --from=builder /app/app ./app
COPY --from=builder /app/node_modules ./node_modules

RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `next start` uses Node server — required so Server Components with
# node:sqlite (history + KB APIs) work correctly on a long-running host.
CMD ["node_modules/.bin/next", "start"]
