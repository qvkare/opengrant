# ============================================
# OpenGrant Multi-Stage Docker Build
# ============================================

FROM node:20-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

# ============================================
# Dependencies Stage
# ============================================
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY package.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/cre-workflows/package.json ./packages/cre-workflows/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/cli/package.json ./apps/cli/

RUN pnpm install --frozen-lockfile

# ============================================
# Builder Stage
# ============================================
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/sdk/node_modules ./packages/sdk/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

# Next.js needs NEXT_PUBLIC_* at build time
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PARTICLE_PROJECT_ID
ARG NEXT_PUBLIC_PARTICLE_CLIENT_KEY
ARG NEXT_PUBLIC_PARTICLE_APP_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_PARTICLE_PROJECT_ID=$NEXT_PUBLIC_PARTICLE_PROJECT_ID
ENV NEXT_PUBLIC_PARTICLE_CLIENT_KEY=$NEXT_PUBLIC_PARTICLE_CLIENT_KEY
ENV NEXT_PUBLIC_PARTICLE_APP_ID=$NEXT_PUBLIC_PARTICLE_APP_ID

# Build packages (skip cre-workflows)
RUN pnpm --filter @opengrant/database build && \
    pnpm --filter @opengrant/sdk build && \
    pnpm --filter @opengrant/api build && \
    pnpm --filter @opengrant/web build

# ============================================
# API Production Image
# ============================================
FROM node:20-alpine AS api
WORKDIR /app

# Copy full pnpm structure (preserves symlinks)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages/database ./packages/database

WORKDIR /app/apps/api

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/index.js"]

# ============================================
# Web Production Image
# ============================================
FROM node:20-alpine AS web
WORKDIR /app

# Copy full pnpm structure
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

WORKDIR /app/apps/web

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npx", "next", "start"]
