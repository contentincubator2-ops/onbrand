/**
 * influencerSheet — 網紅名單的匯入（.xlsx／.csv／.txt）與結果的匯出（.xlsx／.docx）。
 *
 * 匯入不要求固定格式：每一列找得到連結就算一位；有標題列就照標題認「名字／Email／備註」，
 * 沒有標題列就用內容猜（像 email 的是 email、短的文字是名字、長的文字是備註）。
 * Excel 裡「顯示文字是名字、連結藏在超連結」的儲存格也讀得到。
 */
import { unzip, zip } from "./miniZip";
import { classifyLink, PLATFORM_LABEL } from "./influencerLink";
import { IDEA_KINDS, MAX_PEOPLE, NOTES_MAX, personLabel, type Idea, type PersonResult } from "./influencerAngles";

export interface SheetPerson { url: string; name?: string; email?: string; notes?: string }
export interface SheetParse { people: SheetPerson[]; skipped: number; truncated: number }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HEAD = {
  url: /連結|網址|url|link|頻道|主頁|profile/i,
  name: /名稱|名字|姓名|網紅|創作者|帳號|name|creator|kol|influencer/i,
  email: /e-?mail|信箱|郵件/i,
  notes: /備註|說明|貼文|簡介|note|memo|bio/i,
};

function xmlText(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}
const tTexts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1] ?? "")).join("");

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** .xlsx 第一張工作表 → 列×欄的文字；超連結目標另外回傳（key＝儲存格位址）。 */
export function readXlsx(buf: Buffer): { rows: string[][]; links: Map<string, string> } {
  const files = unzip(buf);
  const text = (name: string) => files.get(name)?.toString("utf8") ?? "";
  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)]
    // 注音／拼音標註（rPh）不是儲存格內容。
    .map((m) => tTexts((m[1] ?? "").replace(/<rPh[\s\S]*?<\/rPh>/g, "")));
  const sheetName = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))[0];
  if (!sheetName) throw new Error("no worksheet");
  const sheet = text(sheetName);
  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of (rm[1] ?? "").matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1] ?? "", inner = cm[2] ?? "";
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const val = type === "s" ? shared[Number(v)] ?? "" : type === "inlineStr" ? tTexts(inner) : xmlText(v);
      row[ref ? colIndex(ref) : row.length] = val.trim();
    }
    rows.push(Array.from(row, (c) => c ?? ""));
  }
  const links = new Map<string, string>();
  const rels = text(sheetName.replace("worksheets/", "worksheets/_rels/") + ".rels");
  const target = new Map([...rels.matchAll(/<Relationship\s([^>]*?)\/?>/g)].map((m) => {
    const a = m[1] ?? "";
    return [a.match(/Id="([^"]+)"/)?.[1] ?? "", xmlText(a.match(/Target="([^"]+)"/)?.[1] ?? "")] as [string, string];
  }));
  for (const hm of sheet.matchAll(/<hyperlink\s([^>]*?)\/?>/g)) {
    const a = hm[1] ?? "";
    const ref = a.match(/ref="([A-Z]+\d+)/)?.[1];
    const t = target.get(a.match(/r:id="([^"]+)"/)?.[1] ?? "");
    if (ref && t) links.set(ref, t);
  }
  return { rows, links };
}

/** CSV／TSV／一行一條連結的純文字。 */
export function readDelimited(textIn: string): string[][] {
  const text = textIn.replace(/^﻿/, "");
  const delim = (text.split("\n", 1)[0] ?? "").includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && !cell) q = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

