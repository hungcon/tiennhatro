FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
# Use npm install instead of npm ci to avoid lockfile mismatch during image build
# --omit=dev installs only production deps; --no-audit/--no-fund speed up build
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 4000

ENV NODE_ENV=production
CMD ["node", "index.js"]
