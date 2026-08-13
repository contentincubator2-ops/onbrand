# -*- coding: utf-8 -*-
"""
AI Reporting — template parser v1

Input : N months of the same report (.pptx)
Output: slot list (the 6 types) + a health report, as JSON.

Design: don't guess with heuristics — LEARN from the multi-deck upload.
Text that is identical in every month is a label. Text that changes is a slot.
The same diffing yields char budgets (min observed length) and cardinality
ranges (min/max observed) for free.

Reads slide XML straight from the zip: 8 decks × ~60MB, no media parsing.
"""
from __future__ import annotations
import os, sys, zipfile, json, hashlib, re, statistics
from collections import defaultdict, Counter
from dataclasses import dataclass, field, asdict
from lxml import etree

sys.stdout.reconfigure(encoding="utf-8")

P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
C = "{http://schemas.openxmlformats.org/drawingml/2006/chart}"
EMU_IN = 914400
CHART_KINDS = ["lineChart", "barChart", "pieChart", "doughnutChart", "areaChart"]
DATEISH = re.compile(r"^(20\d\d[.\-/]\d{1,2}|20\d\d)$")
VOLATILE = re.compile(r"[\d,.%+\-()：:／/。、 \u3000]")


# ─────────────────────────────────────────────────────────────── model ──
@dataclass
class ShapeModel:
    name: str
    kind: str                              # text | table | chart | picture | other
    geom: tuple                            # (l, t, w, h) in EMU
    runs: list = field(default_factory=list)      # [(para, group, text)]
    table: dict | None = None              # {rows, cols, cells}
    chart: dict | None = None              # {kind, series, categories}
    image_sha: str | None = None


@dataclass
class SlideModel:
    index: int
    layout: str
    sig: str
    shapes: list
    tokens: set = field(default_factory=set)
    struct: set = field(default_factory=set)


def _slide_paths(z):
    pres = etree.fromstring(z.read("ppt/presentation.xml"))
    rels = etree.fromstring(z.read("ppt/_rels/presentation.xml.rels"))
    rid2t = {r.get("Id"): r.get("Target") for r in rels}
    out = []
    for sid in pres.find(f"{P}sldIdLst"):
        t = rid2t[sid.get(f"{R}id")].replace("../", "").lstrip("/")
        out.append(t if t.startswith("ppt/") else "ppt/" + t)
    return out


def _rels(z, part):
    rp = part.rsplit("/", 1)[0] + "/_rels/" + part.rsplit("/", 1)[1] + ".rels"
    try:
        return {r.get("Id"): (r.get("Type"), r.get("Target"))
                for r in etree.fromstring(z.read(rp))}
    except KeyError:
        return {}


def _run_groups(txbody):
    """[F1] a paragraph split by <a:br/> is a sequence of run-groups."""
    out = []
    for pi, p in enumerate(txbody.findall(f"{A}p")):
        gi, buf = 0, []
        for ch in p:
            if ch.tag == f"{A}r":
                t = ch.find(f"{A}t")
                buf.append(t.text or "" if t is not None else "")
            elif ch.tag == f"{A}br":
                out.append((pi, gi, "".join(buf)))
                gi, buf = gi + 1, []
        out.append((pi, gi, "".join(buf)))
    return [(pi, gi, t) for pi, gi, t in out if t.strip()]


def _xfrm(el):
    # <p:sp> and <p:pic> keep the transform at a:xfrm; <p:graphicFrame> keeps it
    # at p:xfrm. Looking only for the drawingml one silently returns 0,0,0,0 for
    # every table and chart — i.e. exactly the blocks the editor most needs to
    # draw a box around.
    x = el.find(f"{P}xfrm")
    if x is None:
        x = el.find(f".//{A}xfrm")
    if x is None:
        return (0, 0, 0, 0)
    off, ext = x.find(f"{A}off"), x.find(f"{A}ext")
    return (int(off.get("x")) if off is not None else 0,
            int(off.get("y")) if off is not None else 0,
            int(ext.get("cx")) if ext is not None else 0,
            int(ext.get("cy")) if ext is not None else 0)