/** 列×欄 → 名單。links：Excel 超連結（key＝A1 位址）。 */
export function rowsToPeople(rows: string[][], links: Map<string, string> = new Map()): SheetParse {
  const colLetter = (i: number) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const urlAt = (r: number, c: number, v: string) => classifyLink(v)?.url ?? classifyLink(links.get(`${colLetter(c)}${r + 1}`) ?? "")?.url ?? null;
  const rowHasUrl = (r: number) => (rows[r] ?? []).some((v, c) => urlAt(r, c, v));
  // 第一列沒有連結、而且有認得的標題字 → 當標題列。
  const first = rows[0] ?? [];
  const head = rows.length && !rowHasUrl(0) && first.some((v) => Object.values(HEAD).some((re) => re.test(v))) ? first : null;
  const col = (re: RegExp) => (head ? head.findIndex((v) => re.test(v)) : -1);
  const cName = col(HEAD.name), cEmail = col(HEAD.email), cNotes = col(HEAD.notes);
  const people: SheetPerson[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (let r = head ? 1 : 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const at = (c: number) => row[c] ?? "";
    let url: string | null = null, urlCol = -1;
    for (let c = 0; c < row.length && !url; c++) { url = urlAt(r, c, at(c)); if (url) urlCol = c; }
    if (!url) { skipped++; continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    // 連結藏在超連結裡時，那一格的顯示文字多半就是名字。
    const urlCellIsText = !classifyLink(at(urlCol));
    const rest = row.map((v, c) => ({ v, c })).filter(({ v, c }) => v && (c !== urlCol || urlCellIsText) && !classifyLink(v));
    const email = (cEmail >= 0 && EMAIL_RE.test(at(cEmail)) ? at(cEmail) : rest.find(({ v }) => EMAIL_RE.test(v))?.v) || undefined;
    const others = rest.filter(({ v }) => !EMAIL_RE.test(v));
    const name = (cName >= 0 ? at(cName) : others.find(({ v }) => v.length <= 40)?.v) || undefined;
    // 有標題列就只認「備註」那一欄：其他欄是什麼我們不知道（例如把我們匯出的表再匯入，
    // 裡面的個人特色、點子不是用戶補的素材）。沒有標題列才把剩下的文字都當備註。
    const notes = (cNotes >= 0 ? at(cNotes) : head ? "" : others.filter(({ v }) => v !== name).map(({ v }) => v).join("\n")) || undefined;
    people.push({ url, name: name?.slice(0, 60), email, notes: notes?.slice(0, NOTES_MAX) });
  }
  const truncated = Math.max(0, people.length - MAX_PEOPLE);
  return { people: people.slice(0, MAX_PEOPLE), skipped, truncated };
}

export function parseSheet(buf: Buffer, filename: string): SheetParse {
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
  if (/\.xlsx$/i.test(filename) || isZip) {
    const { rows, links } = readXlsx(buf);
    return rowsToPeople(rows, links);
  }
  return rowsToPeople(readDelimited(buf.toString("utf8")));
}

// ─── 匯出 ────────────────────────────────────────────────────────────

const esc = (s: unknown) => String(s ?? "")
  // XML 1.0 不允許的控制字元（模型偶爾會吐）。
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STATUS_ZH: Record<string, string> = {
  done: "完成", needs_material: "資料不足，請補貼文", invalid_link: "連結無法辨識", failed: "沒寫成，請重試",
  queued: "排隊中", reading: "讀取中", thinking: "研究中",
};

/** 這一位的點子。2026-10-06 改寫前的舊資料只有一個切角，當成一個點子。 */
function ideasOf(p: PersonResult): Array<Pick<Idea, "title" | "hook" | "productPoint" | "why">> {
  if (p.ideas?.length) return p.ideas;
  return p.angle ? [{ title: p.angle, hook: p.hook ?? "", productPoint: (p.talkingPoints ?? []).join("、"), why: p.angleWhy ?? "" }] : [];
}
const ideaText = (i?: Pick<Idea, "title" | "hook" | "productPoint">) =>
  (i ? [i.title, i.hook ? `「${i.hook}」` : "", i.productPoint ? `帶到：${i.productPoint}` : ""].filter(Boolean).join("\n") : "");
/** 用戶挑的那一個；舊資料只有一個，就是它。 */
const pickedIdea = (p: PersonResult) => (p.picked !== undefined ? ideasOf(p)[p.picked] : p.ideas?.length ? undefined : ideasOf(p)[0]);

const COLUMNS: Array<[string, number, (p: PersonResult) => string]> = [
  ["網紅", 18, (p) => personLabel(p)],
  ["平台", 11, (p) => (p.platform ? PLATFORM_LABEL[p.platform] : "")],
  ["連結", 34, (p) => p.url],
  ["Email", 24, (p) => p.email ?? ""],
  ["粉絲／訂閱", 14, (p) => p.followers ?? ""],
  ["個人特色", 36, (p) => p.profile ?? ""],
  ["主打賣點", 34, (p) => [p.uspTag && p.uspTag !== p.usp ? `【${p.uspTag}】` : "", p.usp ?? "", p.uspWhy ? `為什麼是他：${p.uspWhy}` : ""].filter(Boolean).join("\n")],
  ...IDEA_KINDS.map((k, n): [string, number, (p: PersonResult) => string] =>
    [`點子${"一二三"[n]}（${k.zh}）`, 40, (p) => ideaText(p.ideas?.length ? p.ideas.find((i) => i.kind === k.key) : n === 0 ? ideasOf(p)[0] : undefined)]),
  ["選定的點子", 30, (p) => pickedIdea(p)?.title ?? ""],
  ["建議形式", 14, (p) => p.format ?? ""],
  ["邀約信主旨", 30, (p) => p.emailSubject ?? ""],
  ["邀約信內文", 60, (p) => p.emailBody ?? ""],
  ["狀態", 18, (p) => STATUS_ZH[p.status] ?? p.status],
];

const XML_HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;

export function buildXlsx(people: PersonResult[], title: string): Buffer {
  const cell = (v: string, style: number) =>
    `<c t="inlineStr" s="${style}"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  const rows = [
    `<row>${COLUMNS.map(([h]) => cell(h, 1)).join("")}</row>`,
    ...people.map((p) => `<row>${COLUMNS.map(([, , get]) => cell(get(p), 2)).join("")}</row>`),
  ].join("");
  const cols = COLUMNS.map(([, w], i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const sheetName = esc(title.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "網紅切角");
  return zip([
    { name: "[Content_Types].xml", data: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: "_rels/.rels", data: `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: `${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="11"/><name val="Microsoft JhengHei"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6F6F5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    { name: "xl/worksheets/sheet1.xml", data: `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${rows}</sheetData></worksheet>` },
  ]);
}

export function buildDocx(people: PersonResult[], title: string): Buffer {
  const FONT = `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft JhengHei"/>`;
  const run = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) => {
    const rpr = `<w:rPr>${FONT}${opts.bold ? "<w:b/>" : ""}<w:sz w:val="${opts.size ?? 22}"/>${opts.color ? `<w:color w:val="${opts.color}"/>` : ""}</w:rPr>`;
    return String(text ?? "").split("\n").map((line, i) =>
      `<w:r>${rpr}${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(line)}</w:t></w:r>`).join("");
  };
  const para = (inner: string, after = 120, pageBreakBefore = false) =>
    `<w:p><w:pPr>${pageBreakBefore ? "<w:pageBreakBefore/>" : ""}<w:spacing w:after="${after}" w:line="320" w:lineRule="auto"/></w:pPr>${inner}</w:p>`;
  const field = (label: string, value: string) => (value ? para(run(`${label}　`, { bold: true }) + run(value)) : "");
  const body = [
    para(run(title, { bold: true, size: 36 }), 80),
    para(run(`共 ${people.length} 位｜${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" })}`, { color: "6B6B6B", size: 20 }), 240),
    ...people.map((p, i) => [
      para(run(`${i + 1}. ${personLabel(p) || p.url}`, { bold: true, size: 28 }), 60, i > 0),
      para(run([p.platform ? PLATFORM_LABEL[p.platform] : "", p.followers ?? "", p.url, p.email ?? ""].filter(Boolean).join("｜"), { color: "6B6B6B", size: 18 }), 200),
      p.status !== "done" ? para(run(STATUS_ZH[p.status] ?? p.status, { color: "B45309" })) : "",
      field("個人特色", p.profile ?? ""),
      field("判讀依據", p.evidence ?? ""),
      field("主打賣點", p.usp ?? ""),
      field("為什麼是他", p.uspWhy ?? ""),
      field("建議形式", p.format ?? ""),
      ...ideasOf(p).map((i, k) => {
        const chosen = pickedIdea(p) === i;
        return para(run(`點子 ${k + 1}${chosen ? "（已選）" : ""}　`, { bold: true }) + run(i.title, { bold: chosen }), 40)
          + (i.hook ? para(run(`「${i.hook}」`), 40) : "")
          + para(run([i.productPoint ? `帶到：${i.productPoint}` : "", i.why ? `觀眾為什麼會看：${i.why}` : ""].filter(Boolean).join("｜"), { color: "6B6B6B", size: 20 }));
      }),
      p.emailBody ? para(run("邀約信", { bold: true }), 40) + field("主旨", p.emailSubject ?? "") + para(run(p.emailBody)) : "",
    ].join("")),
  ].join("");
  return zip([
    { name: "[Content_Types].xml", data: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { name: "_rels/.rels", data: `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/document.xml", data: `${XML_HEAD}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>` },
  ]);
}
