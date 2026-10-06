import { describe, expect, it } from "vitest";

// tRPC 在建構期就會拒絕保留字 procedure 名稱（apply/call/bind…），而 tsc 抓不到——
// 所以每個 router 都要有一支真的 import 它的測試。
describe("influencerRouter", () => {
  it("builds and exposes its procedures", async () => {
    const { influencerRouter } = await import("./influencerRouter");
    const procs = Object.keys((influencerRouter as any)._def.procedures);
    expect(procs.sort()).toEqual(["analyzePoll", "analyzeStart", "exportFile", "latest", "parseSheet", "pickIdea", "readable", "savePerson", "usps"]);
  }, 60_000);
});

describe("influencerLink", () => {
  it("classifies platform, handle and whether the server can read it", async () => {
    const { classifyLink } = await import("../core/influencer/influencerLink");
    const c = (u: string) => { const l = classifyLink(u); return l && [l.platform, l.handle, l.serverReadable]; };
    expect(c("https://www.instagram.com/some.one/")).toEqual(["instagram", "some.one", false]);
    expect(c("instagram.com/p/Cabc123/")).toEqual(["instagram", null, false]);
    expect(c("https://www.threads.net/@some_one")).toEqual(["threads", "some_one", false]);
    expect(c("https://www.threads.com/@some_one")).toEqual(["threads", "some_one", false]);
    expect(c("https://www.tiktok.com/@abc?lang=zh")).toEqual(["tiktok", "abc", false]);
    expect(c("https://www.youtube.com/@joeman/videos")).toEqual(["youtube", "joeman", true]);
    expect(c("https://youtu.be/dQw4w9WgXcQ")).toEqual(["youtube", null, true]);
    expect(c("https://someone.pixnet.net/blog")).toEqual(["web", null, true]);
  });

  it("rejects things that are not public web links", async () => {
    const { classifyLink } = await import("../core/influencer/influencerLink");
    for (const bad of ["", "@someone", "王小明", "javascript:alert(1)", "http://localhost:3000/x", "http://127.0.0.1/",
      "http://10.0.0.5/admin", "http://169.254.169.254/latest/meta-data", "http://192.168.1.1", "http://[::1]/", "ftp://example.com/a"]) {
      expect(classifyLink(bad), bad).toBeNull();
    }
  });
});

describe("influencerReader parsers", () => {
  it("pulls channel id, name, about and subscriber text from a channel page", async () => {
    const { parseChannelPage, parseChannelFeed } = await import("../core/influencer/influencerReader");
    const html = `<meta property="og:title" content="Test &amp; Co"><meta property="og:description" content="開箱與旅遊">`
      + `{"externalId":"UCPRWWKG0VkBA0Pqa4Jr5j0Q"} {"text":{"content":"286萬位訂閱者"}}`;
    expect(parseChannelPage(html)).toEqual({ channelId: "UCPRWWKG0VkBA0Pqa4Jr5j0Q", name: "Test & Co", about: "開箱與旅遊", followers: "286萬位訂閱者" });
    const xml = `<feed><entry><title>第一支 &amp; 開箱</title><media:group><media:description>說明\n第二行</media:description></media:group></entry>`
      + `<entry><title>第二支</title><media:group><media:description></media:description></media:group></entry></feed>`;
    expect(parseChannelFeed(xml)).toEqual([{ title: "第一支 & 開箱", description: "說明 第二行" }, { title: "第二支", description: "" }]);
  });
});

