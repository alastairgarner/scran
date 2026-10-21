FROM oven/bun:1-slim AS build
WORKDIR /app
COPY package.json bun.lockb ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
RUN bun install --frozen-lockfile
COPY client ./client
COPY shared ./shared
COPY server ./server
RUN bun run --filter @scran/client build

FROM oven/bun:1-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/client/dist ./client/dist
COPY package.json ./
EXPOSE 3000
CMD ["bun", "server/src/index.ts"]
