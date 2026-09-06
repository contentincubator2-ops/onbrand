/**
 * Website craft layer — 2026-09-05 (CJ「重新檢查，每一個任務卡片，是否都有
 * 參考某個得獎案例或爆款文章」).
 *
 * ── 為什麼現在才有 ────────────────────────────────────────────────────
 * FB / IG / LI / TikTok / YouTube / Email / PR / Brand / KOL / Research 都有
 * 工藝層，只有官網沒有。官網頻道是 2026-08-29 才加的（quickTaskWebsite.ts），
 * 當時沒有跟著補 craft 模組，所以 `web-` 開頭的任務在 quickTaskOrchestra 裡
 * 完全沒有 craft block —— 稽核盛全 32 張卡時發現六張官網卡是全包裡唯一
 * 「一個範例都拿不到」的（另一張是刻意排除的私訊卡）。
 *
 * 而官網正是最長、對 B2B 最值錢的內容：案例研究、採購指南、FAQ。長文最需要
 * 結構參考，卻反而是唯一沒有的。
 *
 * ── 引用紀律（跟其他模組略有不同，刻意的）────────────────────────────
 * 這份的參考一律是「具名的公開作品 + 它為什麼是標竿」。獎項名稱只在我確定
 * 的情況下寫（例如 Patagonia「Don't Buy This Jacket」的公開紀錄），其餘一律
 * 寫成「業界廣泛引用」而不是掰一個獎。理由跟 brandPacks 的事實白名單同源：
 * 編造一個得獎紀錄，跟編造一張 ISO 認證是同一種錯誤，而且更難被發現。
 *
 * 來源原則不是來源創意：學可遷移的結構，不抄作品。
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/**
 * 官網長文的 postType。
 *
 * 2026-09-06：只靠 `web-` 前綴判斷是不夠的 —— 五感十築的官網卡叫 `wg-web-*`
 * （pack 早於「頻道放第一段」這個命名慣例），三張全部漏接。而 `platform:
 * "doc"` 又不能單獨當判準，因為同一個 pack 的案例卡與行事曆卡也是 doc。
 * 真正的判別點是 postType：官網長文 blog，案例卡 research，行事曆卡 calendar。
 */
const WEBSITE_POST_TYPES = new Set([
  "blog", "article", "column", "product-page", "product_desc", "case-study", "faq",
]);

/** 這是不是品牌自有官網的內容任務？ */
export function isWebsiteTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (id.startsWith("web-")) return true;
  // 與 isFacebookTask 同一個形狀：前綴命中，或型態命中。原本只有前綴那半，
  // 是這個模組跟它模仿的對象唯一不一致的地方。
  return WEBSITE_POST_TYPES.has(String(template.postType ?? ""));
}

/**
 * 「完整內容」的官網任務（工藝層有意義）vs 零件型任務（meta description、
 * 標題變體那種，本來就只有一行，套重型準則反而礙事）。
 */
export function isWebsiteBodyTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  if (/meta-desc|title-tag|slug|alt-text/.test(id)) return false;
  return isWebsiteTask(template);
}

/**
 * 官網長文工藝準則。
 *
 * 社群的準則在教「怎麼在資訊流裡贏得前兩行」，官網完全相反：讀者是自己點進
 * 來的，已經有意圖，所以贏的條件是「讀完之後真的多知道一件事」。準則因此
 * 圍繞在資訊密度、可驗證性與掃讀結構，而不是鉤子。
 */
