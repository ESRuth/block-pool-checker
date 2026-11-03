# One image: the API plus the built web app, so the phone talks to a single address.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/scores/package.json packages/scores/
COPY packages/vision/package.json packages/vision/
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --filter @bpc/web... --filter @bpc/api...
COPY packages packages
COPY apps/web apps/web
RUN pnpm --filter @bpc/web exec vite build

FROM node:24-slim
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/scores/package.json packages/scores/
COPY services/api/package.json services/api/
COPY apps/web/package.json apps/web/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --filter @bpc/api...
COPY packages/engine packages/engine
COPY packages/scores packages/scores
COPY services/api services/api
COPY --from=build /app/apps/web/dist apps/web/dist
ENV NODE_ENV=production PORT=8080 WEB_DIR=/app/apps/web/dist
WORKDIR /app/services/api
USER node
CMD ["./node_modules/.bin/tsx", "src/server.ts"]
