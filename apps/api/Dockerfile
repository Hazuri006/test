# ==============================================================================
# API Yurei Project — build multi-étapes (contexte: racine du monorepo)
# ==============================================================================
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @yurei/shared --workspace @yurei/api --include-workspace-root

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build -w @yurei/shared \
 && cd apps/api \
 && npx prisma generate \
 && npm run build

# ------------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/discord-role-map.json ./apps/api/discord-role-map.json

WORKDIR /app/apps/api
EXPOSE 4000

# Applique les migrations puis démarre l'API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
