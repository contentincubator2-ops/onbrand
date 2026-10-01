/**
 * campaignItemBrief — 從活動企劃開卡寫「某一篇」時，告訴寫手這一篇在企劃裡的位置，
 * 以及它要不要下廣告。
 *
 * 2026-09-30（CJ「廣告文案要標註」）：企劃上標了「廣告」的那幾篇，到內容層寫的時候
 * 以前完全不知道自己是廣告——跟一般貼文用同一套寫法、產出也沒有任何標記。現在：
 *   · 寫的時候：這一段接在品牌大腦後面，要求寫成廣告文案（冷受眾看得懂、第一句抓人、
 *     明確 CTA、避開廣告審核會擋的說法）。
 *   · 寫完之後：產出的 metadata 帶 campaignItem.paid，產出頁與本週企劃標「廣告文案」。
 *
 * 品牌大腦只知道「哪一檔活動」，不知道「哪一篇」，所以這段另外組，不塞進 brandContext。
 */
import localPool from "../../localDb.js";
import { campaignLink, cleanLandingUrl } from "../../performance/core/perfUtm.js";

const PHASE_ZH: Record<string, string> = { teaser: "預熱", launch: "開賣", sustain: "加溫", lastcall: "倒數", encore: "返場" };

export interface CampaignItemRef { eventId: number; itemId: string }
export interface CampaignItemInfo {
  eventId: number; itemId: string; paid: boolean; phase: string; date: string; angle: string; phaseMessage: string;
  /** 2026-09-30 成效第 2 步：這一篇的追蹤連結（活動設了導流網址才有）。 */
  link?: string | null;
}

/** 企劃裡的那一篇 → 給寫手的一段說明。純函式。 */
export function campaignItemBriefText(info: CampaignItemInfo): string {
  const lines = [
    `- 這一篇排在 ${info.date}，屬於${PHASE_ZH[info.phase] ?? info.phase}期${info.phaseMessage ? `；這一段要讓人記住：「${info.phaseMessage}」` : ""}`,
    info.angle ? `- 這一篇要講的：${info.angle}` : "",
    info.paid
      ? "- 這一篇會下廣告（付費投放）。請寫成廣告文案：看到的人多半還沒追蹤這個品牌，第一句就要讓他停下來；講清楚對他有什麼好處、下一步做什麼（一個明確的行動呼籲）；不要只對老粉絲說話；避開保證效果、誇大比較、個人化指稱（例如「你是不是很胖」）這類廣告審核會擋的說法。"
      : "",
    info.link ? `- 文中要放連結時，一律用這一個（帶追蹤碼，不要改、不要縮）：${info.link}` : "",
  ].filter(Boolean);
  return `\n\n[本篇在活動企劃中的位置]\n${lines.join("\n")}\n`;
}

/** 讀那一篇。只讀這個帳號自己的活動；找不到就回 null（不擋寫文）。 */
export async function loadCampaignItem(ref: CampaignItemRef, userId: number): Promise<CampaignItemInfo | null> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT positioning FROM events WHERE id = ? AND userId = ? LIMIT 1`, [ref.eventId, userId],
    );
    const raw = (rows as any[])[0]?.positioning;
    const pos = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
    const plan = pos?.campaignPlan;
    const it = (plan?.items ?? []).find((i: any) => i?.id === ref.itemId);
    if (!it) return null;
    const landing = cleanLandingUrl(pos?.campaignPerf?.landingUrl);
    return {
      link: landing ? campaignLink(landing, { eventId: ref.eventId, itemId: ref.itemId, phase: String(it.phase ?? ""), platform: String(it.platform ?? ""), paid: !!it.paid }) : null,
      eventId: ref.eventId, itemId: ref.itemId, paid: !!it.paid,
      phase: String(it.phase ?? ""), date: String(it.date ?? ""), angle: String(it.angle ?? ""),
      phaseMessage: String(plan?.phaseMessages?.[it.phase] ?? ""),
    };
  } catch {
    return null;
  }
}
