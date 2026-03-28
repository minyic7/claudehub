FROM node:24-slim
RUN apt-get update && apt-get install -y git curl jq python3 make g++ && rm -rf /var/lib/apt/lists/*
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
# Copy non-TS assets (plugin .md/.json files) that tsc doesn't emit
RUN cp -r apps/server/src/plugins apps/server/dist/plugins
# Verify node-pty native binary exists for linux
RUN test -f /app/node_modules/.pnpm/node-pty@*/node_modules/node-pty/build/Release/pty.node && echo "node-pty linux binary OK" || (echo "ERROR: node-pty build/Release/pty.node NOT found" && exit 1)
# Create non-root user (claude CLI refuses --dangerously-skip-permissions as root)
RUN useradd -m -s /bin/bash claudehub
RUN mkdir -p /repos /home/claudehub/.claude && chown -R claudehub:claudehub /repos /home/claudehub/.claude /app
ENV NODE_ENV=production
USER claudehub
EXPOSE 7700
CMD ["node", "apps/server/dist/index.js"]
