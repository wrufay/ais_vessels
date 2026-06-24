FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# VITE_API_URL is empty so requests go to /api/... (proxied by nginx)
ARG VITE_STADIA_KEY
RUN VITE_API_URL="" VITE_STADIA_KEY=$VITE_STADIA_KEY npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
