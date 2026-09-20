/**
 * rewriteDraft — 貼上一段既有文案，改寫成符合品牌調性的版本。
 *
 * 2026-09-16（CJ「要讓用戶可以有地方，輸入原文後改寫就好」）：跟「自建任務卡」
 * 是兩件事——自建任務卡是把一種寫法變成可重複使用的 SKILL（存進品牌任務庫，
 * 之後每次都能再跑）；這裡只改這一篇，貼上去、改完就結束，不產生新卡片。
 *
 * 方法論沿用 quickTaskRouter.ts 裡「改寫文案 Squad」（診斷→改寫→CTA 三人
 * 接力）的三段 prompt，但改成伺服器內部依序呼叫三次模型、只回最終結果——
 * 不需要前端自己驅動三次 mutation，也不需要復活那套目前沒有任何頁面在用
 * 的 Squad 逐步執行介面（quickTaskRouter.runAgent／list，見
 * server/content/routers/quickTaskRouter.ts 的 TASKS map，client 端完全
 * 沒有呼叫）。
 */
import { callModel } from "../../platform/core/multiModelRouter";
import { buildBrandPrefix, enforceBrandRulesOnText } from "../../strategy/core/brandContext";

async function call(system: string, user: string): Promise<string> {
  try {
    const r = await callModel(
      [{ role: "system", content: system }, { role: "user", content: user }],
      undefined,
      "qwen",
    );
    return r.content;
  } catch {
    const r = await callModel(
      [{ role: "system", content: system }, { role: "user", content: user }],
      undefined,
      "forge",
    );
    return r.content;
  }
}

export interface RewriteDraftInput {
  material: string;
  audience?: string;
  brandId?: number | null;
}

export interface RewriteDraftResult {
  rewritten: string;
  cta: string;
  whatChanged: string;
}

/** 抽出「最終文案」／「CTA」／「改了什麼」三段——LLM 不一定乖乖照格式回，抓不到就整段當最終文案。 */
function parseFinal(raw: string): RewriteDraftResult {
  const grab = (label: string): string | null => {
    const m = raw.match(new RegExp(`\\*\\*${label}\\*\\*[：:]?\\s*\\n?([\\s\\S]*?)(?=\\n\\*\\*|$)`));
    return m ? m[1]!.trim() : null;
  };
  const rewritten = grab("最終文案") ?? raw.trim();
  const cta = grab("CTA") ?? "";
  const whatChanged = grab("改了什麼") ?? "";
  return { rewritten, cta, whatChanged };
}

export async function rewriteDraft(input: RewriteDraftInput): Promise<RewriteDraftResult> {
  const material = input.material.trim();
  const audience = (input.audience ?? "").trim();
  const brandPrefix = await buildBrandPrefix(input.brandId ?? undefined, undefined, undefined, "core");

  const diagnosis = await call(
    `你是資深文案診斷師。讀原文案，輸出：\n\n**病因**（3 點，每點 20 字內）\n- 例：太抽象 / 沒利益 / 沒急迫\n\n**處方**（1 句指定一個改寫策略）\n- 從「恐懼訴求 / 反差敘事 / 數字證據 / 故事帶入 / 反問句」五選一，給後面寫手用。` + brandPrefix,
    `原文案：\n${material}\n讀者：${audience}`,
  );

  const rewritten = await call(
    `你是資深 copywriter。**嚴格依照診斷師處方指定的策略**改寫，不要自選策略。輸出 1 個完整改寫版本，跟原文案一樣的長度範圍。` + brandPrefix,
    `原文案：\n${material}\n讀者：${audience}\n\n[診斷師的處方]\n${diagnosis}`,
  );

  const final = await call(
    `你是 CTA 設計與收尾編輯。讀上方診斷處方與改寫版本，輸出：\n\n**最終文案**\n（改寫版微調後，不超過原文案 1.2 倍長度）\n\n**CTA**\n（一行，動詞起手，不超過 12 字）\n\n**改了什麼**（30 字內 — 跟原文案差在哪）` + brandPrefix,
    `原文案：\n${material}\n\n[診斷處方]\n${diagnosis}\n\n[改寫版本]\n${rewritten}`,
  );

  const parsed = parseFinal(final);
  try {
    parsed.rewritten = await enforceBrandRulesOnText(input.brandId ?? undefined, parsed.rewritten);
  } catch { /* fail-safe：規則引擎壞掉不擋改寫結果 */ }
  return parsed;
}