export const WEB_CRAFT_RUBRIC = `
# 官網內容得獎級工藝準則（嚴格遵守）
官網讀者是「自己搜尋、自己點進來」的——他有意圖、有耐心，但也最沒有耐性容忍空話。社群靠鉤子贏，官網靠**資訊密度**贏。
【每一篇都必守】
- **一篇只解決一個問題**：標題承諾什麼就交付什麼，不要在一篇裡塞三個主題。讀者是帶著一個具體問題來的。
- **可驗證性優先於說服力**：每一個主張後面要跟得上機制、數字或可自己動手做的檢查。無法驗證的形容詞（優質、專業、領先）一律刪掉，改寫成「發生了什麼事」。
- **前 100 字就要給出答案的雛形**：官網不是懸疑寫作。先給結論，再展開為什麼。把答案藏到最後一段是社群的玩法，在官網只會讓人跳出。
- **可掃讀**：小標要能單獨讀懂（讀者只看小標也要能拼出全文邏輯）；段落 2–4 句；長清單改成表格式條列。
【結構紀律】
- 開場禁用：「在這個快速變化的時代」「隨著科技發展」「你是否曾經想過」這類暖場。第一句就進入主題。
- 中段每一節都要有一個「讀者現在可以做的事」或「讀者現在看得懂的機制」。
- 收尾不要行動呼籲式推銷。官網長文的結尾是把讀者送到下一個問題，不是送到表單。
【B2B 專屬】
- 承認限制會提高可信度：說明「什麼情況下我們不是對的選擇」，比任何保證都有效。
- 不要在內容裡報價、承諾交期或宣稱產能。這些會變成合約，且會過期。
- 案例一律匿名到「類別 + 情境」（「一個美國戶外品牌」），除非有書面同意。
【SEO 紀律（不犧牲可讀性）】
- 標題與 H2 用讀者真的會打的字，不要用內部術語。
- 關鍵詞塞入是負分：一次自然出現即可，重複到不像人話會同時傷讀者與排名。
`.trim();

/**
 * 每張官網卡的具名參考。key 是精確 taskId。
 *
 * 這裡只放全域目錄（quickTaskWebsite.ts）那五張。品牌任務包的自訂卡在自己的
 * pack 檔裡帶更貼近該產業的參考——通用參考給不了「針織帽工法文章長什麼樣」
 * 這種精度。
 */
const WEB_TASK_REF: Record<string, string> = {
  "web-30-longform":
    "Patagonia「Don't Buy This Jacket」與後續 Worn Wear 長文系列（公開紀錄中最常被引用的品牌長文案例；該廣告刊出後 Patagonia 營收不減反增，被無數行銷教材當成「說出對自己不利的事反而建立信任」的教科書）：主張先行、承認代價、用具體數字支撐、結尾不推銷。可遷移的是「敢寫出對自己不利的那一段」，不是環保議題本身。",
  "web-30-column":
    "Basecamp / 37signals 的 Signal v. Noise 專欄（業界廣泛引用的 B2B 品牌專欄標竿；以逆共識短文建立整個公司的思想領導地位，後來集結成暢銷書）：一篇一個立場，300–800 字就結束，不寫綜述；用自己公司的真實決策當證據，不引用二手研究。",
  "web-30-case-study":
    "Slack 與 Intercom 的 Customer Stories（B2B SaaS 案例研究被拆解最多次的兩份範本）：結構是「客戶的限制 → 為什麼難 → 做了什麼 → 可驗證的結果」；客戶是主角、產品是工具；最強的案例都會寫出「哪裡不順利」，因為全程順利的案例會被讀成行銷素材。",
  "web-30-product-desc":
    "Bellroy 產品頁（業界廣泛引用的產品頁文案標竿；以「這個東西解決你哪個具體不便」取代規格堆疊，並用互動示意讓差異可被理解）：先講使用情境的痛點，再講構造如何解決它；規格放在能被理解之後，不放在開頭。",
  "web-30-product-faq":
    "Stripe 文件與 Wirecutter 的解答式寫作（兩者都是「把複雜問題寫成可掃讀答案」被引用最多的公開範例）：一問一答、問句用讀者真的會打的字；答案第一句就是結論；「看情況」不是答案，要寫出「看什麼情況」。",
};

/**
 * 依任務型態給 playbook。
 *
 * 與 edmPlaybookFor 相同的形狀，但這裡刻意讓**每個分支都自帶一個具名參考**
 * ——不像其他模組只有精確 id 命中才有案例。品牌任務包的自訂卡 id 永遠不會
 * 出現在 WEB_TASK_REF 裡，如果分支不帶案例，自訂卡就只拿得到結構、拿不到
 * 範例，那正是這次稽核發現的問題。
 */
