# Kiri Frontend — Multi-stage Production Build
# Stage 1: Build the Vite app
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom nginx config (template for envsubst)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Railway sets PORT dynamically
ENV PORT=80
EXPOSE ${PORT}

# nginx:alpine image supports /etc/nginx/templates/ — envsubst runs on startup
CMD ["nginx", "-g", "daemon off;"]
