# ── Stage 1: Install dependencies ──
# Use slim (Debian/glibc) — onnxruntime-node requires glibc, not musl.
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --ignore-scripts && \
    npm rebuild onnxruntime-node

# ── Stage 2: Download model (cached unless tag changes) ──
FROM node:20-slim AS model
WORKDIR /model
RUN apt-get update && apt-get install -y --no-install-recommends curl jq ca-certificates && rm -rf /var/lib/apt/lists/*
ARG GITHUB_TOKEN
ARG MODEL_TAG=model-v1
ARG MODEL_CACHE_BUST=2026-09-17
RUN RELEASE_JSON=$(curl -fsSL -H "Authorization: token ${GITHUB_TOKEN}" \
      "https://api.github.com/repos/Trooper15a/collect_them_all/releases/tags/${MODEL_TAG}") && \
    for FILE in card_embedder.onnx embeddings.bin index.json; do \
      ASSET_URL=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name==\"$FILE\") | .url") && \
      curl -fsSL -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/octet-stream" \
        -o "$FILE" "$ASSET_URL"; \
    done && \
    ls -lh .

# ── Stage 3: Build ──
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p public/ort && \
    for f in node_modules/onnxruntime-web/dist/ort-wasm*.wasm node_modules/onnxruntime-web/dist/ort-wasm*.mjs; do \
      [ -f "$f" ] && cp "$f" public/ort/; \
    done
COPY --from=model /model/ public/model/
RUN npm run build

# ── Stage 4: Production ──
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y --no-install-recommends 7zip && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# onnxruntime-node native binary (serverExternalPackages copies the JS, but the .so needs the full module)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/onnxruntime-node ./node_modules/onnxruntime-node
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/onnxruntime-common ./node_modules/onnxruntime-common

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
