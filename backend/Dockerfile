FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json prisma7.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig.json vitest.config.ts ./
COPY src ./src

RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

USER node
CMD ["node", "dist/server.js"]
