/**
 * craftFallback.test — 每一張任務卡都拿得到一個具名案例。
 *
 * 2026-09-05 CJ 問「每一個任務卡片，是否都有參考某個得獎案例或爆款文章」。
 * 稽核盛全那 32 張的答案是「只有 1 張」，而原因是結構性的：
 * fbCraft / igCraft / liCraft / edmCraft 各有一份 XX_TASK_REF，**key 是精確
 * task id**，只有全域目錄那些卡在表上。品牌任務包的自建卡 id 永遠不在裡面，
 * 所以 xxPlaybookFor() 回得了結構、回不了案例 —— 平台準則本身其實掛滿真案例
 * （Shorty Award / Cannes Lions B2B / IAC / CMI / LinkedIn Top Voices），只是
 * 傳不到自建卡。
 *
 * 2026-09-06 修法：每個分支自帶 fallback，fallback 一律沿用該模組**自己**
 * 案例池裡既有的條目，不新增任何得獎宣稱。
 *
 * 這支測試鎖的是結果而不是實作：不管四個模組內部怎麼改，只要有一張真實的
 * pack 卡拿不到案例就要紅。放在獨立檔案是因為 brandPacks.test.ts 同期有其他
 * session 在動，分開才不會互相蓋掉。
 */
import { describe, it, expect } from "vitest";
import { PACKS, packCardId } from "./brandPacks";
import { isFacebookBodyTask, fbPlaybookFor } from "./fbCraft";
import { isInstagramBodyTask, igPlaybookFor } from "./igCraft";
import { isLinkedInBodyTask, liPlaybookFor } from "./liCraft";
import { isEmailBodyTask, edmPlaybookFor } from "./edmCraft";
import { isWebsiteBodyTask, webPlaybookFor } from "./webCraft";
import { isTikTokBodyTask, ttPlaybookFor } from "./ttCraft";
import { isYouTubeBodyTask, ytPlaybookFor } from "./ytCraft";
import { isPRBodyTask, prPlaybookFor } from "./prCraft";
import { isBrandStrategyBodyTask, brPlaybookFor } from "./brCraft";
import { isKOLBodyTask, klPlaybookFor } from "./klCraft";
import { isResearchBodyTask, rsPlaybookFor } from "./rsCraft";
import { isCrossplatformBodyTask, cwPlaybookFor } from "./cwCraft";
import type { FBTaskTemplate } from "./quickTaskFB";

/**
 * 順序要跟 quickTaskOrchestra 組 prompt 時的判斷順序一致 —— 一張卡可能同時
 * 命中兩個模組，實際注入哪一個由那邊決定，這裡要看的是同一個答案。
 */
const PROBES: { name: string; matches: (t: FBTaskTemplate) => boolean; playbook: (id: string) => string }[] = [
  { name: "EM", matches: isEmailBodyTask, playbook: edmPlaybookFor },
  { name: "IG", matches: isInstagramBodyTask, playbook: igPlaybookFor },
  { name: "FB", matches: isFacebookBodyTask, playbook: fbPlaybookFor },
  { name: "LI", matches: isLinkedInBodyTask, playbook: liPlaybookFor },
  { name: "TT", matches: isTikTokBodyTask, playbook: ttPlaybookFor },
  { name: "YT", matches: isYouTubeBodyTask, playbook: ytPlaybookFor },
  { name: "PR", matches: isPRBodyTask, playbook: prPlaybookFor },
  { name: "BR", matches: isBrandStrategyBodyTask, playbook: brPlaybookFor },
  { name: "KOL", matches: isKOLBodyTask, playbook: klPlaybookFor },
  { name: "RS", matches: isResearchBodyTask, playbook: rsPlaybookFor },
  { name: "CW", matches: isCrossplatformBodyTask, playbook: cwPlaybookFor },
  { name: "WEB", matches: isWebsiteBodyTask, playbook: webPlaybookFor },
];

/** 參考區塊的標題 —— 五個模組各自的寫法。 */
const CITES = /得獎參考|具名參考/;

