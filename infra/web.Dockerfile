FROM node:22-bookworm-slim AS build
WORKDIR /workspace
COPY package*.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --no-audit --no-fund
COPY frontend/ ./frontend/
ENV NEXT_TELEMETRY_DISABLED=1 STANDALONE=1
RUN npm run build
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /workspace/frontend/.next/standalone ./
COPY --from=build --chown=node:node /workspace/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /workspace/frontend/public ./frontend/public
USER node
EXPOSE 3000
CMD ["node","frontend/server.js"]
