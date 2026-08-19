#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CLIENT_SRC="skills/ai-talent/client/src"

if [[ ! -d "$CLIENT_SRC" ]]; then
  echo "錯誤：找不到 client 原始碼目錄：${CLIENT_SRC}（邊界檢查無法執行）"
  exit 1
fi

# 已知限制：檢查以單行為單位；若 import/export/require 的模組字串另起一行，
# 可能無法偵測。單行的 import type 與 export type 會被排除。
violations=$(grep -rn --include="*.ts" --include="*.tsx" -E \
  -e "^[[:space:]]*(import|export)[[:space:]]+.*[[:space:]]from[[:space:]]*['\"][^'\"]*/server/" \
  -e "^[[:space:]]*import[[:space:]]*['\"][^'\"]*/server/" \
  -e "(^|[^[:alnum:]_$])import[[:space:]]*\\([[:space:]]*['\"][^'\"]*/server/" \
  -e "(^|[^[:alnum:]_$])require[[:space:]]*\\([[:space:]]*['\"][^'\"]*/server/" \
  "$CLIENT_SRC" \
  | grep -vE "^[^:]+:[0-9]+:[[:space:]]*(import|export)[[:space:]]+type([[:space:]]|[{*])" || true)

if [[ -n "$violations" ]]; then
  echo "錯誤：偵測到 client 對 server 的 value import/export/require；僅允許 import type 或 export type 型別引用。"
  echo "違規清單："
  echo "$violations"
  exit 1
fi

echo "通過：client/server 邊界檢查未發現違規。"
exit 0
