# 本地从源码构建，CI 使用 release 目标复用已校验的前端产物。
FROM --platform=$BUILDPLATFORM node:24-alpine AS frontend
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

FROM nginx:stable-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/nginx.conf
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]

FROM runtime AS release
COPY .release/site/ /usr/share/nginx/qkit/

FROM runtime AS standalone
COPY --from=frontend /src/dist/ /usr/share/nginx/qkit/
