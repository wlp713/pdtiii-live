#!/usr/bin/env bash
# deploy_cloudflare.sh — 把两个看板自动发布到 Cloudflare Pages（2026-11-04）
#
# 背景：gat-production-dashboard(.pages.dev) / -mobile 两个项目是 direct-upload（没有接 Git），
#   以前靠人工上传快照 → 仓库改了线上不动，线上长期停在 2026-11-02 的版本。
#   本脚本由本机 cron 每 10 分钟跑一次：只有仓库 HEAD 变了才部署，否则直接退出。
#
# 依赖：wrangler 已登录（~/.config/.wrangler/config/default.toml，带 refresh_token，会自动续期）
# 用法：deploy_cloudflare.sh [--force]
set -u

PC=/mnt/c/Users/19777/Desktop/pdtiii-live
MOB=/mnt/c/Users/19777/Desktop/pdtiii-mobile
LOG="$PC/logs/deploy.log"
mkdir -p "$PC/logs"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }

deploy_one() {
  local repo="$1" project="$2" stamp="$3"
  cd "$repo" || { log "跳过 $project: 目录不存在"; return 1; }
  git fetch origin main -q 2>/dev/null || { log "跳过 $project: git fetch 失败"; return 1; }
  local head last
  head=$(git rev-parse origin/main 2>/dev/null) || return 1
  last=$(cat "$stamp" 2>/dev/null || echo "")
  if [ "$head" = "$last" ] && [ "$FORCE" = "0" ]; then
    return 0
  fi
  local dist="/tmp/cfdeploy-$(basename "$repo")"
  rm -rf "$dist"; mkdir -p "$dist"
  git archive origin/main | tar -x -C "$dist" 2>/dev/null || {
    log "跳过 $project: git archive 失败"; return 1; }
  rm -rf "$dist/.github" "$dist/logs" "$dist/tools" "$dist/scripts" "$dist/server" "$dist/tests"
  find "$dist" -maxdepth 1 -name '_*' -exec rm -rf {} + 2>/dev/null
  find "$dist" -maxdepth 1 -name '*.bak*' -delete 2>/dev/null
  log "开始部署 $project @ ${head:0:7}"
  if ( cd "$dist" && npx --yes wrangler@3 pages deploy . --project-name="$project" --branch=main --commit-dirty=true ) >>"$LOG" 2>&1; then
    echo "$head" > "$stamp"
    log "部署成功 $project @ ${head:0:7}"
  else
    log "部署失败 $project @ ${head:0:7}（详见上方 wrangler 输出）"
    return 1
  fi
}

deploy_one "$PC"  gat-production-dashboard         "$PC/.cf_last_deploy"
deploy_one "$MOB" gat-production-dashboard-mobile  "$MOB/.cf_last_deploy"
exit 0

# 2026-11-04: 本脚本已停用（本机 cron 部署分支已 #DISABLED），部署改由 GitHub Actions 承担
