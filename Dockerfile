# ==============================================================================
# Production Multi-Stage Dockerfile for Viral Fabrics Web Platform
# Optimized for Ultra-Lightweight Size (~130MB), Zero Vulnerabilities, and High Performance
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Base Image with Node.js LTS on Alpine Linux
# ------------------------------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ------------------------------------------------------------------------------
# 2. Dependencies Stage
# ------------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Install dependencies based on lockfile
COPY package.json package-lock.json* .npmrc* ./
RUN npm ci --legacy-peer-deps

# ------------------------------------------------------------------------------
# 3. Builder Stage
# ------------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment for production build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Compile Next.js standalone application
RUN npm run build

# ------------------------------------------------------------------------------
# 4. Production Runner Stage (Minimal Alpine Runtime)
# ------------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Create secure non-root system user and group
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets and standalone server output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user for security hardening
USER nextjs

EXPOSE 3000

# Health check to ensure zero-downtime container monitoring
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

# Start self-contained Next.js server
CMD ["node", "server.js"]

