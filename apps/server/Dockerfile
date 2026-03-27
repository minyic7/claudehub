FROM node:24-alpine AS build
RUN apk add --no-cache python3 make g++
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile
COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
RUN pnpm -F @claudehub/shared build && pnpm -F @claudehub/server build
# Prune devDependencies so we can copy a clean node_modules to production
RUN pnpm prune --prod

FROM node:24-alpine
RUN npm install -g @anthropic-ai/claude-code
RUN apk add --no-cache git curl libstdc++
WORKDIR /app
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/apps/server/node_modules apps/server/node_modules/
COPY --from=build /app/packages/shared/node_modules packages/shared/node_modules/
EXPOSE 7700
CMD ["node", "apps/server/dist/index.js"]
