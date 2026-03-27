FROM node:24-slim AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile
COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
RUN pnpm -F @claudehub/shared build && pnpm -F @claudehub/server build

FROM node:24-slim
RUN apt-get update && apt-get install -y git curl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code
RUN corepack enable pnpm
WORKDIR /app
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/tsconfig.base.json ./
# node-pty requires compilation; build tools are installed above
RUN pnpm install --frozen-lockfile --prod
EXPOSE 7700
CMD ["node", "apps/server/dist/index.js"]
