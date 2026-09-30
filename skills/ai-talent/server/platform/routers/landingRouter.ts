/**
 * landingRouter — 首頁（未登入）用的公開資料。
 *
 * 2026-09-30（CJ 首頁改版：「本月爆款卡牆」＋「七個通路＋規格圖卡」）。
 * 首頁要證明「我們每個月替你消化市場」，最有力的是直接擺出當月真的卡，
 * 而且跟著目錄自動換，不要手抄一份會過期的 client 副本。
 *
 * 只回卡面上本來就印出來的東西（標題、出處、數字、量測年月、註、參考文章），
 * prompt 與 SKILL 內文一律不出 server。
 */
import { router, publicProcedure } from "../core/trpc";
import { buildTaskCatalogIndex, type CatalogPlatform } from "../../content/core/taskCatalogIndex";
import { isRecentViral } from "../../content/core/taskSource";
import { PLATFORM_IMAGE_SPECS, IMAGE_CHANNELS } from "../../content/core/platformImageSpecs";

/** 首頁上線中的七個通路（與 IMAGE_CHANNELS 同一組）。 */
const LANDING_CHANNELS = new Set<CatalogPlatform>(IMAGE_CHANNELS);

export interface LandingViralCard {
  id: string;
  platform: CatalogPlatform;
  labelZh: string;
  labelEn: string;
  short: string;
  metric: string;
  asOf: string;
  caveat: string | null;
  url: string | null;
}

/**
 * 近三個月的爆款卡，新到舊，同一通路先各取一張再補，最多 `limit` 張。
 * 讓卡牆看起來是「各平台都有」而不是整排 FB。
 */
export function pickLandingViralCards(limit = 4, now: Date = new Date()): LandingViralCard[] {
  const recent = buildTaskCatalogIndex()
    .filter((t) => LANDING_CHANNELS.has(t.platform) && isRecentViral(t.source, now) && !!t.source.metric)
    .sort((a, b) => (b.source.asOf ?? "").localeCompare(a.source.asOf ?? ""));
  const seen = new Set<string>();
  const first: typeof recent = [];
  const rest: typeof recent = [];
  for (const t of recent) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    (first.some((f) => f.platform === t.platform) ? rest : first).push(t);
  }
  return [...first, ...rest].slice(0, limit).map((t) => ({
    id: t.id,
    platform: t.platform,
    labelZh: t.labelZh,
    labelEn: t.labelEn,
    short: t.source.short ?? "",
    metric: t.source.metric ?? "",
    asOf: t.source.asOf ?? "",
    caveat: t.source.caveat ?? null,
    url: t.source.url ?? null,
  }));
}

export const landingRouter = router({
  showcase: publicProcedure.query(() => ({
    viralCards: pickLandingViralCards(4),
    imageSpecs: PLATFORM_IMAGE_SPECS.map((s) => ({
      id: s.id,
      channel: s.channel,
      labelZh: s.labelZh,
      labelEn: s.labelEn,
      descZh: s.descZh,
      descEn: s.descEn,
      width: s.width,
      height: s.height,
    })),
  })),
});
