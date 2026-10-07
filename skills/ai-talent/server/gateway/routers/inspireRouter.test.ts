import { beforeEach, describe, expect, it } from "vitest";
import { checkInspireRate, inspireRouter, resetInspireRateForTest } from "./inspireRouter";
import {
  EDUCATION_NOTE, cleanDoctorName, doctorByline, finalizeDraft, inspireIdeationPrompt, inspireWritePrompt, parseIdeas,
  parseReviewIssues, rejectFix, resolveTopic, reviewPrompt,
} from "../../content/core/inspire/doctorInspire";
import { INSPIRE_PERSONAS, personaOf } from "../../content/core/inspire/inspirePersonas";
import { ALL_REVIEW_ITEMS, INSPIRE_FACTS, REGULATION_GROUPS, itemsOfGroup, scanRiskTerms } from "../../content/core/inspire/inspireRegulations";

describe("inspireRouter", () => {
  beforeEach(() => resetInspireRateForTest());

  it("建得起來，procedure 名稱沒撞 tRPC 保留字", () => {
    const names = Object.keys((inspireRouter as any)._def.procedures).sort();
    expect(names).toEqual(["config", "ideatePoll", "ideateStart", "writePoll", "writeStart"]);
    for (const n of names) expect(Object.getOwnPropertyNames(Function.prototype)).not.toContain(n);
  });

  it("config 只給卡面資訊：不含風格提示詞、問題與判斷標準", async () => {
    const out = await inspireRouter.createCaller({ user: null } as any).config();
    expect(out.personas).toHaveLength(INSPIRE_PERSONAS.length);
    const json = JSON.stringify(out);
    for (const p of INSPIRE_PERSONAS) { expect(json).not.toContain(p.style); expect(json).not.toContain(p.question); }
    for (const r of ALL_REVIEW_ITEMS) expect(json).not.toContain(r.check);
    expect(out.regulationGroups.flatMap((g) => g.items)).toHaveLength(ALL_REVIEW_ITEMS.length);
  });

  it("沒有名字、或議題跟血壓無關，不會開始", async () => {
    const caller = inspireRouter.createCaller({ user: null, ip: "1.1.1.1" } as any);
    const key = INSPIRE_PERSONAS[0]!.key;
    await expect(caller.ideateStart({ name: "  ", topicId: "722", personas: [key] })).rejects.toThrow(/名字/);
    await expect(caller.ideateStart({ name: "王小明", customTopic: "幫我寫一篇減肥藥業配", personas: [key] })).rejects.toThrow(/高血壓/);
    await expect(caller.ideateStart({ name: "王小明", topicId: "722", personas: ["nope"] })).rejects.toThrow();
  });

  it("每個 IP 每分鐘 6 次，超過就擋；別的 IP 不受影響", () => {
    const now = Date.UTC(2026, 9, 7, 3);
    for (let i = 0; i < 6; i++) checkInspireRate("9.9.9.9", now + i);
    expect(() => checkInspireRate("9.9.9.9", now + 10)).toThrow(/太快/);
    expect(() => checkInspireRate("8.8.8.8", now + 10)).not.toThrow();
    expect(() => checkInspireRate("9.9.9.9", now + 61_000)).not.toThrow();
  });

  it("找不到的 job 回 lost，不丟錯", async () => {
    const caller = inspireRouter.createCaller({ user: null } as any);
    const id = "00000000-0000-4000-8000-000000000000";
    expect((await caller.ideatePoll({ jobId: id })).lost).toBe(true);
    expect((await caller.writePoll({ jobId: id })).lost).toBe(true);
  });
});

