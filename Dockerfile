FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
# SPA fallback — all routes to index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
