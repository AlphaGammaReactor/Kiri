# Kiri Frontend — Vite Dev Server
FROM node:22-slim

WORKDIR /app

# Install deps
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
