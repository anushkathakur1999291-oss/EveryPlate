FROM node:24-bookworm-slim AS ui
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-bookworm-slim AS api
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/package*.json ./
COPY backend/prisma ./prisma
RUN npm ci
COPY backend/tsconfig.json ./
COPY backend/src ./src
RUN npm run prisma:generate && npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=api --chown=node:node /app/node_modules ./node_modules
COPY --from=api --chown=node:node /app/dist ./dist
COPY --from=api --chown=node:node /app/prisma ./prisma
COPY --from=api --chown=node:node /app/package.json ./package.json
COPY --from=ui --chown=node:node /frontend/dist ./public
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production PORT=4000 DEMO_MODE=false DATABASE_URL=file:/data/rescue.db
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/app.js"]
