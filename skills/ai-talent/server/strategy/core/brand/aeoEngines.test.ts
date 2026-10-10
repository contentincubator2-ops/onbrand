import { describe, expect, it } from "vitest";
import {
  AEO_ENGINES, AEO_ENGINE_LABEL, brandTermsOf, domainOf, errorKind, keysFor, mentionsBrand,
  parseClaude, parseGemini, parseOpenAi, parsePerplexity, parseSerp,
} from "./aeoEngines";
import { mentionSummary, scanStatusOf } from "./aeoQuestions";

// 回應的形狀都照 2026-10-10 用真的金鑰實測到的（op-probe-ai-search-engines／op-probe-gemini-grounding）。

describe("品牌辨識", () => {
  it("品牌名＋官網網域；太短的字不用，免得到處誤判", () => {
    expect(brandTermsOf("SoWork", "https://www.sowork.ai/service")).toEqual(["sowork", "sowork.ai"]);
    expect(brandTermsOf("禾木香氛", null)).toEqual(["禾木香氛"]);
    expect(brandTermsOf("AI", "ai.co")).toEqual(["ai.co"]);
    expect(brandTermsOf("", null)).toEqual([]);
  });

  it("回答或引用裡出現就算提到；沒有辨識字串就一律不算", () => {
    expect(mentionsBrand(["推薦使用 SoWork.ai 的工具"], ["sowork"])).toBe(true);
    expect(mentionsBrand(["推薦 Supermetrics", "https://funnel.io/blog"], ["sowork"])).toBe(false);
    expect(mentionsBrand(["", "https://sowork.ai/blog/x"], ["sowork.ai"])).toBe(true);
    expect(mentionsBrand(["SoWork"], [])).toBe(false);
  });

  it("網域：去掉 www；不是網址就原樣（Gemini 給的是標題）", () => {
    expect(domainOf("https://www.Shopline.tw/a/b?x=1")).toBe("shopline.tw");
    expect(domainOf("funnel.io")).toBe("funnel.io");
  });
});

describe("各家回應的解析", () => {
  it("Perplexity：引用在 search_results（或 citations），延伸問題可能沒有", () => {
    const p = parsePerplexity({
      choices: [{ message: { content: "可以用報表整合工具。" } }],
      search_results: [{ url: "https://apps.shopline.tw/x" }, { url: "https://www.shopline.tw/y" }, { url: "https://apps.shopline.tw/z" }],
    });
    expect(p.domains).toEqual(["apps.shopline.tw", "shopline.tw"]);
    expect(p.related).toEqual([]);
    expect(p.excerpt).toBe("可以用報表整合工具。");
    expect(parsePerplexity({ choices: [], citations: ["https://a.com/1"], related_questions: ["怎麼選？"] }).related).toEqual(["怎麼選？"]);
  });

  it("OpenAI：把原句照搬的檢索詞不算；引用在訊息的 annotations", () => {
    const q = "行銷報表自動化";
    const p = parseOpenAi({
      output: [
        { type: "web_search_call", action: { query: q } },
        { type: "web_search_call", action: { queries: ["marketing report automation tools"] } },
        { type: "message", content: [{ text: "有幾種做法。", annotations: [{ type: "url_citation", url: "https://admetry.app/a" }, { type: "other" }] }] },
      ],
    }, q);
    expect(p.queries).toEqual(["marketing report automation tools"]);
    expect(p.domains).toEqual(["admetry.app"]);
    // 實測：中文檢索詞回來是字面的 \uXXXX。還原後跟原句一樣就不列；不一樣的要看得懂。
    const escaped = parseOpenAi({ output: [
      { type: "web_search_call", action: { query: "\\u884c\\u92b7\\u5831\\u8868\\u81ea\\u52d5\\u5316" } },
      { type: "web_search_call", action: { query: "\\u884c\\u92b7 \\u5de5\\u5177" } },
    ] }, q);
    expect(escaped.queries).toEqual(["行銷 工具"]);
  });

  it("Gemini：檢索詞在 webSearchQueries；引用的網域要看 title（uri 是 Google 的轉址）", () => {
    const p = parseGemini({
      candidates: [{
        content: { parts: [{ text: "常見工具有…", thoughtSignature: "x" }] },
        groundingMetadata: {
          webSearchQueries: ["行銷報表 自動化 工具 推薦", "best marketing reporting automation tools"],
          groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA", title: "funnel.io" } }, { web: { uri: "https://vertexaisearch.cloud.google.com/x", title: "improvado.io" } }],
        },
      }],
    });
    expect(p.queries).toHaveLength(2);
    expect(p.domains).toEqual(["funnel.io", "improvado.io"]);
    // 沒上網查的回應：接地資料整個不存在
    expect(parseGemini({ candidates: [{ content: { parts: [{ text: "憑記憶回答" }] } }] }).domains).toEqual([]);
  });

  it("Claude：檢索詞在 server_tool_use，引用在 web_search_tool_result", () => {
    const p = parseClaude({
      content: [
        { type: "server_tool_use", input: { query: "Google Looker Studio Meta Ads Shopline 報表 自動化 連接器" } },
        { type: "web_search_tool_result", content: [{ url: "https://www.shopline.tw/a" }, { url: "https://ithelp.ithome.com.tw/b" }] },
        { type: "web_search_tool_result", content: { type: "web_search_tool_result_error" } },
        { type: "text", text: "可以用 Looker Studio。" },
      ],
    });
    expect(p.queries).toEqual(["Google Looker Studio Meta Ads Shopline 報表 自動化 連接器"]);
    expect(p.domains).toEqual(["shopline.tw", "ithelp.ithome.com.tw"]);
    expect(p.excerpt).toBe("可以用 Looker Studio。");
  });

  it("Google：其他人也問了＋相關搜尋；引用＝AI 摘要的來源在前、再接前五筆搜尋結果", () => {
    const p = parseSerp({
      related_questions: [{ question: "有哪些 AI 行銷工具?" }, { question: "行銷會被AI取代嗎？" }],
      related_searches: [{ query: "行銷分析工具" }],
      organic_results: [{ title: "十大行銷工具", snippet: "…", link: "https://welly.tw/a" }],
    }, { text_blocks: [{ snippet: "摘要" }], references: [{ link: "https://awoo.ai/x" }] });
    expect(p.related).toEqual(["有哪些 AI 行銷工具?", "行銷會被AI取代嗎？", "行銷分析工具"]);
    expect(p.domains).toEqual(["awoo.ai", "welly.tw"]);
    expect(p.excerpt).toBe("十大行銷工具");
  });
});

