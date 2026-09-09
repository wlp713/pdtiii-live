#!/usr/bin/env bash
# PDTIII 生产日归档本机兜底 wrapper (2026-09-09)
# 用途: 数据驱动归档 + 一旦有新数据自动 commit+push 上线。
# 幂等: 无新内容时 git commit/push 会优雅退出(exit 0)。
# 依赖: 本机 python3 + git remote 凭据(已内嵌在 origin URL)。
set -u
ROOT="/mnt/c/Users/19777/Desktop/pdtiii-live"
LOG="$ROOT/logs/archive_cron.log"
STAMP="$(date '+%Y-%m-%d %H:%M:%S %Z')"

run_archive() {
  local shift_arg="$1"
  cd "$ROOT" || { echo "[$STAMP] FAIL cd $ROOT" >> "$LOG"; return 1; }
  echo "=== [$STAMP] python3 scripts/archive_daily.py --shift $shift_arg ===" >> "$LOG"
  /usr/bin/python3 scripts/archive_daily.py --shift "$shift_arg" >> "$LOG" 2>&1
  local rc=$?
  echo "rc=$rc" >> "$LOG"
  return $rc
}

commit_push() {
  cd "$ROOT" || return 1
  git add -A
  if git diff --cached --quiet; then
    echo "[$STAMP] no archive change, skip commit/push" >> "$LOG"
    return 0
  fi
  git commit -m "archive: 本机 cron 归档更新 $(date '+%Y-%m-%d %H:%M')" >> "$LOG" 2>&1
  git push origin main >> "$LOG" 2>&1
  echo "[$STAMP] pushed $(git rev-parse --short HEAD)" >> "$LOG"
}

# 两个班次都得跑: 白班(auto) 在日20:31, 夜班(auto) 在次日08:00
# cron 每次只调这个 wrapper 一次, 传 auto 即可(脚本自动归档所有完整班次)
run_archive "auto" && commit_push