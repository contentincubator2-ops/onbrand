#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
媽爹講故事 LINE OA 六格 rich menu —— 綁定可點區域、註冊、設為預設。

2026-09-18。圖由 CJ 自己設計（AI文宣助理，六格 + 標題帶 + logo），
這支腳本負責圖以外的另一半：**把六個可點區域和動作綁上去**。

在 LINE 官方帳號後台上傳圖片，那六格是不會有任何動作的 —— 區域座標與動作
只能透過 Messaging API 設定。這就是這支腳本存在的理由。

## 動作型別：message，不是 postback

照 hermes-candidate-linebot-starter 的架構慣例：

    "The Rich Menu is a start surface, not a side-effect button bank.
     Use `message` actions for initial visible flows unless postback
     handling has been fully tested."

按下去送出一則固定文字（「FB文案」），伺服器收到後回一句引導 —— 引導式流程
在 server/_core/lineFlows.ts。message 動作的好處是完全可觀察：她送了什麼、
我們收到什麼，在對話紀錄裡一目了然，出問題時查得動。

## 座標怎麼來的

圖的上方約 28.5% 是標題帶（AI文宣助理 + logo），六格在下方排成 2 列 × 3 欄。
所以區域**不是**整張圖的 2×3 均分。標題帶本身不綁動作 —— 點到那裡沒反應，
這是對的，它不是按鈕。

TITLE_BAND 可以用 --title-band 微調，不必改程式。

用法：
  python scripts/line/richmenu.py --image menu.png --dry-run   # 只檢查，不呼叫 API
  python scripts/line/richmenu.py --image menu.png             # 註冊 + 設為預設
"""

import argparse
import io
import json
import os
import sys
import urllib.error
import urllib.request

from PIL import Image

# LINE 只接受這幾個尺寸，其中六格版面只有 2500×1686 放得下。
MENU_W, MENU_H = 2500, 1686
COLS, ROWS = 3, 2

# 標題帶占整張圖高度的比例（AI文宣助理 + logo 那一條）。
TITLE_BAND = 0.285

# 順序 = 圖上的閱讀順序：上排左→右，下排左→右。
# 文字必須與圖上、以及 lineFlows.ts 的 trigger / PENDING_TRIGGERS 逐字相同 ——
# message 動作送出的就是這幾個字，對不上就等於按鈕沒反應。
CELL_LABELS = [
    "蹭熱點", "FB文案", "IG文案",
    "活動宣傳", "LINE推播", "故事推廣",
]


def load_and_fit(path: str) -> bytes:
    """
    把設計稿變成 LINE 收得下的圖：2500×1686、JPEG、1MB 以內。

    比例不同時用「填滿後置中裁切」而不是直接拉伸 —— 拉伸會讓字變形，
    而且六格的邊界會跟這裡算出來的座標對不上。裁切只會切掉最外圈的留白。
    """
    img = Image.open(path).convert("RGB")
    src_ratio = img.width / img.height
    dst_ratio = MENU_W / MENU_H
    if abs(src_ratio - dst_ratio) > 0.001:
        print(f"  原圖 {img.width}×{img.height}（比例 {src_ratio:.3f}），"
              f"目標 {MENU_W}×{MENU_H}（{dst_ratio:.3f}）→ 置中裁切")
        if src_ratio > dst_ratio:          # 太寬 → 裁左右
            new_w = int(img.height * dst_ratio)
            left = (img.width - new_w) // 2
            img = img.crop((left, 0, left + new_w, img.height))
        else:                              # 太高 → 裁上下
            new_h = int(img.width / dst_ratio)
            top = (img.height - new_h) // 2
            img = img.crop((0, top, img.width, top + new_h))
    img = img.resize((MENU_W, MENU_H), Image.LANCZOS)

    for q in (92, 86, 80, 72, 64):
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=q, optimize=True)
        data = buf.getvalue()
        if len(data) <= 1_000_000:
            print(f"  JPEG quality={q}, {len(data)/1024:.0f} KB")
            return data
    raise SystemExit("壓不到 1MB 以下 —— 請把圖的細節簡化一點。")


def areas(title_band: float) -> list:
    """六格的可點區域。標題帶不綁動作。"""
    top = int(MENU_H * title_band)
    grid_h = MENU_H - top
    cell_h = grid_h // ROWS
    cell_w = MENU_W // COLS
    out = []
    for i, label in enumerate(CELL_LABELS):
        col, row = i % COLS, i // COLS
        x = col * cell_w
        y = top + row * cell_h
        w = (MENU_W - x) if col == COLS - 1 else cell_w
        h = (MENU_H - y) if row == ROWS - 1 else cell_h
        out.append({
            "bounds": {"x": x, "y": y, "width": w, "height": h},
            # message 動作：按下去送出這幾個字，伺服器回一句引導。
            "action": {"type": "message", "label": label[:20], "text": label},
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
    ap.add_argument("--image", required=True, help="設計稿（png / jpg 皆可）")
    ap.add_argument("--title-band", type=float, default=TITLE_BAND,
                    help=f"標題帶占的高度比例，預設 {TITLE_BAND}")
    ap.add_argument("--dry-run", action="store_true", help="只檢查圖與座標，不呼叫 API")
    args = ap.parse_args()

    print("1. 處理圖片")
    data = load_and_fit(args.image)

    spec = areas(args.title_band)
    print("2. 可點區域")
    for a, label in zip(spec, CELL_LABELS):
        b = a["bounds"]
        print(f"   {label:6} x={b['x']:5} y={b['y']:5} {b['width']}×{b['height']}")

    if args.dry_run:
        print("\n--dry-run：未呼叫 API。")
        return

    print("3. 建立 rich menu")
    body = {
        "size": {"width": MENU_W, "height": MENU_H},
        # 預設收合：她要讀的是一整篇長文案，選單開著會吃掉半個螢幕。
        "selected": False,
        "name": "momdad-ai-assistant-6",
        "chatBarText": "選功能",
        "areas": spec,
    }
    created = api("/v2/bot/richmenu",
                  json.dumps(body, ensure_ascii=False).encode("utf-8"),
                  "application/json")
    rid = created.get("richMenuId")
    if not rid:
        raise SystemExit(f"沒拿到 richMenuId：{created}")
    print(f"   → {rid}")

    print("4. 上傳圖片")
    # 圖片走 api-data.line.me，不是 api.line.me —— 打錯 host 會回 404。
    api(f"/v2/bot/richmenu/{rid}/content", data, "image/jpeg",
        host="https://api-data.line.me")
    print("   → ok")

    print("5. 設為所有使用者的預設選單")
    api(f"/v2/bot/user/all/richmenu/{rid}", b"", "application/json")
    print("   → ok")

    print(f"\n✓ 完成。richMenuId={rid}")
    print("  照 hermes 的 launch gate：現在要用真帳號逐一點過六格才算數。")


if __name__ == "__main__":
    sys.exit(main())
