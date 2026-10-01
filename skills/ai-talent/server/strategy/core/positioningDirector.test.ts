import { describe, expect, it } from "vitest";
import { buildDirectorPersonaBlock } from "./positioningDirector";

// 2026-09-30（CJ「總監的人設應該會影響產出」）
describe("buildDirectorPersonaBlock", () => {
  const d = {
    name: "潘建宇", title: "品牌策略總監",
    specialty: "B2B 品牌定位、差異化",
    experience: "【工作經歷】某國際廣告集團策略總監十年",
    methodology: "先找出唯一致勝理由，再往回推受眾與證據",
  };

  it("人設的姓名、職稱、專長、經歷、方法論都進得去", () => {
    const b = buildDirectorPersonaBlock(d);
    for (const t of [d.name, d.title, d.specialty, d.experience, d.methodology]) expect(b).toContain(t);
  });

  it("工作守則（agentKnowledge）接在後面", () => {
    expect(buildDirectorPersonaBlock(d, "# 工作守則\n只講有證據的差異化")).toContain("只講有證據的差異化");
  });

  it("明講格式與事實不被人設改變、不在產出提到總監本人", () => {
    const b = buildDirectorPersonaBlock(d);
    expect(b).toContain("JSON 鍵名");
    expect(b).toContain("官方確認客群");
    expect(b).toContain("不要在輸出裡提到總監本人");
  });

  it("缺欄位不會印出空標籤；超長內容會截斷", () => {
    const b = buildDirectorPersonaBlock({ name: "A", title: "B", experience: "x".repeat(5000) });
    expect(b).not.toContain("專長：");
    expect(b).not.toContain("慣用的方法論");
    expect(b.length).toBeLessThan(2000);
  });
});
