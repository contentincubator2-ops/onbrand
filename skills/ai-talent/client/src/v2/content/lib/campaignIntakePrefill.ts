/**
 * campaignIntakePrefill — 從活動企劃開卡時，把我們**已經知道的**答案填進任務卡的欄位。
 *
 * 2026-09-25（CJ「他忘記帶入日期時間了，本來在活動企畫中，有該則貼文要發布的時間」）：
 * 從企劃按「去寫這篇」進來，卡片卻還在問「日期 / 時間 *」「為什麼參加 / 重點 *」——
 * 這兩格的答案早就在活動設定裡（期間、優惠機制），使用者卻要再打一次。被系統問
 * 一個它自己已經知道的問題，比沒有預填更糟：那等於在說剛才填的東西沒人看。
 *
 * ── 為什麼是一支純函式 ───────────────────────────────────────────────
 * 對映規則會長（未來每加一種卡、每加一個欄位都可能要補一條），而錯的樣子在畫面上
 * 很難看出來——填錯欄位跟沒填一樣安靜。所以規則集中在這裡並且有測試。
 *
 * ── 三條原則 ─────────────────────────────────────────────────────────
 * 1. **只填空的格子**：使用者打過的字永遠不覆蓋。
 * 2. **只填我們真的知道的**：活動沒設地點就不要編一個；寧可讓那格留空讓使用者填，
 *    也不要塞一個看起來像答案的東西（那會直接變成文案裡的假事實）。
 * 3. **主要欄位看卡片在問什麼**：問「活動名稱 + 日期」就給活動名稱與期間，問別的
 *    就給企劃寫好的切角。切角塞進「活動名稱」那一格，產出的貼文標題會很怪。
 */

export interface CampaignIntakeCtx {
  /** 活動名稱 */
  eventName: string;
  /** YYYY-MM-DD */
  startAt?: string | null;
  endAt?: string | null;
  /** 這一篇在企劃上的發布日 */
  itemDate?: string | null;
  /** 優惠機制／活動內容（使用者在活動設定寫的那一句） */
  mechanic?: string | null;
  venue?: string | null;
  sessions?: string | null;
  signupUrl?: string | null;
  /** 企劃替這一篇寫好的切角 */
  angle?: string | null;
}

export interface IntakeFieldLike { key: string; label?: string; type?: string; required?: boolean }

const has = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** 活動什麼時候發生——期間優先，只有單日就寫單日，都沒有才退回這一篇的發布日。 */
export function campaignWhen(ctx: CampaignIntakeCtx): string {
  if (has(ctx.startAt) && has(ctx.endAt) && ctx.startAt !== ctx.endAt) return `${ctx.startAt} 至 ${ctx.endAt}`;
  if (has(ctx.startAt)) return ctx.startAt!;
  if (has(ctx.endAt)) return ctx.endAt!;
  if (has(ctx.itemDate)) return ctx.itemDate!;
  return "";
}

/** 這一篇的重點：優惠機制是事實，切角是這一篇怎麼講——兩個都有就都給。 */
function whyText(ctx: CampaignIntakeCtx): string {
  return [ctx.mechanic, ctx.angle].filter(has).join("\n").trim();
}

// 邊界用 (^|_|\s) / (_|\s|$)：比對的字串是 `key 空白 label`（例如「event_when 日期 / 時間」），
// 只允許底線與字串結尾的話，`venue 地點` 這種最常見的形狀反而比不到——第一版就是這樣漏的。
const B0 = String.raw`(^|_|\s)`;
const B1 = String.raw`(_|\s|$)`;
const re = (body: string, zh: string) => new RegExp(`${B0}(?:${body})${B1}|${zh}`, "i");

const RE = {
  when:     re("when|date|time|datetime|schedule", "日期|時間|檔期|期間"),
  name:     re("event_?name|campaign_?name|title", "活動名稱|活動標題"),
  why:      re("why|benefit|highlight|offer|mechanic|detail|point", "重點|為什麼|好處|優惠|內容|亮點"),
  venue:    re("venue|place|location|address", "地點|場地"),
  signup:   re("signup|register|url|link|cta_?link", "報名|連結|網址"),
  sessions: re("session|round", "場次"),
};

/** 這一格我們答得出來嗎？答得出來就回答案，答不出來回空字串（＝不要填）。 */
export function answerFor(field: IntakeFieldLike, ctx: CampaignIntakeCtx): string {
  const probe = `${field.key} ${field.label ?? ""}`;
  // 順序有意義：活動名稱與日期都可能命中 when（「活動名稱 + 日期」），名稱先判。
  if (RE.name.test(probe)) return ctx.eventName ?? "";
  if (RE.when.test(probe)) return campaignWhen(ctx);
  if (RE.venue.test(probe)) return has(ctx.venue) ? ctx.venue! : "";
  if (RE.sessions.test(probe)) return has(ctx.sessions) ? ctx.sessions! : "";
  if (RE.signup.test(probe)) return has(ctx.signupUrl) ? ctx.signupUrl! : "";
  if (RE.why.test(probe)) return whyText(ctx);
  return "";
}

export interface PrefillResult {
  /** 主要輸入框要填什麼（空字串＝維持既有行為，用切角）。 */
  primary: string;
  /** 次要欄位 key → 值。只包含我們真的答得出來的。 */
  extras: Record<string, string>;
}

/**
 * 依卡片的欄位定義，算出這次要預填什麼。
 * `existing` 是使用者已經打的字——有值的 key 一律不動。
 */
export function campaignPrefill(args: {
  primaryKey?: string | null;
  primaryLabel?: string | null;
  fields?: IntakeFieldLike[] | null;
  ctx: CampaignIntakeCtx;
  existing?: Record<string, string>;
}): PrefillResult {
  const { ctx } = args;
  const existing = args.existing ?? {};
  const extras: Record<string, string> = {};

  for (const f of args.fields ?? []) {
    if (!f?.key) continue;
    if (has(existing[f.key])) continue;                 // 使用者打過的不覆蓋
    if (args.primaryKey && f.key === args.primaryKey) continue;   // 主要欄位另外處理
    const v = answerFor(f, ctx);
    if (has(v)) extras[f.key] = v;
  }

  // 主要欄位：卡片問的是活動名稱／日期這類我們知道的事，就照答；否則交給切角。
  let primary = "";
  if (args.primaryKey) {
    const answered = answerFor({ key: args.primaryKey, label: args.primaryLabel ?? "" }, ctx);
    const isNameOrWhen = RE.name.test(`${args.primaryKey} ${args.primaryLabel ?? ""}`)
      || RE.when.test(`${args.primaryKey} ${args.primaryLabel ?? ""}`);
    if (isNameOrWhen && has(answered)) {
      const when = campaignWhen(ctx);
      // 「活動名稱 + 日期？」這種問法要兩個一起給，只給名稱等於沒回答完。
      primary = RE.name.test(`${args.primaryKey} ${args.primaryLabel ?? ""}`) && has(when) && has(ctx.eventName)
        ? `${ctx.eventName}（${when}）`
        : answered;
    }
  }
  return { primary, extras };
}
