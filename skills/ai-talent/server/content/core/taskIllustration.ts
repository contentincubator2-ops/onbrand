/**
 * 任務卡插畫：每張卡一張 gpt-image-2 畫的圖（2026-09-30，CJ「每一個任務卡都要有
 * 自己符合情境的插畫；品牌自建的也要能自己創造，用 image 2 生」）。
 *
 * 兩段：
 *   1. 概念——Claude 讀卡名＋主問題＋說明，寫一句「畫面上有什麼」。卡片之間要
 *      看得出差別，所以批次產時會把已用過的概念一起給它，要它避開。
 *   2. 畫圖——概念接在固定的畫風描述後面丟給 gpt-image-2。畫風鎖死
 *      （深藍描邊／淺藍底／只有 SoWork 橘一個重點色），整組看起來才是同一套。
 *
 * 圖上一律不放字（模型畫不出正確中文，見 image text overlay 記憶）。
 * 內建卡由 scripts/gen-task-illustrations.ts 批次產、進 repo；自建卡在伺服器上
 * 即時產、存 covers 目錄。兩條路都走這支，畫風只有一份。
 */
import { invokeLLM } from "../../platform/core/llm";
import { generateStillImage, GPT_IMAGE_2 } from "./stillImageModels";

export interface IllustrationCardInput {
  id: string;
  label: string;
  question?: string | null;
  description?: string | null;
}

export const ILLUSTRATION_STYLE = [
  "Minimal flat icon-style spot illustration, like an app empty-state graphic.",
  "ONE simple subject only: a single object, or one simple character holding one prop. At most three elements in total.",
  "Large simple geometric shapes, very few lines, no small details, no scenery, no background objects, no crowds, no furniture unless it is the subject.",
  "Thick rounded dark navy (#1F2A44) outlines of even weight.",
  "Fills only in white and pale blue (#DCE6F4); plain solid background in very light blue (#EDF2F9).",
  "Exactly ONE warm orange accent (#E85D2E) on the key element — nothing else orange.",
  "Subject centered with lots of empty space around it, on a soft pale-blue oval ground shadow.",
  "No gradients, no photorealism, no 3D, no drop shadows, no texture.",
  "Absolutely no text, letters, words, numbers, question or exclamation marks, logos, watermarks or UI labels anywhere in the image.",
].join(" ");

export function illustrationPrompt(concept: string): string {
  return `${ILLUSTRATION_STYLE}\n\nScene: ${concept.trim()}`;
}

const CONCEPT_SYSTEM = `You design the small header illustration for marketing task cards in a Taiwanese content app.
For each card, write ONE short English phrase (max 18 words) naming a single simple visual metaphor that captures what THIS card is specifically about — its twist, not just its channel.
Rules:
- Show objects, characters, gestures. Never mention text, letters, numbers, labels, or symbols like question/exclamation marks — the image will contain none.
- Avoid generic channel icons alone (a phone, a play button). Make the scene specific to the card's idea.
- Every card must look clearly different from the others and from the "already used" list.
- It is shown as a small thumbnail (132px wide): ONE object, or ONE character with ONE prop. Never groups, scenes or settings.
- Say which single element is the orange accent.
Reply with JSON only: {"concepts": {"<card id>": "<sentence>", ...}}`;

function cardLine(c: IllustrationCardInput): string {
  const parts = [`id=${c.id}`, `title=${c.label}`];
  if (c.question) parts.push(`asks user=${c.question}`);
  if (c.description) parts.push(`about=${c.description.slice(0, 200)}`);
  return `- ${parts.join(" | ")}`;
}

/** 一次替一批卡寫概念；拿不到的卡不會出現在回傳裡（呼叫端決定要不要重試）。 */
export async function writeIllustrationConcepts(
  cards: IllustrationCardInput[],
  alreadyUsed: string[] = [],
): Promise<Record<string, string>> {
  if (cards.length === 0) return {};
  const used = alreadyUsed.slice(-80).map((s) => `- ${s}`).join("\n");
  const user = `Cards:\n${cards.map(cardLine).join("\n")}${used ? `\n\nAlready used (do not repeat these ideas):\n${used}` : ""}`;
  const out = await invokeLLM({
    provider: "anthropic",
    messages: [
      { role: "system", content: CONCEPT_SYSTEM },
      { role: "user", content: user },
    ],
    maxTokens: 200 + cards.length * 90,
  });
  const text = String(out?.choices?.[0]?.message?.content ?? "");
  return parseConcepts(text, cards.map((c) => c.id));
}

