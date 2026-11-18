# 发布流程

[文档中心](README.md) · [开发指南](development.md) · [部署指南](deployment.md)

工作流为 [构建、检查与发布](../.github/workflows/ci.yml)。沿用 [QPix 的工作流](https://github.com/Qwerto107/QPix/blob/main/.github/workflows/ci.yml) 的触发和发布顺序。QKit 的交付物是一份平台无关的静态包及多架构容器镜像。

## 触发方式

| 触发 | 检查 | 产物与发布 |
| --- | --- | --- |
| 分支推送或 PR 命中工作流路径 | 前端测试和构建 | 保存 `qkit-webui-dist`，不发布 |
| 手动运行 | 常规检查 | 额外保存 `qkit-static`，不创建 Release |
| 手动启用 `publish_images` | 常规检查 | 仅 main 发布提交 SHA 镜像，不创建 Release |
| 手动启用 `full_checks` | 额外运行生产依赖审计、容器健康与路由检查 | 是否发布镜像由 `publish_images` 决定 |
| 推送 `v1.2.3` | 常规检查和生产依赖审计 | 发布镜像、附件和正式 Release，更新 `latest` |
| 推送 `v1.2.3-rc.1` | 同正式版 | 发布预览镜像和预发布 Release，保留正式版 `latest` |

手动输入默认关闭。仅修改 README 或未参与打包的说明文档时，不触发日常构建。普通检查可被同一分支的新提交取消，标签发布和手动镜像发布不中途取消。

## 构建顺序

1. 用 Node.js 24 按锁文件安装依赖，执行测试并产出 `dist/`，保存 7 天。
2. 手动与标签构建复用上述产物，生成静态压缩包和 SHA-256，保存 30 天。
3. 镜像任务核对压缩包的 SHA-256，再用同一份站点产物构建并推送至 GHCR。
4. 推送标签时，等镜像任务成功后创建 Release 草稿，上传附件，重新下载并核验后公开。重跑仅补充缺少的文件，不覆盖内容不同的附件。

## 产物与镜像

Release 附件是 `qkit-static.tar.gz` 和 `qkit-static.tar.gz.sha256`。压缩包包含 `site/` 和部署说明。镜像地址为 `ghcr.io/qwerto107/qkit`，配置发布 `linux/amd64`、`linux/arm64` 和 `linux/arm/v6`。镜像的架构来自容器基础镜像，静态包适用于任何可托管静态文件的平台。

| 场景 | 镜像标签 |
| --- | --- |
| 正式版 `v1.2.3` | `1.2.3`、`latest`、`sha-完整提交号` |
| 预发布 `v1.2.3-rc.1` | `1.2.3-rc.1`、`sha-完整提交号` |
| 手动启用镜像发布 | `sha-完整提交号` |

## 仓库权限

工作流默认使用 `contents: read`。镜像任务需要 `packages: write`，Release 任务需要 `contents: write`。两者使用 GitHub 自带的 `GITHUB_TOKEN`；GHCR 包需要允许本仓库写入，匿名拉取需要将包设置为公开。

## 发布与部署

验收代码后，将版本标签指向已推送的提交。示例：

```sh
git tag -a v1.2.3 -m "QKit v1.2.3"
git push origin v1.2.3
```

Actions 负责产物交付。实际部署与回退见 [部署指南](deployment.md)。
