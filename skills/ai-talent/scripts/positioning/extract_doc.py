# -*- coding: utf-8 -*-
"""
定位文件抽取器 — 把用戶自己格式的定位文件變成「他自己的段落結構」。

刻意不做的事：不把內容塞進我們的 10 個 segment。這一步只負責如實讀出文件
本來的樣子（標題階層 + 每段內文），對映到 canonical 欄位是下一步（LLM，在
positioningDocRouter），而且要讓用戶確認。順序反過來的話，用戶上傳完看到
的就是我們的表格而不是他的文件 —— 那就違背了「按照用戶有的內容呈現」。

輸入：一個或多個檔案路徑
輸出：JSON { docs: [ { name, kind, chars, sections: [...], text } ], errors: [...] }

相依：只有 lxml（parse_template.py 已經在用），其餘都是 stdlib。.docx/.pptx
都是 zip，直接讀 XML 就好，不必為了單一功能引進 python-docx / python-pptx。
PDF 沒有純 stdlib 的解法，改試系統的 pdftotext；沒有就誠實報錯，叫用戶轉檔
或直接貼上 —— 靜靜回一份空的結構比壞掉更糟。
"""
from __future__ import annotations
import json, os, re, subprocess, sys, zipfile
from lxml import etree

sys.stdout.reconfigure(encoding="utf-8")

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"

MAX_CHARS = 120_000          # 一份文件抽出的上限；再長的定位文件是別的東西
MAX_SECTIONS = 400

# Word 的標題樣式在中文版 Office 叫「標題 1」，英文版叫 Heading1，
# 匯出自 Google Docs 的又是 Heading1 但帶語系後綴。全部認。
HEADING_STYLE = re.compile(r"^(heading|標題|标题|title)\s*([1-9])?", re.I)


def _clean(s: str) -> str:
    return re.sub(r"[ \t　]+", " ", (s or "")).strip()


# ───────────────────────────────────────────────────────────────── docx ──
def _docx_paragraphs(path: str):
    """yield (text, heading_level) — heading_level 0 代表內文。"""
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml")
    root = etree.fromstring(xml)
    for p in root.iter(f"{W}p"):
        text = _clean("".join(t.text or "" for t in p.iter(f"{W}t")))
        if not text:
            continue
        level = 0
        style = p.find(f"{W}pPr/{W}pStyle")
        if style is not None:
            m = HEADING_STYLE.match(style.get(f"{W}val") or "")
            if m:
                level = int(m.group(2)) if m.group(2) else 1
        if not level:
            # outlineLvl 是樣式沒帶到時的後備（自訂樣式命名時常見）
            outline = p.find(f"{W}pPr/{W}outlineLvl")
            if outline is not None:
                try:
                    level = int(outline.get(f"{W}val") or "9") + 1
                except ValueError:
                    level = 0
                if level > 6:
                    level = 0
        yield text, level


# ───────────────────────────────────────────────────────────────── pptx ──
def _pptx_slides(path: str):
    """yield (slide_title, [body lines]) — 每張投影片當成一節。"""
    with zipfile.ZipFile(path) as z:
        names = sorted(
            (n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)),
            key=lambda n: int(re.search(r"(\d+)", n).group(1)),
        )
        for n in names:
            root = etree.fromstring(z.read(n))
            lines = []
            for p in root.iter(f"{A}p"):
                line = _clean("".join(t.text or "" for t in p.iter(f"{A}t")))
                if line:
                    lines.append(line)
            if not lines:
                continue
            yield lines[0], lines[1:]


# ──────────────────────────────────────────────────────────────── xlsx ──
def _xlsx_sheets(path: str):
    """yield (sheet_name, [row lines]) — 每個工作表一節，列內以 | 分欄。"""
    NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in etree.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{NS}si"):
                shared.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
        wb = etree.fromstring(z.read("xl/workbook.xml"))
        rels = {
            r.get("Id"): r.get("Target")
            for r in etree.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        }
        for sh in wb.iter(f"{NS}sheet"):
            target = rels.get(sh.get(f"{RNS}id"), "")
            member = target.lstrip("/") if target.startswith("/") else "xl/" + target
            if member not in z.namelist():
                continue
            lines = []
            for row in etree.fromstring(z.read(member)).iter(f"{NS}row"):
                cells = []
                for c in row.iter(f"{NS}c"):
                    v = c.find(f"{NS}v")
                    if c.get("t") == "s" and v is not None and v.text is not None:
                        val = shared[int(v.text)] if int(v.text) < len(shared) else ""
                    elif c.get("t") == "inlineStr":
                        val = "".join(t.text or "" for t in c.iter(f"{NS}t"))
                    else:
                        val = v.text if v is not None and v.text else ""
                    cells.append(_clean(val))
                if any(cells):
                    lines.append(" | ".join(cells).rstrip(" |"))
            if lines:
                yield sh.get("name") or "工作表", lines


# ─────────────────────────────────────────────────────────── md / txt ──
MD_HEADING = re.compile(r"^(#{1,6})\s+(.*\S)\s*$")
# 純文字沒有樣式資訊，只能靠形狀猜：短、獨立成行、不以句讀收尾。
# 寧可少認幾個標題（內容會併進上一節，還是讀得到）也不要把內文切碎。
TXT_HEADING = re.compile(r"^\s{0,3}(?:[\d一二三四五六七八九十]+[.、)]\s*)?(\S.{0,38})\s*$")
SENTENCE_END = tuple("。！？，、；：.!?,;:")


