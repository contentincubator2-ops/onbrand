# -*- coding: utf-8 -*-
"""
opview-xlsx-to-json — normalise an OpView (or similar) social-listening Excel
export into JSON our importer can load into `listening_mentions`.

Maps the standard OpView column set (關聯判定/命中標記/主文回文/發布時間/來源類型/
頻道頁面/作者/情緒/留言數/按讚觀看/標題/討論內容/原文連結/文章ID/討論串ID) to
{publishedAt, sourceType, source, sentiment, title, excerpt, url, ...}.

Usage:
  python scripts/opview-xlsx-to-json.py <input.xlsx> <output.json> [sheet_name]
  (default sheet: 精準品牌討論)
Requires: pip install openpyxl
"""
import openpyxl, json, datetime, sys

def stype(src_type, channel, url):
    h = f"{channel} {url}".lower()
    if "instagram" in h: return "fanpage"
    if "threads" in h: return "threads"
    if "facebook" in h or "fb.com" in h: return "fanpage"
    if "youtube" in h or "youtu.be" in h: return "youtube"
    if any(k in h for k in ("ptt.cc", "dcard", "mobile01", "mamibuy", "babyhome", "gamer.com.tw")): return "forum"
    st = (src_type or "").lower()
    if st == "forum": return "forum"
    if st == "news": return "news"
    if st == "blog" or "pixnet" in h or "blogspot" in h or "痞客邦" in h: return "blog"
    if st == "social": return "fanpage"
    return "web"

def sent(v):
    v = str(v or "")
    if "正" in v: return "positive"
    if "負" in v: return "negative"
    return "neutral"

def isodate(v):
    if isinstance(v, (datetime.datetime, datetime.date)): return v.strftime("%Y-%m-%d")
    s = str(v or "")
    return s[:10] if len(s) >= 10 else None

def main():
    if len(sys.argv) < 3:
        print("usage: opview-xlsx-to-json.py <input.xlsx> <output.json> [sheet]"); sys.exit(1)
    inp, outp = sys.argv[1], sys.argv[2]
    sheet = sys.argv[3] if len(sys.argv) > 3 else "精準品牌討論"
    wb = openpyxl.load_workbook(inp, read_only=True, data_only=True)
    if sheet not in wb.sheetnames:
        # fall back to the first sheet whose header row has 發布時間/情緒
        sheet = next((s for s in wb.sheetnames if "發布時間" in [str(c.value) for c in next(wb[s].iter_rows(max_row=1))]), wb.sheetnames[-1])
    ws = wb[sheet]
    out = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        if not r or (r[10] is None and r[11] is None): continue
        url = str(r[12] or "")
        out.append({
            "publishedAt": isodate(r[3]), "sourceType": stype(r[4], str(r[5] or ""), url),
            "source": str(r[5] or "")[:255], "sentiment": sent(r[7]),
            "title": str(r[10] or "")[:300], "excerpt": str(r[11] or "")[:1000], "url": url[:1000],
            "author": str(r[6] or ""), "hitTag": str(r[1] or ""), "postType": str(r[2] or ""),
        })
    with open(outp, "w", encoding="utf-8") as f:
        json.dump({"sheet": sheet, "rows": out}, f, ensure_ascii=False, indent=1)
    print(f"wrote {outp}: {len(out)} rows from sheet '{sheet}'")

if __name__ == "__main__":
    main()
