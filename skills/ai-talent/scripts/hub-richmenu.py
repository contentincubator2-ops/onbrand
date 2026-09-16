"""Sales Hub — LINE rich menu image (2500x1686, 3x2). Run once; output is committed.

Tiles follow lineBot.ts RICH_MENU_AREAS order:
  write · featured · lookup
  share · stats    · ask
"""
import math, os, sys
from PIL import Image, ImageDraw, ImageFont

W, H = 2500, 1686
COLS, ROWS = 3, 2
BG = (24, 24, 27)
TILE = (39, 39, 42)
LINE = (250, 250, 249)
MUTED = (168, 162, 158)
ACCENT = (141, 224, 85)   # LINE green, used once per tile as the icon stroke

FONTS = "C:/Windows/Fonts"
zh_font = ImageFont.truetype(f"{FONTS}/msjhbd.ttc", 120)
en_font = ImageFont.truetype(f"{FONTS}/segoeui.ttf", 62)

TILES = [
    ("write", "寫一篇", "Write a post"),
    ("featured", "本週主推", "This week's focus"),
    ("lookup", "產品快查", "Product lookup"),
    ("share", "發布回報", "Share & report"),
    ("stats", "我的成效", "My results"),
    ("ask", "問 AI 助理", "Ask AI"),
]

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)
cw, rh = W // COLS, H // ROWS
S = 10  # stroke

def icon(kind, cx, cy, r):
    if kind == "write":  # pencil
        d.line([(cx - r, cy + r), (cx + r * 0.7, cy - r * 0.7)], fill=ACCENT, width=S * 3)
        d.polygon([(cx - r - 10, cy + r + 10), (cx - r + 30, cy + r - 5), (cx - r + 5, cy + r - 30)], fill=ACCENT)
        d.line([(cx - r, cy + r + 40), (cx + r, cy + r + 40)], fill=LINE, width=S)
    elif kind == "featured":  # star
        pts = []
        for i in range(10):
            ang = -math.pi / 2 + i * math.pi / 5
            rad = r if i % 2 == 0 else r * 0.45
            pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
        d.polygon(pts, outline=ACCENT, width=S)
    elif kind == "lookup":  # magnifier
        d.ellipse([cx - r * 0.8, cy - r * 0.8, cx + r * 0.4, cy + r * 0.4], outline=ACCENT, width=S)
        d.line([(cx + r * 0.25, cy + r * 0.25), (cx + r, cy + r)], fill=ACCENT, width=S * 2)
    elif kind == "share":  # paper plane
        d.polygon([(cx - r, cy), (cx + r, cy - r * 0.8), (cx + r * 0.2, cy + r)], outline=ACCENT, width=S)
        d.line([(cx + r, cy - r * 0.8), (cx - r * 0.1, cy + r * 0.15)], fill=ACCENT, width=S)
    elif kind == "stats":  # bars
        bw = r * 0.4
        for i, hgt in enumerate([0.8, 1.4, 2.0]):
            x0 = cx - r + i * (bw + r * 0.3)
            d.rounded_rectangle([x0, cy + r - hgt * r, x0 + bw, cy + r], radius=12, fill=ACCENT)
        d.line([(cx - r - 20, cy + r + 20), (cx + r + 20, cy + r + 20)], fill=LINE, width=S)
    elif kind == "ask":  # chat bubble with sparkle
        d.rounded_rectangle([cx - r, cy - r * 0.8, cx + r, cy + r * 0.6], radius=50, outline=ACCENT, width=S)
        d.polygon([(cx - r * 0.5, cy + r * 0.55), (cx - r * 0.7, cy + r * 1.1), (cx - r * 0.1, cy + r * 0.55)], fill=ACCENT)
        for dx in (-0.45, 0, 0.45):
            d.ellipse([cx + dx * r - 16, cy - 16 - r * 0.1, cx + dx * r + 16, cy + 16 - r * 0.1], fill=LINE)

for i, (kind, zh, en) in enumerate(TILES):
    col, row = i % COLS, i // COLS
    x0, y0 = col * cw, row * rh
    pad = 14
    d.rounded_rectangle([x0 + pad, y0 + pad, x0 + cw - pad, y0 + rh - pad], radius=48, fill=TILE)
    cx = x0 + cw // 2
    icon(kind, cx, y0 + rh * 0.34, 105)
    tw = d.textlength(zh, font=zh_font)
    d.text((cx - tw / 2, y0 + rh * 0.56), zh, font=zh_font, fill=LINE)
    ew = d.textlength(en, font=en_font)
    d.text((cx - ew / 2, y0 + rh * 0.56 + 150), en, font=en_font, fill=MUTED)

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "server", "platform", "assets", "hub-richmenu.jpg")
img.save(out, "JPEG", quality=86, optimize=True)
print(out, os.path.getsize(out), "bytes")
