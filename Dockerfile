FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY drizzle ./drizzle

USER node
EXPOSE 3100
CMD ["sh", "-c", "node src/infrastructure/db/migrate.ts && node src/index.ts"]