export function parseConcepts(text: string, ids: string[]): Record<string, string> {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return {};
  let obj: any;
  try { obj = JSON.parse(m[0]); } catch { return {}; }
  const src = obj?.concepts ?? obj;
  const res: Record<string, string> = {};
  for (const id of ids) {
    const v = src?.[id];
    if (typeof v === "string" && v.trim().length >= 10) res[id] = v.trim();
  }
  return res;
}

/** 用 gpt-image-2 畫一張，回傳 covers 目錄裡的原圖 URL（PNG，1536×1024）。 */
export async function drawIllustration(concept: string): Promise<{ url: string } | { error: string }> {
  const r = await generateStillImage(GPT_IMAGE_2, { prompt: illustrationPrompt(concept), size: "1536x1024" });
  return r.status === "ready" && r.url ? { url: r.url } : { error: r.errorMsg ?? "image failed" };
}

/**
 * 原圖太大（~1.4MB PNG），卡片上只顯示約 104px 寬：先裁到「畫面實際有東西的範圍」，
 * 四周留一致的邊，再補成框的比例（240:170），輸出 480×340 webp。
 * 不這樣做的話，模型留的大片空白會讓主體在小框裡只剩一小顆；直接等比放大裁切
 * 又會切到高的主體（2026-09-30 在 dev 上對 301 張實測過）。
 */
export async function shrinkToWebp(png: Buffer): Promise<Buffer> {
  return fitToFrame(png);
}

export const FRAME_W = 480;
export const FRAME_H = 340;

export async function fitToFrame(img: Buffer, margin = 0.1): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const base = sharp(img).removeAlpha();
  const { data, info } = await base.clone().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  // 背景色取四個角的平均——模型給的淺藍不一定剛好是 #EDF2F9。
  const at = (i: number): number => data[i] ?? 0;
  const px = (x: number, y: number): [number, number, number] => {
    const i = (y * w + x) * c; return [at(i), at(i + 1), at(i + 2)];
  };
  const corners = [px(2, 2), px(w - 3, 2), px(2, h - 3), px(w - 3, h - 3)];
  const avg = (k: 0 | 1 | 2) => corners.reduce((a, p) => a + p[k], 0) / 4;
  const bg: [number, number, number] = [avg(0), avg(1), avg(2)];
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      const d = Math.abs(at(i) - bg[0]) + Math.abs(at(i + 1) - bg[1]) + Math.abs(at(i + 2) - bg[2]);
      if (d > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  const bgHex = { r: Math.round(bg[0]), g: Math.round(bg[1]), b: Math.round(bg[2]) };
  if (x1 < 0) return base.resize(FRAME_W, FRAME_H, { fit: "cover" }).webp({ quality: 82 }).toBuffer();

  // 內容框＋邊，再擴成 240:170；擴出去超過原圖的部分用背景色補。
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  let bw = cw * (1 + 2 * margin), bh = ch * (1 + 2 * margin);
  const ratio = FRAME_W / FRAME_H;
  if (bw / bh < ratio) bw = bh * ratio; else bh = bw / ratio;
  const cx = x0 + cw / 2, cy = y0 + ch / 2;
  const left = Math.round(cx - bw / 2), top = Math.round(cy - bh / 2);
  const W = Math.round(bw), H = Math.round(bh);
  const pad = {
    left: Math.max(0, -left), top: Math.max(0, -top),
    right: Math.max(0, left + W - w), bottom: Math.max(0, top + H - h),
  };
  // sharp 在同一條 pipeline 裡會先 extract 再 extend，所以分兩趟。
  const padded = await sharp(img).removeAlpha().extend({ ...pad, background: bgHex }).png().toBuffer();
  return sharp(padded)
    .extract({ left: left + pad.left, top: top + pad.top, width: W, height: H })
    .resize(FRAME_W, FRAME_H)
    .webp({ quality: 82 })
    .toBuffer();
}
