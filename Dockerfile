FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8787
ENV DATA_FILE=/data/app.db
ENV DAPOERMUDA_API_BASE_URL=https://dapoermuda-production.up.railway.app

RUN node scripts/write-app-config.mjs && node scripts/sync-web.mjs

EXPOSE 8787

CMD ["node", "server/index.mjs"]
