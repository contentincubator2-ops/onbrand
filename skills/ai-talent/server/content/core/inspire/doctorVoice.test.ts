import { describe, expect, it } from "vitest";
import { INSPIRE_PERSONAS } from "./inspirePersonas";
import { finalizeDraft, EDUCATION_NOTE } from "./doctorInspire";
import { COMMON_DOCTOR_HABITS, DOCTOR_SPECIALTIES, specialtyStyle, writingStyleBlock, writingType } from "./doctorWritingStyle";
import {
  INSPIRE_QUESTIONS, INTERVIEW_QUESTIONS, QUESTION_AREAS, addedNumbers, interviewIsThin, parseRemix, parseVoiceArticle,
  questionOf, trafficRemixPrompt, voiceArticlePrompt,
} from "./doctorVoice";

const answers = [
  "醫師，我體重有掉可是越來越沒力。",
  "我會說肌肉是存款，每一餐都要有一份蛋白質，每個禮拜要有阻力訓練。",
  "最常誤會的是體重掉越快越好。",
  "回家把每一餐拍下來。",
];

describe("問題地圖", () => {
  it("每個領域都有題目；問藥品的題目不開放給醫師直接寫", () => {
    for (const a of QUESTION_AREAS) expect(INSPIRE_QUESTIONS.some((q) => q.area === a.id)).toBe(true);
    expect(new Set(INSPIRE_QUESTIONS.map((q) => q.id)).size).toBe(INSPIRE_QUESTIONS.length);
    for (const id of ["w-choose", "w-side", "w-rebound", "d-drug", "d-reverse", "d-insulin", "g-gh"]) expect(questionOf(id)?.scope).toBe("legal");
    expect(questionOf("w-muscle")?.scope).toBe("open");
    // 兒童成長還沒有核對過的白名單。
    expect(INSPIRE_QUESTIONS.filter((q) => q.area === "growth").every((q) => q.scope !== "open")).toBe(true);
  });
});

describe("第一步：照醫師口吻寫", () => {
  it("提示詞帶著醫師的口述與「不可以替他發明內容」的界線", () => {
    const p = voiceArticlePrompt({ doctor: "王小明", specialty: "新陳代謝科", question: "減脂怎麼不掉肌肉", answers });
    expect(p).toContain("你是醫師的文字編輯，不是作者");
    for (const a of answers) expect(p).toContain(a);
    expect(p).toContain(INTERVIEW_QUESTIONS[1]);
    expect(p).toContain("口述沒講的，不要寫");
    expect(p).toContain("文／王小明醫師（新陳代謝科）");
    expect(p).toContain("gaps");
  });
  it("沒回答的題目不會出現在提示詞；口述太短要擋", () => {
    const p = voiceArticlePrompt({ doctor: "王小明", question: "x", answers: ["", answers[1]!, "", ""] });
    expect(p).not.toContain(INTERVIEW_QUESTIONS[0]);
    expect(interviewIsThin(["有", "多運動", "", ""])).toBe(true);
    expect(interviewIsThin(answers.map((a) => a.repeat(2)))).toBe(false);
  });
  it("解析：文章太短算失敗；gaps 最多 3 條", () => {
    expect(parseVoiceArticle('{"title":"t","article":"太短"}')).toBeNull();
    const ok = parseVoiceArticle("```json\n" + JSON.stringify({ title: "減脂怎麼不掉肌肉？", article: "內".repeat(200), gaps: ["a", "b", "c", "d"] }) + "\n```");
    expect(ok?.title).toBe("減脂怎麼不掉肌肉？");
    expect(ok?.gaps).toHaveLength(3);
  });
});

