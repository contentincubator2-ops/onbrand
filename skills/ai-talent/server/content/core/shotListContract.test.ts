import { describe, it, expect } from "vitest";
import {
  isShotListTemplate,
  buildShotListRule,
  validateShotList,
  repairShotList,
  countShots,
  normalizeShotList,
} from "./shotListContract";
import { TT_30S_TASKS } from "./quickTaskTikTok";
import { FB_30S_TASKS } from "./quickTaskFB";

const MECHANIC_CARDS = [
  "tt-30-visual-illusion",
  "tt-30-process-payoff",
  "tt-30-beat-sync",
  "tt-30-scale-reveal",
  "tt-30-real-reaction",
];

const GOOD = `[0.0-0.5s] 正常的一格
　畫面：中景，冷凍包放在流理台上
　動作：手把包裝推進微波爐
　聲音：無旁白，微波爐關門的喀噠聲
　字卡：無

[0.5-2.0s] 觸發
　畫面：同機位，微波爐門關上遮住視線
　動作：門一關，畫面暗一格
　聲音：拍點 1
　字卡：5 分鐘後

[2.0-4.0s] 揭曉
　畫面：同機位，門打開
　動作：撕開包裝，熱氣衝出來
　聲音：拍點 2，熱氣的滋滋聲
　字卡：24g 蛋白質`;

describe("isShotListTemplate", () => {
  it.each(MECHANIC_CARDS)("recognises %s", (id) => {
    const t = TT_30S_TASKS.find((x) => x.id === id)!;
    expect(isShotListTemplate(t)).toBe(true);
  });

  it("does not fire on ordinary TikTok caption tasks", () => {
    for (const id of ["tt-30-caption-description", "tt-30-hashtag-set", "tt-30-bio-rewrite", "tt-30-full-script"]) {
      const t = TT_30S_TASKS.find((x) => x.id === id)!;
      expect(isShotListTemplate(t), `${id} must not be treated as a shot list`).toBe(false);
    }
  });

  it("does not fire on any Facebook task", () => {
    // The contract turns OFF hashtags and forces structured output — firing it
    // on a post task would wreck that task's deliverable.
    for (const t of FB_30S_TASKS) {
      expect(isShotListTemplate(t), `${t.id} must not be treated as a shot list`).toBe(false);
    }
  });
});

describe("buildShotListRule", () => {
  it("cancels the three social-scaffold rules that fight a shot list", () => {
    const rule = buildShotListRule();
    expect(rule).toContain("不要排成結構化卡片"); // names the rule it overrides
    expect(rule).toContain("禁止 hashtag");
    expect(rule).toContain("不是貼文");
  });
});

describe("validateShotList", () => {
  it("passes a real shot list", () => {
    expect(validateShotList(GOOD)).toBeNull();
  });

  it("counts shots by timestamp head", () => {
    expect(countShots(GOOD)).toBe(3);
  });

  it("rejects the hashtag caption the model produced before the contract", () => {
    // Verbatim shape from the 2026-08-23 probe run.
    const issue = validateShotList(
      "冷凍包丟進微波 5 分鐘，\n撕開就是一份 24g 蛋白質的正餐。 #桂冠美味健力餐 #冷凍正餐",
    );
    expect(issue?.reason).toBe("no_timestamps");
  });

  it("rejects a script that is too short to shoot", () => {
    const twoShots = GOOD.split("\n\n").slice(0, 2).join("\n\n");
    expect(validateShotList(twoShots)?.reason).toBe("too_few_shots");
  });

  it("rejects a script missing one of the four lines", () => {
    const noSound = GOOD.replace(/^.*聲音：.*$/gmu, "");
    expect(validateShotList(noSound)?.reason).toBe("missing_lines");
  });

  it("rejects hashtags even when the格式 is otherwise correct", () => {
    expect(validateShotList(`${GOOD}\n\n#桂冠 #高蛋白`)?.reason).toBe("has_hashtags");
  });
});

describe("normalizeShotList — 救回「內容對、包裝爛」的回應", () => {
  // 以下三段都是 2026-08-23 probe-orchestra 實際跑出來的原文（降級到 zhipu）。
  it("turns literal backslash-n into real line breaks and drops the JSON tail", () => {
    const raw =
      '[0.0-2.0s] 畫面：工廠產線，工人在打包 \\n動作：一箱箱包裝好 \\n聲音：無旁白 \\n字卡：一天 3000 箱\\n' +
      '[2.0-8.0s] 畫面：鏡頭拉遠，整條產線 \\n動作：鏡頭平移 \\n聲音：無旁白 \\n字卡：12 道品管\\n' +
      '[8.0-12.0s] 畫面：全景，工廠規模 \\n動作：拉到全景 \\n聲音：無旁白 \\n字卡：桂冠冷凍食品"]\n}';
    const out = normalizeShotList(raw);
    expect(out).not.toContain("\\n");
    expect(out.endsWith("桂冠冷凍食品")).toBe(true);
    expect(countShots(out)).toBe(3);
    expect(validateShotList(out)).toBeNull();
  });

  it("splits a script the model crammed onto one line", () => {
    const raw =
      "[0.0-2.0s] 畫面：工人檢查包裝，細節清晰。[2.0-8.0s] 動作：搬箱上車，鏡頭拉遠。" +
      "[8.0-12.0s] 聲音：無旁白，只有機器聲。[12.0-15.0s] 字卡：一天 3000 箱";
    const out = normalizeShotList(raw);
    expect(countShots(out)).toBe(4);
  });

  it("splits a label glued to its timestamp", () => {
    const out = normalizeShotList("[0.0-2.0s]畫面：一條產線\n動作：機器運轉\n聲音：無旁白\n字卡：無");
    expect(out.split("\n")[0]).toBe("[0.0-2.0s]");
    expect(out).toContain("\n畫面：一條產線");
  });

  it("strips a leading ```json {\"caption\": [ envelope", () => {
    const out = normalizeShotList('```json\n{"caption": ["[0.0-2.0s] 開場\\n畫面：手\\n動作：推\\n聲音：無旁白\\n字卡：無"]}\n```');
    expect(out.startsWith("[0.0-2.0s]")).toBe(true);
    expect(out).not.toContain("caption");
  });

  it("leaves a well-formed script untouched", () => {
    expect(normalizeShotList(GOOD)).toBe(GOOD.trim());
  });

  it("keeps punctuation that belongs to the last 字卡", () => {
    const out = normalizeShotList("[0-2s] 開場\n畫面：手\n動作：推\n聲音：無旁白\n字卡：真的只要 5 分鐘！");
    expect(out.endsWith("真的只要 5 分鐘！")).toBe(true);
  });
});

