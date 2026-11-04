FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY admin/package.json admin/
COPY mobile/package.json mobile/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY admin/package.json admin/
COPY mobile/package.json mobile/
RUN npm ci --omit=dev
COPY server/src server/src
COPY --from=build /app/admin/dist admin/dist
COPY --from=build /app/mobile/dist mobile/dist
VOLUME /data
EXPOSE 3000
CMD ["node", "--no-warnings", "server/src/index.js"]
