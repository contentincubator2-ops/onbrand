/**
 * cutoutQuality — 去背結果好不好用，用程式先看一遍。
 *
 * 2026-09-21（CJ「產品圖合成的時候，如何確保精準」）：合成這一步不重畫產品像素，
 * 但產品準不準完全取決於遮罩準不準。以前遮罩壞了（沒去掉背景、整張被去光、
 * 碎成好幾塊）沒有任何東西會知道，照樣合成、照樣扣點、照樣標「完成」。
 *
 * 這裡只做「便宜、確定性、不需要模型」的檢查，在縮小的 alpha 通道上算：
 *   硬性失敗（遮罩根本不能用，值得重試或改走備援）
 *     nothing_kept     幾乎整張都被去掉了（產品沒了）
 *     nothing_removed  幾乎整張都留著（背景沒去掉，等於沒去背）
 *   軟性提醒（可以用，但請用戶看一眼再確認）
 *     cropped_at_edge  產品貼到照片邊緣，原照片可能就把它裁到了
 *     fragmented       遮罩碎成好幾塊（多個物件，或殘留的雜點／陰影）
 *     fuzzy_edges      半透明邊緣占比很高（毛邊、光暈；透明玻璃製品也會這樣）
 *
 * 這些門檻是「抓明顯壞掉」的粗略值，不是精準度量——沒有用真實商品照校準過。
 * 精準度要靠真實照片基準集量（見交接文件），這裡的目的是擋住最糟的情況。
 */
import sharp from "sharp";

export type CutoutIssue =
  | "nothing_kept" | "nothing_removed"
  | "cropped_at_edge" | "fragmented" | "fuzzy_edges";

export const HARD_ISSUES: readonly CutoutIssue[] = ["nothing_kept", "nothing_removed"];

export interface CutoutAssessment {
  /** 沒有硬性失敗就是 true；軟性提醒不影響 ok，只列在 issues。 */
  ok: boolean;
  issues: CutoutIssue[];
  metrics: { coverage: number; edgeTouch: number; largestShare: number; fuzzyShare: number };
}

const GRID = 160;
const OPAQUE = 128;
const FUZZY_LO = 24;
const FUZZY_HI = 232;

const T = {
  keptMin: 0.02,
  removedMax: 0.985,
  edgeTouch: 0.02,
  largestShareMin: 0.9,
  fuzzyShare: 0.2,
};

export async function assessCutout(png: Buffer): Promise<CutoutAssessment> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .resize({ width: GRID, height: GRID, fit: "inside", kernel: "nearest" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3]!;

  let opaque = 0, fuzzy = 0;
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i]! >= OPAQUE) opaque++;
    if (alpha[i]! >= FUZZY_LO && alpha[i]! <= FUZZY_HI) fuzzy++;
  }
  const coverage = opaque / (w * h);

  let ringTotal = 0, ringOpaque = 0;
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { ringTotal++; if (alpha[y * w + x]! >= OPAQUE) ringOpaque++; }
  for (let y = 1; y < h - 1; y++) for (const x of [0, w - 1]) { ringTotal++; if (alpha[y * w + x]! >= OPAQUE) ringOpaque++; }
  const edgeTouch = ringTotal ? ringOpaque / ringTotal : 0;

  // 最大連通塊佔不透明像素的比例（4 鄰域）。
  const seen = new Uint8Array(w * h);
  let largest = 0;
  const stack: number[] = [];
  for (let s = 0; s < alpha.length; s++) {
    if (seen[s] || alpha[s]! < OPAQUE) continue;
    let size = 0;
    stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0 && !seen[p - 1] && alpha[p - 1]! >= OPAQUE) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < w - 1 && !seen[p + 1] && alpha[p + 1]! >= OPAQUE) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && !seen[p - w] && alpha[p - w]! >= OPAQUE) { seen[p - w] = 1; stack.push(p - w); }
      if (y < h - 1 && !seen[p + w] && alpha[p + w]! >= OPAQUE) { seen[p + w] = 1; stack.push(p + w); }
    }
    if (size > largest) largest = size;
  }
  const largestShare = opaque ? largest / opaque : 0;
  const fuzzyShare = fuzzy / Math.max(1, opaque);

  const issues: CutoutIssue[] = [];
  if (coverage < T.keptMin) issues.push("nothing_kept");
  else if (coverage > T.removedMax) issues.push("nothing_removed");
  else {
    if (edgeTouch > T.edgeTouch) issues.push("cropped_at_edge");
    if (largestShare < T.largestShareMin) issues.push("fragmented");
    if (fuzzyShare > T.fuzzyShare) issues.push("fuzzy_edges");
  }
  return {
    ok: !issues.some((i) => HARD_ISSUES.includes(i)),
    issues,
    metrics: { coverage, edgeTouch, largestShare, fuzzyShare },
  };
}
