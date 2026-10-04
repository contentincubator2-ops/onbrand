/**
 * 平台認證知識（2026-10-04，第一個 mission：Facebook）。
 * 鎖住三件事：只有整理過的平台會拿到、別的平台行為不變；知識不是考古題也不自稱認證；
 * 事實紀律與缺資訊處理不再誘發編造。
 */
import { describe, expect, it } from "vitest";
import {
  certMissionOf, certKnowledgeBlock, MISSING_INFO_RULE_NO_FABRICATION, FACT_DISCIPLINE_RULE,
} from "./platformCertKnowledge";

describe("certMissionOf", () => {
  it("Facebook 的卡（30s／60s／99s）都屬於 facebook mission", () => {
    for (const id of ["fb-30-caption-short", "fb-60-album-4", "fb-99-30day-calendar"]) {
      expect(certMissionOf({ id })).toBe("facebook");
    }
  });
  it("還沒整理到的平台回 null——那些卡的 prompt 一個字都不會變", () => {
    for (const id of ["ig-30-caption-short", "th-30-reply-verse", "ln-30-rich-menu-order-entry", "tt-30-beat-sync", "em-30-subject-ai-variants", "web-30-case-study", "br-30-naming", "u12-fb-like-name"]) {
      expect(certMissionOf({ id })).toBeNull();
    }
    expect(certKnowledgeBlock(null)).toBe("");
  });
});

describe("Facebook 平台知識", () => {
  const block = certKnowledgeBlock("facebook");
  it("涵蓋 Meta 認證範圍裡跟寫內容有關的三塊", () => {
    expect(block).toContain("行動優先的創意");
    expect(block).toContain("社群經營");
    expect(block).toContain("廣告與政策");
    expect(block).toContain("個人屬性");
  });
  it("不自稱通過認證、不說自己是考題", () => {
    expect(block).not.toMatch(/已通過|通過.{0,4}認證|認證通過|考古題|考題答案/);
  });
});

describe("不再誘發編造", () => {
  it("缺資訊時的處理：禁用佔位符，而且明講不准編客人", () => {
    expect(MISSING_INFO_RULE_NO_FABRICATION).toContain("禁用任何佔位符");
    expect(MISSING_INFO_RULE_NO_FABRICATION).toContain("不准**編一位客人");
    // 舊版的第三步是「用對話起手式」當成建議做法——新版只能把它當反例提到。
    expect(MISSING_INFO_RULE_NO_FABRICATION).not.toContain("用「對話起手式」");
  });
  it("事實紀律：列出不能編的類別，並明講壓過工藝準則的「用數字開場」", () => {
    for (const kw of ["價格", "截止日", "銷量", "客人說的話", "產地"]) expect(FACT_DISCIPLINE_RULE).toContain(kw);
    expect(FACT_DISCIPLINE_RULE).toContain("有資料才做");
    expect(FACT_DISCIPLINE_RULE).toContain("壓過上面所有工藝準則");
  });
});
