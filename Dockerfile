# ── build ───────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ── araçlar ─────────────────────────────────────────────────────
# yt-dlp'nin standalone linux binary'si python gerektirmez; ffmpeg statik build
# olarak alınır. İkisi de apt ağacını imaja sokmadan ~100 MB'a sığar.
FROM debian:bookworm-slim AS tools
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
      -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp
RUN curl -fsSL https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz \
      -o /tmp/ffmpeg.tar.xz \
 && tar -xJf /tmp/ffmpeg.tar.xz -C /tmp \
 && find /tmp -name ffmpeg -type f -exec cp {} /usr/local/bin/ffmpeg \; \
 && find /tmp -name ffprobe -type f -exec cp {} /usr/local/bin/ffprobe \; \
 && chmod a+rx /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

# ── runtime ─────────────────────────────────────────────────────
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=tools /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --from=tools /usr/local/bin/ffmpeg /usr/local/bin/ffmpeg
COPY --from=tools /usr/local/bin/ffprobe /usr/local/bin/ffprobe

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Root olarak çalıştırma: indirilen içerik güvenilmez kaynaktan geliyor.
USER node

CMD ["node", "dist/index.js", "sunucu"]
