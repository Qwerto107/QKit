#!/usr/bin/env bash
set -euo pipefail

image="ghcr.io/${GITHUB_REPOSITORY,,}"
tags=("$image:sha-${GITHUB_SHA}")
case "$GITHUB_EVENT_NAME:$GITHUB_REF" in
  push:refs/tags/v*)
    version="${GITHUB_REF#refs/tags/v}"
    tags+=("$image:$version")
    # 正式版更新 latest，预发布只写版本标签与提交标签。
    if [[ "$version" != *-* ]]; then tags+=("$image:latest"); fi
    ;;
  workflow_dispatch:refs/heads/main) ;;
  *) printf '当前事件或分支不允许发布镜像\n' >&2; exit 1 ;;
esac

{
  printf 'tags<<QKIT_IMAGE_TAGS\n'
  printf '%s\n' "${tags[@]}"
  printf 'QKIT_IMAGE_TAGS\n'
} >> "${GITHUB_OUTPUT:?缺少 GITHUB_OUTPUT}"
