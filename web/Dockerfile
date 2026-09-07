# ── Stage 1: Install dependencies ──
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --ignore-scripts

# ── Stage 2: Build ──
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Copy onnxruntime-web WASM files to public/ort (postinstall is skipped)
RUN mkdir -p public/ort && \
    for f in node_modules/onnxruntime-web/dist/ort-wasm*.wasm node_modules/onnxruntime-web/dist/ort-wasm*.mjs; do \
      [ -f "$f" ] && cp "$f" public/ort/; \
    done
# Download scanner model from GitHub Release (private repo needs auth token)
ARG GITHUB_TOKEN
RUN apk add --no-cache curl jq && mkdir -p public/model && \
    RELEASE_JSON=$(curl -fsSL -H "Authorization: token ${GITHUB_TOKEN}" \
      "https://api.github.com/repos/Trooper15a/collect_them_all/releases/tags/model-v1") && \
    for FILE in card_embedder.onnx embeddings.bin index.json; do \
      ASSET_URL=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name==\"$FILE\") | .url") && \
      curl -fsSL -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/octet-stream" \
        -o "public/model/$FILE" "$ASSET_URL"; \
    done && \
    ls -lh public/model/
RUN npm run build

# ── Stage 3: Production ──
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