describe("normalizeShotList — 句子裡提到的時間戳不是一格", () => {
  it("does not split a timestamp used as an inline reference", () => {
    // 2026-08-23 VM probe：最後一格寫「…無縫切回格 [0.0-0.5s]）」，被切開後
    // 留下孤零零的一行「[0.0-0.5s]）」，看起來像多了一格空的。
    const withRef = [
      "[0.0-0.5s] 開場",
      "畫面：a",
      "動作：b",
      "聲音：c",
      "字卡：d",
      "[14.5-15.0s] 回環",
      "畫面：同開場",
      "動作：靜止 0.5 秒，無縫切回第一格 [0.0-0.5s]）",
      "聲音：淡出",
      "字卡：無",
    ].join("\n");
    const out = normalizeShotList(withRef);
    expect(countShots(out)).toBe(2); // 不是 3
    expect(out).toContain("無縫切回第一格 [0.0-0.5s]）");
  });

  it("puts a trailing block heading on its own line", () => {
    // 2026-08-23 VM probe：「字卡：開了。【開拍前準備】」黏成一行。
    const glued = "字卡：開了。 【開拍前準備】\n・器材：手機＋腳架";
    const out = normalizeShotList(glued);
    expect(out).toContain("字卡：開了。\n\n【開拍前準備】");
  });

  it("drops the markdown rule the model leaves before a block", () => {
    // 2026-08-23 VM probe：「字卡：微波 5 分鐘的距離 ---」。
    const out = normalizeShotList("字卡：微波 5 分鐘的距離 ---\n\n【開拍前準備】\n・器材：手機");
    expect(out).toContain("字卡：微波 5 分鐘的距離\n");
    expect(out).not.toContain("---");
  });

  it("breaks a block that came back as one long line", () => {
    // 2026-08-23 VM probe：整個【常見失誤】擠成一行。
    const oneLine = "字卡：無 【常見失誤】 失誤：位置不一致　改法：貼膠帶標中央點 失誤：煙霧擋住盒子　改法：等一秒再倒";
    const out = normalizeShotList(oneLine).split("\n").filter(Boolean);
    expect(out).toEqual([
      "字卡：無",
      "【常見失誤】",
      "失誤：位置不一致　改法：貼膠帶標中央點",
      "失誤：煙霧擋住盒子　改法：等一秒再倒",
    ]);
  });

  it("still splits a real shot header that follows content", () => {
    const glued = "字卡：d [0.5-1.0s] 第二格\n畫面：e";
    expect(normalizeShotList(glued)).toContain("字卡：d\n[0.5-1.0s] 第二格");
  });
});

describe("repairShotList — 品牌規則改寫之後的第二道防線", () => {
  it("re-splits the timestamp a brand rewrite glued onto the 字卡 line", () => {
    // 2026-08-23 VM probe（brand_id=2924，Anthropic）實際回來的形狀：
    // enforceBrandRulesOnTextWithReport 改寫後，下一格的時間戳黏回上一行。
    const glued = [
      "[0.0-0.5s] 開場",
      "畫面：俯拍冰箱冷凍層，8 款包裝整齊排列",
      "動作：鏡頭緩慢推進",
      "聲音：低沉電子音起",
      "字卡：冷凍微波 5 分鐘 [0.5-1.0s] 品項 1 — 黑椒牛肉",
      "畫面：手拿盒裝，背景白牆",
      "動作：轉向鏡頭",
      "聲音：清脆音效跟拍",
      "字卡：24g 蛋白質 [1.0-1.5s] 品項 2 — 麻辣雞腿",
      "畫面：同機位，切換款式",
      "動作：包裝轉向正面",
      "聲音：同前音效",
      "字卡：24g 蛋白質",
    ].join("\n");
    expect(countShots(glued)).toBe(1); // 黏在一起時只認得出 1 格
    const fixed = repairShotList(glued);
    expect(countShots(fixed)).toBe(3);
    expect(validateShotList(fixed)).toBeNull();
    expect(fixed).toContain("字卡：冷凍微波 5 分鐘\n[0.5-1.0s]");
  });
});

describe("repairShotList", () => {
  it("strips hashtags and leaves the shots intact", () => {
    const repaired = repairShotList(`${GOOD}\n\n#桂冠 #高蛋白`);
    expect(validateShotList(repaired)).toBeNull();
    expect(countShots(repaired)).toBe(3);
    expect(repaired).toContain("24g 蛋白質");
  });

  it("strips an inline hashtag without eating the line", () => {
    const repaired = repairShotList(GOOD.replace("字卡：24g 蛋白質", "字卡：24g 蛋白質 #高蛋白"));
    expect(repaired).toContain("字卡：24g 蛋白質");
    expect(repaired).not.toContain("#");
  });
});
