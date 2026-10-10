import { readFileSync } from "fs";
import { join, resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  AEO_FAQ_MARK, AEO_FACTS_MARK, AEO_FORMAT_BY_TASK, AEO_SUMMARY_MARK,
  aeoFormatOf, buildAeoFormatRule, validateAeoFormat,
} from "./aeoFormatContract";
import { resolveTaskTemplateSync } from "../catalog/taskRegistry";

const ROOT = resolve(__dirname, "../../../..");
const BRAND = "禾木香氛";

describe("哪些卡套 AI 搜尋格式", () => {
  it("跟前台標成「AI 搜尋」的卡完全同一批——標了就要真的照格式寫", () => {
    const src = readFileSync(join(ROOT, "client/src/v2/platform/lib/sourceVocabulary.ts"), "utf8");
    const block = /export const AEO_CARD_IDS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(src)?.[1] ?? "";
    const clientIds = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]!).sort();
    expect(Object.keys(AEO_FORMAT_BY_TASK).sort()).toEqual(clientIds);
  });

  it("每一張都找得到任務卡；其他卡不受影響", () => {
    for (const id of Object.keys(AEO_FORMAT_BY_TASK)) expect(resolveTaskTemplateSync(id), id).toBeTruthy();
    expect(aeoFormatOf("fb-30-single-post")).toBeNull();
    expect(aeoFormatOf("yt-30-comment-reply")).toBeNull();
    expect(aeoFormatOf(null)).toBeNull();
  });
});

describe("buildAeoFormatRule", () => {
  it("官網長文：摘要放最前面、要講品牌，而且明講不跟「引言不講品牌」衝突", () => {
    const rule = buildAeoFormatRule("article", BRAND);
    expect(rule).toContain("最高優先");
    expect(rule).toContain(AEO_SUMMARY_MARK);
    expect(rule).toContain(`「${BRAND}」`);
    expect(rule).toContain("不要在引言就講品牌」仍然成立");
    expect(rule).toContain(AEO_FAQ_MARK);
  });

  it("共同規則：主詞寫全、問答只能用正文有的、加的段落不算字數", () => {
    for (const p of ["article", "product", "faq", "yt-description", "press", "boilerplate"] as const) {
      const rule = buildAeoFormatRule(p, BRAND);
      expect(rule).toContain("不要用「我們」「它」「本產品」");
      expect(rule).toContain("只能用正文已經寫到的內容");
      expect(rule).toContain("不算在上方的字數限制裡");
    }
  });

  it("沒有品牌名也寫得出合約（只講原則）", () => {
    expect(buildAeoFormatRule("boilerplate", null)).toContain("品牌名");
  });
});

const ARTICLE = [
  AEO_SUMMARY_MARK,
  `${BRAND}的雪松擴香用台灣雪松精油製作，一瓶 200ml 大約可以用三個月，適合放在五坪以內的房間。`,
  "",
  "下班回到家，打開門的那一秒，你聞到的是什麼？",
  "",
  "雪松的味道為什麼讓人放鬆？",
  "因為它的氣味分子揮發得慢，味道穩定。",
  "",
  "一瓶可以用多久？",
  "200ml 大約三個月。",
  "",
  "放在哪裡最剛好",
  "通風但不直吹的位置。",
  "",
  AEO_FAQ_MARK,
  "Q：雪松擴香適合放臥室嗎？",
  `A：${BRAND}的雪松擴香不含酒精，可以放臥室。`,
  "Q：多久要換藤枝？",
  `A：${BRAND}建議一週翻一次藤枝。`,
].join("\n");

describe("validateAeoFormat — 官網長文／產品頁", () => {
  it("照合約寫的過關", () => {
    expect(validateAeoFormat("article", ARTICLE, BRAND)).toBeNull();
  });

  it("沒有摘要", () => {
    expect(validateAeoFormat("article", ARTICLE.replace(AEO_SUMMARY_MARK, ""), BRAND)?.reason).toBe("no-summary");
  });

  it("摘要不在最前面", () => {
    const moved = `${"情境引言。".repeat(30)}\n${ARTICLE}`;
    expect(validateAeoFormat("article", moved, BRAND)?.reason).toBe("summary-not-first");
  });

  it("摘要裡沒有品牌名", () => {
    const noBrand = ARTICLE.replace(`${BRAND}的雪松擴香用`, "這款擴香用");
    expect(validateAeoFormat("article", noBrand, BRAND)?.reason).toBe("summary-no-brand");
  });

  it("沒有問答，或問答不夠", () => {
    const cut = ARTICLE.slice(0, ARTICLE.indexOf(AEO_FAQ_MARK));
    expect(validateAeoFormat("article", cut, BRAND)?.reason).toBe("no-faq");
    // 產品頁要三則，兩則不夠
    expect(validateAeoFormat("product", ARTICLE, BRAND)?.reason).toBe("no-faq");
  });

  it("小標沒有問句——問答區裡的 Q 不算小標", () => {
    const flat = ARTICLE.replace("雪松的味道為什麼讓人放鬆？", "雪松的味道").replace("一瓶可以用多久？", "使用時間").replace("你聞到的是什麼？", "你聞到的味道。");
    expect(validateAeoFormat("article", flat, BRAND)?.reason).toBe("no-question-headings");
  });
});