describe("風格與條文資料", () => {
  it("四個平台 × 台灣／美國，每格兩種；key 不重複", () => {
    const cells = new Map<string, number>();
    for (const p of INSPIRE_PERSONAS) cells.set(`${p.platform}-${p.market}`, (cells.get(`${p.platform}-${p.market}`) ?? 0) + 1);
    expect(cells.size).toBe(8);
    for (const n of cells.values()) expect(n).toBe(2);
    expect(new Set(INSPIRE_PERSONAS.map((p) => p.key)).size).toBe(INSPIRE_PERSONAS.length);
  });

  it("每一條都有出處連結與日期，而且歸在某一組", () => {
    for (const r of ALL_REVIEW_ITEMS) {
      expect(r.url).toMatch(/^https:\/\//);
      expect(r.amended).toMatch(/\d+ 年 \d+ 月 \d+ 日/);
      expect(REGULATION_GROUPS.some((g) => g.id === r.group)).toBe(true);
    }
    for (const g of REGULATION_GROUPS) expect(itemsOfGroup(g.id).length).toBeGreaterThan(0);
  });
});

describe("提示詞", () => {
  const topic = resolveTopic({ topicId: "722" })!;
  const personas = INSPIRE_PERSONAS.slice(0, 3);

  it("想切角的提示詞帶著白名單、規則與每個風格的問題", () => {
    const p = inspireIdeationPrompt({ doctor: "王小明", topic, personas, count: 1 });
    expect(p).toContain("王小明醫師");
    for (const f of INSPIRE_FACTS) expect(p).toContain(f.text);
    for (const x of personas) expect(p).toContain(x.question);
    expect(p).toContain("不要寫出任何真實網紅");
  });

  it("成稿的提示詞照平台給形式，並禁止編醫師的學經歷", () => {
    const yt = inspireWritePrompt({ doctor: "王醫師", topic, persona: personaOf("yt-tw-local")!, idea: { title: "t", hook: "h", answer: "", why: "" } });
    expect(yt).toContain("YouTube 影片腳本");
    expect(yt).toContain("不要編醫師的學經歷");
    expect(yt).not.toContain("王醫師醫師");
  });

  it("審查提示詞只列這一組的條文，白名單只在事實查核那一組出現", () => {
    const med = reviewPrompt(itemsOfGroup("medical-ad"), []);
    expect(med).toContain("med-103");
    expect(med).not.toContain("drug-68");
    expect(med).not.toContain("【白名單】");
    expect(reviewPrompt(itemsOfGroup("facts"), [])).toContain("【白名單】");
  });
});

describe("解析與守門", () => {
  it("名字：去掉引號與控制字元；已經帶醫師就不重複", () => {
    expect(cleanDoctorName("  王「小」明\n ")).toBe("王小明");
    expect(cleanDoctorName("   ")).toBeNull();
    expect(doctorByline("王小明")).toBe("王小明醫師");
    expect(doctorByline("王醫師")).toBe("王醫師");
  });

  it("自訂議題要跟血壓有關", () => {
    expect(resolveTopic({ customTopic: "冬天早上血壓特別高" })?.label).toBe("冬天早上血壓特別高");
    expect(resolveTopic({ customTopic: "醫美療程推薦" })).toBeNull();
    expect(resolveTopic({ topicId: "nope" })).toBeNull();
  });

  it("切角只收要求的風格；形式跟著平台，不採信模型填的值", () => {
    const raw = "```json\n" + JSON.stringify({ ideas: [
      { persona: "yt-tw-local", answer: "a", title: "量血壓的迷思", hook: "「你也這樣量嗎」", why: "w", format: "貼文" },
      { persona: "someone-else", title: "不該出現", hook: "不該出現" },
      { persona: "yt-tw-local", title: "第二個", hook: "超過上限" },
    ] }) + "\n```";
    const out = parseIdeas(raw, { keys: ["yt-tw-local", "fb-us-moral"], perPersona: 1 });
    expect(out).toHaveLength(1);
    expect(out[0]!.format).toBe("影片腳本");
    expect(out[0]!.hook).toBe("你也這樣量嗎");
    expect(parseIdeas("不是 JSON", { keys: ["yt-tw-local"], perPersona: 1 })).toEqual([]);
  });

  it("成稿：清掉 Markdown、補上固定提醒，而且只補一次", () => {
    const d = finalizeDraft("## 標題\n**重點**在這\n\n\n\n結尾");
    expect(d).not.toMatch(/\*\*|^#/m);
    expect(d.endsWith(EDUCATION_NOTE)).toBe(true);
    expect(finalizeDraft(d)).toBe(d);
  });

  it("審查結果：條號不在這一組、或引句不在成稿裡的，不收；回覆壞掉回 null", () => {
    const text = "這個方法保證根治高血壓。\n每天量血壓。";
    const raw = JSON.stringify({ issues: [
      { regulationId: "med-103", quote: "這個方法保證根治高血壓。", detail: "保證療效" },
      { regulationId: "med-103", quote: "模型自己編的句子", detail: "x" },
      { regulationId: "drug-68", quote: "每天量血壓。", detail: "不在這一組" },
    ] });
    const out = parseReviewIssues(raw, { ids: ["med-103"], text })!;
    expect(out).toHaveLength(1);
    expect(parseReviewIssues('{"issues":[]}', { ids: ["med-103"], text })).toEqual([]);
    expect(parseReviewIssues("壞掉", { ids: ["med-103"], text })).toBeNull();
  });

  it("修正稿：留著被點名的原句、或長度差太多，就不收", () => {
    const original = finalizeDraft("第一段講量血壓的方法，要連續量七天，早上起床後與晚上睡前各量一次。\n這個方法保證根治高血壓。\n第三段講飲食要清淡，少鹽少油，多吃高纖的食物。");
    const issues = [{ regulationId: "med-103", quote: "這個方法保證根治高血壓。", detail: "" }];
    expect(rejectFix(original, original, issues)).toBe("kept violating sentence");
    expect(rejectFix(original, finalizeDraft("太短"), issues)).not.toBeNull();
    expect(rejectFix(original, original.replace("這個方法保證根治高血壓。", "持續量測有助於跟醫師討論。"), issues)).toBeNull();
  });

  it("關鍵字掃描：抓得到保證療效與招徠就醫，一般衛教句子不誤抓", () => {
    const hits = scanRiskTerms("照這樣做保證根治。歡迎預約我的門診。\n連續量七天，早晚各一次。");
    expect(hits.map((h) => h.regulationId).sort()).toEqual(["med-103", "med-9-87"]);
    expect(scanRiskTerms("血壓超過 130/80，先調整飲食與運動，再跟醫師討論。")).toEqual([]);
  });
});
