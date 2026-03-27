FROM node:24-slim
RUN apt-get update && apt-get install -y git curl python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile
COPY packages/shared/ packages/shared/
COPY apps/server/ apps/server/
RUN pnpm -F @claudehub/shared build && pnpm -F @claudehub/server build
# Verify node-pty native binary exists
RUN find /app/node_modules -name "pty.node" -type f && echo "node-pty binary found" || (echo "ERROR: node-pty binary NOT found" && exit 1)
EXPOSE 7700
CMD ["node", "apps/server/dist/index.js"]
