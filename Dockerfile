FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package*.json ./

RUN npm ci

RUN npx playwright install --with-deps chromium

COPY . .

CMD ["npm", "run", "worker"]
