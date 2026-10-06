import { describe, expect, it } from "vitest";

// tRPC 在建構期就會拒絕保留字 procedure 名稱（apply/call/bind…），而 tsc 抓不到——
// 所以每個 router 都要有一支真的 import 它的測試。
describe("influencerRouter", () => {
  it("builds and exposes its procedures", async () => {
    const { influencerRouter } = await import("./influencerRouter");
    const procs = Object.keys((influencerRouter as any)._def.procedures);
    expect(procs.sort()).toEqual(["analyzePoll", "analyzeStart", "exportFile", "latest", "parseSheet", "readable", "savePerson"]);
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
  it("keeps the two fact sources and the no-price rule in the prompt", async () => {
    const { anglesSystemPrompt } = await import("../core/influencer/influencerAngles");
    const p = anglesSystemPrompt({
      brandName: "測試品牌", subjectLine: "「測試品牌」的產品「A」", brandCtx: "品牌資料內容", outputLanguage: "zh-TW",
      people: [{ id: "p1", label: "小明", platform: "YouTube", followers: "10萬位訂閱者", material: "YouTube 頻道：小明" }],
      avoid: ["已用切角"],
    });
    expect(p).toContain("產品特色的唯一來源");
    expect(p).toContain("個人特色的唯一來源");
    expect(p).toContain("不要提費用、預算、報價");
    expect(p).toContain("私人生活");
    expect(p).toContain("- 已用切角");
    expect(p).toContain("id=p1");
  });

  it("parsePeopleAngles keeps only requested ids, one each, and drops incomplete ones", async () => {
    const { parsePeopleAngles } = await import("../core/influencer/influencerAngles");
    const ok = { profile: "科技開箱", evidence: "Mac 開箱", talkingPoints: ["a", "b", "c", "d"], angle: "切角", angleWhy: "因為", hook: "開場", format: "長片", emailSubject: "主旨", emailBody: "x".repeat(60) };
    const raw = "好的：\n```json\n" + JSON.stringify({ people: [
      { id: "p1", ...ok }, { id: "p1", ...ok, angle: "重複的" }, { id: "zz", ...ok },
      { id: "p2", ...ok, talkingPoints: [] }, { id: "p3", ...ok, emailBody: "太短" },
    ] }) + "\n```";
    const out = parsePeopleAngles(raw, ["p1", "p2", "p3"]);
    expect([...out.keys()]).toEqual(["p1"]);
    expect(out.get("p1")!.angle).toBe("切角");
    expect(out.get("p1")!.talkingPoints).toHaveLength(3);
    expect(parsePeopleAngles("不是 JSON", ["p1"]).size).toBe(0);
  });

  it("flags quotes that are not in the material, and over-long emails and angles", async () => {
    const { unsupportedQuotes, angleIssues, EMAIL_MAX_CHARS } = await import("../core/influencer/influencerAngles");
    const material = "YouTube 頻道：小明\n- 一台超過40萬的Mac！蘋果史上最強晶片到底有多強？";
    const base = { profile: "科技開箱", talkingPoints: ["整合 44 個大數據來源"], angle: "用值不值得買的邏輯拆解顧問服務", angleWhy: "", hook: "", format: "", emailSubject: "" };
    const a = {
      ...base,
      evidence: "從「一台超過40萬的Mac！蘋果史上最強晶片到底有多強？」看得出來",
      emailBody: "你說的「規格強是一回事，但對工作流程意味著什麼才是重點」讓我們印象很深。我們想用「值不值得買」來談，也就是「用值不值得買的邏輯拆解顧問服務」。",
    };
    // 標題照抄＝有依據；短的強調詞不查；自己的切角不算；編出來的那句被抓到。
    expect(unsupportedQuotes(a, material, "")).toEqual(["規格強是一回事，但對工作流程意味著什麼才是重點"]);
    expect(unsupportedQuotes({ ...a, emailBody: "我們是「讓資深顧問思維以 AI 規模運作」的團隊。" }, material, "品牌：讓資深顧問思維以AI規模運作")).toEqual([]);
    const issues = angleIssues({ ...a, emailBody: "字".repeat(EMAIL_MAX_CHARS + 1), angle: "角".repeat(60) }, material, "");
    expect(issues).toHaveLength(2);
    expect(angleIssues({ ...a, emailBody: "很短但沒有引用的信。".repeat(5) }, material, "")).toEqual([]);
  });

  it("feeds last round's problems back into the prompt and reads the detected name", async () => {
    const { anglesSystemPrompt, parsePeopleAngles } = await import("../core/influencer/influencerAngles");
    const prompt = anglesSystemPrompt({
      brandName: "測試品牌", subjectLine: "x", brandCtx: "", outputLanguage: "zh-TW",
      people: [{ id: "p1", label: "", platform: "網站", followers: null, material: "素材" }],
      fixes: { p1: ["emailBody 太長"] },
    });
    expect(prompt).toContain("上一版的問題");
    expect(prompt).toContain("- emailBody 太長");
    expect(prompt).toContain("不可以替他編一句話");
    const raw = JSON.stringify({ people: [{ id: "p1", profile: "a", evidence: "b", talkingPoints: ["c"], angle: "d", emailSubject: "e", emailBody: "x".repeat(60), name: "蔡阿嘎" }] });
    expect(parsePeopleAngles(raw, ["p1"]).get("p1")!.detectedName).toBe("蔡阿嘎");
  });

  it("materialEnough ignores whitespace", async () => {
    const { materialEnough, MIN_MATERIAL_CHARS } = await import("../core/influencer/influencerAngles");
    expect(materialEnough(" \n".repeat(500))).toBe(false);
    expect(materialEnough("字".repeat(MIN_MATERIAL_CHARS))).toBe(true);
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
      profile: "科技開箱", evidence: "Mac 開箱", talkingPoints: ["特色一", "特色二"], angle: "切角", angleWhy: "因為", hook: "開場",
      format: "開箱長片", emailSubject: "主旨", emailBody: "第一段\n\n第二段\u0007",
    }, { id: "p2", url: "https://www.instagram.com/mei", status: "needs_material", platform: "instagram", handle: "mei", followers: null, source: "none", displayName: null }];
    const { rows } = readXlsx(buildXlsx(people, "測試/產品 網紅切角"));
    expect(rows[0].slice(0, 3)).toEqual(["網紅", "平台", "連結"]);
    expect(rows[1][0]).toBe("小明 <A&B>");
    expect(rows[1][7]).toBe("1. 特色一\n2. 特色二");
    expect(rows[1][13]).toBe("第一段\n\n第二段");
    expect(rows[2][14]).toBe("資料不足，請補貼文");
    const doc = unzip(buildDocx(people, "測試 網紅切角")).get("word/document.xml")!.toString("utf8");
    expect(doc).toContain("小明 &lt;A&amp;B&gt;");
    expect(doc).toContain("資料不足，請補貼文");
    expect(doc).not.toContain("\u0007");
    // 顯示文字是名字、連結藏在超連結裡的儲存格。
    const r = rowsToPeople([["名字", "信箱"], ["小華", "hua@example.com"]], new Map([["A2", "https://www.tiktok.com/@hua"]]));
    expect(r.people).toEqual([{ url: "https://www.tiktok.com/@hua", name: "小華", email: "hua@example.com", notes: undefined }]);
  });
});
