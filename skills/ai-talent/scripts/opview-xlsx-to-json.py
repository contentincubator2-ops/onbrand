# -*- coding: utf-8 -*-
"""
opview-xlsx-to-json — normalise an OpView (or similar) social-listening Excel
export into JSON our importer loads into `listening_mentions`.

Header-DRIVEN: maps columns by name, so it handles multiple OpView export layouts
(品牌討論 15-col with 原文連結, or 熱門RawData Top500 17-col with 文章識別碼 and
情緒標籤 P/N + 正/負比例). Output carries brandId + scope so each fixture
self-describes for the import loop.

Usage:
  python scripts/opview-xlsx-to-json.py <input.xlsx> <output.json> \
      [sheet] --brand=2956 --scope=listening.own_brand
Requires: pip install openpyxl
"""
import openpyxl, json, datetime, sys

def argflag(name, default=None):
    for a in sys.argv:
        if a.startswith(f"--{name}="): return a.split("=", 1)[1]
    return default

def stype(source, srctype, url):
    h = f"{source} {srctype} {url}".lower()
    if "instagram" in h: return "fanpage"
    if "threads" in h: return "threads"
    if "facebook" in h or "fb.com" in h or "粉絲團" in h or "粉絲頁" in h: return "fanpage"
    if "youtube" in h or "youtu.be" in h: return "youtube"
    if any(k in h for k in ("ptt", "dcard", "mobile01", "mamibuy", "babyhome", "gamer", "討論區", "論壇", "forum")): return "forum"
    if "pixnet" in h or "blogspot" in h or "痞客邦" in h or "部落格" in h or "blog" in h: return "blog"
    if "新聞" in h or "news" in h: return "news"
    if "social" in h or "社群" in h: return "fanpage"
    return "web"

def sent(label, pos, neg):
    l = str(label or "").strip().upper()
    if l in ("P", "POS", "POSITIVE") or "正" in str(label): return "positive"
    if l in ("N", "NEG", "NEGATIVE") or "負" in str(label): return "negative"
    if "中" in str(label) or l in ("O", "NEU", "NEUTRAL"): return "neutral"
    try:
        p, n = float(pos), float(neg)
        if p - n > 0.15: return "positive"
        if n - p > 0.15: return "negative"
    except (TypeError, ValueError): pass
    return "neutral"

def isodate(v):
    if isinstance(v, (datetime.datetime, datetime.date)): return v.strftime("%Y-%m-%d")
    s = str(v or "")
    return s[:10] if len(s) >= 10 else None

# column name → our field (first matching header wins)
COLS = {
    "date":   ["發布時間", "發布日期", "時間"],
    "title":  ["標題"],
    "excerpt":["本文（去識別 Raw Text）", "討論內容", "本文", "內容", "摘要"],
    "url":    ["原文連結", "連結", "網址"],
    "source": ["頻道／頁面", "頻道/頁面", "來源", "頻道"],
    "srctype":["來源類型", "來源型別（原始）", "來源型別"],
    "slabel": ["情緒", "情緒標籤（原始）", "情緒標籤"],
    "pos":    ["正向比例（原始）", "正向比例"],
    "neg":    ["負向比例（原始）", "負向比例"],
    "aid":    ["文章識別碼", "文章 ID", "文章ID"],
}

def build_index(header):
    hmap = {str(h).strip(): i for i, h in enumerate(header) if h is not None}
    idx = {}
    for field, names in COLS.items():
        idx[field] = next((hmap[n] for n in names if n in hmap), None)
    return idx

def main():
    inp, outp = sys.argv[1], sys.argv[2]
    sheet = sys.argv[3] if len(sys.argv) > 3 and not sys.argv[3].startswith("--") else None
    brand = argflag("brand"); scope = argflag("scope", "listening.own_brand")
    wb = openpyxl.load_workbook(inp, read_only=True, data_only=True)
    if not sheet:
        sheet = next((s for s in wb.sheetnames
                      if "發布時間" in [str(c.value) for c in next(wb[s].iter_rows(max_row=1))]
                      and "標題" in [str(c.value) for c in next(wb[s].iter_rows(max_row=1))]), wb.sheetnames[0])
    ws = wb[sheet]
    it = ws.iter_rows(values_only=True)
    header = next(it)
    ix = build_index(header)
    def cell(r, f):
        j = ix[f]
        return r[j] if (j is not None and j < len(r)) else None
    out = []
    for r in it:
        if not r: continue
        title, exc = cell(r, "title"), cell(r, "excerpt")
        if title is None and exc is None: continue
        d = isodate(cell(r, "date"))
        if not d: continue
        out.append({
            "publishedAt": d,
            "sourceType": stype(str(cell(r, "source") or ""), str(cell(r, "srctype") or ""), str(cell(r, "url") or "")),
            "source": str(cell(r, "source") or "")[:255],
            "sentiment": sent(cell(r, "slabel"), cell(r, "pos"), cell(r, "neg")),
            "title": str(title or "")[:300], "excerpt": str(exc or "")[:1000],
            "url": str(cell(r, "url") or "")[:1000],
            "articleId": str(cell(r, "aid") or ""),
        })
    payload = {"sheet": sheet, "scope": scope, "rows": out}
    if brand: payload["brandId"] = int(brand)
    with open(outp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(f"wrote {outp}: {len(out)} rows | sheet='{sheet}' brand={brand} scope={scope}")

if __name__ == "__main__":
    main()
