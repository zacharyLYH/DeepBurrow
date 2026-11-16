FROM node:26-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
RUN npm ci --omit=dev
COPY apps/api apps/api
COPY packages/types packages/types
COPY db db
ENV PORT=8787 DATA_DIR=/data
EXPOSE 8787
CMD ["node", "apps/api/src/server.ts"]
