#!/usr/bin/env bash
set -euo pipefail

test -s dist/index.html
epoch="$(git show -s --format=%ct HEAD)"
mkdir -p .release/site release-assets
cp -R dist/. .release/site/
cp docs/deployment.md .release/README.md

# 固定归档时间、顺序及权限，同一份静态产物重跑可以核验。
tar --sort=name --mtime="@$epoch" --owner=0 --group=0 --numeric-owner \
  --mode='u=rwX,go=rX' -czf release-assets/qkit-static.tar.gz -C .release site README.md
(cd release-assets && sha256sum qkit-static.tar.gz > qkit-static.tar.gz.sha256)
