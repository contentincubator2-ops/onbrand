/**
 * 交付前檢查（brandConsistency.ts 帶 taskSpec 的那條路）。2026-10-04。
 *
 * 背景：Microsoft Foundry 評 289 張卡，失分前三名是「形式不對」「不能直接發布」「編造事實」。
 * 這裡鎖住三件事：機器找得到明顯的未完成痕跡、形式錯的改寫稿不會被長度守門退回、
 * 沒帶 taskSpec 時行為跟以前一模一樣。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeLLM = vi.fn();
vi.mock("../../../platform/core/llm/llm", () => ({
  invokeLLM: (...a: any[]) => invokeLLM(...a),
  invokeLLMSingleProvider: vi.fn(),
}));

import { acceptRevision, checkBrandConsistency, escapeControlCharsInStrings, publishDefects } from "./brandConsistency";

const reply = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });
const base = {
  caption: "這塊牛舌退冰就能煎，五分鐘上桌。想第一次試試看的人，從這一包開始。\n#牛舌",
  brandPrefix: "品牌：懶得煮的Tom老闆。產品：牛舌，退冰即可下鍋。語氣：直接、不講大話。",
  userMsg: "這次主打「牛舌」，想吸引第一次購買的人",
  taskLabel: "品牌命名",
  isZhTW: true,
  timeoutMs: 20_000,
};

describe("publishDefects：機器先找一遍明顯不是成品的痕跡", () => {
  it("乾淨的成品沒有問題", () => {
    expect(publishDefects("這塊牛舌退冰就能煎，五分鐘上桌。\n👉 點連結帶回家")).toEqual([]);
    expect(publishDefects("中秋不想顧火？Tom 老闆幫你配好了。 #牛舌 #中秋")).toEqual([]);
  });
  it("佔位符：[X]、（日期）、請填入", () => {
    expect(publishDefects("本檔限量 [X] 包，售完為止。")).toContain("有方括號佔位符");
    expect(publishDefects("本周四（日期）開賣，記得來。")).toContain("有括號佔位符");
    expect(publishDefects("👉 請填入連結")).toContain("有待填的空格");
    expect(publishDefects("Tom老闆與「」聯手推出首購活動。")).toContain("有空的括號或引號");
  });
  it("不是成品的口吻：AI 前言、向使用者要資料、裸 JSON", () => {
    expect(publishDefects("以下是為您撰寫的貼文：\n今晚吃牛舌。")).toContain("開頭是 AI 口吻的前言");
    expect(publishDefects("我需要你提供以下資訊來完成任務：")).toContain("在向使用者要資料，不是成品");
    expect(publishDefects("{")).toContain("裸露的 JSON");
  });
  it("結尾斷在一半（評測裡的「他們以」）；以 hashtag 或連結收尾不算", () => {
    expect(publishDefects("第一次買牛舌的人最常問的問題，其實不是怎麼煎，而是他們以")).toContain("結尾像是斷在一半");
    expect(publishDefects("第一次買牛舌的人最常問的問題是怎麼煎。 #牛舌料理")).not.toContain("結尾像是斷在一半");
    expect(publishDefects("想看更多做法就到這裡 https://example.com/tongue")).not.toContain("結尾像是斷在一半");
  });
});

describe("escapeControlCharsInStrings：revised 裡的裸換行不該讓整次檢查被跳過", () => {
  it("字串裡的換行變成跳脫序列，字串外的排版不動", () => {
    const raw = '{\n  "consistent": false,\n  "revised": "第一行\n第二行"\n}';
    expect(() => JSON.parse(raw)).toThrow();
    expect(JSON.parse(escapeControlCharsInStrings(raw)).revised).toBe("第一行\n第二行");
  });
  it("已經跳脫的引號與反斜線照舊", () => {
    const raw = '{"revised": "他說\\"好吃\\"\n真的"}';
    expect(JSON.parse(escapeControlCharsInStrings(raw)).revised).toBe('他說"好吃"\n真的');
  });
});

describe("acceptRevision：形式錯的稿子是改寫，長度守門要放寬", () => {
  const post = "這塊牛舌退冰就能煎，五分鐘上桌。想第一次試試看的人，從這一包開始。";
  const list = Array.from({ length: 10 }, (_, i) => `${i + 1}. 牛舌命名候選第 ${i + 1} 個：一句話說明這個名字的由來與適用情境`).join("\n");
  it("預設（微調）：長度差太多不採用", () => {
    expect(acceptRevision(post, list, { isZhTW: true })).toMatch(/length ratio/);
  });
  it("allowRestructure：同一份改寫稿可以採用", () => {
    expect(acceptRevision(post, list, { isZhTW: true, allowRestructure: true })).toBeNull();
  });
  it("就算放寬，空稿與語言跑掉還是不採用", () => {
    expect(acceptRevision(post, "", { isZhTW: true, allowRestructure: true })).toBe("empty revision");
    expect(acceptRevision(post, "Ten naming candidates for the beef tongue product line, each with a rationale.", { isZhTW: true, allowRestructure: true }))
      .toMatch(/language drifted/);
  });
});

describe("checkBrandConsistency 帶 taskSpec＝交付前檢查", () => {
  beforeEach(() => invokeLLM.mockReset());
  const taskSpec = "任務卡：品牌命名\n說明：產出 10 個命名候選，各附一句理由。";

  it("審稿拿到的是任務卡要求與機器線索，用的是交付前那份指令", async () => {
    invokeLLM.mockResolvedValue(reply({ consistent: true, issues: [], revised: "" }));
    await checkBrandConsistency({ ...base, caption: "本檔限量 [X] 包，五分鐘上桌，想試試看的人從這一包開始。", taskSpec });
    const msgs = invokeLLM.mock.calls[0]![0].messages;
    expect(msgs[0].content).toContain("交付前的最後一關審稿");
    expect(msgs[1].content).toContain("# 任務卡要求\n任務卡：品牌命名");
    expect(msgs[1].content).toContain("有方括號佔位符");
  });

  it("形式不對 → 改寫稿比原稿長很多也採用", async () => {
    const revised = Array.from({ length: 10 }, (_, i) => `${i + 1}. 舌尖上的星期${i + 1}：把牛舌變成每週固定的一餐，名字好記、好叫`).join("\n");
    invokeLLM.mockResolvedValue(reply({ consistent: false, issues: [{ aspect: "形式", detail: "要 10 個命名，交出來是一篇貼文" }], revised }));
    const r = await checkBrandConsistency({ ...base, taskSpec });
    expect(r.status).toBe("fixed");
    expect(r.caption).toBe(revised);
  });

  it("只有語氣問題 → 仍然是微調，長度差太多照舊退回（不會被放寬）", async () => {
    invokeLLM.mockResolvedValue(reply({ consistent: false, issues: [{ aspect: "語氣", detail: "太像廣告" }], revised: "短" }));
    const r = await checkBrandConsistency({ ...base, taskSpec });
    expect(r.status).toBe("flagged");
    expect(r.caption).toBe(base.caption);
  });

  it("模型把換行原樣寫進 revised 也解析得了（原本整次被跳過）", async () => {
    const revised = "這塊牛舌退冰就能煎。\n數量有限，想第一次試試看的人從這一包開始。\n#牛舌";
    const content = `{"consistent": false, "issues": [{"aspect": "事實", "detail": "限量 500 包沒有依據"}], "revised": "${revised}"}`;
    invokeLLM.mockResolvedValue({ choices: [{ message: { content } }] });
    const r = await checkBrandConsistency({ ...base, taskSpec });
    expect(r.status).toBe("fixed");
    expect(r.caption).toBe(revised);
  });

  it("沒帶 taskSpec：用原本的品牌一致性指令，不附機器線索", async () => {
    invokeLLM.mockResolvedValue(reply({ consistent: true, issues: [], revised: "" }));
    await checkBrandConsistency({ ...base, caption: "本檔限量 [X] 包，五分鐘上桌。" });
    const msgs = invokeLLM.mock.calls[0]![0].messages;
    expect(msgs[0].content).toContain("你是品牌一致性審核");
    expect(msgs[1].content).toContain("# 任務\n品牌命名");
    expect(msgs[1].content).not.toContain("機器檢查先發現的問題");
  });
});
