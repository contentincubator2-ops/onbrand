/**
 * brandPacks — 註冊表與解析。
 *
 * 加一個新客戶的完整流程（給用 Claude Code 開發的人看）：
 *   1. 複製 wugan.ts 成 <客戶>.ts，改 key / brandName / match / channels / cards
 *   2. 在下面的 PACKS 陣列加一行
 *   3. 跑 npx vitest run server/_core/brandPacks/brandPacks.test.ts
 * 沒有資料庫欄位要改，沒有 migration，沒有後台要點。
 *
 * 解析規則：brandId 命中優先於 brandName。任一命中就套用該 pack，該品牌
 * 的頻道列與卡片清單「完全」由 pack 決定；沒命中就是今天的全域行為，
 * 一個位元都不變。
 */
import type { FBTaskTemplate, OrchestraConfig } from "../quickTaskFB";
import type { BrandPack, BrandPackCard } from "./types";
import { DEFAULT_TASK_SOURCE, type TaskSource } from "../taskSource";
import { WUGAN_PACK } from "./wugan";

/** 所有已建置的客戶任務包。加新客戶就在這裡加一行。 */
export const PACKS: BrandPack[] = [
  WUGAN_PACK,
];

export type { BrandPack, BrandPackCard } from "./types";

/**
 * 找出這個品牌適用的 pack。兩個參數都給時 brandId 優先。
 * 回傳 null 代表「沒有客製包」，呼叫端要維持既有的全域行為。
 */
export function resolveBrandPack(args: {
  brandId?: number | null;
  brandName?: string | null;
}): BrandPack | null {
  const { brandId, brandName } = args;
  if (brandId != null) {
    const byId = PACKS.find((p) => p.match.brandIds?.includes(brandId));
    if (byId) return byId;
  }
  if (brandName) {
    const trimmed = brandName.trim();
    const byName = PACKS.find((p) => p.match.brandNames?.some((n) => n.trim() === trimmed));
    if (byName) return byName;
  }
  return null;
}

/** pack 卡片的 task id（custom 用 template.id，ref 用 ref）。 */
export function packCardId(card: BrandPackCard): string {
  return card.kind === "custom" ? card.template.id : card.ref;
}

/**
 * 用 task id 找出 pack 裡的自訂 template。
 *
 * 刻意不需要 brandId：quickTaskRouter 的五個查表點裡，regenerateVariant
 * 那個拿不到 brandId（它只有 outputId → taskId）。pack 卡的 id 一律帶
 * 品牌前綴（wg-…），跨 pack 撞名的風險由 brandPacks.test.ts 鎖住。
 */
export function findPackTemplate(taskId: string): FBTaskTemplate | null {
  for (const pack of PACKS) {
    for (const card of pack.cards) {
      if (card.kind === "custom" && card.template.id === taskId) return card.template;
    }
  }
  return null;
}

/** 用 task id 找出 pack 裡的自訂 orchestra config。 */
export function findPackOrchestraConfig(taskId: string): OrchestraConfig | null {
  for (const pack of PACKS) {
    for (const card of pack.cards) {
      if (card.kind === "custom" && card.template.id === taskId) return card.config;
    }
  }
  return null;
}

/**
 * 這張 task id 是否為某個 pack 的專屬卡 —— 專屬卡不得出現在其他品牌的目錄。
 *
 * 只算 kind:"custom"。kind:"ref" 指向的本來就是全域卡，它在全域目錄裡是
 * 公開的，pack 只是把它收進來並改個標題，不該因此對別人隱藏。
 */
export function isPackTaskId(taskId: string): boolean {
  return findPackTemplate(taskId) !== null;
}

/**
 * 把 pack 展開成 listFB 要回傳的卡片形狀。
 *
 * `globalById` 是全域目錄（id → 卡片物件），供 kind:"ref" 的卡沿用。
 * 找不到對應全域卡的 ref 會被丟掉而不是拋錯 —— 全域目錄退役一張卡時，
 * 客戶的任務頁應該少一張，而不是整頁 500。這種情況由測試抓，不在執行期爆。
 */
export function expandPackCards(
  pack: BrandPack,
  globalById: Map<string, any>,
): any[] {
  const out: any[] = [];
  for (const card of pack.cards) {
    if (card.kind === "custom") {
      out.push({
        ...card.template,
        source: sourceForPackCard(pack, card, card.template.source),
        kind: "fast" as const,
        platform: card.channel,
        packFormat: card.format,
        packOrigin: card.origin,
      });
      continue;
    }
    const base = globalById.get(card.ref);
    if (!base) continue; // 全域卡退役了，靜默略過；測試會紅
    out.push({
      ...base,
      label: card.label ?? base.label,
      description: card.description ?? base.description,
      source: sourceForPackCard(pack, card, base.source),
      platform: card.channel,
      packFormat: card.format,
      packOrigin: card.origin,
    });
  }
  return out;
}

/**
 * 客製卡的結構來源。
 *
 * 卡片自己標了就用自己的 —— 拆自得獎案例或標竿品牌的卡（gusheng /
 * urenshenghuo 的 CARD_EXEMPLARS）會走這條。
 *
 * 沒標的就從 `origin` 推導，不編任何東西：origin="brand" 的定義本來就是
 * 「這張是客戶自己的做法」，那就是品牌方法論；origin="sowork" 是套我們的
 * 通用結構，回長青公式。
 */
function sourceForPackCard(
  pack: BrandPack,
  card: BrandPackCard,
  own: TaskSource | undefined,
): TaskSource {
  if (own) return own;
  if (card.origin === "brand") {
    return { type: "brand-method", short: pack.brandName };
  }
  return DEFAULT_TASK_SOURCE;
}

/** 前端頻道列與 pill 需要的結構。沒有 pack 就回 null（= 顯示全部）。 */
export function packNavForBrand(args: {
  brandId?: number | null;
  brandName?: string | null;
}): {
  packKey: string;
  channels: { key: string; labelZh: string; labelEn: string; formats: { id: string; labelZh: string; labelEn: string }[] }[];
} | null {
  const pack = resolveBrandPack(args);
  if (!pack) return null;
  return {
    packKey: pack.key,
    channels: pack.channels.map((c) => ({
      key: c.key,
      labelZh: c.labelZh,
      labelEn: c.labelEn,
      formats: c.formats.map((f) => ({ id: f.id, labelZh: f.labelZh, labelEn: f.labelEn })),
    })),
  };
}