describe("金鑰與錯誤", () => {
  it("專用的那一串優先，再接 app 原本那一把；空的、重複的拿掉", () => {
    expect(keysFor("claude", { AEO_CLAUDE_KEYS: "k1, ,k2", ANTHROPIC_API_KEY: "k2" })).toEqual(["k1", "k2"]);
    expect(keysFor("google", {})).toEqual([]);
    expect(keysFor("gemini", { GOOGLE_AI_API_KEY: "g" })).toEqual(["g"]);
  });

  it("錯誤只留種類，不存供應商回的整段", () => {
    expect(errorKind(new Error('HTTP 401: {"error":{"message":"You exceeded your current quota"}}'))).toBe("額度用完或被限流");
    expect(errorKind(new Error("HTTP 400: Your credit balance is too low"))).toBe("額度用完或被限流");
    expect(errorKind(new Error("HTTP 401: invalid x-api-key"))).toBe("金鑰無效");
    expect(errorKind(new Error("The operation was aborted due to timeout"))).toBe("逾時");
    expect(errorKind(new Error("HTTP 503: upstream"))).toBe("對方服務暫時有問題");
  });

  it("五家都有顯示名稱", () => {
    for (const e of AEO_ENGINES) expect(AEO_ENGINE_LABEL[e].zh).toBeTruthy();
  });
});

describe("掃描狀態與摘要", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  it("卡太久的 running 視為失敗；沒掃過是 idle", () => {
    expect(scanStatusOf(null, null, now)).toBe("idle");
    expect(scanStatusOf("running", "2026-10-10T11:59:00Z", now)).toBe("running");
    expect(scanStatusOf("running", "2026-10-10T11:50:00Z", now)).toBe("failed");
    expect(scanStatusOf("done", "2026-10-01T00:00:00Z", now)).toBe("done");
  });

  it("幾家提到你：沒設金鑰與失敗的不算進分母", () => {
    expect(mentionSummary([
      { status: "ok", mentioned: false }, { status: "ok", mentioned: true },
      { status: "failed", mentioned: false }, { status: "unconfigured", mentioned: false },
    ])).toEqual({ answered: 2, mentioned: 1 });
    expect(mentionSummary([])).toEqual({ answered: 0, mentioned: 0 });
  });
});