describe("apifyProfiles", () => {
  it("turns each actor's items into material, and returns null when there is nothing to read", async () => {
    const { ACTORS, followersText } = await import("../core/influencer/apifyProfiles");
    expect(followersText(268_440_000)).toBe("2.7 億粉絲");
    expect([followersText(286_0000), followersText(12_345), followersText(980), followersText(0), followersText("x")])
      .toEqual(["286 萬粉絲", "1.2 萬粉絲", "980 粉絲", null, null]);

    const ig = ACTORS.instagram!.toRead([{
      username: "Mei", fullName: "小美", businessCategoryName: "None", biography: "兩寶媽\n共讀紀錄", followersCount: 52000, verified: true,
      latestPosts: [{ caption: "睡前 20 分鐘是我們家的固定儀式" }, { caption: "" }, { caption: "長途開車救星清單" }],
    }], "mei")!;
    expect(ig.displayName).toBe("小美");
    expect(ig.followers).toBe("5.2 萬粉絲");
    expect(ig.material).toContain("自介：兩寶媽 共讀紀錄");
    expect(ig.material).toContain("最近 2 則貼文：");
    expect(ig.material).not.toContain("類別");
    expect(ig.material).toContain("- 長途開車救星清單");
    // 私人帳號、查無此人、actor 回錯誤：沒有內容就是讀不到。
    expect(ACTORS.instagram!.toRead([{ username: "mei", private: true, latestPosts: [] }], "mei")).toBeNull();
    expect(ACTORS.instagram!.toRead([{ error: "not_found" }], "mei")).toBeNull();

    const tt = ACTORS.tiktok!.toRead([
      { text: "開箱新玩具", authorMeta: { name: "mei", nickName: "小美", signature: "育兒日常", fans: 3000 } },
      { text: "一日 vlog", authorMeta: { name: "mei" } },
    ], "mei")!;
    expect(tt.followers).toBe("3,000 粉絲");
    expect(tt.material).toContain("最近 2 支影片的說明：");

    // Threads：只收這個帳號自己的貼文（回文串裡別人的不算）。
    const th = ACTORS.threads!.toRead([
      { text: "今天聊一人行銷部", username: "mei", user_full_name: "小美" },
      { text: "別人的回覆", username: "someone_else" },
    ], "mei")!;
    expect(th.material).toContain("最近 1 則貼文：");
    expect(th.material).not.toContain("別人的回覆");
    expect(ACTORS.threads!.toRead([], "mei")).toBeNull();
  });

  it("is off without a token, and never calls out for a malformed handle", async () => {
    const { providerPlatforms, readSocialProfile } = await import("../core/influencer/apifyProfiles");
    const saved = [process.env.APIFY_API_TOKEN, process.env.APIFY_TOKEN];
    delete process.env.APIFY_API_TOKEN; delete process.env.APIFY_TOKEN;
    try {
      expect(providerPlatforms()).toEqual([]);
      expect(await readSocialProfile("instagram", "mei")).toBeNull();
      process.env.APIFY_API_TOKEN = "test-token";
      expect(providerPlatforms().sort()).toEqual(["instagram", "threads", "tiktok"]);
      expect(await readSocialProfile("instagram", "../../etc/passwd")).toBeNull();
      expect(await readSocialProfile("facebook", "mei")).toBeNull();
    } finally {
      if (saved[0] === undefined) delete process.env.APIFY_API_TOKEN; else process.env.APIFY_API_TOKEN = saved[0];
      if (saved[1] !== undefined) process.env.APIFY_TOKEN = saved[1];
    }
  });
});