describe("validateAeoFormat — 其他格式", () => {
  it("常見問答：答案用代稱開頭太多會被抓；沒有任何一則提到品牌也會", () => {
    const good = `Q：擴香可以用多久？\nA：${BRAND}的擴香 200ml 約三個月。\nQ：放臥室安全嗎？\nA：${BRAND}的擴香不含酒精。\nQ：怎麼買？\nA：官網與門市都有${BRAND}的產品。\nQ：可以退嗎？\nA：${BRAND}提供七天鑑賞期。`;
    expect(validateAeoFormat("faq", good, BRAND)).toBeNull();
    const pronouns = "Q：擴香可以用多久？\nA：它大約三個月。\nQ：放臥室安全嗎？\nA：可以的，沒有酒精。\nQ：怎麼買？\nA：我們官網有賣。\nQ：可以退嗎？\nA：七天內可以。";
    expect(validateAeoFormat("faq", pronouns, BRAND)?.reason).toBe("pronoun-answers");
    const noBrand = "Q：擴香可以用多久？\nA：200ml 約三個月。\nQ：放臥室安全嗎？\nA：不含酒精，可以。\nQ：怎麼買？\nA：官網與門市。\nQ：可以退嗎？\nA：七天內可以。";
    expect(validateAeoFormat("faq", noBrand, BRAND)?.reason).toBe("faq-no-brand");
  });

  it("YouTube 說明欄：前兩行要有品牌、要列問句", () => {
    const ok = `這支影片說明${BRAND}的雪松擴香怎麼放才香。\n結論：放在通風但不直吹的位置。\n這支影片回答的問題\n擴香要放哪裡？\n多久翻一次藤枝？`;
    expect(validateAeoFormat("yt-description", ok, BRAND)).toBeNull();
    expect(validateAeoFormat("yt-description", ok.replace(BRAND, "這個牌子"), BRAND)?.reason).toBe("head-no-brand");
    expect(validateAeoFormat("yt-description", `${BRAND}的擴香開箱。\n重點一次看。\n・好聞\n・耐用`, BRAND)?.reason).toBe("no-questions");
  });

  it("YouTube 標題與章節", () => {
    expect(validateAeoFormat("yt-title", "1. 擴香開箱\n2. 我以為都一樣", BRAND)?.reason).toBe("no-question-title");
    expect(validateAeoFormat("yt-title", `1. ${BRAND}的擴香可以用多久？\n2. 我以為都一樣`, BRAND)).toBeNull();
    expect(validateAeoFormat("yt-chapters", "00:00 開場\n01:00 介紹\n05:00 總結", BRAND)?.reason).toBe("generic-chapters");
    expect(validateAeoFormat("yt-chapters", "00:00 擴香怎麼挑\n01:00 為什麼選雪松\n05:00 總結", BRAND)).toBeNull();
  });

  it("新聞稿：導言要有品牌、文末要有重點事實", () => {
    const ok = `${BRAND}推出雪松擴香\n${BRAND}宣布推出新款擴香。\n內文。\n${AEO_FACTS_MARK}\n${BRAND}成立於台北。\n${BRAND}的擴香不含酒精。\n${BRAND}的擴香一瓶 200ml。`;
    expect(validateAeoFormat("press", ok, BRAND)).toBeNull();
    expect(validateAeoFormat("press", ok.slice(0, ok.indexOf(AEO_FACTS_MARK)), BRAND)?.reason).toBe("no-facts");
    expect(validateAeoFormat("press", `新品上市\n新款擴香登場。\n內文一。\n內文二。\n${BRAND}表示…`, BRAND)?.reason).toBe("lead-no-brand");
  });

  it("公司簡介：品牌名開頭、不出現「我們」", () => {
    expect(validateAeoFormat("boilerplate", `${BRAND}是台灣的居家香氛品牌，提供擴香與蠟燭。`, BRAND)).toBeNull();
    expect(validateAeoFormat("boilerplate", `成立於台北的居家香氛品牌，提供擴香與蠟燭，多年來深受喜愛。品牌名為${BRAND}。`, BRAND)?.reason).toBe("no-definition");
    expect(validateAeoFormat("boilerplate", `${BRAND}是居家香氛品牌，我們相信氣味。`, BRAND)?.reason).toBe("first-person");
  });

  it("沒帶品牌名時只驗結構，不因為品牌名而擋", () => {
    expect(validateAeoFormat("article", ARTICLE.split(BRAND).join("某牌"), null)).toBeNull();
    expect(validateAeoFormat("factsheet", "某公司是一家做擴香的公司。", null)).toBeNull();
  });
});
