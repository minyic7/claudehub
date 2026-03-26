FROM node:24-alpine AS build
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
RUN pnpm -F @claudehub/shared build && pnpm -F @claudehub/web build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html/claudehub
# SPA fallback under /claudehub/
RUN echo 'server { listen 80; location /claudehub/ { alias /usr/share/nginx/html/claudehub/; try_files $uri /claudehub/index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
