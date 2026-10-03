/**
 * 定位文件抽取的兩條補強路徑（Python 抽取器之外）：
 *   1. 舊版 Office（.doc / .ppt）— Python 這邊只有 lxml，讀不了 OLE 二進位檔。
 *   2. 掃描檔 PDF — 沒有文字層，pdftotext 回空；改成逐頁轉圖 → OCR。
 *
 * 兩條都只負責「變成純文字」。切段（標題／內文）一律回頭交給同一支 extract_doc.py，
 * 這樣不論檔案從哪條路進來，下游看到的結構都一樣。
 */
import { promises as fs } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";

const require = createRequire(import.meta.url);

/** OLE 複合檔頭（.doc / .ppt / .xls 共用）。 */
export const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

// ── .doc ────────────────────────────────────────────────────────────────────
export async function docToText(path: string): Promise<string> {
  const WordExtractor = require("word-extractor");
  const doc = await new WordExtractor().extract(path);
  return String(doc.getBody() ?? "").replace(/\r/g, "\n");
}

// ── .ppt ────────────────────────────────────────────────────────────────────
// PowerPoint 97-2003 的文字存在「PowerPoint Document」stream 的 record 裡：
//   SlideContainer (0x03EE) 底下
//     TextHeaderAtom   0x0F9F  （4 bytes: 文字類型；0=標題 6=副標題 其餘=內文）
//     TextCharsAtom    0x0FA0  （UTF-16LE）
//     TextBytesAtom    0x0FA8  （Latin-1 / 各 codepage 單位元組）
// 不用把整棵 record 樹解開：容器 record（recVer=0xF）只往裡走，原子 record 直接讀。
const RT_SLIDE = 0x03ee;
// 母片／備忘稿／講義的容器裡也有文字（「請按這裡編輯題名文字格式」之類的版型佔位字），
// 不是內容，整棵跳過。
const RT_SKIP_CONTAINERS = new Set([0x03f8 /* MainMaster */, 0x03f0 /* Notes */, 0x0fc9 /* Handout */]);
const RT_TEXT_HEADER = 0x0f9f;
const RT_TEXT_CHARS = 0x0fa0;
const RT_TEXT_BYTES = 0x0fa8;

type PptText = { slide: number; kind: number; text: string };

function walkPpt(buf: Buffer, start: number, end: number, ctx: { slide: number; kind: number }, out: PptText[]) {
  let pos = start;
  while (pos + 8 <= end) {
    const verInst = buf.readUInt16LE(pos);
    const recType = buf.readUInt16LE(pos + 2);
    const recLen = buf.readUInt32LE(pos + 4);
    const bodyStart = pos + 8;
    const bodyEnd = bodyStart + recLen;
    if (bodyEnd > end) break;                              // 壞 record：停，不要亂讀
    const isContainer = (verInst & 0x0f) === 0x0f;
    if (isContainer) {
      if (RT_SKIP_CONTAINERS.has(recType)) { pos = bodyEnd; continue; }
      if (recType === RT_SLIDE) ctx.slide += 1;
      walkPpt(buf, bodyStart, bodyEnd, ctx, out);
    } else if (recType === RT_TEXT_HEADER && recLen >= 4) {
      ctx.kind = buf.readUInt32LE(bodyStart);
    } else if (recType === RT_TEXT_CHARS) {
      out.push({ slide: ctx.slide, kind: ctx.kind, text: buf.subarray(bodyStart, bodyEnd).toString("utf16le") });
    } else if (recType === RT_TEXT_BYTES) {
      out.push({ slide: ctx.slide, kind: ctx.kind, text: buf.subarray(bodyStart, bodyEnd).toString("latin1") });
    }
    pos = bodyEnd;
  }
}

