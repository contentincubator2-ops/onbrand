#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
媽爹講故事 LINE OA 的六格 rich menu —— 產圖 + 註冊 + 設為預設。

2026-09-18 (CJ「我還沒做 rich menu，我該如何設計六格的 rich menu?」).

為什麼不用 LINE 官方帳號管理後台做：
  後台那個拖拉編輯器只給「連結 / 優惠券 / 文字」三種動作，其中「文字」是按下去
  立刻送出。我們要的是 postback + inputOption:"openKeyboard" + fillInText ——
  按下去在輸入框「預填」前綴再跳鍵盤，讓使用者接著打主題，一則訊息同時帶著
  「要做什麼」與「要寫什麼」。伺服器因此完全不需要 per-user 狀態
  （見 server/routes/lineWebhookRoute.ts 的說明）。那個動作型別只有
  Messaging API 的 rich menu 有，所以這支腳本存在。

fillInText 必須與 lineWebhookRoute.ts 的 LINE_MENU 標籤「逐字相符」，
否則按鈕送出的前綴會解析不出任務。CELLS 是這件事的唯一來源，兩邊都照它。

用法（需要 LINE_CHANNEL_ACCESS_TOKEN）：
  python scripts/line/richmenu.py --out richmenu.jpg --dry-run   # 只產圖，不呼叫 API
  python scripts/line/richmenu.py                                 # 產圖 + 註冊 + 設預設