export function webPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const exact = WEB_TASK_REF[id];
  const P = (s: string, fallbackRef: string) =>
    `# 本任務 playbook（官網得獎模式）\n${s}` +
    `\n# 具名參考（學可遷移結構，非抄作品）\n${exact ?? fallbackRef}`;

  if (/craft|process|how-its-made|manufactur/.test(id))
    return P(
      "製程長文：以原料未加工的狀態開場；照生產順序走站點，每站一個小標；在其中一站停下來講「有更便宜的作法而我們沒選」——那段是全文的承重牆；結尾回到成品，講讀者現在看得懂什麼。",
      "Filson、Hiut Denim、Red Wing 的工廠內容（英語系工藝品牌製程長文被引用最多的三家；Hiut Denim 的 HistoryTag 讓每條褲子可追溯到縫製者，是「製程即品牌」最完整的公開實作）：製程的說服力來自具體到可以被檢查的細節，不來自形容詞。",
    );
  if (/care|maintenance|repair/.test(id))
    return P(
      "保養指南：先講「壞掉時長什麼樣」再講怎麼避免——讀者是遇到問題才搜尋的；每一步都要能在家裡完成，需要專業設備的就明說；誠實寫出「這種情況救不回來」。",
      "The Woolmark Company 的羊毛保養指引與 Nudie Jeans 的修補指南（兩者都是產業內被引用最多的公開保養內容；Nudie 的免費修補計畫把保養內容變成通路本身）：權威來自「連救不回來的情況都告訴你」。",
    );
  if (/guide|how-to|checklist|spec/.test(id))
    return P(
      "採購/操作指南：讀者要的是「我下一步該做什麼」；用可勾選的步驟或必填欄位清單；明確指出「最多人漏掉的那一項」與漏掉的後果；不要寫成產品介紹。",
      "Stripe 文件與 Wirecutter 的選購指南（把複雜決策寫成可執行清單被引用最多的兩個公開範例）：好的指南讀完之後，讀者就算去找別家也用得上——那正是它建立信任的方式。",
    );
  if (/case|customer-story|success/.test(id))
    return P(
      "案例研究：客戶的限制 → 為什麼難 → 做了什麼 → 可驗證的結果；客戶是主角、我們是工具；一定要寫出中途不順的那一段，全程順利的案例會被讀成行銷素材。",
      "Slack 與 Intercom 的 Customer Stories（B2B 案例研究被拆解最多次的兩份範本）：結果要具體到可以被質疑，客戶名稱可以匿名但情境不能模糊。",
    );
  if (/faq|question|q-and-a/.test(id))
    return P(
      "常見問題：問句用讀者真的會打的字；答案第一句就是結論；「看情況」要寫成「看哪些情況」；把限制寫出來，沒有限制的 FAQ 讀起來像型錄。",
      "Stripe 文件與 Wirecutter 的解答式寫作（把複雜問題寫成可掃讀答案被引用最多的公開範例）：一問一答、不繞路、承認邊界。",
    );
  if (/product|landing|desc/.test(id))
    return P(
      "產品頁：先講使用情境的痛點，再講構造如何解決；規格放在能被理解之後；明說「什麼情況下這個不適合你」——那句話會提高而不是降低轉換。",
      "Bellroy 產品頁（業界廣泛引用的產品頁文案標竿）：用「解決你哪個具體不便」取代規格堆疊，讓差異可被理解而不只是被宣稱。",
    );
  if (/column|opinion|editorial|pov/.test(id))
    return P(
      "品牌專欄：一篇一個立場，不寫綜述；用自己的真實決策當證據，不引用二手研究；300–800 字就收，長度不是深度。",
      "Basecamp / 37signals 的 Signal v. Noise（以逆共識短文建立公司思想領導地位的 B2B 專欄標竿）：立場要銳利到有人會不同意，否則沒有人會記得。",
    );
  return P(
    "通用官網內容：一篇解決一個問題；前 100 字給出答案雛形；小標單獨可讀；每個主張後面跟得上機制或數字；結尾把讀者送到下一個問題而不是表單。",
    "Patagonia 的長文與 Stripe 的文件寫作（一個示範觀點型、一個示範說明型，都是公開可查、被引用最多的官網內容標竿）：可驗證性優先於說服力。",
  );
}
