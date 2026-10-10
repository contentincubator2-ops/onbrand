import { describe, expect, it } from "vitest";
import {
  AEO_TARGET_TASK, aeoContractBlock, aeoPlainText, faqHtmlSnippet, faqJsonLd, isAeoNativePlatform,
  parseAeoReply, repairAeo, serializeAeo, validateAeo,
} from "./aeoContract";
import { buildTaskCatalogIndex } from "../catalog/taskCatalogIndex";

const ANSWER = "禾木香氛的雪松擴香瓶 200ml 可以用大約三個月，放在五坪以內的房間香氣最穩定。";
const BODY = "這瓶擴香用的是台灣雪松精油，沒有添加酒精。\n\n建議放在通風但不直吹的位置，藤枝一週翻一次。\n\n官網與門市都買得到，補充瓶另售。再補一句讓長度過門檻，內容都是原稿有的。";

describe("parseAeoReply", () => {
  it("照標記拆出三段", () => {
    const p = parseAeoReply("web-qa", `【問題】\n雪松擴香可以用多久？\n【直接答案】\n${ANSWER}\n【展開】\n${BODY}`);
    expect(p.noConvert).toBe(false);
    expect(p.fields.question).toBe("雪松擴香可以用多久？");
    expect(p.fields.answer).toBe(ANSWER);
    expect(p.fields.body).toBe(BODY);
  });

  it("模型說轉不了就不硬寫", () => {
    const p = parseAeoReply("web-qa", "【無法轉換】：這篇只有節慶問候，沒有可以回答的事實。");
    expect(p.noConvert).toBe(true);
    expect(p.reason).toContain("節慶問候");
  });

  it("YouTube 版拆標題與說明欄", () => {
    const p = parseAeoReply("yt-description", "【標題】\n雪松擴香怎麼放才香\n【說明欄】\n第一行\n第二行");
    expect(p.fields.title).toBe("雪松擴香怎麼放才香");
    expect(p.fields.description).toBe("第一行\n第二行");
  });
});

describe("repairAeo", () => {
  it("問題補問號、答案併成一段", () => {
    const f = repairAeo("web-qa", { question: "雪松擴香可以用多久。", answer: "第一句。\n第二句。", body: " x " });
    expect(f.question).toBe("雪松擴香可以用多久？");
    expect(f.answer).toBe("第一句。第二句。");
    expect(f.body).toBe("x");
  });

  it("Markdown 符號拿掉——貼進官網後台會變成一堆星號", () => {
    const f = repairAeo("web-qa", { question: "Q？", answer: "**禾木香氛**的擴香", body: "## 小標\n**重點**一句\n- 條列一\n\n\n\n下一段" });
    expect(f.answer).toBe("禾木香氛的擴香");
    expect(f.body).toBe("小標\n重點一句\n條列一\n\n下一段");
  });

  it("展開裡在講「原稿」的段落拿掉——那是寫給我們的說明，不是內容", () => {
    const f = repairAeo("web-qa", { question: "Q？", answer: "A", body: "活動邀請各地訓練家一起探索。\n\n原稿聚焦於情感邀請，未提供具體玩法。" });
    expect(f.body).toBe("活動邀請各地訓練家一起探索。");
    expect(repairAeo("web-qa", { question: "Q？", answer: "A", body: "原稿未提供細節。" }).body).toBe("");
  });

  it("說明欄的時間軸整行拿掉——我們不知道影片怎麼剪", () => {
    const f = repairAeo("yt-description", { title: "t", description: "重點\n00:00 開場\n・01:20 示範\n・藤枝一週翻一次" });
    expect(f.description).toBe("重點\n・藤枝一週翻一次");
  });
});

describe("validateAeo", () => {
  const ok = { question: "雪松擴香可以用多久？", answer: ANSWER, body: BODY };

  it("達標就沒有問題", () => {
    expect(validateAeo("web-qa", ok, { brandName: "禾木香氛" })).toEqual([]);
  });

  it("直接答案沒有品牌名會被抓——那一句要能被單獨摘走", () => {
    const out = validateAeo("web-qa", { ...ok, answer: "我們的雪松擴香瓶 200ml 可以用大約三個月，放在五坪以內的房間香氣最穩定。" }, { brandName: "禾木香氛" });
    expect(out.some((p) => p.includes("品牌名"))).toBe(true);
  });

  it("缺段、太短都列出來", () => {
    const out = validateAeo("web-qa", { question: "", answer: "太短", body: "" });
    expect(out).toEqual(expect.arrayContaining(["缺【問題】"]));
    expect(out.some((p) => p.includes("太短"))).toBe(true);
  });

  // 2026-10-10 DEV 實測：規定展開至少 150 字，原稿只有 175 字的貼文就被補出一堆原稿沒有的玩法。
  it("展開沒有下限——原稿事實少就該短；太長才抓", () => {
    expect(validateAeo("web-qa", { ...ok, body: "" }, { brandName: "禾木香氛" })).toEqual([]);
    expect(validateAeo("web-qa", { ...ok, body: "字".repeat(500) }).some((p) => p.includes("【展開】太長"))).toBe(true);
  });

  it("原稿沒有的數字會被抓出來", () => {
    const src = ["雪松擴香瓶 200ml，可以用大約三個月。售價 1,280 元。"];
    expect(validateAeo("web-qa", { ...ok, body: "200ml 一瓶 1280 元。" }, { sources: src })).toEqual([]);
    const out = validateAeo("web-qa", { ...ok, body: "可以省下 60–70% 的時間，２４小時都香。" }, { sources: src });
    expect(out.some((p) => p.includes("60、70、24"))).toBe(true);
  });

  it("會過期的時間會被抓出來", () => {
    const out = validateAeo("web-qa", { ...ok, answer: `${ANSWER}活動今日正式開跑。` });
    expect(out.some((p) => p.includes("「今日」"))).toBe(true);
  });

  it("YouTube 標題超過平台上限會被抓", () => {
    const out = validateAeo("yt-description", { title: "字".repeat(101), description: "字".repeat(120) });
    expect(out.some((p) => p.includes("100 字上限"))).toBe(true);
  });
});