/**
 * 刻意沒有工藝層的卡。每一條都要說得出理由，否則就是漏接而不是設計。
 *
 * 1. 一對一私訊（dm-intro）—— liCraft.isLinkedInBodyTask 明確排除，因為那份
 *    rubric 是給動態貼文的（前兩行決勝、開放問題引留言），套到私訊會寫出
 *    一則貼文而不是一句開場。案例改由 pack 自己的 CARD_EXEMPLARS 提供。
 * 2. 案例庫（wg-case-*，postType research）與內容行事曆（wg-cal-*，postType
 *    calendar）—— 這兩種產出不是「刊出去的文章形式」，是素材查找與當月規劃。
 *    全平台都沒有對應的 craft 模組，也不該有：得獎案例談的是寫作形式，對
 *    「找三個國際案例」或「排本月篇數」沒有可遷移的東西。
 * 3. 三個新頻道 —— Amazon 商品頁（amz-*）、課程（course-*）、異業合作
 *    （partnership-*）。2026-09 由其他 pack 陸續新增，全平台都還沒有對應的
 *    craft 模組。
 *
 *    這三條是**待補而不是設計**，跟上面兩條性質不同。官網在補 webCraft 之前
 *    是同樣的狀態：頻道加上去了、craft 模組沒跟上，於是那些卡拿到的是「沒有
 *    任何結構參考」的空白。Amazon listing、課程銷售頁、合作提案都有大量公開
 *    的最佳實務可以引用，值得各補一個模組。
 *
 *    列在這裡是為了讓它可見 —— 一個靜靜放過的例外，跟沒有測試是一樣的。
 */
const NO_CRAFT_BY_DESIGN = /dm-intro|-case-\d|-cal-|^amz-|^course-|^partnership-/;

describe("每張 pack 卡都拿得到一個具名案例", () => {
  const cards = PACKS.flatMap((p) =>
    p.cards.filter((c) => c.kind === "custom").map((c) => ({ pack: p.key, card: c })),
  );

  it("有卡可測（測試自己失效要先紅在這裡）", () => {
    expect(cards.length).toBeGreaterThan(20);
  });

  it.each(cards.map(({ pack, card }) => [`${pack}: ${packCardId(card)}`, card] as const))(
    "%s",
    (_label, card) => {
      if (card.kind !== "custom") return;
      const t = card.template;
      const id = t.id;

      const hit = PROBES.find((p) => p.matches(t));
      if (!hit) {
        // 沒有工藝層的，必須是刻意排除的那一種
        expect(
          NO_CRAFT_BY_DESIGN.test(id),
          `${id} 沒有任何工藝層，且不在刻意排除的名單裡`,
        ).toBe(true);
        return;
      }

      const line = hit.playbook(id);
      expect(line, `${id} 的 playbook 是空的`).toBeTruthy();
      expect(
        CITES.test(line),
        `${id} 走 ${hit.name} 工藝層，但 playbook 沒有附任何具名案例 —— ` +
        `該分支缺 fallback，或 fallback 指到不存在的案例 key`,
      ).toBe(true);
    },
  );
});

describe("fallback 只沿用既有案例，不會回空字串", () => {
  // fallbackKey 打錯字的話 XX_TASK_REF[key] 會是 undefined，playbook 就退回
  // 「只有結構、沒有案例」—— 跟修這件事之前一模一樣，而且不會有人發現。
  const SAMPLES: [string, (id: string) => string][] = [
    ["fb-brandpack-made-up-id", fbPlaybookFor],
    ["ig-brandpack-made-up-id", igPlaybookFor],
    ["li-brandpack-made-up-id", liPlaybookFor],
    ["em-brandpack-made-up-id", edmPlaybookFor],
    ["web-brandpack-made-up-id", webPlaybookFor],
  ];

  it.each(SAMPLES)("%s 這種沒見過的 id 也拿得到案例", (id, fn) => {
    const line = fn(id);
    expect(CITES.test(line), `${id} 落到預設分支卻沒有案例`).toBe(true);
    // 案例本身要有內容，不是只有標題
    const body = line.split(CITES)[1] ?? "";
    expect(body.trim().length, `${id} 的案例區塊是空的`).toBeGreaterThan(30);
  });
});