describe("influencerAngles", () => {
  const MATERIAL = "Instagram：小美（@mei）\n- 苗栗 26 間森林系景觀餐廳，快存起來\n- 空間看似粗獷，細節卻很溫柔。";

  it("the ideas prompt puts the model in the creator's seat and keeps the two fact sources apart", async () => {
    const { ideasPrompt, voicePrompt, IDEA_KINDS } = await import("../core/influencer/influencerAngles");
    const p = ideasPrompt({
      brandName: "測試品牌", subjectLine: "「測試品牌」的產品「A」", brandCtx: "品牌資料內容", outputLanguage: "zh-TW",
      label: "小美", platform: "Instagram", followers: "3.2 萬粉絲", material: MATERIAL, voice: "語氣溫柔平靜", avoid: ["已用點子"], direction: "想主打送禮",
    });
    expect(p).toContain("你現在就是下面這位創作者本人");
    expect(p).toContain("做給「你的觀眾」看的，不是品牌在對你推銷");
    expect(p).toContain("產品事實的唯一來源");
    expect(p).toContain("語氣溫柔平靜");
    expect(p).toContain("- 已用點子");
    expect(p).toContain("想主打送禮");
    expect(p).toContain("私人生活");
    expect(p).toContain("品牌簡報用語");
    expect(p).toContain("主體只能做它本來做的事");
    expect(p).not.toContain("主打的賣點");
    // 配了賣點：三個點子都帶同一個。
    const withUsp = ideasPrompt({
      brandName: "測試品牌", subjectLine: "x", brandCtx: "", outputLanguage: "zh-TW", label: "小美", platform: "Instagram", followers: null,
      material: MATERIAL, voice: "v", usp: "一鍵產出品牌定位",
    });
    expect(withUsp).toContain("【品牌這次想請你主打的賣點】一鍵產出品牌定位");
    expect(withUsp).toContain("三個點子都要帶到這一個賣點");
    for (const k of IDEA_KINDS) expect(p).toContain(`${k.key}：`);
    expect(voicePrompt("zh-TW")).toContain("照抄 3 句");
  });

  it("parseIdeas keeps one idea per starting point in a fixed order and needs at least two", async () => {
    const { parseIdeas } = await import("../core/influencer/influencerAngles");
    const idea = (kind: string, title: string) => ({ kind, title, hook: "「開場句」", productPoint: "一鍵產出品牌定位", why: "會想存", basedOn: "苗栗 26 間森林系景觀餐廳" });
    const raw = "好的：\n```json\n" + JSON.stringify({
      name: "小美", profile: "旅遊攝影創作者", evidence: "「苗栗 26 間森林系景觀餐廳」", format: "圖文貼文",
      ideas: [idea("method", "方法"), idea("own", "延伸"), idea("own", "重複的"), idea("bogus", "不認得"), { kind: "contrast", title: "沒有開場", hook: "" }],
    }) + "\n```";
    const out = parseIdeas(raw, MATERIAL)!;
    expect(out.ideas.map((i) => [i.kind, i.title])).toEqual([["own", "延伸"], ["method", "方法"]]);
    expect(out.ideas[0]!.hook).toBe("開場句");               // 包住整句的引號拿掉
    expect(out.ideas[0]!.basedOn).toBe("苗栗 26 間森林系景觀餐廳");
    expect(out.ideas[1]!.basedOn).toBeUndefined();            // 只有 own 留 basedOn
    expect(out.evidence).toBe("「苗栗 26 間森林系景觀餐廳」");
    expect(out.detectedName).toBe("小美");
    // 依據引了一句素材裡沒有的話：整句拿掉。
    const fake = parseIdeas(JSON.stringify({ evidence: "「她說旅行是為了找回自己的節奏」", ideas: [idea("own", "a"), idea("method", "b")] }), MATERIAL)!;
    expect(fake.evidence).toBe("");
    expect(parseIdeas(JSON.stringify({ ideas: [idea("own", "只有一個")] }), MATERIAL)).toBeNull();
    expect(parseIdeas("不是 JSON", MATERIAL)).toBeNull();
  });

  it("flags quotes that are not in what we read, and over-long emails", async () => {
    const { unsupportedQuotes, emailIssues, EMAIL_MAX_CHARS } = await import("../core/influencer/influencerAngles");
    const known = [MATERIAL, "品牌：一鍵產出品牌定位"];
    const body = "看到你做的「苗栗 26 間森林系景觀餐廳，快存起來」；你說的「旅行是為了找回自己的節奏，這句話我記了很久」讓我們印象很深。我們想聊「快存」。";
    // 標題照抄＝有依據；短的強調詞不查；編出來的那句被抓到。
    expect(unsupportedQuotes(body, known)).toEqual(["旅行是為了找回自己的節奏，這句話我記了很久"]);
    expect(emailIssues(body, known)).toHaveLength(1);
    expect(emailIssues("字".repeat(EMAIL_MAX_CHARS + 1), known)).toHaveLength(1);
    expect(emailIssues("很短、沒有引用的信。".repeat(5), known)).toEqual([]);
  });

  it("the email prompt carries the picked idea, last round's problems, and the no-price rule", async () => {
    const { emailPrompt, parseEmail } = await import("../core/influencer/influencerAngles");
    const p = emailPrompt({
      brandName: "測試品牌", subjectLine: "x", brandCtx: "品牌資料", label: "小美", material: MATERIAL, outputLanguage: "zh-TW",
      idea: { kind: "own", title: "整理 26 間餐廳，我怎麼不讓自己亂", hook: "h", productPoint: "一鍵產出品牌定位", why: "w", basedOn: "苗栗 26 間" },
      fixes: ["內文太長"],
    });
    expect(p).toContain("整理 26 間餐廳，我怎麼不讓自己亂");
    expect(p).toContain("延伸自他做過的：苗栗 26 間");
    expect(p).toContain("- 內文太長");
    expect(p).toContain("不提費用、預算、報價");
    expect(p).toContain("不可以替他編一句話");
    expect(p).toContain("主體只能做它本來做的事");
    expect(parseEmail(JSON.stringify({ subject: "主旨", body: "x".repeat(60) }))).toEqual({ subject: "主旨", body: "x".repeat(60) });
    expect(parseEmail(JSON.stringify({ subject: "主旨", body: "太短" }))).toBeNull();
  });

  it("materialEnough ignores whitespace", async () => {
    const { materialEnough, MIN_MATERIAL_CHARS } = await import("../core/influencer/influencerAngles");
    expect(materialEnough(" \n".repeat(500))).toBe(false);
    expect(materialEnough("字".repeat(MIN_MATERIAL_CHARS))).toBe(true);
  });
});

