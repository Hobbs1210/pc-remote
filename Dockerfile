# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:24-slim AS builder

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace dependency manifests for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

RUN pnpm install --frozen-lockfile

# Copy source files
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# Build shared library and backend app
RUN pnpm --filter @pc-remote/shared build
RUN pnpm --filter backend build

# ── Stage 2: Production Runner ────────────────────────────────────────────────
FROM node:24-slim AS runner

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9

WORKDIR /app

# Copy dependency manifests and built artifacts from builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile
RUN pnpm --filter backend exec prisma generate

# Set file ownership for non-root user
RUN chown -R node:node /app

USER node

EXPOSE 3000

ENV NODE_ENV=production

CMD ["sh", "-c", "pnpm --filter backend start"]

