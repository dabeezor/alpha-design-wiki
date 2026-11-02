FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite reads PUBLIC_* from .env; the committed example holds the NAS values.
RUN cp .env.example .env && npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html/__SLUG__
# Deploy check: the Komodo deploy step reads this file back.
COPY VERSION /usr/share/nginx/html/__SLUG__/version.txt
