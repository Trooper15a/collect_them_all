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
# Download scanner model from GitHub Release (files are .gitignored)
RUN mkdir -p public/model && \
    wget -q -O public/model/card_embedder.onnx https://github.com/Trooper15a/collect_them_all/releases/download/model-v1/card_embedder.onnx && \
    wget -q -O public/model/embeddings.bin https://github.com/Trooper15a/collect_them_all/releases/download/model-v1/embeddings.bin && \
    wget -q -O public/model/index.json https://github.com/Trooper15a/collect_them_all/releases/download/model-v1/index.json
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
