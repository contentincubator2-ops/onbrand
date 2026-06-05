#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LINE Rich Menu Generator -- Breaking Frame Effect
Style: notionists (DiceBear), character breaks out above circle top
Output: 2500x843 JPEG
"""

import sys
import io
import os

# Fix Windows console encoding
if sys.platform == "win32":
    import ctypes
    try:
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    except Exception:
        pass
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

import requests
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# ── 尺寸規格 ──────────────────────────────────────────────────
MENU_W, MENU_H = 2500, 843
COLS = 4
BTN_W = MENU_W // COLS   # 625
BTN_H = MENU_H

# ── 圓圈參數 ──────────────────────────────────────────────────
CIRCLE_R      = 185    # 圓半徑 px
CIRCLE_CX     = BTN_W  // 2        # 水平置中
CIRCLE_CY     = 560    # 圓心 Y（按鈕內）
BORDER_W      = 10     # 白色邊框厚度
SHADOW_BLUR   = 14     # 圓圈陰影模糊半徑

# ── 角色破框比例 ─────────────────────────────────────────────
# 角色身高（相對圓直徑的倍數）
CHAR_H_FACTOR = 2.3    # 角色身高 = 2.3 × 直徑
# 圓頂以上的角色比例（頭+肩膀突出量）
BREAK_RATIO   = 0.50   # 50% 在圓圈上方

# ── 字型 ─────────────────────────────────────────────────────
FONT_SIZE = 52
FONT_PATHS = [
    "C:/Windows/Fonts/msjh.ttc",           # 微軟正黑體
    "C:/Windows/Fonts/msjhbd.ttc",
    "C:/Windows/Fonts/msgothic.ttc",
    "/System/Library/Fonts/PingFang.ttc",   # macOS fallback
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
]

# ── 角色設定 ─────────────────────────────────────────────────
CHARS = [
    {"name": "戰情主任", "seed": "strategist-kai",   "bg": (26,  35,  126)},
    {"name": "文宣主任", "seed": "media-chief-aoc",  "bg": (136, 14,  79)},
    {"name": "攻擊手",   "seed": "attack-sara-w",    "bg": (183, 28,  28)},
    {"name": "行程主任", "seed": "schedule-alyssa",  "bg": (0,   77,  64)},
]

OUTPUT = os.path.join(os.path.dirname(__file__), "richmenu_final.jpg")


# ── 工具函式 ─────────────────────────────────────────────────

def load_font(size: int) -> ImageFont.ImageFont:
    for path in FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()


def fetch_avatar(seed: str, px: int = 600) -> Image.Image:
    url = (
        f"https://api.dicebear.com/9.x/notionists/png"
        f"?seed={seed}&backgroundColor=transparent&size={px}"
    )
    print(f"  ↓ {url}")
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return Image.open(io.BytesIO(r.content)).convert("RGBA")


def crop_alpha(img: Image.Image, margin: int = 4) -> Image.Image:
    """Remove transparent padding, add small margin."""
    bb = img.getbbox()
    if not bb:
        return img
    l, t, r, b = bb
    l = max(0, l - margin)
    t = max(0, t - margin)
    r = min(img.width,  r + margin)
    b = min(img.height, b + margin)
    return img.crop((l, t, r, b))


def make_circle_mask(r: int) -> Image.Image:
    """Smooth anti-aliased circle mask (greyscale)."""
    size = r * 2
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    return mask


def draw_button(char: dict, avatar: Image.Image) -> Image.Image:
    """Render one button (BTN_W × BTN_H) with breaking-frame character."""
    bg = char["bg"]
    btn = Image.new("RGBA", (BTN_W, BTN_H), (*bg, 255))
    draw = ImageDraw.Draw(btn)

    cx, cy, r = CIRCLE_CX, CIRCLE_CY, CIRCLE_R

    # ── 圓圈陰影（在白框下方畫半透明橢圓）───────────────────
    shadow_layer = Image.new("RGBA", (BTN_W, BTN_H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    so = BORDER_W + 8   # shadow offset
    sd.ellipse(
        [cx - r - BORDER_W + so, cy - r - BORDER_W + so,
         cx + r + BORDER_W + so, cy + r + BORDER_W + so],
        fill=(0, 0, 0, 60)
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(SHADOW_BLUR))
    btn = Image.alpha_composite(btn, shadow_layer)
    draw = ImageDraw.Draw(btn)

    # ── 白色外框圓 ───────────────────────────────────────────
    draw.ellipse(
        [cx - r - BORDER_W, cy - r - BORDER_W,
         cx + r + BORDER_W, cy + r + BORDER_W],
        fill=(255, 255, 255, 255)
    )
    # 內圓（背景色）
    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        fill=(*bg, 255)
    )

    # ── 角色縮放與定位 ───────────────────────────────────────
    char_h = int(CIRCLE_R * 2 * CHAR_H_FACTOR)
    aspect = avatar.width / avatar.height
    char_w = int(char_h * aspect)
    scaled = avatar.resize((char_w, char_h), Image.LANCZOS)

    circle_top = cy - r - BORDER_W          # 白框最頂點
    char_top   = circle_top - int(char_h * BREAK_RATIO)
    char_left  = cx - char_w // 2

    # 先貼在暫存層，確保 alpha 正確
    overlay = Image.new("RGBA", (BTN_W, BTN_H), (0, 0, 0, 0))
    overlay.paste(scaled, (char_left, char_top), scaled)
    btn = Image.alpha_composite(btn, overlay)
    draw = ImageDraw.Draw(btn)

    # ── 遮蓋圓圈以下的腿（用背景色半矩形）──────────────────
    # 重新畫下半圓弧，讓圓圈完整；再用矩形蓋掉圓圈下方角色部分
    # 步驟1：半透明矩形蓋掉圓圈底部到按鈕底部（隱藏腿部）
    # 我們只蓋「角色在圓圈外下方」的部分
    leg_mask = Image.new("RGBA", (BTN_W, BTN_H), (0, 0, 0, 0))
    lm_draw = ImageDraw.Draw(leg_mask)
    # 蓋掉圓心以下的矩形區域
    lm_draw.rectangle(
        [cx - r - BORDER_W - 2, cy,
         cx + r + BORDER_W + 2, BTN_H],
        fill=(*bg, 255)
    )
    # 但保留圓圈下半弧（把下半圓重畫出來）
    lm_draw.ellipse(
        [cx - r - BORDER_W, cy - r - BORDER_W,
         cx + r + BORDER_W, cy + r + BORDER_W],
        fill=(255, 255, 255, 255)
    )
    lm_draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        fill=(*bg, 255)
    )
    btn = Image.alpha_composite(btn, leg_mask)
    draw = ImageDraw.Draw(btn)

    # ── 文字 ─────────────────────────────────────────────────
    font = load_font(FONT_SIZE)
    text = char["name"]
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = cx - tw // 2
    ty = cy + r + BORDER_W + 28

    # 文字陰影
    draw.text((tx + 2, ty + 2), text, font=font, fill=(0, 0, 0, 120))
    # 文字本體
    draw.text((tx, ty), text, font=font, fill=(255, 255, 255, 255))

    return btn.convert("RGB")


def main():
    print("=== LINE Rich Menu Generator ===")
    menu = Image.new("RGB", (MENU_W, MENU_H), (255, 255, 255))

    for i, char in enumerate(CHARS):
        print(f"\n[{i+1}/{len(CHARS)}] {char['name']}")
        avatar = fetch_avatar(char["seed"])
        avatar = crop_alpha(avatar)
        btn = draw_button(char, avatar)
        menu.paste(btn, (i * BTN_W, 0))
        print(f"  OK button {i+1} done")

    # add separator lines
    draw = ImageDraw.Draw(menu)
    for i in range(1, COLS):
        x = i * BTN_W
        draw.line([(x, 0), (x, MENU_H)], fill=(255, 255, 255), width=3)

    menu.save(OUTPUT, "JPEG", quality=95)
    print(f"\n✅ Saved → {OUTPUT}")
    print(f"   Size: {menu.width} × {menu.height}")
    return OUTPUT


if __name__ == "__main__":
    main()
