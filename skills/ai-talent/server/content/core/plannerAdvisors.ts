/**
 * plannerAdvisors — 本週企劃的「分歧方案卡」：總監判斷這週有兩條都合理、但會讓一週長得很不一樣的路時，
 * 請兩位立場相反的顧問各排一版，使用者挑一版。
 *
 * 2026-09-27（CJ「總主管帶路，分歧時顧問才出場」「只要分歧時，再出現兩張方案卡」
 * 「請選擇有多樣性的 ai agent，不要回答太相同的」）。
 *
 * 多樣性靠三層，不靠運氣：
 *   1. 人選是成對寫死的（PLANNER_AXES），每一對的立場本來就對立；八個人全部不同。
 *   2. 每位的指令要求「站在你的立場排，不要折衷」，並且看得到對方的立場。
 *   3. 兩版排完後比題目重疊度（topicOverlap）；太像就叫第二位重排一次，並把第一版的題目給他看。
 */
import localPool from "../../localDb";

export type ForkAxis = "consistency" | "conversion" | "volume" | "voice";

export interface AdvisorSide {
  slug: string;
  /** 卡片上的立場，一句話（12 字內）。 */
  stance: string;
  /** 給模型的立場說明。 */
  angle: string;
}

export const PLANNER_AXES: Record<ForkAxis, { question: string; sides: [AdvisorSide, AdvisorSide] }> = {
  consistency: {
    question: "這週要一個調性到底，還是每篇換打法？",
    sides: [
      { slug: "exec-brand-k3", stance: "一個聲音到底",
        angle: "你相信品牌是靠重複被記住的：這週每一篇都用同一種語氣、同一個主軸、同一種開場結構，換的只有切角。你會刻意讓 FB 和 IG 看起來是同一個人寫的。" },
      { slug: "tiktok_ads-ecom-cn-1550", stance: "每篇換打法測",
        angle: "你相信不測就不知道：這週每一篇都換一種打法（問題式開頭、反常識、清單、開箱、比較），形式也要不一樣，目的是一週後知道哪一種對這個品牌有效。" },
    ],
  },
  conversion: {
    question: "這週要衝單，還是養品牌？",
    sides: [
      { slug: "meta_ads_tw-ecom-cn-6845", stance: "這週就收單",
        angle: "你看的是漏斗最底層：這週每一篇都要有購買理由（價格、截止日、到貨時間、組合），寫給已經在考慮的人，篇篇有明確下一步。沒有促銷的日常內容這週先不排。" },
      { slug: "chun-ting-chang-media-tw-3b6c04", stance: "先讓人記得你",
        angle: "你看的是品牌聲量：這週大部分內容不談價格，談品牌故事、使用情境、老闆的堅持，讓沒聽過這個品牌的人先記住它。最多只留一篇提到優惠。" },
    ],
  },
  volume: {
    question: "這週要天天出現，還是少而精？",
    sides: [
      { slug: "meta_ads_tw-food-cn-1427", stance: "天天出現",
        angle: "你相信節奏：演算法獎勵穩定出現的帳號，這週每天都要有一篇，題目可以輕、可以短，靠頻率累積觸及。" },
      { slug: "exec-copywriter-senior", stance: "少寫、寫到位",
        angle: "你相信一篇好文勝過五篇充數：這週只排 2–3 篇，每篇都是值得認真寫、值得拿去下廣告的主力內容，其他日子留白。" },
    ],
  },
  voice: {
    question: "這週誰來說話：顧客，還是老闆？",
    sides: [
      { slug: "social_media-ecom-tw-1789", stance: "讓顧客替你說",
        angle: "你相信社會證明：這週的內容以顧客為主角——買過的人怎麼用、留言與評價、揪團分享、邀請投稿，品牌退到後面。資料裡沒有的真實評價不要編，改成「邀請顧客分享」的題目。" },
      { slug: "mkt-service-shortvideo", stance: "老闆自己出來說",
        angle: "你相信人設：這週的內容以老闆為主角——老闆的堅持、選貨標準、廚房裡的日常、直接對鏡頭講話，原生感比精緻重要。" },
    ],
  },
};

export const FORK_AXES = Object.keys(PLANNER_AXES) as ForkAxis[];
export function isForkAxis(s: unknown): s is ForkAxis {
  return typeof s === "string" && (FORK_AXES as string[]).includes(s);
}

