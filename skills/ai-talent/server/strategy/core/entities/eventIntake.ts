/**
 * eventIntake — 新增活動時使用者自己說的「這檔活動要對誰說」。
 *
 * 2026-10-08（CJ「新建活動中，要包括詢問是否有目標受眾」）。
 *
 * 存在 events.positioning 最上層的 targetAudience（跟 note 同一層）。沒寫＝沒有指定，受眾照
 * 品牌的走。不放進 positioning.campaign：campaign.saveSettings 每次都整包換掉那一格，放進去
 * 存一次設定就不見了。
 *
 * 寫入端（新增活動視窗）不可信，所以清洗在讀的這一側做——所有讀的人都走 readEventIntake。
 *
 * 誰在讀：
 *   · 活動定位（positioningJobRunner）：當受眾錨點，蓋過品牌的官方客群
 *   · 推斷設定與排企劃（campaignPlan）
 *   · 品牌大腦的活動段（brandContext）：每一篇貼文與活動對話都讀得到
 *
 * 同一個視窗裡填的「活動連結」不在這裡：連結讀回來的內容跟上傳的檔案一樣，存成這檔活動的
 * 參考資料（strategy/core/entities/campaignChatSources.ts）。這裡只提供網址的清洗。
 */

export const INTAKE_AUDIENCE_MAX = 300;
/** 新增活動時最多給幾條連結。檔案最多 5 份，加起來剛好是一檔活動的參考資料上限（8 筆）。 */
export const INTAKE_LINKS_MAX = 3;
const LINK_MAX = 500;

export interface EventIntake {
  audience: string;
}

/** 一段文字或陣列 → 合法、不重複的 http(s) 網址，最多 max 個。純函式。 */
export function cleanLinks(raw: unknown, max = INTAKE_LINKS_MAX): string[] {
  const parts = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,，、;；]+/) : [];
  const out: string[] = [];
  for (const p of parts) {
    let s = String(p ?? "").trim();
    if (!s || s.length > LINK_MAX) continue;
    // 使用者常只貼 www.xxx.com／xxx.com/活動頁，沒帶 https://。
    if (!/^https?:\/\//i.test(s)) {
      if (!/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(s)) continue;
      s = `https://${s}`;
    }
    try {
      const u = new URL(s);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (!u.hostname.includes(".")) continue;
      if (!out.includes(u.href)) out.push(u.href);
    } catch { continue; }
    if (out.length >= max) break;
  }
  return out;
}

/** 從 events.positioning 讀出使用者指定的受眾（已清洗）。純函式。 */
export function readEventIntake(pos: unknown): EventIntake {
  const p = (pos && typeof pos === "object" ? pos : {}) as Record<string, unknown>;
  const audience = typeof p.targetAudience === "string"
    ? p.targetAudience.replace(/\s+/g, " ").trim().slice(0, INTAKE_AUDIENCE_MAX)
    : "";
  return { audience };
}

/** 用 eventId 直接讀（定位流程用；它手上沒有 positioning）。查不到回空的。 */
export async function loadEventIntake(eventId: number): Promise<EventIntake & { note: string }> {
  const { default: localPool } = await import("../../../localDb");
  const [rows]: any = await localPool.execute(`SELECT positioning FROM events WHERE id = ? LIMIT 1`, [eventId]);
  const raw = (rows as any[])[0]?.positioning;
  let pos: any = {};
  try { pos = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {}); } catch { pos = {}; }
  return { ...readEventIntake(pos), note: typeof pos?.note === "string" ? pos.note.trim().slice(0, 800) : "" };
}
