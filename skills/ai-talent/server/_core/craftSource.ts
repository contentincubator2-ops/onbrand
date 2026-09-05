/**
 * craftSource — 把「得獎工藝層」已經寫好的參考案例，變成前台看得見的來源標籤。
 *
 * ── 為什麼是「衍生」而不是在 207 張卡上各標一次 ─────────────────────────
 * 每個平台的 craft 檔（fbCraft / igCraft / …）都有一張 `*_TASK_REF`：
 *
 *   "fb-30-ad-headline":
 *     "Old Spice「The Man Your Man Could Smell Like」Facebook 廣告
 *      (Cannes Lions Grand Prix Titanium 2010，Effie Gold 2011)：
 *      廣告標題 = 價值主張 + 個性，一句話說完；每個字有存在理由。"
 *
 * 這段字串**已經**在生成時被 fbPlaybookFor() 接到 prompt 尾巴送進模型
 * （quickTaskOrchestra.ts）。也就是說「這張卡憑什麼這樣寫」的答案本來
 * 就存在、而且是真的被拿去寫的東西——只是前台看不到。
 *
 * 所以來源標籤從同一份資料推導，而不是另外抄一份。這給我們一個一般抄
 * 兩份做不到的保證：**pill 上寫的出處，就是模型實際被餵的那一則**。
 * 有人刪掉某張卡的 craft ref，pill 上的出處會跟著消失，不會留在那裡說謊。
 *
 * 卡片自己在 template 上標了 `source` 的話以卡片為準（客製卡、squad 卡走
 * 這條）；沒標的才走這裡。
 *
 * ── 解析規則 ──────────────────────────────────────────────────────────
 *   "<案例名>（<出處/獎項>）：<可遷移的心法>"
 *      short    ← 案例名，縮到 pill 放得下（見 shortenCaseName）
 *      type     ← 括號裡出現獎項名 = award，否則 benchmark
 *      takeaway ← 冒號後那句心法，給 tooltip 用
 *
 * 括號裡沒有獎項名的（例：「LinkedIn 官方評選 Top Voices 多年」）一律降為
 * benchmark 標竿，不升成得獎——寧可少講，不能講錯。
 */
import { resolveTaskSource, type TaskSource } from "./taskSource";
import { BR_TASK_REF } from "./brCraft";
import { CW_TASK_REF } from "./cwCraft";
import { EDM_TASK_REF } from "./edmCraft";
import { FB_TASK_REF } from "./fbCraft";
import { IG_TASK_REF } from "./igCraft";
import { KL_TASK_REF } from "./klCraft";
import { LI_TASK_REF } from "./liCraft";
import { PR_TASK_REF } from "./prCraft";
import { RS_TASK_REF } from "./rsCraft";
import { TT_TASK_REF } from "./ttCraft";
import { YT_TASK_REF } from "./ytCraft";

/** 所有平台的得獎工藝參考，合成一張表。後面的不會覆蓋前面的（id 不重疊）。 */
export const ALL_CRAFT_REFS: Record<string, string> = {
  ...BR_TASK_REF, ...CW_TASK_REF, ...EDM_TASK_REF, ...FB_TASK_REF,
  ...IG_TASK_REF, ...KL_TASK_REF, ...LI_TASK_REF, ...PR_TASK_REF,
  ...RS_TASK_REF, ...TT_TASK_REF, ...YT_TASK_REF,
};

/**
 * 認定為「獎項」的字樣。刻意只收國際廣告/行銷獎的正式名稱。
 *
 * 不收的例子：「LinkedIn Top Voices」「全球最多追蹤者」「業界標準」——
 * 那些是標竿地位，不是得獎，收進來就是把 benchmark 灌水成 award。
 */
const AWARD_MARKS =
  /(Cannes Lions|Grand Prix|Shorty|Effie|Clio|D&AD|One Show|Webby|Titanium|Pencil|Lion\b|Awards?\b)/;

/** 縮寫時要砍掉的尾巴：平台名與泛稱形式詞，它們不構成出處。 */
const DESCRIPTOR_TAIL =
  /\s*(Facebook|Instagram|LinkedIn|TikTok|YouTube|Twitter|Threads|Email|EDM|Newsletter|Articles?|Document|Community|Premiere|Stories|Shorts|Reels?|品牌|社群|廣告|貼文|策略|系列|格式|套組|腳本|方法|指南|循環|地圖|模式|案例|活動|年度報告|完整).*$/;
