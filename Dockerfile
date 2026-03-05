FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# --- Builder stage ---
FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run setup:icons
RUN pnpm build

# --- Deps stage: flat node_modules via npm ---
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

# --- Runner stage ---
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy standalone server + static + public + skills
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/skills ./skills

# Replace standalone's pnpm node_modules with flat npm ones
RUN rm -rf /app/node_modules
COPY --from=deps /app/node_modules ./node_modules

# Fix: Turbopack externalizes @github/copilot-sdk as a hashed name.
# Scan built chunks for hashed package names and create symlinks.
RUN for hash in $(grep -rohP '@github/copilot-sdk-[a-f0-9]+' /app/.next/server/chunks/ 2>/dev/null | sed 's|@github/||' | sort -u); do \
      [ -e "/app/node_modules/@github/$hash" ] || ln -s copilot-sdk "/app/node_modules/@github/$hash"; \
    done && \
    for hash in $(grep -rohP '@github/copilot-[a-f0-9]+' /app/.next/server/chunks/ 2>/dev/null | grep -v sdk | sed 's|@github/||' | sort -u); do \
      [ -e "/app/node_modules/@github/$hash" ] || ln -s copilot "/app/node_modules/@github/$hash"; \
    done && \
    echo "Symlinks created:" && ls -la /app/node_modules/@github/ | grep '^l'

EXPOSE 3000
CMD ["node", "server.js"]
