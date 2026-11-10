# syntax=docker/dockerfile:1

# ---- Stage 1: build the Vue app with Vite ----
FROM node:22-alpine AS app-builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: serve the static bundle ----
FROM nginx:alpine AS runtime
COPY --from=app-builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
