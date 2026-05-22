FROM node:22-slim AS base
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

# --- Deps stage: production-only flat node_modules via pnpm ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod --shamefully-hoist

# --- Runner stage ---
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# LibreOffice writes to $HOME/.config; point it at a writable tmpfs location.
ENV HOME=/tmp

# Install LibreOffice (PPTX rendering), poppler (pdftoppm), Noto CJK fonts (Japanese),
# and fontconfig. These are required by the async quality gate that renders the
# generated PPTX to PNG for pixelmatch / sharp-phash comparison (Phase 4B).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libreoffice-impress \
        libreoffice-core \
        poppler-utils \
        fonts-noto-cjk \
        fontconfig \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Warm up the UNO runtime so the first runtime conversion is not the one
# paying the jar-compilation cost. Use a dedicated build-time profile to
# avoid colliding with the per-PID runtime profiles (-env:UserInstallation).
RUN soffice --headless \
        -env:UserInstallation=file:///tmp/uno-warmup-build \
        --convert-to pdf \
        --outdir /tmp \
        /usr/share/doc/libreoffice-core/README || true \
    && rm -rf /tmp/uno-warmup-build /tmp/README.pdf

# Sanity check: image must include Noto CJK fonts, otherwise Japanese slides
# render as tofu in the quality-gate PNGs. Fail the build if missing.
RUN fc-list | grep -i noto >/dev/null \
    || (echo "ERROR: Noto fonts not installed" >&2 && exit 1)

# Copy standalone server + static + public + skills
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/skills ./skills

# Replace standalone's pnpm node_modules with flat npm ones
RUN rm -rf /app/node_modules
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "server.js"]
