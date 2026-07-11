FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .
RUN mkdir -p data data/transcripts

ENV NODE_ENV=production
EXPOSE 3847

CMD ["node", "src/index.js"]