export async function pptToMarkdown(path: string): Promise<string> {
  const CFB = require("cfb");
  const cfb = CFB.read(await fs.readFile(path), { type: "buffer" });
  const entry = CFB.find(cfb, "/PowerPoint Document");
  if (!entry?.content) throw new Error("這不是有效的 .ppt（找不到 PowerPoint Document）");
  const buf = Buffer.from(entry.content);
  const texts: PptText[] = [];
  walkPpt(buf, 0, buf.length, { slide: 0, kind: 1 }, texts);
  if (!texts.length) return "";

  // 每張投影片一節：標題類（0 / 6）當節標題，其餘進內文。沒有標題就用第一行。
  const bySlide = new Map<number, PptText[]>();
  for (const t of texts) {
    if (!bySlide.has(t.slide)) bySlide.set(t.slide, []);
    bySlide.get(t.slide)!.push(t);
  }
  const clean = (s: string) => s.replace(/[\r\v\u000b]/g, "\n").replace(/\u0000/g, "").trim();
  const parts: string[] = [];
  for (const [, items] of [...bySlide.entries()].sort((a, b) => a[0] - b[0])) {
    const titleItem = items.find((i) => i.kind === 0 || i.kind === 6);
    const lines = items.filter((i) => i !== titleItem).flatMap((i) => clean(i.text).split("\n")).filter(Boolean);
    const title = titleItem ? clean(titleItem.text).split("\n")[0] : lines.shift() ?? "";
    if (!title && !lines.length) continue;
    parts.push(`# ${title || "(無標題投影片)"}\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

// ── 掃描 PDF → OCR ──────────────────────────────────────────────────────────
// 反向 proxy 的 read timeout 是 180 秒，同步上傳必須在那之前回應。所以 OCR 有「頁數」
// 與「時間」兩道上限；沒辨識完就在文末**明講**只辨識了前 N 頁，不能靜靜截斷。
const OCR_MAX_PAGES = 20;
const OCR_BUDGET_MS = 120_000;
const OCR_SCALE = 2;                                       // ≈144 dpi，中文小字夠辨識又不爆記憶體

function langDir(pkg: string): string {
  // @tesseract.js-data/<lang>/4.0.0_best_int/<lang>.traineddata.gz — 隨 npm 一起部署，
  // 不在執行時去 CDN 抓（VM 對外連線不保證通）。
  const pkgJson = require.resolve(`@tesseract.js-data/${pkg}/package.json`);
  return join(dirname(pkgJson), "4.0.0_best_int");
}

export async function ocrPdf(path: string): Promise<string> {
  const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
  const { createWorker } = await import("tesseract.js");

  const pdf = await getDocumentProxy(new Uint8Array(await fs.readFile(path)));
  const total = pdf.numPages;
  const limit = Math.min(total, OCR_MAX_PAGES);

  // chi_tra 的字集已含基本拉丁字母與數字，英文為主的段落也辨識得出來；
  // 不另載 eng（langPath 只能指一個目錄，多載一包只會把載入時間加倍）。
  const worker = await createWorker("chi_tra", 1, {
    langPath: langDir("chi_tra"),
    gzip: true,
    cachePath: join(dirname(langDir("chi_tra")), ".cache"),
  });

  const started = Date.now();
  const pages: string[] = [];
  let done = 0;
  try {
    for (let i = 1; i <= limit; i++) {
      if (Date.now() - started > OCR_BUDGET_MS) break;
      const png = await renderPageAsImage(pdf, i, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale: OCR_SCALE,
      });
      const { data } = await worker.recognize(Buffer.from(png));
      pages.push(String(data.text ?? "").trim());
      done = i;
    }
  } finally {
    await worker.terminate().catch(() => {});
  }

  // OCR 把漢字之間插空白（中文字元間不該有空白）。拿掉「漢字‧空白‧漢字」之間的空白。
  const joined = pages
    .join("\n\n")
    // OCR 常把全形逗號／句號認成半形並前後加空白：「安心 , 從」→「安心，從」
    .replace(/(?<=[㐀-鿿]) *, */g, "，")
    .replace(/(?<=[㐀-鿿]) *\. *(?=[㐀-鿿]|$)/gm, "。")
    .replace(/(?<=[㐀-鿿　-〿＀-￯]) +(?=[㐀-鿿　-〿＀-￯])/g, "")
    .trim();
  if (!joined) return "";
  const note =
    done < total
      ? `\n\n（注意：這份掃描檔共 ${total} 頁，因時間與頁數上限只辨識了前 ${done} 頁。其餘請另存成較小的檔案再上傳。）`
      : "";
  return joined + note;
}
