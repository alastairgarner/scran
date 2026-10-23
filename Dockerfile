# Update this digest deliberately alongside dependency/security checks.
FROM oven/bun:1-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4 AS build
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

FROM oven/bun:1-slim@sha256:1846adf22496bd711036aae8be147e57bdebbaea2e5264e3e0b5af1db187d9a4
WORKDIR /app
RUN mkdir /data && chown bun:bun /data
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/client/dist ./client/dist
COPY package.json ./
USER bun
EXPOSE 3000
CMD ["bun", "server/src/index.ts"]
