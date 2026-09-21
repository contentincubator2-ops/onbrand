/**
 * reliableCutout — 去背失敗就自動重試，不把失敗丟給用戶。
 *
 * 2026-09-21（CJ「我最終還是需要出圖，所以應該是失敗立刻重新嘗試，而不能出現
 * 錯誤」）。removeProductBackground 自己會吞掉所有錯誤、退成「原圖不去背」，
 * 呼叫端分不出成功與失敗——以前就是這樣，退成原圖的結果照樣被當成功合成。
 *
 * 這裡把「成功」定義清楚：真的是去背服務回來的、有 alpha 通道、而且 assessCutout
 * 沒有硬性失敗。不符合就重試（最多 MAX_CUTOUT_ATTEMPTS 次，逐次拉長間隔）。
 * 重試對「暫時性失敗」有用；遮罩本身不好（同一模型同一張圖大多會給同樣的遮罩）
 * 重試多半沒用，所以耗盡次數後回 ok:false，由呼叫端走備援出圖，而不是報錯。
 *
 * 沒設去背服務的金鑰時重試沒有意義（每次都一樣），直接回 no_cutout_service。
 */
import { removeProductBackground, type CutoutResult } from "./productImageCutout";
import { assessCutout, type CutoutIssue } from "./cutoutQuality";

export const MAX_CUTOUT_ATTEMPTS = 3;

export type CutoutOutcome =
  | { ok: true; pngBuffer: Buffer; attempts: number; issues: CutoutIssue[]; needsReview: boolean }
  | { ok: false; attempts: number; reason: "no_cutout_service" | "cutout_failed" | "cutout_unusable"; issues: CutoutIssue[] };

export interface ObtainDeps {
  remove?: (url: string) => Promise<CutoutResult>;
  sleep?: (ms: number) => Promise<void>;
  hasService?: () => boolean;
  maxAttempts?: number;
}

export async function obtainCutout(url: string, deps: ObtainDeps = {}): Promise<CutoutOutcome> {
  const remove = deps.remove ?? removeProductBackground;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const hasService = deps.hasService ?? (() => !!process.env.REPLICATE_API_TOKEN);
  const max = deps.maxAttempts ?? MAX_CUTOUT_ATTEMPTS;

  if (!hasService()) return { ok: false, attempts: 0, reason: "no_cutout_service", issues: [] };

  let reason: "cutout_failed" | "cutout_unusable" = "cutout_failed";
  let issues: CutoutIssue[] = [];
  for (let attempt = 1; attempt <= max; attempt++) {
    let r: CutoutResult | null = null;
    try { r = await remove(url); } catch { r = null; }

    if (!r || r.provider !== "replicate-birefnet" || !r.hadAlpha) {
      reason = "cutout_failed";
    } else {
      const a = await assessCutout(r.pngBuffer);
      if (a.ok) return { ok: true, pngBuffer: r.pngBuffer, attempts: attempt, issues: a.issues, needsReview: a.issues.length > 0 };
      reason = "cutout_unusable";
      issues = a.issues;
    }
    if (attempt < max) await sleep(800 * attempt);
  }
  return { ok: false, attempts: max, reason, issues };
}