const TRAILING_NOISE =
  /[\s,、]*(Facebook|Instagram|LinkedIn|TikTok|YouTube|Twitter|Threads|Email|EDM|Newsletter|Articles?|Document|Community|Premiere|Bio|Stories|Story|Live|Shorts|Reels?|Polls?|Posts?|策略|系列|格式|套組|腳本|完整)+$/;

const len = (s: string) => [...s].length;

/**
 * 把案例全名縮成 pill 放得下的 40 字內。
 *
 * 優先序刻意是「保住作品名 → 保住品牌名 → 才動刀」：
 *   1. 到「作品名」收尾（Squarespace「Make Your Next Move」）
 *   2. 只留引號前的主體（Old Spice / Alan Cooper）
 *   3. 砍掉尾端的平台與形式詞（Washington Post @washingtonpost）
 * 一律要求候選 ≥ 12 字，避免把 "Washington Post" 砍成 "Washington"。
 */
export function shortenCaseName(name: string): string {
  const quoted = name.match(/^(.*?[「『][^」』]*[」』])/)?.[1];
  const prefix = (name.split(/[「『]/)[0] ?? "").trim();
  const cut = name.replace(DESCRIPTOR_TAIL, "").trim();
  // 長度下限只套在「砍尾巴」那個候選上：它會從中間切斷專有名詞
  // （"Washington Post @washingtonpost" → "Washington"）。引號前的主體
  // 不受限——"Old Spice"、"Alan Cooper" 本來就是完整且夠好的出處。
  for (const [c, min] of [[quoted, 3], [prefix, 3], [cut, 12]] as const) {
    if (c && len(c) <= 40 && len(c) >= min) return c;
  }
  let s = name;
  while (len(s) > 40) {
    const t = s.replace(/\s*\S+$/, "");
    if (!t || t === s) break;
    s = t;
  }
  s = s.replace(TRAILING_NOISE, "").trim();
  return (len(s) >= 3 ? s : [...name].slice(0, 40).join("")).trim();
}

/** 解析一則 craft ref 字串。看不懂就回 undefined，不硬湊。 */
export function parseCraftRef(text: string): TaskSource | undefined {
  const raw = String(text ?? "").trim();
  if (!raw) return undefined;
  const paren = raw.match(/[（(]([^）)]*)[）)]/)?.[1] ?? "";
  const name = (raw.split(/[（(]/)[0] ?? "").trim().replace(/[:：].*$/, "");
  if (len(name) < 3) return undefined;
  const afterParen = raw.split(/[）)]/).slice(1).join(")");
  const takeaway = (afterParen.match(/[:：]\s*(.+)$/)?.[1] ?? "").trim();
  return {
    type: AWARD_MARKS.test(paren) ? "award" : "benchmark",
    short: shortenCaseName(name),
    ...(takeaway ? { takeaway } : {}),
  };
}

/** 解析一次就好——207 張卡 × 每次列表重算沒有意義。 */
let cache: Map<string, TaskSource> | null = null;
function table(): Map<string, TaskSource> {
  if (cache) return cache;
  cache = new Map();
  for (const [id, text] of Object.entries(ALL_CRAFT_REFS)) {
    const s = parseCraftRef(text);
    if (s) cache.set(id, s);
  }
  return cache;
}

/**
 * 這張卡的得獎工藝參考推導出來的來源。沒有 ref 就回 undefined，
 * 呼叫端會落回 evergreen —— 那是誠實的預設，不是缺漏。
 */
export function craftSourceFor(taskId: string): TaskSource | undefined {
  return table().get(String(taskId ?? ""));
}

/**
 * 一張卡最終顯示的來源。目錄索引與 quickTaskRouter 都走這一支，兩邊才不會漂。
 *
 * 優先序：卡片自己標的 > 得獎工藝層推導的 > evergreen。
 * 卡片優先是刻意的——客製卡與 squad 卡的出處（品牌方法論、具名方法論）
 * 比通用的得獎參考更貼近那張卡實際在做的事。
 */
export function sourceForTemplate(
  t: { id?: string | null; source?: TaskSource | null },
): TaskSource {
  return resolveTaskSource(t.source ?? craftSourceFor(String(t.id ?? "")));
}
