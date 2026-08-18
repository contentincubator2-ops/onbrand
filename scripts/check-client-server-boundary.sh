#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CLIENT_SRC="skills/ai-talent/client/src"

if [[ ! -d "$CLIENT_SRC" ]]; then
  echo "錯誤：找不到 client 原始碼目錄：${CLIENT_SRC}（邊界檢查無法執行）"
  exit 1
fi

# 已知限制：跨多行的 `import type {\n ... \n} from ".../server/x"` 會誤報。
# 這是 fail-safe 的取捨：誤報會讓 CI 變紅並觸發檢查，不會靜默放行。
violations=$(grep -rn --include="*.ts" --include="*.tsx" -E "from ['\"][^'\"]*/server/" "$CLIENT_SRC" \
  | grep -vE "^[^:]+:[0-9]+:import type\b" || true)

if [[ -n "$violations" ]]; then
  echo "錯誤：偵測到 client 對 server 的 value import；僅允許以 import type 開頭的型別引用。"
  echo "違規清單："
  echo "$violations"
  exit 1
fi

echo "通過：client/server 邊界檢查未發現違規。"
exit 0