def load_deck(path, label):
    z = zipfile.ZipFile(path)
    media_sha = {n: hashlib.md5(z.read(n)).hexdigest()[:12]
                 for n in z.namelist() if n.startswith("ppt/media/")}
    slides = []
    for idx, sp in enumerate(_slide_paths(z), start=1):
        root = etree.fromstring(z.read(sp))
        rid = _rels(z, sp)
        shapes = []
        for el in root.iter():
            if el.tag == f"{P}sp":
                nv = el.find(f".//{P}cNvPr")
                tx = el.find(f"{P}txBody")
                if nv is None:
                    continue
                shapes.append(ShapeModel(nv.get("name") or "", "text", _xfrm(el),
                                         runs=_run_groups(tx) if tx is not None else []))
            elif el.tag == f"{P}pic":
                nv = el.find(f".//{P}cNvPr")
                blip = el.find(f".//{A}blip")
                emb = blip.get(f"{R}embed") if blip is not None else None
                tgt = rid.get(emb, (None, None))[1] if emb else None
                sha = media_sha.get((tgt or "").replace("../", "ppt/")) if tgt else None
                shapes.append(ShapeModel(nv.get("name") or "", "picture",
                                         _xfrm(el), image_sha=sha))
            elif el.tag == f"{P}graphicFrame":
                nv = el.find(f".//{P}cNvPr")
                name = nv.get("name") if nv is not None else ""
                tbl = el.find(f".//{A}tbl")
                if tbl is not None:
                    cells = []
                    for tr in tbl.findall(f"{A}tr"):
                        cells.append(["".join(t.text or "" for t in tc.iter(f"{A}t"))
                                      for tc in tr.findall(f"{A}tc")])
                    shapes.append(ShapeModel(name, "table", _xfrm(el),
                                             table={"rows": len(cells),
                                                    "cols": len(tbl.findall(f"{A}tblGrid/{A}gridCol")),
                                                    "cells": cells,
                                                    "rowH": [int(tr.get("h") or 0)
                                                             for tr in tbl.findall(f"{A}tr")],
                                                    "colW": [int(gc.get("w") or 0)
                                                             for gc in tbl.findall(f"{A}tblGrid/{A}gridCol")]}))
                    continue
                cref = el.find(f".//{C}chart")
                if cref is not None:
                    tgt = rid.get(cref.get(f"{R}id"), (None, None))[1]
                    ch = etree.fromstring(z.read((tgt or "").replace("../", "ppt/")))
                    kind = next((k for k in CHART_KINDS
                                 if ch.find(f".//{C}{k}") is not None), "?")
                    sers = ch.findall(f".//{C}ser")
                    names = []
                    for s in sers:
                        v = s.find(f"{C}tx//{C}v")
                        names.append(v.text if v is not None else "")
                    cat = sers[0].find(f"{C}cat") if sers else None
                    cache = None
                    if cat is not None:
                        cache = cat.find(f".//{C}strCache")
                        if cache is None:
                            cache = cat.find(f".//{C}numCache")
                    cats = [p.find(f"{C}v").text for p in cache.findall(f"{C}pt")] \
                        if cache is not None else []
                    va = ch.find(f".//{C}valAx//{C}numFmt")
                    dl = ch.find(f".//{C}dLbls//{C}numFmt")
                    shapes.append(ShapeModel(name, "chart", _xfrm(el),
                                             chart={"kind": kind, "series": names,
                                                    "categories": cats,
                                                    "valueAxisFmt": va.get("formatCode") if va is not None else None,
                                                    "dataLabelFmt": dl.get("formatCode") if dl is not None else None}))
        txt = "".join(t.text or "" for t in root.iter(f"{A}t"))
        sl = SlideModel(idx, "", VOLATILE.sub("", txt)[:44], shapes)
        sl.tokens = set(re.findall(r"[一-鿿]{2,4}", txt))
        # Structure survives what text does not: an item-heavy slide can have
        # every word replaced month to month and still be the same slide.
        BUCKET = 228600                                   # 0.25in
        sl.struct = ({f"K:{sh.kind}@{sh.geom[0]//BUCKET},{sh.geom[1]//BUCKET}"
                      for sh in shapes if sh.geom[2]} |
                     {f"N:{sh.name}" for sh in shapes
                      if sh.name and not sh.name.startswith("Google Shape")} |
                     {f"CH:{n}" for sh in shapes if sh.kind == "chart"
                      for n in sh.chart["series"]} |
                     {f"TB:{sh.table['cols']}" for sh in shapes if sh.kind == "table"})
        slides.append(sl)
    z.close()
    return {"label": label, "slides": slides, "media_sha": set(media_sha.values())}


