#!/usr/bin/env bash
set -euo pipefail

cd release-assets
archive=qkit-static.tar.gz
sha256sum -c "$archive.sha256"
tag="${GITHUB_REF_NAME:?缺少版本标签}"
prerelease=false
latest=true
if [[ "$tag" == *-* ]]; then prerelease=true; latest=false; fi

# 草稿先上传附件；下载并核对服务器实际保存的文件后再公开。
if ! gh release view "$tag" --json tagName > /dev/null 2>&1; then
  printf '解压后将 site/ 部署到静态站点。\n\n镜像：`ghcr.io/%s:%s`\n' "${GH_REPO,,}" "${tag#v}" > release-notes.md
  gh release create "$tag" --verify-tag --draft --title "$tag" --generate-notes --notes-file release-notes.md
fi
existing_assets="$(gh release view "$tag" --json assets --jq '.assets[].name')"
for asset in "$archive" "$archive.sha256"; do
  if ! grep -Fxq "$asset" <<< "$existing_assets"; then gh release upload "$tag" "$asset"; fi
done
gh release download "$tag" --dir verified-assets --pattern 'qkit-static.tar.gz*'
cmp "$archive.sha256" "verified-assets/$archive.sha256"
(cd verified-assets && sha256sum -c "$archive.sha256")
gh release edit "$tag" --draft=false --prerelease="$prerelease" --latest="$latest"
printf 'Release: https://github.com/%s/releases/tag/%s\n' "$GH_REPO" "$tag" >> "$GITHUB_STEP_SUMMARY"
