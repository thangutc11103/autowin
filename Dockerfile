# Dockerfile for Next.js + Worker Service (Production)

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Native build dependencies for packages like canvas on Alpine Linux.
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev

# Copy dependency files
COPY package*.json ./

# Install dependencies
# --force avoids npm failing on Windows-generated optional platform metadata in package-lock.json.
RUN npm ci --force

# Copy source
COPY . .

# Build Next.js
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Install dumb-init and runtime libraries needed by native modules.
RUN apk add --no-cache \
    dumb-init \
    cairo \
    pango \
    jpeg \
    giflib \
    librsvg \
    pixman

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/types ./types
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/public ./public

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose ports
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Run with dumb-init to properly handle signals
ENTRYPOINT ["dumb-init", "--"]

# Default: Start Next.js server
CMD ["npm", "start"]

# Alternative: Start worker (override with: docker run ... npm run worker)
# CMD ["npm", "run", "worker"]
