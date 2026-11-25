FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/game-core ./packages/game-core
COPY apps/api ./apps/api
RUN pnpm install --dangerously-allow-all-builds
RUN pnpm --filter @ts-legends/game-core build && pnpm --filter @ts-legends/api build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/game-core/dist ./packages/game-core/dist
COPY --from=builder /app/packages/game-core/package.json ./packages/game-core/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