export interface AdvisorCard { slug: string; name: string; title: string; avatarUrl: string }

/** 顧問的顯示資料；查不到（被下架）就用立場當名字，不讓整張卡消失。 */
export async function loadAdvisor(slug: string, fallbackTitle: string): Promise<AdvisorCard> {
  try {
    const [rows]: any = await localPool.execute(
      `SELECT slug, name, name_zh, englishName, title, title_zh, avatarUrl FROM agents WHERE slug = ? LIMIT 1`, [slug],
    );
    const r = (rows as any[])[0];
    if (r) return {
      slug, name: String(r.name_zh || r.name || r.englishName || fallbackTitle),
      title: String(r.title_zh || r.title || ""), avatarUrl: String(r.avatarUrl ?? ""),
    };
  } catch { /* fall through */ }
  return { slug, name: fallbackTitle, title: "", avatarUrl: "" };
}

/** 兩版題目的重疊度 0–1：題目兩兩比字元雙字組 Jaccard，取每題最高再平均。 */
export function topicOverlap(a: string[], b: string[]): number {
  const grams = (s: string) => {
    const t = s.replace(/[\s，。、！？：；「」『』（）()!?,.:;"'…\-—]/g, "");
    const g = new Set<string>();
    for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
    return g;
  };
  if (!a.length || !b.length) return 0;
  const gb = b.map(grams);
  let sum = 0;
  for (const x of a) {
    const gx = grams(x);
    let best = 0;
    for (const gy of gb) {
      const inter = [...gx].filter((k) => gy.has(k)).length;
      const uni = new Set([...gx, ...gy]).size;
      if (uni) best = Math.max(best, inter / uni);
    }
    sum += best;
  }
  return sum / a.length;
}

/**
 * 一版最多 7 篇、同一天同一通路只留一篇（第一版實測兩位都排滿 14 篇——那不是方案，是清單）。
 * remove 全部保留：不合立場的草稿要刪得掉。
 */
export function capAdds<T extends { op: string; date?: string; platform?: string }>(ops: T[], max = 7): T[] {
  const seen = new Set<string>();
  let adds = 0;
  return ops.filter((o) => {
    if (o.op !== "add") return true;
    const key = `${o.date}|${o.platform}`;
    if (seen.has(key) || adds >= max) return false;
    seen.add(key); adds++;
    return true;
  });
}

/** 顧問回覆：{"why","ops"}。 */
export function parseAdvisorReply(raw: string): { why: string; ops: unknown[] } | null {
  const cleaned = String(raw ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let obj: any = null;
  try { obj = JSON.parse(cleaned); } catch {
    const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
    if (s >= 0 && e > s) { try { obj = JSON.parse(cleaned.slice(s, e + 1)); } catch { obj = null; } }
  }
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.ops)) return null;
  return { why: String(obj.why ?? "").trim().slice(0, 80), ops: obj.ops };
}

export function advisorSystemPrompt(args: {
  advisor: AdvisorCard; side: AdvisorSide; other: AdvisorSide; question: string; context: string; avoidTopics?: string[];
}): string {
  return [
    `你是${args.advisor.name}（${args.advisor.title}），被找來回答這一題：「${args.question}」`,
    `你的立場：${args.side.stance}。${args.side.angle}`,
    `另一位顧問的立場是「${args.other.stance}」。你的方案必須明顯站在你這邊，不要折衷、不要兩邊都顧；使用者要看到兩條真的不同的路。`,
    args.avoidTopics?.length ? `另一位已經排了這些題目，你的題目與形式不能跟它們相似：\n${args.avoidTopics.map((t) => `- ${t}`).join("\n")}` : "",
    ``,
    args.context,
    ``,
    `做法：把這週「草稿」格子全部重排成你的版本（不合你立場的草稿用 remove 刪掉，再 add 你的），已排定與已寫好的不要動。`,
    `篇數：一週 3–6 篇（立場是「天天出現」的最多 7 篇、「少寫、寫到位」的 2–3 篇），每天每個通路最多一篇。`,
    `why 用一句話（30 字內）講你這樣排的理由，口語，不要重複立場名稱。`,
    `只輸出 JSON：{"why":"…","ops":[{"op":"add","date":"YYYY-MM-DD","platform":"facebook","taskId":"…","topic":"…","format":"…","reason":"…"},{"op":"remove","id":12}]}`,
  ].filter(Boolean).join("\n");
}
