FROM node:24-slim
RUN apt-get update && apt-get install -y git curl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile
# Force rebuild node-pty native addon for linux-arm64
RUN cd /app/node_modules/.pnpm/node-pty@*/node_modules/node-pty && npx node-gyp rebuild
COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
RUN pnpm -F @claudehub/shared build && pnpm -F @claudehub/server build
# Verify node-pty native binary exists for linux
RUN test -f /app/node_modules/.pnpm/node-pty@*/node_modules/node-pty/build/Release/pty.node && echo "node-pty linux binary OK" || (echo "ERROR: node-pty build/Release/pty.node NOT found" && exit 1)
ENV NODE_ENV=production
EXPOSE 7700
CMD ["node", "apps/server/dist/index.js"]
