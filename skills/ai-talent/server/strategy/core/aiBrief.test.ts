import { describe, it, expect } from "vitest";
import { LABEL_TO_FIELD, fieldsInBrief, parseBrief } from "./aiBrief";
import { BRAND_PROMPT_FIELDS } from "./positioningDocs";

const SAMPLE = `

[品牌已鎖定屬性 — 最高優先級，所有產出都要符合]
- 【Tagline 中】把日常過好
- 【Archetype】照顧者 / 創造者
- 【WHY (信念)】我們相信好東西不該貴

[品牌聲音指南 — 嚴格遵守，這是品牌的「人聲」]
tone keywords: 溫暖 / 直接
✗ 禁用詞彙 / 句式：
  · 頂級
  · 尊榮
【模仿這些範例的口吻】
1. ✓「今天先把碗洗完，其他的明天再說。」

[寫手指引 — 用詞 / CTA / 受眾規範]
- 【偏好用詞】管道 · 夥伴
- 【CTA 範例】來看看 · 留言告訴我

[補充脈絡 — 品牌故事 / 受眾 / 差異化]
- 【主要受眾】30-45 歲、忙碌的雙薪家庭
- 【差異化】不講奢華，講省下來的時間

[本次產出聚焦的產品 — 必須圍繞此產品撰寫]
- 【產品名稱】好氧
- 【產品核心定位】一天一顆
`;

describe("aiBrief · parseBrief", () => {
  const sections = parseBrief(SAMPLE);

  it("依 [段落] 切段，標題只留破折號前那截", () => {
    expect(sections.map((s) => s.title)).toEqual([
      "品牌已鎖定屬性", "品牌聲音指南", "寫手指引", "補充脈絡", "本次產出聚焦的產品",
    ]);
  });

  it("【標籤】對回定位欄位 path", () => {
    const locked = sections[0]!.lines;
    expect(locked).toEqual([
      { label: "Tagline 中", text: "把日常過好", field: "tagline.zhTagline" },
      { label: "Archetype", text: "照顧者 / 創造者", field: "voice.archetypes" },
      { label: "WHY (信念)", text: "我們相信好東西不該貴", field: "goldenCircle.why" },
    ]);
    expect(sections[4]!.lines[1]).toEqual({ label: "產品核心定位", text: "一天一顆", field: "product.core.coreStatement" });
  });

  it("沒有【】的固定字首行（tone keywords／禁用詞彙）也認得，多行內文會接到上一個標籤", () => {
    const voice = sections[1]!.lines;
    expect(voice[0]).toEqual({ label: "語調關鍵詞", text: "溫暖 / 直接", field: "voice.tone" });
    expect(voice[1]!.label).toBe("溝通禁區");
    expect(voice[1]!.field).toBe("voice.forbidden");
    expect(voice[1]!.text).toBe("· 頂級\n· 尊榮");
    expect(voice[2]!.label).toBe("模仿這些範例的口吻");
    expect(voice[2]!.field).toBe("voice.samples");
    expect(voice[2]!.text).toContain("今天先把碗洗完");
  });

  it("fieldsInBrief 列出簡報裡出現的欄位", () => {
    const f = fieldsInBrief(sections);
    expect(f).toContain("audience.primary");
    expect(f).toContain("differentiation.summary");
    expect(f).not.toContain("origin.story");
  });

  it("空字串回空陣列", () => {
    expect(parseBrief("")).toEqual([]);
  });
});

describe("aiBrief · LABEL_TO_FIELD 與 PROMPT_FIELDS 對得上", () => {
  it("BRAND_PROMPT_FIELDS 裡每一格，簡報都有標籤能對回去（否則用戶看不到那格有沒有進簡報）", () => {
    const covered = new Set(Object.values(LABEL_TO_FIELD));
    covered.add("voice.tone"); covered.add("voice.forbidden");
    const missing = BRAND_PROMPT_FIELDS.map((f) => f.path).filter((p) => !covered.has(p));
    expect(missing, `對不回去的欄位：${missing.join(", ")}`).toEqual([]);
  });
});