# ──────────────────────────────────────────────────────── alignment ──
def _jac(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def sim(a, b):
    """Structure dominates; text breaks ties. An item-heavy slide keeps its
    structure while every word changes, so text alone cannot carry the match."""
    return 0.65 * _jac(a.struct, b.struct) + 0.35 * _jac(a.tokens, b.tokens)


def align_slides(decks, ref_idx=-1, thresh=0.22, gap=-0.12):
    """
    Align every deck to the NEWEST deck (the reference template) with a proper
    Needleman-Wunsch global alignment instead of a sliding window: a section
    inserted or dropped upstream shifts everything after it, and only a real
    sequence alignment absorbs that without losing the rest of the deck.
    """
    ref = decks[ref_idx]
    groups = {i: {ref["label"]: rs} for i, rs in enumerate(ref["slides"])}
    for d in decks:
        if d is ref:
            continue
        Aseq, Bseq = ref["slides"], d["slides"]
        n, m = len(Aseq), len(Bseq)
        S = [[sim(Aseq[i], Bseq[j]) for j in range(m)] for i in range(n)]
        F = [[0.0] * (m + 1) for _ in range(n + 1)]
        for i in range(1, n + 1):
            F[i][0] = F[i - 1][0] + gap
        for j in range(1, m + 1):
            F[0][j] = F[0][j - 1] + gap
        for i in range(1, n + 1):
            for j in range(1, m + 1):
                F[i][j] = max(F[i - 1][j - 1] + S[i - 1][j - 1],
                              F[i - 1][j] + gap, F[i][j - 1] + gap)
        i, j = n, m
        while i > 0 and j > 0:
            if F[i][j] == F[i - 1][j - 1] + S[i - 1][j - 1]:
                if S[i - 1][j - 1] >= thresh:
                    groups[i - 1][d["label"]] = Bseq[j - 1]
                i, j = i - 1, j - 1
            elif F[i][j] == F[i - 1][j] + gap:
                i -= 1
            else:
                j -= 1
    return {(f"s{i}", 1): m for i, m in groups.items()}


def align_shapes(slidemap, tol=228600):
    """
    Line up shapes across months. Names are the first try, but they drift
    (the crown was 圖形 1 in Nov/Dec and 圖形 28 from Jan), so anything left
    over is matched to the nearest same-kind shape by position.
    """
    labels = list(slidemap)
    ref_label = labels[-1]
    slots = {}                                   # key -> {label: shape}
    seen = Counter()
    for sh in slidemap[ref_label].shapes:
        seen[sh.name] += 1
        slots[(sh.name, seen[sh.name])] = {ref_label: sh}
    for label in labels[:-1]:
        seen = Counter()
        taken = set()
        leftovers = []
        for sh in slidemap[label].shapes:
            seen[sh.name] += 1
            k = (sh.name, seen[sh.name])
            if k in slots and label not in slots[k]:
                slots[k][label] = sh
                taken.add(k)
            else:
                leftovers.append(sh)
        for sh in leftovers:                     # geometry fallback
            best, bk = None, None
            for k, m in slots.items():
                if k in taken or label in m:
                    continue
                r = m[ref_label]
                if r.kind != sh.kind:
                    continue
                dx = abs(r.geom[0] - sh.geom[0]); dy = abs(r.geom[1] - sh.geom[1])
                if dx <= tol and dy <= tol and (best is None or dx + dy < best):
                    best, bk = dx + dy, k
            if bk is not None:
                slots[bk][label] = sh
                taken.add(bk)
    return slots


# ────────────────────────────────────────────────────── classifier ──
REF_LABEL = None


def classify(decks, minmonths=4):
    global REF_LABEL
    REF_LABEL = decks[-1]["label"]
    labels = [d["label"] for d in decks]
    nd = len(decks)
    chrome_sha = set.intersection(*[d["media_sha"] for d in decks]) if nd > 1 else set()
    slots, findings = [], []
    sid = 0

    def nid(p):
        nonlocal sid
        sid += 1
        return f"{p}_{sid}"

    for (skey, nth), slidemap in align_slides(decks).items():
        months = len(slidemap)
        if months < minmonths:
            continue
        # Name the slot after the reference slide's own heading \u2014 the topmost
        # short text run that isn't the \u8cc7\u6599\u4f86\u6e90/\u8cc7\u6599\u5340\u9593 footer.
        ref_slide = slidemap.get(REF_LABEL) or list(slidemap.values())[0]
        cands = [(sh.geom[1], t) for sh in ref_slide.shapes if sh.kind == "text"
                 for _, _, t in sh.runs if 2 <= len(t.strip()) <= 40
                 and not t.startswith("\u8cc7\u6599\u4f86\u6e90") and not t.startswith("\u8cc7\u6599\u5340\u9593")]
        cands.sort(key=lambda x: x[0])
        anchor_text = [t.strip() for _, t in cands[:2]]
        idxs = sorted({s.index for s in slidemap.values()})

        ref_idx = ref_slide.index
        for (name, occ), shmap in align_shapes(slidemap).items():
            if len(shmap) < minmonths:
                continue
            _rs = shmap.get(REF_LABEL) or list(shmap.values())[-1]
            ref_box = {"slide": ref_idx, "x": _rs.geom[0], "y": _rs.geom[1],
                       "w": _rs.geom[2], "h": _rs.geom[3], "shape": name}
            kinds = {sh.kind for sh in shmap.values()}
            kind = kinds.pop() if len(kinds) == 1 else "mixed"

            # ── TEXT → scalar (one slot per run-group that actually varies)
            if kind == "text":
                per_group = defaultdict(dict)
                for lb, sh in shmap.items():
                    for pi, gi, t in sh.runs:
                        per_group[(pi, gi)][lb] = t
                for (pi, gi), vals in per_group.items():
                    if len(vals) < minmonths:
                        continue
                    uniq = set(vals.values())
                    if len(uniq) == 1:
                        continue                       # identical every month = label
                    lens = [len(v) for v in vals.values()]
                    slots.append({
                        "ref": ref_box, "type": "scalar", "id": nid("scalar"),
                        "label": f"{'/'.join(anchor_text) or 'slide'} — {list(vals.values())[0][:18]}",
                        "anchor": {"signature": {"slideTextContains": anchor_text,
                                                 "shapeKind": "text"},
                                   "shapeName": name, "slideIndexHint": idxs[0]},
                        "target": {"kind": "runGroup", "paragraphIndex": pi,
                                   "runGroupIndex": gi},
                        "charBudget": {"max": max(lens),
                                       "derivedFrom": {"months": len(lens),
                                                       "observed": sorted(lens)}},
                        "observedValues": list(vals.values())[:3],
                        "stability": f"{len(vals)}/{nd}",
                    })

            # ── TABLE → fixed cells become scalars, varying axis becomes a group
            elif kind == "table":
                rows = {sh.table["rows"] for sh in shmap.values()}
                cols = {sh.table["cols"] for sh in shmap.values()}
                varies = ("rows" if len(rows) > 1 else "") + ("cols" if len(cols) > 1 else "")
                any_sh = next(iter(shmap.values()))
                if any_sh.table["rows"] * any_sh.table["cols"] <= 1:
                    continue                            # 1x1 prose box → handled as text
                if varies:
                    orient = "columns" if "cols" in varies else "rows"
                    n = max(cols) if orient == "columns" else max(rows)
                    fields = []
                    for ri, rowcells in enumerate(any_sh.table["cells"]):
                        lbl = rowcells[0] if rowcells else ""
                        if ri == 0 or lbl:
                            fields.append({"index": ri, "key": lbl or f"row{ri}"})
                    slots.append({
                        "ref": ref_box, "type": "tableGroup", "id": nid("tablegroup"),
                        "label": f"{'/'.join(anchor_text)} — {name}",
                        "anchor": {"signature": {"slideTextContains": anchor_text,
                                                 "shapeKind": "table"},
                                   "shapeName": name, "slideIndexHint": idxs[0]},
                        "orientation": orient, "labelIndex": 0,
                        "templateCardinality": n - 1,
                        "cardinality": {"from": "data",
                                        "min": (min(cols) if orient == "columns" else min(rows)) - 1,
                                        "max": n - 1,
                                        "onOverflow": "trim", "onUnderflow": "removeSpare"},
                        "fields": fields,
                        "rowHeightsEmu": any_sh.table["rowH"],
                        "stability": f"{len(shmap)}/{nd}",
                    })
                else:
                    for ri, rowcells in enumerate(any_sh.table["cells"]):
                        for ci in range(len(rowcells)):
                            vals = {lb: (sh.table["cells"][ri][ci]
                                         if ri < len(sh.table["cells"])
                                         and ci < len(sh.table["cells"][ri]) else None)
                                    for lb, sh in shmap.items()}
                            vals = {k: v for k, v in vals.items() if v is not None}
                            if len(set(vals.values())) <= 1 or len(vals) < minmonths:
                                continue
                            _t = (shmap.get(REF_LABEL) or list(shmap.values())[-1]).table
                            _cw, _rh = _t.get("colW") or [], _t.get("rowH") or []
                            cell_box = {
                                "slide": ref_box["slide"],
                                "x": ref_box["x"] + sum(_cw[:ci]),
                                "y": ref_box["y"] + sum(_rh[:ri]),
                                "w": _cw[ci] if ci < len(_cw) else ref_box["w"],
                                "h": _rh[ri] if ri < len(_rh) else ref_box["h"],
                                "shape": f"{name}[{ri},{ci}]",
                            } if _cw and _rh else ref_box
                            slots.append({
                                "ref": cell_box, "type": "scalar", "id": nid("cell"),
                                "label": f"{'/'.join(anchor_text)} — {name}[{ri},{ci}]",
                                "anchor": {"signature": {"slideTextContains": anchor_text,
                                                         "shapeKind": "table"},
                                           "shapeName": name, "slideIndexHint": idxs[0]},
                                "target": {"kind": "cell", "row": ri, "col": ci},
                                "charBudget": {"max": max(len(v) for v in vals.values()),
                                               "derivedFrom": {"months": len(vals),
                                                               "observed": sorted(len(v) for v in vals.values())}},
                                "observedValues": list(vals.values())[:3],
                                "stability": f"{len(vals)}/{nd}",
                            })

            # ── CHART
            elif kind == "chart":
                catsets = {lb: tuple(sh.chart["categories"]) for lb, sh in shmap.items()}
                any_sh = next(iter(shmap.values()))
                counts = {len(c) for c in catsets.values()}
                allcats = set().union(*[set(c) for c in catsets.values()])
                monotonic = len(counts) == len(catsets) and all(
                    DATEISH.match(str(c)) for c in list(allcats)[:5])
                if monotonic:
                    catspec = {"from": "timeline", "granularity": "month",
                               "mode": "append", "format": "YYYY.MM"}
                elif len(set(catsets.values())) == 1:
                    catspec = {"from": "template", "values": list(any_sh.chart["categories"])}
                else:
                    catspec = {"from": "data", "maxCount": max(counts),
                               "onOverflow": "groupAsOther"}
                slots.append({
                    "ref": ref_box, "type": "chart", "id": nid("chart"),
                    "label": f"{'/'.join(anchor_text)} — {any_sh.chart['kind']}",
                    "anchor": {"signature": {"slideTextContains": anchor_text,
                                             "shapeKind": "chart",
                                             "chartSeriesNames": any_sh.chart["series"]},
                               "shapeName": name, "slideIndexHint": idxs[0]},
                    "chartKind": any_sh.chart["kind"].replace("Chart", ""),
                    "categories": catspec,
                    "series": [{"name": s} for s in any_sh.chart["series"]],
                    "preservedFormats": {
                        "valueAxisNumberFormat": any_sh.chart["valueAxisFmt"],
                        "dataLabelNumberFormat": any_sh.chart["dataLabelFmt"]},
                    "historySource": "db" if catspec["from"] == "timeline" else None,
                    "observedCategoryCounts": sorted(counts),
                    "stability": f"{len(shmap)}/{nd}",
                })

            # ── PICTURE → chrome or image slot or marker
            elif kind == "picture":
                shas = {sh.image_sha for sh in shmap.values() if sh.image_sha}
                w = next(iter(shmap.values())).geom[2]
                h = next(iter(shmap.values())).geom[3]
                tiny = w < 0.45 * EMU_IN and h < 0.45 * EMU_IN
                moves = len({sh.geom[:2] for sh in shmap.values()}) > 1
                if shas and shas <= chrome_sha and not moves:
                    continue                                   # template chrome
                if tiny and moves:
                    slots.append({
                        "ref": ref_box, "type": "marker", "id": nid("marker"),
                        "label": f"{'/'.join(anchor_text)} — {name}",
                        "anchor": {"signature": {"slideTextContains": anchor_text,
                                                 "shapeKind": "picture"},
                                   "geometry": {"leftEmu": next(iter(shmap.values())).geom[0],
                                                "topEmu": next(iter(shmap.values())).geom[1]}},
                        "rule": "max", "onUnresolved": "hide",
                        "note": "位置每月不同 → 綁定排名，不能用 shape name 定位",
                        "stability": f"{len(shmap)}/{nd}",
                    })
                elif len(shas) > 1:
                    slots.append({
                        "ref": ref_box, "type": "image", "id": nid("image"),
                        "label": f"{'/'.join(anchor_text)} — {name}",
                        "anchor": {"signature": {"slideTextContains": anchor_text,
                                                 "shapeKind": "picture"},
                                   "shapeName": name, "slideIndexHint": idxs[0]},
                        "fit": "cover", "cropPolicy": "recompute",
                        "onMissing": "flag",
                        "distinctImages": len(shas),
                        "stability": f"{len(shmap)}/{nd}",
                    })

    # ── slideGroup: contiguous runs of same-shaped slides whose count varies ──
    POST = re.compile(r"\d{1,2}月\d{1,2}日")
    counts = {}
    for d in decks:
        hits = [s.index for s in d["slides"]
                if POST.search("".join(t for _, _, t in
                                       [r for sh in s.shapes for r in sh.runs]))]
        if hits:
            counts[d["label"]] = (len(hits), hits[0], hits[-1])
    if len(counts) >= minmonths:
        ns = [v[0] for v in counts.values()]
        slots.append({
            "type": "slideGroup", "id": nid("slidegroup"),
            "label": "內容行事曆 — 一則貼文一頁",
            "anchor": {"signature": {"slideTextContains": ["月", "日"],
                                     "shapeKind": "slide"}},
            "mode": "perItem",
            "cardinality": {"from": "data", "min": min(ns), "max": max(ns),
                            "onOverflow": "trim", "onUnderflow": "removeSpare"},
            "templateSlideIndices": [counts[decks[-1]["label"]][1]],
            "itemsBinding": {"source": "calendar", "field": "plannedPosts"},
            "observedPerMonth": {k: v[0] for k, v in counts.items()},
            "observedStartPage": sorted({v[1] for v in counts.values()}),
            "stability": f"{len(counts)}/{nd}",
        })

    return slots, chrome_sha


# ────────────────────────────────────────────────────────── health ──
def health(decks, slots, chrome_sha):
    nd = len(decks)
    f = []
    by = Counter(s["type"] for s in slots)
    stable = [s for s in slots if s.get("stability") == f"{nd}/{nd}"]
    f.append({"kind": "stable",
              "message": f"{len(stable)} 個欄位在全部 {nd} 個月都出現在同一位置，可自動化。",
              "evidence": [f"{k}×{v}" for k, v in by.items()]})
    for s in slots:
        if s["type"] == "tableGroup":
            c = s["cardinality"]
            if c["min"] != c["max"]:
                f.append({"kind": "variableCardinality", "slotIds": [s["id"]],
                          "message": f"「{s['label']}」的項目數每月不同（{c['min']}～{c['max']}），"
                                     f"將依實際資料筆數自動增減欄位。",
                          "evidence": [f"orientation={s['orientation']}"]})
        if s["type"] == "slideGroup":
            f.append({"kind": "repeatingSlides", "slotIds": [s["id"]],
                      "message": f"「{s['label']}」是整頁重複，每月 {s['cardinality']['min']}～"
                                 f"{s['cardinality']['max']} 頁，起始頁會隨前面段落增減而移動。",
                      "evidence": [f"各月頁數 {s['observedPerMonth']}",
                                   f"起始頁 {s['observedStartPage']}"]})
        if s["type"] == "chart" and s["categories"]["from"] == "data":
            f.append({"kind": "variableCardinality", "slotIds": [s["id"]],
                      "message": f"「{s['label']}」的分類項目每月不同（{s['observedCategoryCounts']} 項），"
                                 f"分類名稱與數量都由資料決定。",
                      "evidence": [f"observed={s['observedCategoryCounts']}"]})
        if s["type"] == "scalar" and s.get("charBudget", {}).get("max", 99) <= 60:
            b = s["charBudget"]
            vals = s.get("observedValues", [])
            prose = any(len(re.findall(r"[一-鿿]", v)) >= 10 for v in vals)
            spread = max(b["derivedFrom"]["observed"]) - min(b["derivedFrom"]["observed"])
            if prose and b["max"] >= 20 and 3 <= spread <= 24:
                f.append({"kind": "tightBudget", "slotIds": [s["id"]],
                          "_headroom": spread,
                          "message": f"「{s['label']}」的可用字數只有 {b['max']} 字，超過會擠壓版面。",
                          "evidence": [f"各月長度 {b['derivedFrom']['observed']}"]})
    tb = [x for x in f if x["kind"] == "tightBudget"]
    if len(tb) > 8:
        f = [x for x in f if x["kind"] != "tightBudget"]
        tb.sort(key=lambda x: x["_headroom"])
        f.extend(tb[:8])
        f.append({"kind": "tightBudget", "slotIds": [],
                  "message": f"另有 {len(tb)-8} 個文字欄位也有字數上限，產出時會一併遵守。",
                  "evidence": []})
    imgs = [s for s in slots if s["type"] == "image"]
    if imgs:
        f.append({"kind": "imageHeavy", "slotIds": [s["id"] for s in imgs],
                  "message": f"{len(imgs)} 個圖片位置每月都換圖，會自動從資料來源取圖並置中裁切以維持版面。",
                  "evidence": [f"樣板固定裝飾圖 {len(chrome_sha)} 張（不會動到）"]})
    return f


# ── slide outline for the editor's centre pane ──────────────────────────────
# No LibreOffice on the VM, so we cannot rasterise a slide. We do not need to:
# the point of the centre pane is picking BLOCKS, and a schematic drawn from the
# real geometry is more precise for that than a picture would be — every shape
# is a box at its true position, and a detected slot can be highlighted exactly.
def outline(deck, max_text=90):
    out = []
    for sl in deck["slides"]:
        shapes = []
        for sh in sl.shapes:
            if not sh.geom[2] or not sh.geom[3]:
                continue
            txt = " ".join(t for _, _, t in sh.runs).strip()
            shapes.append({
                "name": sh.name, "kind": sh.kind,
                "x": sh.geom[0], "y": sh.geom[1], "w": sh.geom[2], "h": sh.geom[3],
                "text": txt[:max_text],
                "table": ({"rows": sh.table["rows"], "cols": sh.table["cols"]}
                          if sh.table else None),
                "chart": ({"kind": sh.chart["kind"], "series": sh.chart["series"]}
                          if sh.chart else None),
            })
        shapes.sort(key=lambda s: (s["y"], s["x"]))
        out.append({"index": sl.index, "shapes": shapes})
    return out


def main(argv):
    if len(argv) < 2:
        json.dump({"error": "usage: parse_template.py <deck.pptx> [more.pptx ...]"},
                  sys.stdout, ensure_ascii=False)
        return 2
    paths = argv[1:]
    decks = []
    for p in paths:
        label = os.path.splitext(os.path.basename(p))[0][:40]
        decks.append(load_deck(p, label))
    # The newest upload is the reference template; the rest exist to measure
    # what varies. Sorting by name keeps "260725_…" last for this client's
    # yymmdd_ naming; the caller can override by upload order later.
    decks.sort(key=lambda d: d["label"])

    slots, chrome = classify(decks) if len(decks) > 1 else ([], set())
    findings = health(decks, slots, chrome) if len(decks) > 1 else [{
        "kind": "manualOnly", "slotIds": [],
        "message": "只上傳了 1 份版型，無法比對出哪些欄位每月會變。再上傳 3 份以上（不同月份）才能產出體檢報告。",
        "evidence": [f"目前 1 份：{decks[0]['label']}"],
    }]
    ref = decks[-1]
    json.dump({
        "decks": [{"label": d["label"], "slides": len(d["slides"])} for d in decks],
        "reference": {"label": ref["label"], "slideW": 9144000, "slideH": 5143500,
                      "slides": outline(ref)},
        "slots": slots,
        "health": {"decksAnalyzed": len(decks), "findings": findings},
    }, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
