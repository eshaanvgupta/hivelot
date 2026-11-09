FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/sdk/package.json ./packages/sdk/

RUN npm install --omit=dev

COPY apps/api ./apps/api
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk

EXPOSE 4000

CMD ["node", "apps/api/src/server.js"]
