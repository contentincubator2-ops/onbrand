import { beforeEach, describe, expect, it } from "vitest";
import { IDEAS_PER_PERSONA, checkInspireRate, inspireRouter, resetInspireRateForTest } from "./inspireRouter";
import {
  EDUCATION_NOTE, cleanDoctorName, doctorByline, finalizeDraft, inspireWritePrompt, parseIdeas,
  parseReviewIssues, personaIdeationPrompt, resolveTopic, reviewPrompt,
} from "../../content/core/inspire/doctorInspire";
import { INSPIRE_PERSONAS, leaksPersona, type InspirePersona } from "../../content/core/inspire/inspirePersonas";
import { ALL_REVIEW_ITEMS, INSPIRE_FACTS, REGULATION_GROUPS, itemsOfGroup, scanRiskTerms } from "../../content/core/inspire/inspireRegulations";

const SECTIONS = ["【你是誰】", "【招牌形式】", "【開場公式】", "【結構節拍】", "【語言指紋】", "【題材轉換法】", "【不會做的事】"];
const sample = INSPIRE_PERSONAS[0]!;

describe("inspireRouter", () => {
  beforeEach(() => resetInspireRateForTest());

  it("建得起來，procedure 名稱沒撞 tRPC 保留字", () => {
    const names = Object.keys((inspireRouter as any)._def.procedures).sort();
    expect(names).toEqual(["config", "ideatePoll", "ideateStart", "reviewStart", "writePoll", "writeStart"]);
    for (const n of names) expect(Object.getOwnPropertyNames(Function.prototype)).not.toContain(n);
  });

  it("config 只給卡面資訊：不含 agent 人設、問題、判斷標準，也不含任何一位創作者的名字", async () => {
    const out = await inspireRouter.createCaller({ user: null } as any).config();
    expect(out.personas).toHaveLength(INSPIRE_PERSONAS.length);
    expect(Object.keys(out.personas[0]!).sort()).toEqual(["format", "key", "label", "market", "pitch", "platform", "platformLabel", "reference"]);
    const json = JSON.stringify(out);
    for (const p of INSPIRE_PERSONAS) {
      expect(json).not.toContain(p.question);
      expect(leaksPersona(JSON.stringify(out.personas.find((x) => x.key === p.key)), p)).toBeNull();
    }
    for (const r of ALL_REVIEW_ITEMS) expect(json).not.toContain(r.check);
    expect(out.regulationGroups.flatMap((g) => g.items)).toHaveLength(ALL_REVIEW_ITEMS.length);
  });

  it("沒有名字、議題跟體重管理無關或談到藥品、或不認得的 agent，不會開始", async () => {
    const caller = inspireRouter.createCaller({ user: null, ip: "1.1.1.1" } as any);
    await expect(caller.ideateStart({ name: "  ", topicId: "bmi", personas: [sample.key] })).rejects.toThrow(/名字/);
    await expect(caller.ideateStart({ name: "王小明", customTopic: "幫我寫一篇減肥藥業配", personas: [sample.key] })).rejects.toThrow(/體重管理/);
    await expect(caller.ideateStart({ name: "王小明", customTopic: "冬天早上血壓特別高", personas: [sample.key] })).rejects.toThrow(/體重管理/);
    await expect(caller.ideateStart({ name: "王小明", topicId: "bmi", personas: ["nope"] })).rejects.toThrow();
    await expect(caller.reviewStart({ text: "太短" })).rejects.toThrow();
  });

  it("每個 IP 每分鐘 30 次，超過就擋；別的 IP 不受影響", () => {
    const now = Date.UTC(2026, 9, 7, 3);
    for (let i = 0; i < 30; i++) checkInspireRate("9.9.9.9", now + i);
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

describe("100 位創作者 agent", () => {
  it("四個平台 × 台灣／美國共 100 位：Facebook、Instagram 各 12，YouTube、TikTok 各 13；key 不重複", () => {
    expect(INSPIRE_PERSONAS).toHaveLength(100);
    const cells = new Map<string, number>();
    for (const p of INSPIRE_PERSONAS) cells.set(`${p.market}-${p.platform}`, (cells.get(`${p.market}-${p.platform}`) ?? 0) + 1);
    expect(cells.size).toBe(8);
    for (const [cell, n] of cells) expect(n, cell).toBe(/facebook|instagram/.test(cell) ? 12 : 13);
    expect(new Set(INSPIRE_PERSONAS.map((p) => p.key)).size).toBe(100);
  });

  it("每一位的人設至少 2,200 字、七個段落都在", () => {
    for (const p of INSPIRE_PERSONAS) {
      expect(p.agentPrompt.length, p.key).toBeGreaterThanOrEqual(2200);
      for (const h of SECTIONS) expect(p.agentPrompt, `${p.key} ${h}`).toContain(h);
    }
  });

  it("卡面文字（風格名、參考說明、副標）不含本人的名字或帳號；參考說明寫了市場；同一格風格名不重複", () => {
    const seen = new Set<string>();
    for (const p of INSPIRE_PERSONAS) {
      expect(leaksPersona(`${p.label}\n${p.reference}\n${p.pitch}`, p), p.key).toBeNull();
      expect(p.reference, p.key).toMatch(p.market === "tw" ? /台灣|在台/ : /美國/);
      const id = `${p.market}-${p.platform}-${p.label}`;
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
    }
  });

  it("名字與帳號擋得住；短的口頭禪不誤擋一般用字", () => {
    const p = { name: "王大明", aliases: ["BigMing TV", "@bm"], catchphrases: ["大家好", "今天也要好好量血壓喔"] };
    expect(leaksPersona("這是王大明的風格", p)).toBe("王大明");
    expect(leaksPersona("訂閱 bigming-tv", p)).toBe("BigMing TV");
    expect(leaksPersona("大家好，我是醫師", p)).toBeNull();
    expect(leaksPersona("今天也要好好量血壓喔！", p)).toBe("今天也要好好量血壓喔");
    expect(leaksPersona("bm 值", p)).toBeNull();
  });

  it("一般用語不會被當成口頭禪或別名擋掉；實跑漏出的家人名字擋得住", () => {
    const p = { key: "tw-fb-02", name: "某對夫妻", aliases: ["洋蔥", "雪碧", "筆電"], catchphrases: ["留言告訴我", "真的假的", "Wait for it"] };
    expect(leaksPersona("少鹽料理可以多用洋蔥提味，別配雪碧。看完留言告訴我，真的假的？wait for it", p)).toBeNull();
    expect(leaksPersona("妮妮從旁邊走過", p)).toBe("妮妮");
    expect(leaksPersona("地表最強小三的腰圍大挑戰", { name: "x", aliases: [], catchphrases: ["地表最強小三"] })).toBe("地表最強小三");
  });

  it("每一位 agent 的擋字清單都不會擋掉一段普通的衛教點子", () => {
    const ordinary = "門診常被問到在家怎麼量血壓。先生說他每天都有量，太太把血壓計推過去。連續量七天、早晚各一次、每次量兩遍取平均。"
      + "少鹽、少油、多運動，看完留言告訴我你家的狀況，真的假的都歡迎。今天也要開心，一起出門走走。";
    for (const p of INSPIRE_PERSONAS) expect(leaksPersona(ordinary, p), p.key).toBeNull();
  });
});

describe("條文資料", () => {
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
  const topic = resolveTopic({ topicId: "bmi" })!;

  it("想點子：帶著這一位的完整人設、他的問題、白名單與規則，並交代名字不能外露", () => {
    const p = personaIdeationPrompt({ doctor: "王小明", topic, persona: sample, count: IDEAS_PER_PERSONA, avoid: ["已經有的點子"] });
    expect(p).toContain(sample.agentPrompt);
    expect(p).toContain(sample.question);
    expect(p).toContain("王小明醫師");
    expect(p).toContain("已經有的點子");
    expect(p).toContain("都不能出現在任何產出裡");
    for (const f of INSPIRE_FACTS) expect(p).toContain(f.text);
  });

  it("成稿：照平台給形式、帶著點子的做法，並禁止編醫師的學經歷", () => {
    const yt = INSPIRE_PERSONAS.find((x) => x.platform === "youtube")!;
    const w = inspireWritePrompt({ doctor: "王醫師", topic, persona: yt, idea: { title: "t", hook: "h", concept: "先拍結果再倒帶", answer: "", why: "" } });
    expect(w).toContain(yt.agentPrompt);
    expect(w).toContain("YouTube 影片腳本");
    expect(w).toContain("先拍結果再倒帶");
    expect(w).toContain("不要編醫師的學經歷");
    expect(w).not.toContain("王醫師醫師");
  });

  it("審查：只列這一組的條文、要求附建議而不改稿；白名單只在事實查核那一組出現", () => {
    const med = reviewPrompt(itemsOfGroup("medical-ad"), []);
    expect(med).toContain("med-103");
    expect(med).not.toContain("drug-68");
    expect(med).not.toContain("【白名單】");
    expect(med).toContain("suggestion");
    expect(med).toContain("你不要改成稿，只提建議");
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

  it("自訂議題要跟體重管理有關，而且不能談藥品", () => {
    expect(resolveTopic({ customTopic: "過年後體重回不去" })?.label).toBe("過年後體重回不去");
    expect(resolveTopic({ customTopic: "冬天早上血壓特別高" })).toBeNull();
    expect(resolveTopic({ customTopic: "瘦瘦針怎麼打才會瘦" })).toBeNull();
    expect(resolveTopic({ customTopic: "醫美療程推薦" })).toBeNull();
    expect(resolveTopic({ topicId: "nope" })).toBeNull();
  });

  it("點子：最多收指定的數量；形式跟著平台；露出本人名字的點子不收", () => {
    const p: InspirePersona = { ...sample, platform: "youtube", name: "王大明", aliases: ["BigMing TV"], catchphrases: [] };
    const raw = "```json\n" + JSON.stringify({ ideas: [
      { answer: "a", title: "七天血壓日記挑戰", hook: "「你也這樣量嗎」", concept: "餐桌上放兩台血壓計", why: "w", format: "貼文" },
      { title: "王大明式開箱", hook: "不該出現", concept: "c" },
      { title: "只有標題" },
      { title: "第二個", hook: "可以收", concept: "c" },
      { title: "第三個", hook: "超過上限", concept: "c" },
    ] }) + "\n```";
    const out = parseIdeas(raw, p, 2);
    expect(out.map((i) => i.title)).toEqual(["七天血壓日記挑戰", "第二個"]);
    expect(out[0]!.format).toBe("影片腳本");
    expect(out[0]!.hook).toBe("你也這樣量嗎");
    expect(out[0]!.concept).toBe("餐桌上放兩台血壓計");
    expect(parseIdeas("不是 JSON", p, 3)).toEqual([]);
  });

  it("成稿：清掉 Markdown、補上固定提醒，而且只補一次", () => {
    const d = finalizeDraft("## 標題\n**重點**在這\n\n\n\n結尾");
    expect(d).not.toMatch(/\*\*|^#/m);
    expect(d.endsWith(EDUCATION_NOTE)).toBe(true);
    expect(finalizeDraft(d)).toBe(d);
  });

  it("審查結果：帶著建議；條號不在這一組、引句不是一字不差出現在成稿裡、或建議等於原句的，不收", () => {
    const text = "這個方法保證根治高血壓。\n每天量血壓。";
    const raw = JSON.stringify({ issues: [
      { regulationId: "med-103", quote: "這個方法保證根治高血壓。", detail: "保證療效", suggestion: "這個方法有助於掌握自己的血壓。" },
      { regulationId: "med-103", quote: "這個方法 保證根治高血壓。", detail: "多了空白", suggestion: "x" },
      { regulationId: "med-103", quote: "每天量血壓。", detail: "沒有改", suggestion: "每天量血壓。" },
      { regulationId: "drug-68", quote: "每天量血壓。", detail: "不在這一組", suggestion: "" },
    ] });
    const out = parseReviewIssues(raw, { ids: ["med-103"], text })!;
    expect(out).toHaveLength(1);
    expect(out[0]!.suggestion).toBe("這個方法有助於掌握自己的血壓。");
    expect(text.replace(out[0]!.quote, out[0]!.suggestion)).toBe("這個方法有助於掌握自己的血壓。\n每天量血壓。");
    expect(parseReviewIssues('{"issues":[]}', { ids: ["med-103"], text })).toEqual([]);
    expect(parseReviewIssues("壞掉", { ids: ["med-103"], text })).toBeNull();
  });

  it("關鍵字掃描：抓得到保證療效與招徠就醫，一般衛教句子不誤抓", () => {
    const hits = scanRiskTerms("照這樣做保證根治。歡迎預約我的門診。\n連續量七天，早晚各一次。");
    expect(hits.map((h) => h.regulationId).sort()).toEqual(["med-103", "med-9-87"]);
    expect(scanRiskTerms("BMI 27 以上屬於肥胖，先調整飲食與運動，再跟醫師討論適合的做法。")).toEqual([]);
    const drug = scanRiskTerms("很多人問我瘦瘦針有沒有效。\n照這樣做三個月瘦 10 公斤，保證不復胖。");
    expect(drug.map((h) => h.regulationId).sort()).toEqual(["drug-65-67", "med-103"]);
  });
});
