# 部署指南

[文档中心](https://github.com/Qwerto107/QKit/tree/main/docs) · [下载版本](https://github.com/Qwerto107/QKit/releases) · [源代码](https://github.com/Qwerto107/QKit)

## 容器部署

安装 Docker 与 Compose。发布正式版后，在工作目录运行：

```sh
curl -fLO https://raw.githubusercontent.com/Qwerto107/QKit/main/docker-compose.yml
docker compose up -d --pull always
```

默认地址为 <http://127.0.0.1:7980>。容器以普通用户运行，静态文件只读，无数据库、密码、环境变量或持久化数据目录。需要远程访问时，在服务前配置 HTTPS 反向代理。

## 静态托管

从 Release 下载 `qkit-static.tar.gz` 和 `qkit-static.tar.gz.sha256`，放到同一目录：

```sh
sha256sum -c qkit-static.tar.gz.sha256
tar -xzf qkit-static.tar.gz
```

macOS 可用 `shasum -a 256 -c qkit-static.tar.gz.sha256` 校验。Windows PowerShell 可运行 `Get-FileHash qkit-static.tar.gz -Algorithm SHA256`，并与校验文件中的散列值逐字对照。

将 `site/` **里的文件**发布到独立域名或子域名的根目录。已有源码时，运行 `npm ci && npm run build`，使用 `dist/` 里的文件。

- 存在的静态资源直接返回。访问 `/poetry`、`/blind-watermark` 等页面路径时，服务器应返回 `index.html`。不要把缺失的 `/assets/` 文件也回退成 HTML。
- WebAssembly 文件需要 `application/wasm` MIME 类型。不要直接双击 HTML，通过 HTTP 或 HTTPS 访问。
- 摄像头、现代剪贴板和 AES-GCM 等功能依赖安全上下文，建议站点启用 HTTPS。设备上的 localhost 可用于本机调试。

容器版已内置这些路由及静态文件配置。

## 升级与回退

使用 Compose 时，可编辑 `docker-compose.yml` 中的镜像版本标签，然后运行 `docker compose up -d --pull always`。需要固定版本时优先用具体版本标签。

静态托管应替换整份站点产物，避免新入口引用已经删除的旧资源。回退时使用相应版本的完整静态包。浏览器内的工具偏好由同一站点的本地存储保留。
