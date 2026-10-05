/**
 * campaignRetune — 一篇被拖到另一段之後，把「這一篇要講什麼」照新那一段的策略改寫。
 *
 * 2026-10-06（CJ「時間軸讓用戶可以新增、拖曳或刪除，但拖曳後，要問用戶，是否要按照該階段
 * 策略調整內容」）：預熱期的一篇拖到倒數期，日期變了，要講的還是「為什麼現在該注意」——
 * 那一段該做的事（把期限變成理由）它一個字都沒做到。所以拖完問一句，使用者說好才改。
 *
 * 跟對話、手動加篇同一條路：這裡只回新的一句、不寫入，畫面併進企劃後送 savePlan。
 * 題目沒有換——還是同一張卡、同一個通路、同一個題材，只是換成那一段該用的講法。
 */
import { PHASE_PURPOSE, safeJSON, type CampaignPhaseId, type CampaignPlan } from "./campaignPlan.js";

const PHASE_ZH: Record<CampaignPhaseId, string> = { teaser: "預熱", launch: "開賣", sustain: "加溫", lastcall: "倒數", encore: "返場" };

export interface RetuneInput {
  /** 被拖的那一篇（畫面上的值——可能還沒存進資料庫）。 */
  itemId: string; platform: string; taskLabel: string; angle: string; date: string;
  /** 拖到哪一段。 */
  phase: CampaignPhaseId;
  /** 原本在哪一段（有給就寫進提示，模型才知道是從哪種講法換過來）。 */
  fromPhase?: CampaignPhaseId | null;
}

const SYSTEM = `你是負責「檔期宣傳」的資深行銷企劃。企劃裡有一篇貼文被使用者從一個階段挪到另一個階段，你要把「這一篇要講什麼」改成新階段該用的講法。

鐵則：
- 題材不換：還是原本那一篇在講的東西（同一個產品、同一個切入點），只換成新階段的目的與語氣。
- 寫的是「給寫手的內容方向」，不是貼文文案也不是口號：不要用問句開場、不要驚嘆號、不要對讀者喊話。
- 一句話，25–45 字，具體到寫的人不必再想：講清楚這一篇的切角，以及新階段要它多做到的那件事。
- 原本那一句裡的具體名詞（對象、產品、情境、平台名稱）要留著，不要換成「AI 幫忙」這種泛稱。
- 優惠機制、售價、期限、份量這些數字，只能用提供的，不准自己編；成效數據、顧客見證、
  「限量」「名額有限」這類稀缺條件、網址，沒提供就不要寫。
- 不要說產品或功能會關閉、下架、漲價、停止供應——除非提供的資料就是這樣寫的。期限只能照
  「這一段要讓人記住的訊息」與優惠機制裡寫的講。
- 預熱階段不要把折數講完；返場階段不要再催「最後一天」。
- 不要跟同一段其他篇講一樣的事。
- 只輸出一個 JSON 物件，只有 angle 一個鍵，值就是改好的那一句。`;

/** 給模型的那一段。純函式，有測試。 */
export function retunePrompt(args: {
  input: RetuneInput;
  plan: Pick<CampaignPlan, "smp" | "items" | "phaseMessages">;
  mechanic: string;
  eventName: string;
}): string {
  const { input, plan } = args;
  const siblings = plan.items
    .filter((i) => i.phase === input.phase && i.id !== input.itemId && i.enabled && i.angle)
    .slice(0, 8)
    .map((i) => `- ${i.date}｜${i.platform}｜${i.angle}`);
  const message = plan.phaseMessages?.[input.phase] ?? "";
  return [
    `【活動】${args.eventName}`,
    plan.smp ? `【一句話訴求】${plan.smp}` : "",
    args.mechanic.trim() ? `【優惠機制／活動內容】${args.mechanic.trim().slice(0, 600)}` : "",
    `【這一篇】${input.date}｜${input.platform}｜任務卡：${input.taskLabel}`,
    `【原本要講什麼】${input.angle}`,
    input.fromPhase && input.fromPhase !== input.phase
      ? `【原本在】${PHASE_ZH[input.fromPhase]}期（${PHASE_PURPOSE[input.fromPhase]}）` : "",
    `【現在挪到】${PHASE_ZH[input.phase]}期——這一段要做到：${PHASE_PURPOSE[input.phase]}`,
    message ? `【這一段要讓人記住的訊息】${message}` : "",
    siblings.length ? `【同一段已經排的其他篇（不要重複）】\n${siblings.join("\n")}` : "",
    "",
    `把「原本要講什麼」改成${PHASE_ZH[input.phase]}期該用的講法（25–45 字）。只輸出一個 JSON 物件，只有 angle 一個鍵，值是改好的那一句。`,
  ].filter(Boolean).join("\n");
}

/**
 * 模型回的東西 → 可以放進企劃的一句。讀不出來、太短、或跟原本一樣就回 null
 * （「調整了但其實沒變」要讓使用者知道，不能假裝改過）。純函式，有測試。
 */
export function cleanRetuned(text: string, previous: string): string | null {
  const parsed = safeJSON<any>(text, null);
  // 弱一點的模型會把格式說明也抄進去（{"angle":"說明":"真正的那一句"}），整段讀不成 JSON——
  // 這時拿最後一個引號裡的字串（2026-10-06 本機實測遇到）。完全沒有 JSON 的樣子就不救。
  const quoted = /"angle"/.test(text) ? [...text.matchAll(/"([^"\n]{4,})"/g)].map((m) => m[1]!).filter((q) => q !== "angle") : [];
  const raw = typeof parsed?.angle === "string" ? parsed.angle : quoted[quoted.length - 1] ?? "";
  const angle = raw.replace(/\s+/g, " ").replace(/^[「『"'“]+|[」』"'”]+$/g, "").trim().slice(0, 200);
  if (angle.length < 4) return null;
  if (angle === previous.replace(/\s+/g, " ").trim()) return null;
  return angle;
}

/** 問模型一次。失敗就丟——畫面會說沒改成，內容維持原樣。 */
export async function retuneItemAngle(args: {
  input: RetuneInput;
  plan: Pick<CampaignPlan, "smp" | "items" | "phaseMessages">;
  mechanic: string;
  eventName: string;
  brandId: number;
  eventId: number;
}): Promise<string> {
  // 跟排企劃同一份品牌大腦（含這檔活動的定位）：改出來的角度才不會離開品牌的講法。
  const { buildBrandPrefix } = await import("../../../strategy/core/brand/brandContext");
  const brain = await buildBrandPrefix(args.brandId, null, args.eventId, "full").catch(() => "");
  const { invokeLLM } = await import("../../../platform/core/llm/llm.js");
  const r = await invokeLLM({
    messages: [
      { role: "system", content: brain ? `${SYSTEM}\n\n# 品牌大腦（角度要扣回這裡）${brain}` : SYSTEM },
      { role: "user", content: retunePrompt(args) },
    ],
    maxTokens: 400,
  });
  const angle = cleanRetuned(String(r.choices?.[0]?.message?.content ?? ""), args.input.angle);
  if (!angle) throw new Error("這一次沒有改出不一樣的內容，原本的先留著；可以再試一次，或直接改字");
  return angle;
}
