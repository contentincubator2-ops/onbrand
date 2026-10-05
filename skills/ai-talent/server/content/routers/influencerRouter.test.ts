import { describe, expect, it } from "vitest";

// tRPC 在建構期就會拒絕保留字 procedure 名稱（apply/call/bind…），而 tsc 抓不到——
// 所以每個 router 都要有一支真的 import 它的測試。
describe("influencerRouter", () => {
  it("builds and exposes its procedures", async () => {
    const { influencerRouter } = await import("./influencerRouter");
    const procs = Object.keys((influencerRouter as any)._def.procedures);
    expect(procs.sort()).toEqual(["analyzePoll", "analyzeStart", "exportFile", "latest", "parseSheet", "savePerson"]);
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