describe("influencerUsps", () => {
  it("splits a positioning field only at clear separators and never mid-sentence", async () => {
    const { splitUspText, USP_MAX_CHARS } = await import("../core/influencer/influencerUsps");
    expect(splitUspText("整合 44 個大數據來源\n顧問與 AI 一起判斷")).toEqual(["整合 44 個大數據來源", "顧問與 AI 一起判斷"]);
    expect(splitUspText("1. 一鍵產出品牌定位 2. 法規自動檢查；3、多市場語言")).toEqual(["一鍵產出品牌定位", "法規自動檢查", "多市場語言"]);
    expect(splitUspText("• 冷壓初榨 • 單一產區 · 當季現採")).toEqual(["冷壓初榨", "單一產區", "當季現採"]);
    expect(splitUspText(["陣列裡的第一條賣點", "", 3, "陣列裡的第二條賣點"])).toEqual(["陣列裡的第一條賣點", "陣列裡的第二條賣點"]);
    // 一整段沒有分隔的長文不硬切，只在太長時截尾。
    const long = "這是一段沒有任何分隔符號的長文字" + "，一直寫下去".repeat(30);
    const out = splitUspText(long);
    expect(out).toHaveLength(1);
    expect(out[0]!.length).toBe(USP_MAX_CHARS);
    expect(splitUspText("加熱速度快 3.5 倍；44 個數據來源")).toEqual(["加熱速度快 3.5 倍", "44 個數據來源"]);   // 小數與數量不是編號
    expect(splitUspText(null)).toEqual([]);
    expect(splitUspText("好")).toEqual([]);
  });

  it("reads the right fields per subject, most distinctive first, de-duplicated", async () => {
    const { uspsFromPositioning, MAX_USPS } = await import("../core/influencer/influencerUsps");
    const product = { competition: { uniqueUsp: "獨家配方\n三年保固", rareUsp: "三年保固；台灣製造", commonUsp: "大家都說的" }, value: { coreFunctions: ["快速加熱", "自動斷電"] } };
    expect(uspsFromPositioning("product", JSON.stringify(product))).toEqual([
      { text: "獨家配方", from: "獨家賣點" }, { text: "三年保固", from: "獨家賣點" },
      { text: "台灣製造", from: "少數競品也說的賣點" },
      { text: "快速加熱", from: "核心功能" }, { text: "自動斷電", from: "核心功能" },
    ]);
    expect(uspsFromPositioning("brand", { differentiation: { discriminator: "唯一敢公開成分來源", summary: "不讀這格" } }))
      .toEqual([{ text: "唯一敢公開成分來源", from: "唯一致勝理由" }]);
    expect(uspsFromPositioning("event", { smp: { singleMindedProposition: "買一送一只到週日" } })[0]!.from).toBe("單一主張");
    expect(uspsFromPositioning("product", { competition: { uniqueUsp: Array.from({ length: 20 }, (_, i) => `第 ${i + 1} 個賣點`).join("\n") } })).toHaveLength(MAX_USPS);
    expect(uspsFromPositioning("product", null)).toEqual([]);
    expect(uspsFromPositioning("product", "不是 JSON")).toEqual([]);
  });

  it("cleanUsps trims, de-duplicates and caps what the user sends", async () => {
    const { cleanUsps, MAX_USPS } = await import("../core/influencer/influencerUsps");
    expect(cleanUsps(["  三年  保固 ", "三年保固", "", "x", "台灣製造"])).toEqual(["三年 保固", "台灣製造"]);
    expect(cleanUsps(Array.from({ length: 20 }, (_, i) => `賣點 ${i}`))).toHaveLength(MAX_USPS);
    expect(cleanUsps("不是陣列")).toEqual([]);
  });

  it("parseMatches keeps valid picks and gives everyone left over the least-used selling point", async () => {
    const { parseMatches, matchPrompt } = await import("../core/influencer/influencerUsps");
    const usps = ["獨家配方", "三年保固", "台灣製造"];
    const raw = "好的：" + JSON.stringify({ matches: [
      { id: "p1", usp: 1, why: "常做成分解析" }, { id: "p1", usp: 2, why: "重複" }, { id: "zz", usp: 1 }, { id: "p2", usp: 9, why: "編號不存在" },
    ] });
    const out = parseMatches(raw, usps, ["p1", "p2", "p3", "p4"]);
    expect(out.get("p1")).toEqual({ usp: "獨家配方", why: "常做成分解析" });
    // p2（編號不存在）、p3、p4（模型漏掉）：補到目前最少人講的，理由留空。
    expect([out.get("p2"), out.get("p3"), out.get("p4")]).toEqual([
      { usp: "三年保固", why: "" }, { usp: "台灣製造", why: "" }, { usp: "獨家配方", why: "" },
    ]);
    // 模型整個失敗：全部用補的，照樣分散。
    expect([...parseMatches(null, usps, ["a", "b", "c"]).values()].map((m) => m.usp)).toEqual(usps);
    // 這一批已經有兩位在講第一個：補寫的人不再擠過去。
    expect(parseMatches(null, usps, ["a"], { 獨家配方: 2, 三年保固: 1 }).get("a")!.usp).toBe("台灣製造");
    expect(parseMatches(raw, [], ["p1"]).size).toBe(0);
    const prompt = matchPrompt({
      brandName: "測試品牌", subjectLine: "產品 A", usps, outputLanguage: "zh-TW", taken: { 獨家配方: 2 },
      people: [{ id: "p1", label: "小美", platform: "Instagram", followers: "3.2 萬粉絲", digest: "旅遊清單" }],
    });
    expect(prompt).toContain("1. 獨家配方");
    expect(prompt).toContain("1：已有 2 位在講");
    expect(prompt).toContain("不要讓超過一半的人擠在同一個");
    expect(prompt).toContain("id=p1｜小美｜Instagram｜3.2 萬粉絲");
  });
});

