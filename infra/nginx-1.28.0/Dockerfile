FROM nginx:1.28-alpine

# 2026-08-19: Render environment-aware hosts, certificate paths, and upstream ports before Nginx starts.
RUN rm -f /etc/nginx/conf.d/default.conf

COPY conf/nginx.conf /etc/nginx/nginx.conf
COPY conf/mime.types /etc/nginx/mime.types
COPY templates /etc/nginx/templates
