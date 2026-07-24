FROM nginx:1.28-alpine

# 2026-07-24: Render environment-aware upstream ports before the public reverse proxy starts.
RUN rm -f /etc/nginx/conf.d/default.conf

COPY conf/nginx.conf /etc/nginx/nginx.conf
COPY conf/mime.types /etc/nginx/mime.types
COPY conf/conf.d/common.conf /etc/nginx/conf.d/common.conf
COPY templates /etc/nginx/templates
