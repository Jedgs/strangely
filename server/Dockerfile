# Build from the repository root: docker build -f server/Dockerfile .
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci --workspace @strangely/backend --include-workspace-root
COPY tsconfig.base.json ./
COPY server/tsconfig.json ./server/tsconfig.json
COPY server/src ./server/src
COPY server/migrations ./server/migrations
COPY shared/*.ts ./shared/
COPY scripts/copy-server-assets.mjs ./scripts/copy-server-assets.mjs
RUN npm run build:server

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci --omit=dev --workspace @strangely/backend --include-workspace-root --ignore-scripts && npm cache clean --force
COPY --from=build /app/server/dist ./server/dist
USER node
WORKDIR /app/server
EXPOSE 3001
CMD ["node", "dist/server/src/index.js"]
