# 开发指南

[文档中心](README.md) · [部署指南](deployment.md) · [发布流程](releasing.md)

## 环境与结构

建议使用 Node.js 24，与 CI 一致。受支持的 Node.js 版本以 [package.json](../package.json) 中的 `engines` 为准。npm 依赖由 `package-lock.json` 固定。

```text
index.html            页面结构与图标
src/main.js           初始化、前端路由及主题
src/styles.css        样式
src/components/       自定义控件
src/tools/            各工具的逻辑与交互
src/data/             本地诗词数据与字段说明
public/               直接分发的静态资源
tests/                工具逻辑与页面交互测试
docker/               静态文件服务配置
.github/              Actions 与打包发布脚本
```

## 本地开发与验证

在仓库根目录运行：

```sh
npm ci
npm run dev
```

打开终端显示的地址。测试与生产预览：

```sh
npm test
npm run build
npm run preview
```

`dist/` 是生产输出。Vite 开发和预览服务均支持独立工具路由刷新。可用 `docker build -t qkit:local .` 从源码构建镜像，CI 则复用已构建的静态文件。

## 诗词数据维护

普通开发和生产构建直接使用仓库中的词库。只有重建词库时才需要 Python、[预处理依赖](../scripts/requirements-poetry.txt)和密码转换规则文件。

```sh
python scripts/build_poetry.py --rules-file poetry_rules.py --source verses.json --translate
```

规则文件须在 `PoetryPw` 类中定义 `poetry_to_password` 和 `special_character` 两个异步方法。输入为 JSON 数组，每条包含 `text`（诗句），可附带 `from`（作品）、`by`（作者）和 `id`（唯一标识）。分词和英文标签在构建词库时生成，页面直接使用本地数据。字段细节见 [诗词数据文档](../src/data/README.md)。

## 浏览器边界

页面运行时不依赖第三方 CDN 或业务接口。以后接入公开 API 时，浏览器直接调用要求服务端允许跨域；保密 API Key 或服务端签名应在独立服务处理，不能写入前端构建产物。