describe("influencerSheet", () => {
  it("zip round-trips", async () => {
    const { zip, unzip } = await import("../core/influencer/miniZip");
    const out = unzip(zip([{ name: "a/中文.txt", data: "哈囉".repeat(500) }, { name: "b.bin", data: Buffer.from([0, 1, 2, 255]) }]));
    expect(out.get("a/中文.txt")!.toString("utf8")).toBe("哈囉".repeat(500));
    expect([...out.get("b.bin")!]).toEqual([0, 1, 2, 255]);
    expect(() => unzip(Buffer.from("not a zip at all, really not"))).toThrow();
  });

  it("reads a headed CSV, a bare list of links, and skips rows without a link", async () => {
    const { parseSheet } = await import("../core/influencer/influencerSheet");
    const csv = "﻿網紅,連結,Email,備註\n小明,https://www.youtube.com/@ming,ming@example.com,\"科技開箱,\n常拍 Mac\"\n沒有連結的人,,,\n小美,instagram.com/mei,,\n小明重複,https://www.youtube.com/@ming,,\n";
    const r = parseSheet(Buffer.from(csv, "utf8"), "list.csv");
    expect(r.skipped).toBe(1);
    expect(r.people).toEqual([
      { url: "https://www.youtube.com/@ming", name: "小明", email: "ming@example.com", notes: "科技開箱,\n常拍 Mac" },
      { url: "https://instagram.com/mei", name: "小美", email: undefined, notes: undefined },
    ]);
    const bare = parseSheet(Buffer.from("https://www.youtube.com/@a\nhttps://www.threads.net/@b\n", "utf8"), "links.txt");
    expect(bare.people.map((p) => p.url)).toEqual(["https://www.youtube.com/@a", "https://www.threads.net/@b"]);
  });

  it("exports an xlsx that its own reader can read back, including hyperlink-only cells on import", async () => {
    const { buildXlsx, buildDocx, readXlsx, rowsToPeople } = await import("../core/influencer/influencerSheet");
    const { unzip } = await import("../core/influencer/miniZip");
    const people: any[] = [{
      id: "p1", url: "https://www.youtube.com/@ming", name: "小明 <A&B>", email: "ming@example.com", status: "done",
      platform: "youtube", handle: "ming", followers: "10萬位訂閱者", source: "youtube_channel", displayName: "Ming",
      profile: "科技開箱", evidence: "Mac 開箱", format: "開箱長片", picked: 1, usp: "三年保固", uspWhy: "常做耐用度實測",
      ideas: [
        { kind: "own", title: "延伸點子", hook: "開場一", productPoint: "特色一", why: "w1", basedOn: "Mac 開箱" },
        { kind: "method", title: "方法點子", hook: "開場三", productPoint: "特色三", why: "w3" },
      ],
      emailSubject: "主旨", emailBody: "第一段\n\n第二段\u0007",
    }, {
      // 2026-10-06 改寫前的舊資料：一位一個切角。
      id: "p0", url: "https://www.youtube.com/@old", name: "舊資料", status: "done", platform: "youtube", handle: "old", followers: null, source: "youtube_channel", displayName: null,
      angle: "舊切角", hook: "舊開場", talkingPoints: ["甲", "乙"], angleWhy: "因為", emailSubject: "s", emailBody: "b".repeat(50),
    }, { id: "p2", url: "https://www.instagram.com/mei", status: "needs_material", platform: "instagram", handle: "mei", followers: null, source: "none", displayName: null }];
    const { rows } = readXlsx(buildXlsx(people, "測試/產品 網紅切角"));
    expect(rows[0]!.slice(0, 3)).toEqual(["網紅", "平台", "連結"]);
    expect(rows[0]![6]).toBe("主打賣點");
    expect(rows[0]![7]).toBe("點子一（從他做過的內容延伸）");
    expect(rows[1]![0]).toBe("小明 <A&B>");
    expect(rows[1]![6]).toBe("三年保固\n為什麼是他：常做耐用度實測");
    expect(rows[1]![7]).toBe("延伸點子\n「開場一」\n帶到：特色一");
    expect(rows[1]![8]).toBe("");                              // 沒有 contrast 那一個
    expect(rows[1]![9]).toBe("方法點子\n「開場三」\n帶到：特色三");
    expect(rows[1]![10]).toBe("方法點子");                      // picked: 1
    expect(rows[1]![13]).toBe("第一段\n\n第二段");
    expect(rows[2]![6]).toBe("");
    expect(rows[2]![7]).toBe("舊切角\n「舊開場」\n帶到：甲、乙");
    expect(rows[2]![10]).toBe("舊切角");
    expect(rows[3]![14]).toBe("資料不足，請補貼文");
    const doc = unzip(buildDocx(people, "測試 網紅切角")).get("word/document.xml")!.toString("utf8");
    expect(doc).toContain("小明 &lt;A&amp;B&gt;");
    expect(doc).toContain("點子 2（已選）");
    expect(doc).toContain("三年保固");
    expect(doc).toContain("舊切角");
    expect(doc).toContain("資料不足，請補貼文");
    expect(doc).not.toContain("\u0007");
    // 自己匯出的表再匯入：「個人特色」欄不會被當成用戶補的素材。
    expect(rowsToPeople(rows).people[0]).toEqual({ url: "https://www.youtube.com/@ming", name: "小明 <A&B>", email: "ming@example.com", notes: undefined });
    // 顯示文字是名字、連結藏在超連結裡的儲存格。
    const r = rowsToPeople([["名字", "信箱"], ["小華", "hua@example.com"]], new Map([["A2", "https://www.tiktok.com/@hua"]]));
    expect(r.people).toEqual([{ url: "https://www.tiktok.com/@hua", name: "小華", email: "hua@example.com", notes: undefined }]);
  });
});