"""

import argparse
import io
import json
import os
import sys
import urllib.request

from PIL import Image, ImageDraw, ImageFont

# ── 版面 ──────────────────────────────────────────────────────────────────────
# 六格只能是 2 列 × 3 欄。另一個官方尺寸 2500×843 切六格每格只有 416px 寬，
# 放三四個中文字加一行說明會擠爆。
MENU_W, MENU_H = 2500, 1686
COLS, ROWS = 3, 2
CELL_W = MENU_W // COLS          # 833（最後一欄補到 834）
CELL_H = MENU_H // ROWS          # 843

# ── 配色 ──────────────────────────────────────────────────────────────────────
# 依 OnBrand 設計系統：色彩只承擔功能，不做裝飾。六格一律中性卡片，
# 只有序號標記用一個暖色 accent（讓使用者知道這六格是同一組工具）。
BG        = (250, 250, 249)   # 卡片底
PAGE      = (231, 229, 228)   # 格線／外緣
INK       = (28, 25, 23)      # 主要文字
MUTED     = (120, 113, 108)   # 說明文字
ACCENT    = (234, 88, 12)     # OnBrand 橘，只用在標記

FONT_PATHS = [
    "C:/Windows/Fonts/msjhbd.ttc",                              # 微軟正黑體 Bold
    "C:/Windows/Fonts/msjh.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",      # ubuntu runner
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/System/Library/Fonts/PingFang.ttc",                       # macOS
]


class Cell:
    def __init__(self, label: str, task_id: str, hint: str):
        self.label = label      # ＝ fillInText 前綴（不含冒號）
        self.task_id = task_id
        self.hint = hint


# 改這裡就等於改選單。動完要同步 lineWebhookRoute.ts 的 LINE_MENU，
# 兩邊的 label 必須逐字相同。
CELLS = [
    Cell("FB貼文",   "fb-30-caption-short",  "單篇臉書貼文"),
    Cell("IG貼文",   "ig-30-caption-short",  "單篇 IG 貼文"),
    Cell("IG輪播",   "ig-60-carousel-7",     "七張卡講完一個故事"),
    Cell("限時動態", "ig-30-story-text",     "限動文字 + 互動貼圖"),
    Cell("節慶文",   "fb-30-countdown-1day", "節慶 / 倒數應景文"),
    Cell("廣告文案", "fb-30-ad-primary",     "投放用的主文案"),
]


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for path in FONT_PATHS:
        if bold and "Bold" not in path and "bd" not in path:
            continue
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    for path in FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    # 沒有中文字型就會畫成一排豆腐方塊，與其交出一張壞圖不如直接停下來。
    raise SystemExit(
        "找不到中文字型。ubuntu runner 請先 apt-get install -y fonts-noto-cjk。"
    )


def centered(draw: ImageDraw.ImageDraw, text: str, font, cx: int, y: int, fill):
    l, t, r, b = draw.textbbox((0, 0), text, font=font)
    draw.text((cx - (r - l) / 2, y), text, font=font, fill=fill)
    return b - t


def build_image() -> Image.Image:
    img = Image.new("RGB", (MENU_W, MENU_H), PAGE)
    draw = ImageDraw.Draw(img)

    f_label = load_font(96, bold=True)
    f_hint = load_font(44)
    f_mark = load_font(40, bold=True)

    GAP = 6  # 格線寬度：用底色透出來當分隔，不畫線，版面比較乾淨
    for i, cell in enumerate(CELLS):
        col, row = i % COLS, i // COLS
        x0 = col * CELL_W + (GAP if col > 0 else 0)
        y0 = row * CELL_H + (GAP if row > 0 else 0)
        x1 = (col + 1) * CELL_W if col < COLS - 1 else MENU_W
        y1 = (row + 1) * CELL_H if row < ROWS - 1 else MENU_H
        draw.rectangle([x0, y0, x1, y1], fill=BG)

        cx = (x0 + x1) // 2

        # 左上角的小序號標記 —— 唯一用到 accent 的地方，功能是「這六格是一組」
        mx, my = x0 + 56, y0 + 56
        draw.ellipse([mx, my, mx + 56, my + 56], fill=ACCENT)
        l, t, r, b = draw.textbbox((0, 0), str(i + 1), font=f_mark)
        draw.text((mx + 28 - (r - l) / 2, my + 28 - (b - t) / 2 - t),
                  str(i + 1), font=f_mark, fill=(255, 255, 255))

        # 標籤 + 說明，垂直置中
        block_h = 96 + 28 + 44
        ty = y0 + (y1 - y0 - block_h) // 2
        centered(draw, cell.label, f_label, cx, ty, INK)
        centered(draw, cell.hint, f_hint, cx, ty + 96 + 28, MUTED)

    return img


def to_jpeg_bytes(img: Image.Image) -> bytes:
    """LINE 的上限是 1MB。從高品質往下降，第一個過關的就用。"""
    for q in (92, 86, 80, 72, 64):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=q, optimize=True)
        data = buf.getvalue()
        if len(data) <= 1_000_000:
            print(f"  JPEG quality={q}, {len(data)/1024:.0f} KB")
            return data
    raise SystemExit("壓不到 1MB 以下 —— 版面太複雜，請簡化。")


def areas() -> list:
    """六格的可點區域。座標是相對整張圖的像素，與 build_image 的切法一致。"""
    out = []
    for i, cell in enumerate(CELLS):
        col, row = i % COLS, i // COLS
        x = col * CELL_W
        y = row * CELL_H
        w = (MENU_W - x) if col == COLS - 1 else CELL_W
        h = (MENU_H - y) if row == ROWS - 1 else CELL_H
        out.append({
            "bounds": {"x": x, "y": y, "width": w, "height": h},
            "action": {
                "type": "postback",
                "data": f"task={cell.task_id}",
                # 這兩個欄位就是整個設計的樞紐：預填前綴 + 直接跳鍵盤。
                # 少了它們，使用者按下去只會送出一則沒有主題的空指令。
                "inputOption": "openKeyboard",
                "fillInText": f"{cell.label}：",
            },
        })
    return out


def api(path: str, payload: bytes, content_type: str, host: str = "https://api.line.me") -> dict:
    token = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    if not token:
        raise SystemExit("LINE_CHANNEL_ACCESS_TOKEN 未設定")
    req = urllib.request.Request(
        f"{host}{path}", data=payload, method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": content_type},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8") or "{}"
            return json.loads(body) if body.strip().startswith("{") else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"LINE API {path} {e.code}: {e.read().decode('utf-8')[:500]}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="richmenu.jpg", help="產出的圖檔路徑")
    ap.add_argument("--dry-run", action="store_true", help="只產圖，不呼叫 LINE API")
    args = ap.parse_args()

    print("1. 產圖")
    img = build_image()
    data = to_jpeg_bytes(img)
    with open(args.out, "wb") as f:
        f.write(data)
    print(f"   → {args.out}")

    if args.dry_run:
        print("\n--dry-run：未呼叫 API。區域設定：")
        print(json.dumps(areas(), ensure_ascii=False, indent=2))
        return

    print("2. 建立 rich menu")
    body = {
        "size": {"width": MENU_W, "height": MENU_H},
        # 預設收合：使用者要讀的是一整篇長文案，選單開著會吃掉半個螢幕。
        "selected": False,
        "name": f"momdad-6cell-{len(CELLS)}",
        "chatBarText": "選內容",
        "areas": areas(),
    }
    created = api("/v2/bot/richmenu",
                  json.dumps(body, ensure_ascii=False).encode("utf-8"),
                  "application/json")
    rid = created.get("richMenuId")
    if not rid:
        raise SystemExit(f"沒拿到 richMenuId：{created}")
    print(f"   → {rid}")

    print("3. 上傳圖片")
    # 圖片走 api-data.line.me，不是 api.line.me —— 打錯 host 會回 404。
    api(f"/v2/bot/richmenu/{rid}/content", data, "image/jpeg",
        host="https://api-data.line.me")
    print("   → ok")

    print("4. 設為所有使用者的預設選單")
    api(f"/v2/bot/user/all/richmenu/{rid}", b"", "application/json")
    print("   → ok")

    print(f"\n✓ 完成。richMenuId={rid}")
    print("  舊的選單不會自動刪除（LINE 允許多個並存，只是預設換成新的）。")
    print("  要清掉舊的：GET /v2/bot/richmenu/list 找出來，再 DELETE /v2/bot/richmenu/{id}")


if __name__ == "__main__":
    sys.exit(main())
