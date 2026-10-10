/**
 * 圖上標題的樣式（2026-10-10 CJ「想要文字換個字型，或是壓成海報格式的」）。
 *
 * 標題是前台疊上去的字（AI 圖不烤字），所以換字型、換版式都是即時的、不扣點。
 * 畫面預覽（DOM）與成品（canvas）共用這裡的幾何：字級＝短邊的 7.5%，位置跟卡片規格的 titleZone 走
 * （prompt 就是在那裡留白），所以預覽看到什麼、下載／排程出去就是什麼。
 *
 * 字型一律來自 Google Fonts 的開放授權（OFL）中文字型，用到才載入。
 */
export type TitleLayout = "plain" | "band" | "block";
export type TitleZone = "top" | "center" | "bottom" | "left" | "none";

export interface TitleStyle { font: string; dark: boolean; layout: TitleLayout }
export const DEFAULT_TITLE_STYLE: TitleStyle = { font: "sans", dark: false, layout: "plain" };

export interface TitleFont { id: string; zh: string; en: string; family: string; weight: number; /** Google Fonts css2 的 family 參數；系統字不用載。 */ css?: string }

export const TITLE_FONTS: TitleFont[] = [
  { id: "sans", zh: "黑體", en: "Sans", family: "Noto Sans TC", weight: 700 },
  { id: "serif", zh: "明體", en: "Serif", family: "Noto Serif TC", weight: 700, css: "Noto+Serif+TC:wght@700" },
  { id: "kai", zh: "楷體", en: "Kai", family: "LXGW WenKai TC", weight: 700, css: "LXGW+WenKai+TC:wght@700" },
  { id: "round", zh: "圓體", en: "Rounded", family: "Huninn", weight: 400, css: "Huninn" },
  { id: "classic", zh: "古典黑", en: "Classical", family: "Chocolate Classical Sans", weight: 400, css: "Chocolate+Classical+Sans" },
];

export const TITLE_LAYOUTS: Array<{ id: TitleLayout; zh: string; en: string }> = [
  { id: "plain", zh: "純文字", en: "Text only" },
  { id: "band", zh: "色帶", en: "Band" },
  { id: "block", zh: "色塊", en: "Block" },
];

const FALLBACK = `"PingFang TC", "Microsoft JhengHei", sans-serif`;
export const titleFont = (id: string): TitleFont => TITLE_FONTS.find((f) => f.id === id) ?? TITLE_FONTS[0]!;
export const titleFontFamily = (id: string) => `"${titleFont(id).family}", ${FALLBACK}`;

// 幾何常數（比例都相對於畫布）。DOM 與 canvas 兩邊都讀這裡。
export const TITLE_SIZE = 0.075;        // 字級＝短邊 × 這個
export const TITLE_LINE = 1.25;
export const TITLE_SIDE = 0.07;         // 置中版位的左右邊界
export const TITLE_LEFT_X = 0.06;       // 靠左版位的起點
export const TITLE_LEFT_W = 0.42;       // 靠左版位的文字寬
export const TITLE_TOP = 0.08;
export const TITLE_BOTTOM = 0.10;
export const TITLE_PAD = 0.55;          // 色帶／色塊的內距＝字級 × 這個
export const titleInk = (s: TitleStyle) => (s.dark ? "#171717" : "#FFFFFF");
/** 色帶是半透明（看得到底圖），色塊是實色。 */
export const titlePlate = (s: TitleStyle) =>
  s.layout === "band" ? (s.dark ? "rgba(255,255,255,0.82)" : "rgba(0,0,0,0.55)")
    : s.layout === "block" ? (s.dark ? "#FFFFFF" : "#171717") : null;

const loaded = new Set<string>();
/** 載入這個字型裡「這段文字用得到的字」（Google Fonts 的中文是分片的，要給文字才會抓對的那幾片）。 */
export async function ensureTitleFont(id: string, text: string): Promise<void> {
  const f = titleFont(id);
  if (!f.css || typeof document === "undefined") return;
  if (!loaded.has(f.id)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${f.css}&display=swap`;
    await new Promise<void>((resolve) => { link.onload = () => resolve(); link.onerror = () => resolve(); document.head.appendChild(link); });
    loaded.add(f.id);
  }
  try { await document.fonts.load(`${f.weight} 40px "${f.family}"`, text || "字"); } catch { /* 載不到就用系統字 */ }
}

/** 中文沒有空白可斷：逐字量寬換行。 */
export function wrapTitle(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of text.trim()) {
    if (ch === "\n") { lines.push(line); line = ""; continue; }
    if (line && measure(line + ch) > maxWidth) { lines.push(line); line = ch; } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

/** 把標題畫到 canvas 上（成品用）。呼叫前先 ensureTitleFont。 */
export function drawTitle(g: CanvasRenderingContext2D, W: number, H: number, zone: TitleZone, title: string, style: TitleStyle): void {
  if (!title.trim() || zone === "none") return;
  const f = titleFont(style.font);
  const size = Math.round(Math.min(W, H) * TITLE_SIZE);
  const lh = size * TITLE_LINE;
  const pad = size * TITLE_PAD;
  const left = zone === "left";
  g.font = `${f.weight} ${size}px ${titleFontFamily(style.font)}`;
  g.textBaseline = "middle";
  g.textAlign = left ? "left" : "center";
  const maxW = left ? W * TITLE_LEFT_W : W * (1 - TITLE_SIDE * 2);
  const lines = wrapTitle(title, maxW, (s) => g.measureText(s).width);
  const blockH = lh * lines.length;
  const textW = Math.max(...lines.map((l) => g.measureText(l).width));
  const x = left ? W * TITLE_LEFT_X : W / 2;
  // 色帶／色塊會貼著邊放，文字要往內讓出內距。
  const inset = style.layout === "plain" ? 0 : pad;
  const top = zone === "top" ? H * TITLE_TOP + inset
    : zone === "bottom" ? H * (1 - TITLE_BOTTOM) - blockH - inset
    : H / 2 - blockH / 2;

  const plate = titlePlate(style);
  g.shadowColor = "transparent"; g.shadowBlur = 0;
  if (plate) {
    g.fillStyle = plate;
    if (style.layout === "band") {
      // 靠左版位＝左側整條直的色塊；其餘＝橫跨整張的色帶。
      if (left) g.fillRect(0, 0, W * (TITLE_LEFT_X + TITLE_LEFT_W) + pad, H);
      else g.fillRect(0, top - pad, W, blockH + pad * 2);
    } else {
      const bx = left ? x - pad : x - textW / 2 - pad;
      g.fillRect(bx, top - pad, textW + pad * 2, blockH + pad * 2);
    }
  } else {
    g.shadowColor = style.dark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
    g.shadowBlur = size * 0.25;
  }
  g.fillStyle = titleInk(style);
  lines.forEach((l, i) => g.fillText(l, x, top + lh / 2 + i * lh));
}