describe("輸出", () => {
  const f = { question: "A <b> 可以嗎？", answer: "可以 </script> 的。", body: "第一段\n\n第二段" };

  it("serialize 之後解析得回來（合規檢查靠這個）", () => {
    expect(parseAeoReply("web-qa", serializeAeo("web-qa", f)).fields).toEqual(f);
  });

  it("結構化資料是合法 JSON，而且關不掉外層的 script 標籤", () => {
    const json = faqJsonLd(f);
    expect(json).not.toContain("</script>");
    const data = JSON.parse(json);
    expect(data["@type"]).toBe("FAQPage");
    expect(data.mainEntity[0].name).toBe("A <b> 可以嗎？");
    expect(data.mainEntity[0].acceptedAnswer.text).toBe("可以 </script> 的。\n\n第一段\n\n第二段");
  });

  it("HTML 片段把內容跳脫，看得到的文字與結構化資料一致", () => {
    const html = faqHtmlSnippet(f);
    expect(html).toContain("<h2>A &lt;b&gt; 可以嗎？</h2>");
    expect(html).toContain("<p>第一段</p>");
    expect(html.match(/<\/script>/g)?.length).toBe(1);
  });

  it("純文字版＝問題／答案／展開", () => {
    expect(aeoPlainText("web-qa", f)).toBe("A <b> 可以嗎？\n\n可以 </script> 的。\n\n第一段\n\n第二段");
  });
});

describe("合約與目錄", () => {
  it("合約帶品牌名、帶無法轉換的出口", () => {
    const block = aeoContractBlock("web-qa", { brandName: "禾木香氛" });
    expect(block).toContain("「禾木香氛」");
    expect(block).toContain("【無法轉換】");
  });

  it("存檔掛的任務卡都在目錄裡，通路也對", () => {
    const byId = new Map(buildTaskCatalogIndex().map((t) => [t.id, t]));
    expect(byId.get(AEO_TARGET_TASK["web-qa"].taskId)?.platform).toBe("website");
    expect(byId.get(AEO_TARGET_TASK["yt-description"].taskId)?.platform).toBe("youtube");
  });

  it("官網／YouTube／新聞稿的產出本身就是 AI 讀得到的，不用再轉", () => {
    for (const p of ["website", "youtube", "press", "PR"]) expect(isAeoNativePlatform(p)).toBe(true);
    for (const p of ["facebook", "instagram", "threads", "line", null]) expect(isAeoNativePlatform(p)).toBe(false);
  });
});

// 2026-10-10：問題地圖。轉換時對得上地圖上的題目就用那一題，覆蓋率才算得準。
describe("對應問題地圖", () => {
  it("給了清單，合約才會列題目與【對應】", () => {
    expect(aeoContractBlock("web-qa", { brandName: "禾木香氛" })).not.toContain("【對應】");
    const block = aeoContractBlock("web-qa", { brandName: "禾木香氛", candidates: ["擴香可以用多久？", "放臥室安全嗎？"] });
    expect(block).toContain("1. 擴香可以用多久？");
    expect(block).toContain("2. 放臥室安全嗎？");
    expect(block).toContain("【對應】");
    // YouTube 版沒有問題地圖
    expect(aeoContractBlock("yt-description", { candidates: ["擴香可以用多久？"] })).not.toContain("【對應】");
  });

  it("解析出對到第幾題；沒寫或寫 0 就是沒對到，而且不混進問題或答案", () => {
    const hit = parseAeoReply("web-qa", `【問題】\n擴香可以用多久？\n【對應】\n1\n【直接答案】\n${ANSWER}\n【展開】\n${BODY}`);
    expect(hit.matchIndex).toBe(1);
    expect(hit.fields.question).toBe("擴香可以用多久？");
    expect(hit.fields.answer).toBe(ANSWER);
    expect(parseAeoReply("web-qa", `【問題】\nQ？\n【對應】\n0\n【直接答案】\n${ANSWER}`).matchIndex).toBe(0);
    expect(parseAeoReply("web-qa", `【問題】\nQ？\n【直接答案】\n${ANSWER}`).matchIndex).toBe(0);
  });
});