describe("醫師寫作規範", () => {
  it("五個專科都有習慣與類型；帶招攬意味的類型沒有收進來", () => {
    expect(DOCTOR_SPECIALTIES.map((s) => s.id).sort()).toEqual(["bariatric", "family", "hepatology", "metabolism", "pediatric_endo"]);
    for (const s of DOCTOR_SPECIALTIES) {
      expect(s.habits.length, s.id).toBeGreaterThanOrEqual(6);
      expect(s.types.length, s.id).toBeGreaterThanOrEqual(4);
      for (const t of s.types) { expect(t.structure.length, t.id).toBeGreaterThanOrEqual(3); expect(t.rules.length, t.id).toBeGreaterThanOrEqual(4); }
    }
    const names = DOCTOR_SPECIALTIES.flatMap((s) => s.types.map((t) => t.name)).join("｜");
    expect(names).not.toMatch(/資深外科自述|中心網頁條列/);
    // 規則裡不該有網址。
    expect(JSON.stringify(DOCTOR_SPECIALTIES)).not.toMatch(/https?:\/\//);
  });
  it("帶 style 的提示詞有共同習慣、專科習慣與選定類型；沒帶就是簡版", () => {
    const type = specialtyStyle("metabolism")!.types[0]!;
    const withStyle = voiceArticlePrompt({ doctor: "王小明", question: "x", answers, style: { specialtyId: "metabolism", typeId: type.id } });
    expect(withStyle).toContain(COMMON_DOCTOR_HABITS[0]);
    expect(withStyle).toContain(specialtyStyle("metabolism")!.habits[0]);
    expect(withStyle).toContain(`這一篇照「${type.name}」寫`);
    expect(withStyle).toContain("全篇提醒一次就好");
    expect(withStyle).not.toContain("個人狀況一律請讀者與自己的醫師討論");
    // 藥品的規則沒有因為放寬而不見。
    expect(withStyle).toContain("不提任何藥品的商品名");
    const plain = voiceArticlePrompt({ doctor: "王小明", question: "x", answers });
    expect(plain).not.toContain(COMMON_DOCTOR_HABITS[0]);
    expect(plain).toContain("個人狀況一律請讀者與自己的醫師討論");
    expect(writingType("nope")).toBeUndefined();
    expect(writingStyleBlock({})).toContain(COMMON_DOCTOR_HABITS[1]);
  });
  it("免責聲明預設補上，可以關", () => {
    expect(finalizeDraft("內文")).toContain(EDUCATION_NOTE);
    expect(finalizeDraft("內文", { note: false })).toBe("內文");
  });
});

describe("第二步：套流量密碼", () => {
  const persona = INSPIRE_PERSONAS[0]!;
  it("提示詞帶著底稿，並說明只能改包裝", () => {
    const p = trafficRemixPrompt({ doctor: "王小明", title: "減脂怎麼不掉肌肉？", article: "肌肉是存款。", persona });
    expect(p).toContain("肌肉是存款。");
    expect(p).toContain("不可以新增任何醫療說法、數字、統計、研究、案例或建議");
    expect(p).toContain("move");
  });
  it("包裝後多出來的數字抓得到；平台形式的數字與白名單的數字不算", () => {
    const src = "每一餐都要有一份蛋白質。";
    expect(addedNumbers(src, "0–3 秒｜開場\n第 1 張｜肌肉是存款\n15 秒內講完 #減重")).toEqual([]);
    expect(addedNumbers(src, "BMI 27 以上屬於肥胖。")).toEqual([]);
    expect(addedNumbers(src, "你說你瘦了五公斤，可是臉垮了。回家先做兩件事，連續一個禮拜。")).toEqual(["五公斤"]);
    expect(addedNumbers("我瘦了五公斤。", "他說瘦了五公斤。")).toEqual([]);
    expect(addedNumbers(src, "每公斤體重吃 1.6 克蛋白質，可以多留住 45% 的肌肉。").sort()).toEqual(["1.6", "45"]);
  });
  it("解析：沒有成稿算失敗", () => {
    expect(parseRemix('{"move":"x","draft":""}')).toBeNull();
    expect(parseRemix(JSON.stringify({ move: "倒敘開場", draft: "稿".repeat(80) }))?.move).toBe("倒敘開場");
  });
});
