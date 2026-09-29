#!/usr/bin/env python3
"""成效層用的檔案抽取器（只用標準函式庫，VM 不必另裝套件）。

用法：
  extract.py table <file.xlsx>   → 第一個有資料的工作表轉成 CSV（stdout, UTF-8）
  extract.py text  <file>        → .pptx / .xlsx 的文字與表格，給「照你原本的報告」抽視角用

xlsx / pptx 本質上都是 zip 裡的 XML，所以用 zipfile + ElementTree 就讀得到；
日期格子在 xlsx 裡是序號數字，這裡原樣輸出，由 Node 端 parseDate 轉。
"""
import csv
import io
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {
    "s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def xlsx_sheets(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall("s:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["s"])))
    names = sorted(
        (n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n)),
        key=lambda n: int(re.search(r"(\d+)", n.rsplit("/", 1)[1]).group(1)),
    )
    for name in names:
        root = ET.fromstring(z.read(name))
        rows = []
        for row in root.iter("{%s}row" % NS["s"]):
            cells = {}
            for c in row.findall("s:c", NS):
                ref = c.get("r")
                t = c.get("t")
                v = c.find("s:v", NS)
                if t == "s" and v is not None:
                    val = shared[int(v.text)]
                elif t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["s"]))
                else:
                    val = v.text if v is not None else ""
                if ref:
                    cells[col_index(ref)] = val
            if cells:
                width = max(cells) + 1
                rows.append([cells.get(i, "") for i in range(width)])
        if rows:
            yield name, rows


def cmd_table(path):
    for _, rows in xlsx_sheets(path):
        out = io.StringIO()
        csv.writer(out).writerows(rows)
        sys.stdout.write(out.getvalue())
        return
    sys.stderr.write("no data sheet\n")
    sys.exit(2)


def pptx_text(path):
    z = zipfile.ZipFile(path)
    slides = sorted(
        (n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)),
        key=lambda n: int(re.search(r"(\d+)\.xml$", n).group(1)),
    )
    parts = []
    for i, name in enumerate(slides, 1):
        root = ET.fromstring(z.read(name))
        lines = []
        for tbl in root.iter("{%s}tbl" % NS["a"]):
            for tr in tbl.findall("a:tr", NS):
                cells = []
                for tc in tr.findall("a:tc", NS):
                    cells.append("".join(t.text or "" for t in tc.iter("{%s}t" % NS["a"])).strip())
                lines.append(" | ".join(cells))
        for para in root.iter("{%s}p" % NS["a"]):
            txt = "".join(t.text or "" for t in para.iter("{%s}t" % NS["a"])).strip()
            if txt:
                lines.append(txt)
        # 圖表：抓系列名稱與類別，報告的「視角」常常只寫在圖表裡
        chart_rels = "ppt/slides/_rels/slide%d.xml.rels" % int(re.search(r"(\d+)\.xml$", name).group(1))
        if chart_rels in z.namelist():
            rels = ET.fromstring(z.read(chart_rels))
            for rel in rels:
                target = rel.get("Target", "")
                if "charts/chart" in target:
                    cpath = "ppt/" + target.replace("../", "")
                    if cpath in z.namelist():
                        croot = ET.fromstring(z.read(cpath))
                        vals = [v.text for v in croot.iter("{http://schemas.openxmlformats.org/drawingml/2006/chart}v") if v.text and not re.match(r"^-?[\d.]+$", v.text)]
                        if vals:
                            lines.append("[圖表] " + "、".join(dict.fromkeys(vals))[:400])
        if lines:
            parts.append("── 第 %d 頁 ──\n%s" % (i, "\n".join(dict.fromkeys(lines))))
    return "\n\n".join(parts)


def cmd_text(path):
    low = path.lower()
    if low.endswith(".pptx"):
        sys.stdout.write(pptx_text(path))
    elif low.endswith(".xlsx"):
        chunks = []
        for name, rows in xlsx_sheets(path):
            chunks.append("── %s ──\n%s" % (name.rsplit("/", 1)[1], "\n".join(" | ".join(r) for r in rows[:60])))
        sys.stdout.write("\n\n".join(chunks))
    else:
        sys.stderr.write("unsupported\n")
        sys.exit(2)


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("table", "text"):
        sys.stderr.write(__doc__)
        sys.exit(1)
    (cmd_table if sys.argv[1] == "table" else cmd_text)(sys.argv[2])