def _md_sections(text: str):
    cur = {"level": 1, "heading": "", "body": []}
    out = [cur]
    for raw in text.splitlines():
        m = MD_HEADING.match(raw)
        if m:
            cur = {"level": len(m.group(1)), "heading": _clean(m.group(2)), "body": []}
            out.append(cur)
        else:
            line = raw.rstrip()
            if line.strip():
                cur["body"].append(line)
    return out


def _txt_sections(text: str):
    lines = [l.rstrip() for l in text.splitlines()]
    cur = {"level": 1, "heading": "", "body": []}
    out = [cur]
    for i, line in enumerate(lines):
        if not line.strip():
            continue
        nxt = next((l for l in lines[i + 1:] if l.strip()), "")
        looks_heading = (
            TXT_HEADING.match(line)
            and not line.rstrip().endswith(SENTENCE_END)
            and len(nxt) > len(line)
        )
        if looks_heading:
            cur = {"level": 1, "heading": _clean(line), "body": []}
            out.append(cur)
        else:
            cur["body"].append(line)
    return out


# ────────────────────────────────────────────────────────────────── pdf ──
def _pdf_text(path: str) -> str:
    try:
        r = subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", path, "-"],
            capture_output=True, timeout=120,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "這台機器沒有 pdftotext，PDF 讀不了。請改上傳 .docx / .md / .txt，"
            "或直接把文字貼上。"
        )
    if r.returncode != 0:
        raise RuntimeError(f"pdftotext 失敗：{(r.stderr or b'').decode('utf-8', 'replace')[:300]}")
    return r.stdout.decode("utf-8", "replace")


# ──────────────────────────────────────────────────────────── assemble ──
def _sections_from_paragraphs(paras) -> list:
    """(text, level) 串流 → 巢狀不管，只保留線性的節。"""
    cur = {"level": 1, "heading": "", "body": []}
    out = [cur]
    for text, level in paras:
        if level:
            cur = {"level": level, "heading": text, "body": []}
            out.append(cur)
        else:
            cur["body"].append(text)
    return out


def _finish(sections: list) -> list:
    """丟掉空節、合併 body、套上限。"""
    done = []
    for s in sections:
        body = "\n".join(s["body"]).strip()
        if not s["heading"] and not body:
            continue
        done.append({
            "level": max(1, min(6, int(s["level"]))),
            "heading": s["heading"][:200],
            "body": body[:20_000],
        })
        if len(done) >= MAX_SECTIONS:
            break
    return done


def extract(path: str) -> dict:
    name = os.path.basename(path)
    ext = os.path.splitext(name)[1].lower()

    if ext == ".docx":
        sections = _finish(_sections_from_paragraphs(_docx_paragraphs(path)))
        kind = "docx"
    elif ext == ".pptx":
        raw = []
        for title, body in _pptx_slides(path):
            raw.append({"level": 1, "heading": title, "body": body})
        sections = _finish(raw)
        kind = "pptx"
    elif ext == ".xlsx":
        sections = _finish([
            {"level": 1, "heading": name_, "body": lines} for name_, lines in _xlsx_sheets(path)
        ])
        kind = "xlsx"
    elif ext in (".md", ".markdown"):
        sections = _finish(_md_sections(open(path, encoding="utf-8", errors="replace").read()))
        kind = "markdown"
    elif ext in (".htm", ".html"):
        from lxml import html as lxml_html
        # 沒宣告 charset 的 HTML，lxml 會當 latin-1 → 中文變亂碼。先自己解碼：
        # UTF-8 優先，其次台灣常見的 Big5，最後才放寬。
        raw_bytes = open(path, "rb").read()
        for enc in ("utf-8-sig", "big5", "gb18030"):
            try:
                html_text = raw_bytes.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            html_text = raw_bytes.decode("utf-8", "replace")
        html_text = re.sub(r"^\s*<\?xml[^>]*\?>", "", html_text)  # lxml 不收帶 encoding 宣告的 str
        doc = lxml_html.fromstring(html_text)
        raw, cur = [], {"level": 1, "heading": "", "body": []}
        raw.append(cur)
        for el in doc.iter():
            tag = str(el.tag).lower()
            txt = _clean(el.text_content() if hasattr(el, "text_content") else "")
            if re.fullmatch(r"h[1-6]", tag) and txt:
                cur = {"level": int(tag[1]), "heading": txt, "body": []}
                raw.append(cur)
            elif tag in ("p", "li") and txt:
                cur["body"].append(txt)
        sections = _finish(raw)
        kind = "html"
    elif ext == ".pdf":
        sections = _finish(_txt_sections(_pdf_text(path)))
        kind = "pdf"
    elif ext in (".txt", ".text", ""):
        sections = _finish(_txt_sections(open(path, encoding="utf-8", errors="replace").read()))
        kind = "text"
    else:
        raise RuntimeError(f"不支援的檔案格式 {ext or '(無副檔名)'} — 可用 .docx / .pptx / .xlsx / .pdf / .md / .txt")

    text = "\n\n".join(
        (f"## {s['heading']}\n{s['body']}" if s["heading"] else s["body"]).strip()
        for s in sections
    ).strip()[:MAX_CHARS]

    if not text:
        raise RuntimeError("檔案讀得到但一個字都沒有 — 可能是掃描的圖片檔或空白文件")

    return {"name": name, "kind": kind, "chars": len(text), "sections": sections, "text": text}


def main() -> int:
    docs, errors = [], []
    for path in sys.argv[1:]:
        try:
            docs.append(extract(path))
        except Exception as exc:                       # noqa: BLE001 — 逐檔回報，不整批爆
            errors.append({"name": os.path.basename(path), "error": str(exc)[:500]})
    json.dump({"docs": docs, "errors": errors}, sys.stdout, ensure_ascii=False)
    return 0 if docs or not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
