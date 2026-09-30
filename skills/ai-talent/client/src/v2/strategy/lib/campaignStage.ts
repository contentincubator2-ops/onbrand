/**
 * campaignStage — 策略層活動頁（CampaignStage.tsx）要算的東西。純函式、有測試。
 *
 * 2026-09-30（CJ 選了 Tesla 分割畫面：「左邊的準備等階段，要增加一個總覽…按下去後，
 * 右邊會按照階段時間，所使用的管道，列出總覽，當你要看加溫期的時候，右邊才會
 * ZOOM IN 到加溫期的傳播管道和訊息和內容安排」）。
 *
 * 畫面上的每一樣東西都從企劃本身算出來，不另外存：
 *   · 階段（地圖的橫軸、傳播圈的圈）＝企劃裡真的有排文的階段
 *   · 通路（地圖的直軸、傳播圈的扇區）＝有排文的通路＋設定裡選了但還沒排的
 *   · 提醒＝空窗、沒排到的通路這種看一眼就知道、不需要模型的事
 *
 * 底圖（CJ「汽車業是起點到終點的地圖、餐飲是從原料做成菜、文具是零件組成一支
 * 馬克筆」）是另一層，不在這裡算。
 */
import { CHANNEL_META } from "../../content/lib/channelMeta";
import { CAMPAIGN_PHASES, type CampaignPhaseId, type CampaignPlanItem } from "./campaignSchema";

export interface StagePhase {
  id: CampaignPhaseId;
  /** YYYY-MM-DD */
  from: string;
  to: string;
  count: number;
}

const PHASE_ORDER = CAMPAIGN_PHASES.map((p) => p.id);
const CHANNEL_ORDER = Object.keys(CHANNEL_META);

const live = (items: CampaignPlanItem[]) => items.filter((i) => i.enabled);

/**
 * 企劃裡有的階段，照檔期順序。一段裡的文全部按了「這篇不做」，那一段還是留著
 * （count 是 0）——不然就沒有地方可以把它們放回來。
 */
export function stagePhases(items: CampaignPlanItem[]): StagePhase[] {
  const out: StagePhase[] = [];
  for (const id of PHASE_ORDER) {
    const list = items.filter((i) => i.phase === id).map((i) => i.date).sort();
    if (!list.length) continue;
    out.push({ id, from: list[0]!, to: list[list.length - 1]!, count: live(items).filter((i) => i.phase === id).length });
  }
  return out;
}

/** 地圖的直軸：有排文的通路，加上設定裡選了但一篇都還沒排的（空的那條也要看得到）。 */
export function stageLanes(items: CampaignPlanItem[], channels: string[]): string[] {
  const used = new Set(live(items).map((i) => i.platform));
  for (const c of channels) used.add(c);
  return [...used].sort((a, b) => {
    const ia = CHANNEL_ORDER.indexOf(a), ib = CHANNEL_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

const DAY = 86_400_000;
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);

/** 左上角的大數字。開始前是倒數，進行中是第幾天，結束後就說結束了。 */
export function countdown(startAt: string | null, endAt: string | null, today: string): { big: string; unitZh: string; unitEn: string } {
  if (!startAt) return { big: "—", unitZh: "還沒設定期間", unitEn: "No dates yet" };
  const toStart = daysBetween(today, startAt);
  if (toStart > 0) return { big: String(toStart), unitZh: "天後開始", unitEn: toStart === 1 ? "day to go" : "days to go" };
  if (endAt && daysBetween(endAt, today) > 0) return { big: "✓", unitZh: "活動已結束", unitEn: "Ended" };
  const nth = -toStart + 1;
  return { big: String(nth), unitZh: "活動第幾天", unitEn: nth === 1 ? "day in" : "days in" };
}

export interface StageNote { zh: string; en: string }

/**
 * 看一眼就知道的提醒。只講事實（哪幾天空著、哪個通路沒排），不替使用者下判斷——
 * 要不要補是策略決定。phase 給了就只看那一段。
 */
export function stageNotes(items: CampaignPlanItem[], channels: string[], phase: CampaignPhaseId | null): StageNote[] {
  const scope = live(items).filter((i) => !phase || i.phase === phase);
  const notes: StageNote[] = [];
  const dates = [...new Set(scope.map((i) => i.date))].sort();
  let gap = { days: 0, from: "", to: "" };
  for (let k = 1; k < dates.length; k++) {
    const d = daysBetween(dates[k - 1]!, dates[k]!);
    if (d > gap.days) gap = { days: d, from: dates[k - 1]!, to: dates[k]! };
  }
  if (gap.days >= 10) {
    const md = (s: string) => s.slice(5).replace("-", "/");
    notes.push({
      zh: `${md(gap.from)} 到 ${md(gap.to)} 之間有 ${gap.days - 1} 天沒有排文。`,
      en: `Nothing scheduled for ${gap.days - 1} days between ${md(gap.from)} and ${md(gap.to)}.`,
    });
  }
  const used = new Set(scope.map((i) => i.platform));
  const missing = channels.filter((c) => !used.has(c));
  if (missing.length) {
    const zh = missing.map((c) => CHANNEL_META[c]?.zh ?? c).join("、");
    const en = missing.map((c) => CHANNEL_META[c]?.en ?? c).join(", ");
    notes.push({
      zh: phase ? `這一段沒有排 ${zh}。` : `${zh} 選了，但整檔一篇都沒排。`,
      en: phase ? `No ${en} posts in this phase.` : `${en} is selected but has no posts.`,
    });
  }
  if (!notes.length && scope.length) {
    notes.push({
      zh: phase ? `這一段 ${scope.length} 篇，沒有明顯的空窗。` : `整檔 ${scope.length} 篇，沒有明顯的空窗。`,
      en: phase ? `${scope.length} posts in this phase, no obvious gaps.` : `${scope.length} posts, no obvious gaps.`,
    });
  }
  return notes;
}

/** 階段的短名（階段列、傳播圈、地圖標題的空間都很小；完整名稱在 campaignSchema）。 */
const PHASE_SHORT: Record<CampaignPhaseId, { zh: string; en: string }> = {
  teaser: { zh: "預熱", en: "Teaser" },
  launch: { zh: "開賣", en: "Launch" },
  sustain: { zh: "加溫", en: "Sustain" },
  lastcall: { zh: "倒數", en: "Last call" },
  encore: { zh: "返場", en: "Encore" },
};

export function phaseShort(id: CampaignPhaseId, en: boolean): string {
  const p = PHASE_SHORT[id];
  return p ? (en ? p.en : p.zh) : id;
}
