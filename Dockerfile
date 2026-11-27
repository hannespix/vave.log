FROM node:24.22.3-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS base
# Alpine security fixes published after this Node image was built.
RUN apk add --no-cache libcrypto3=3.5.9-r1 libssl3=3.5.9-r1 zlib=1.4-r0

FROM base AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM base
# Only the builder needs package managers. The container starts Node directly.
RUN rm -rf /usr/local/lib/node_modules/npm /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node
EXPOSE 3000
# node:http preserves the configured Host for the local probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "require('node:http').get({hostname:'127.0.0.1',port:process.env.PORT||3000,path:'/healthz',headers:{Host:new URL(process.env.APP_URL).host}},res=>process.exit(res.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/server/server/index.js"]
