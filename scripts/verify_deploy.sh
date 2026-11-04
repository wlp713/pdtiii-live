#!/bin/bash
# 验证 Cloudflare Pages 线上版本 == 仓库 HEAD（部署链路体检，2026-11-04）
# 用法: bash scripts/verify_deploy.sh
# 输出: 每个站点一行 OK/FAIL；全部一致时退出码 0，否则 1
set -u
PC_REPO=/mnt/c/Users/19777/Desktop/pdtiii-live
MB_REPO=/mnt/c/Users/19777/Desktop/pdtiii-mobile
PC_URL=https://gat-production-dashboard.pages.dev/
MB_URL=https://gat-production-dashboard-mobile.pages.dev/
fail=0

check() {
  local name="$1" url="$2" repo="$3"
  local live repo_md5 ts
  ts=$(date +%s)
  live=$(curl -s --max-time 25 "${url}?v=${ts}" | md5sum | cut -d' ' -f1)
  repo_md5=$(md5sum "${repo}/index.html" | cut -d' ' -f1)
  if [ -z "$live" ] || [ "$live" = "d41d8cd98f00b204e9800998ecf8427e" ]; then
    echo "FAIL $name: 线上取不到内容 ($url)"; fail=1; return
  fi
  if [ "$live" = "$repo_md5" ]; then
    echo "OK   $name: 线上 == 仓库 HEAD ($live)"
  else
    echo "FAIL $name: 线上 ${live:0:8} != 仓库 ${repo_md5:0:8}"
    echo "     仓库 HEAD: $(git -C "$repo" log --oneline -1 2>/dev/null)"
    fail=1
  fi
}

check "PC端  " "$PC_URL" "$PC_REPO"
check "手机端" "$MB_URL" "$MB_REPO"
exit $fail
