#!/usr/bin/env bash
# PDTIII 生产日归档本机兜底 wrapper (2026-09-09)
# 用途: 数据驱动归档 + 一旦有新数据自动 commit+push 上线。
# 幂等: 无新内容时 git commit/push 会优雅退出(exit 0)。
# 依赖: 本机 python3 + git remote 凭据(已内嵌在 origin URL)。
#
# ★ 2026-10-02 修复(与云端 archive.yml 行为对齐, 避免本机/云端撞车):
#   1. git add 由 `-A`(全仓, 会误收代码改动) 改为 `history/`(仅归档产物);
#   2. push 前先 `git pull --rebase origin main`(云端提交持续前移, 之前从不 pull 必被拒);
#   3. push 成功才记 "pushed <sha>", 失败如实上报并返回非零(之前无条件误报成功);
#   4. rebase/推送失败时给出明确错误定位, 不再被 `&&` 静默吞掉。
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
  cd "$ROOT" || { echo "[$STAMP] FAIL cd $ROOT" >> "$LOG"; return 1; }
  # 只收归档产物, 绝不把 index.html 等代码改动/无关文件一起提交(对齐云端 add history/)
  git add history/
  if git diff --cached --quiet; then
    echo "[$STAMP] no archive change, skip commit/push" >> "$LOG"
    return 0
  fi
  if ! git commit -m "archive: 本机 cron 归档更新 $(date '+%Y-%m-%d %H:%M')" >> "$LOG" 2>&1; then
    echo "[$STAMP] COMMIT FAILED" >> "$LOG"
    return 1
  fi
  # 云端 GH Actions 也在写同一 main, 先 rebase 到最新远端再推, 否则必被拒(non-fast-forward)
  if ! git pull --rebase origin main >> "$LOG" 2>&1; then
    echo "[$STAMP] PULL--REBASE FAILED (远端有更多提交或冲突), 未推送, 待下轮自愈" >> "$LOG"
    git rebase --abort >/dev/null 2>&1
    return 1
  fi
  if git push origin main >> "$LOG" 2>&1; then
    echo "[$STAMP] pushed $(git rev-parse --short HEAD)" >> "$LOG"
  else
    echo "[$STAMP] PUSH FAILED (见上方错误), 归档已生成本地但未上线" >> "$LOG"
    return 1
  fi
}

# 两个班次都得跑: 白班(auto) 在日20:31, 夜班(auto) 在次日08:00
# cron 每次只调这个 wrapper 一次, 传 auto 即可(脚本自动归档所有完整班次)
run_archive "auto" && commit_push