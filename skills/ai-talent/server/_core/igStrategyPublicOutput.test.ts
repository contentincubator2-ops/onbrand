import { describe, expect, it } from "vitest";
import {
  applyIgStrategyPublicBoundary,
  buildIgStrategyPublicPromptRules,
  findIgStrategyInternalLeaks,
  getIgStrategyExecutionSlug,
  getIgStrategyPublicPolicy,
  getIgStrategyPublicSectionLabel,
  getIgStrategyRecordOverrides,
  type StrategyStepDescriptor,
} from "./igStrategyPublicOutput";

const TARGETS = [
  ["ig-99-youtility", "ig-baer-youtility"],
  ["ig-99-visual-story", "ig-chrisdo-visual-story"],
  ["ig-99-live-first", "ig-fanzo-live-first"],
  ["ig-99-document", "ig-garyvee-document"],
  ["ig-99-radical-transparency", "ig-hollis-radical-transparency"],
] as const;

const YOUTILITY_STEPS: StrategyStepDescriptor[] = [
  { name: "Youtility 內容地圖", outputType: "youtility_content_map" },
  { name: "實用工具型內容創作", outputType: "utility_content_posts" },
  { name: "視覺化實用素材設計", outputType: "utility_infographics" },
  { name: "口碑擴散計劃", outputType: "word_of_mouth_plan" },
];

describe("IG strategy public-output policy", () => {
  it.each(TARGETS)("maps public task id %s and squad slug %s to the same policy", (taskId, squadSlug) => {
    const fromTaskId = getIgStrategyPublicPolicy(taskId);
    const fromSlug = getIgStrategyPublicPolicy(squadSlug);
    const fromLegacyTaskId = getIgStrategyPublicPolicy(taskId.replace("-99-", "-100-"));

    expect(fromTaskId?.entry.squad_slug).toBe(squadSlug);
    expect(fromSlug).toBe(fromTaskId);
    expect(fromLegacyTaskId).toBe(fromTaskId);
    expect(fromTaskId?.policy.presentation).toBe("strategy-report");
    expect(getIgStrategyExecutionSlug(taskId)).toBe(squadSlug);
    expect(getIgStrategyExecutionSlug(taskId.replace("-99-", "-100-"))).toBe(squadSlug);
    expect(getIgStrategyRecordOverrides(squadSlug)).toMatchObject({
      taskId,
      workspace: "instagram",
      platform: "instagram",
      outputType: "report",
      presentation: "strategy-report",
    });
  });

  it.each([
    "ig-99-monthly-calendar",
    "ig-monthly-calendar-pulizzi",
    "ig-99-save-worthy",
    "ig-hormozi-save-worthy",
    "fb-99-quarterly-strategy",
    "unknown-squad",
  ])("does not enable the boundary for non-target task %s", (id) => {
    expect(getIgStrategyPublicPolicy(id)).toBeNull();
  });

  it("keeps non-target variants as the exact same object", () => {
    const input = {
      label: "utility_content_posts",
      caption: "她 / 妳 outputType: utility_content_posts",
      hashtags: [],
    };

    expect(applyIgStrategyPublicBoundary("ig-hormozi-save-worthy", input, {
      stepIndex: 0,
      steps: YOUTILITY_STEPS,
    })).toBe(input);
  });

  it("keeps non-target execution slugs on the legacy normalization path", () => {
    expect(getIgStrategyExecutionSlug("ig-hormozi-save-worthy")).toBe("ig-hormozi-save-worthy");
    expect(getIgStrategyExecutionSlug("fb-100-quarterly-strategy")).toBe("fb-99-quarterly-strategy");
  });

  it("uses localized public labels without mixing Chinese into English output", () => {
    expect(getIgStrategyPublicSectionLabel("ig-99-youtility", 0, true)).toBe("受眾問題與內容機會");
    expect(getIgStrategyPublicSectionLabel("ig-99-youtility", 0, false)).toBe("Audience Needs and Content Opportunities");

    const output = applyIgStrategyPublicBoundary("ig-baer-youtility", {
      label: "Youtility 內容地圖",
      caption: "outputType: youtility_content_map\nutility_content_posts follows next.",
    }, { stepIndex: 0, steps: YOUTILITY_STEPS, isZhTW: false });

    expect(output.label).toBe("Audience Needs and Content Opportunities");
    expect(output.caption).toBe([
      "Deliverable: Audience Needs and Content Opportunities",
      "Useful Content Ideas follows next.",
    ].join("\n"));
    expect(output.caption).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("replaces internal step names and output keys with public section labels", () => {
    const input = {
      label: "Youtility 內容地圖",
      caption: [
        "Youtility 內容地圖",
        "outputType: `youtility_content_map`",
        "utility_content_posts 下一步會接續處理。",
      ].join("\n"),
      hashtags: [],
      image: { status: "skipped" },
    };

    const output = applyIgStrategyPublicBoundary("ig-baer-youtility", input, {
      stepIndex: 0,
      steps: YOUTILITY_STEPS,
    });

    expect(output).not.toBe(input);
    expect(output.label).toBe("受眾問題與內容機會");
    expect(output.caption).toContain("受眾問題與內容機會");
    expect(output.caption).toContain("實用內容提案");
    expect(output.caption).not.toMatch(/Youtility 內容地圖|youtility_content_map|utility_content_posts|outputType/i);
    expect(output.caption).not.toContain("`受眾問題與內容機會`");
    expect(output.hashtags).toBe(input.hashtags);
    expect(output.image).toBe(input.image);
  });

  it.each([
    ["ig-fanzo-live-first", "live_strategy_plan", "直播系列規劃"],
    ["ig-garyvee-document", "content_documentation_plan", "日常紀錄規劃"],
    ["ig-hollis-radical-transparency", "authentic_story_bank", "真實故事素材"],
  ])("removes the reported internal key for %s", (squadSlug, internalKey, publicLabel) => {
    const steps = [{ name: publicLabel, outputType: internalKey }];
    const output = applyIgStrategyPublicBoundary(squadSlug, {
      label: internalKey,
      caption: `${internalKey} 條目已建置：請查看內容`,
    }, { stepIndex: 0, steps });

    expect(output.label).toBe(publicLabel);
    expect(output.caption).toBe(`${publicLabel}：請查看內容`);
    expect(output.caption).not.toContain(internalKey);
    expect(output.caption).not.toContain("條目已建置");
  });

  it("fails closed on ambiguous perspective mix and preserves explicit third-person antecedents", () => {
    const thirdPerson = applyIgStrategyPublicBoundary("ig-baer-youtility", {
      label: "實用工具型內容創作",
      caption: "創辦人分享她的實際經驗，你可以從中挑一個主題。",
    }, { stepIndex: 1, steps: YOUTILITY_STEPS });

    expect(() => applyIgStrategyPublicBoundary("ig-baer-youtility", {
      label: "實用工具型內容創作",
      caption: "她們需要一份範本，妳可以先從這一步開始。",
    }, { stepIndex: 1, steps: YOUTILITY_STEPS })).toThrow("strategy public perspective validation failed");
    expect(thirdPerson.caption).toBe("創辦人分享她的實際經驗，你可以從中挑一個主題。");
  });

  it("rewrites mixed audience pronouns when the antecedent is explicit", () => {
    const output = applyIgStrategyPublicBoundary("ig-baer-youtility", {
      label: "實用工具型內容創作",
      caption: "粉絲正在找範本，她們希望立刻套用，妳可以提供下載版本。",
    }, { stepIndex: 1, steps: YOUTILITY_STEPS });

    expect(output.caption).toBe("粉絲正在找範本，這群受眾希望立刻套用，你可以提供下載版本。");
    expect(output.caption).not.toMatch(/[她妳]/);
  });

  it("removes dynamic private terms and system-style prefaces", () => {
    const privateTerms = [
      { value: "秘密小隊", replacement: { zh: "策略團隊", en: "strategy team" } },
      { value: "王小明", replacement: { zh: "策略團隊", en: "strategy team" } },
      { value: "內部方法 X", replacement: { zh: "策略方法", en: "strategy approach" } },
    ];
    const output = applyIgStrategyPublicBoundary("ig-baer-youtility", {
      label: "Youtility 內容地圖",
      caption: [
        "Squad「秘密小隊」",
        "Agent: 王小明",
        "我是王小明，內容策略師。",
        "以下是產出：",
        "內部方法 X 可用來整理內容。",
        "outputType utility_content_posts",
      ].join("\n"),
    }, { stepIndex: 0, steps: YOUTILITY_STEPS, privateTerms });

    expect(output.caption).toBe([
      "策略方法 可用來整理內容。",
      "交付項目 實用內容提案",
    ].join("\n"));
    expect(findIgStrategyInternalLeaks(output.caption, privateTerms)).toEqual([]);
    expect(output.caption).not.toMatch(/秘密小隊|王小明|內部方法 X|Squad|Agent|outputType|以下是產出/i);
  });

  it.each([
    ["ig-baer-youtility", "YOUTILITY"],
    ["ig-baer-youtility", "Baer"],
    ["ig-chrisdo-visual-story", "Chris Do"],
    ["ig-fanzo-live-first", "Live-First"],
    ["ig-garyvee-document", "GaryVee"],
    ["ig-hollis-radical-transparency", "Rachel Hollis"],
  ])("removes configured methodology alias for %s", (squadSlug, alias) => {
    const output = applyIgStrategyPublicBoundary(squadSlug, {
      label: "internal label",
      caption: `${alias} 是本次內部參考方法。`,
    }, { stepIndex: 0, steps: [{ name: "internal label", outputType: "internal_key" }] });

    expect(output.caption).toBe("策略方法 是本次內部參考方法。");
    expect(output.caption.toLocaleLowerCase()).not.toContain(alias.toLocaleLowerCase());
  });

  it("fails closed when a strong internal marker survives inline cleanup", () => {
    expect(() => applyIgStrategyPublicBoundary("ig-baer-youtility", {
      label: "Youtility 內容地圖",
      caption: "可公開內容，但仍殘留資料庫鍵值：secret_key。",
    }, { stepIndex: 0, steps: YOUTILITY_STEPS })).toThrow("strategy public output validation failed");
  });

  it("removes common narrative forms of agent, step, and self-introduction leaks", () => {
    const output = applyIgStrategyPublicBoundary("ig-baer-youtility", {
      label: "Youtility 內容地圖",
      caption: [
        "The agent prepared this section.",
        "我是你的策略顧問，以下提供建議。",
        "下一個 step 會處理視覺方向。",
      ].join("\n"),
    }, { stepIndex: 0, steps: YOUTILITY_STEPS });

    expect(output.caption).toBe("下一個章節會處理視覺方向。");
    expect(findIgStrategyInternalLeaks(output.caption)).toEqual([]);
  });

  it("removes model, prompt, and alternate self-introduction narratives", () => {
    const output = applyIgStrategyPublicBoundary("ig-baer-youtility", {
      label: "Youtility 內容地圖",
      caption: [
        "The model recommends this direction.",
        "This prompt generated the following plan.",
        "I'm your strategist. Here is the output.",
        "I’m your consultant. Here is the output.",
        "As your consultant, here is the output.",
        "身為你的策略顧問，以下提供建議。",
        "這段是可公開的策略內容。",
      ].join("\n"),
    }, { stepIndex: 0, steps: YOUTILITY_STEPS });

    expect(output.caption).toBe("這段是可公開的策略內容。");
    expect(findIgStrategyInternalLeaks(output.caption)).toEqual([]);
  });

  it("is idempotent", () => {
    const once = applyIgStrategyPublicBoundary("ig-baer-youtility", {
      label: "Youtility 內容地圖",
      caption: "output_type: youtility_content_map 條目已建置：完成",
    }, { stepIndex: 0, steps: YOUTILITY_STEPS });
    const twice = applyIgStrategyPublicBoundary("ig-baer-youtility", once, {
      stepIndex: 0,
      steps: YOUTILITY_STEPS,
    });

    expect(twice).toEqual(once);
  });

  it("uses a safe section fallback instead of exposing a mismatched DB step label", () => {
    const output = applyIgStrategyPublicBoundary("ig-baer-youtility", {
      label: "future_internal_stage",
      caption: "可公開的策略內容",
    }, { stepIndex: 9, steps: [{ name: "future_internal_stage", outputType: "future_key" }] });

    expect(output.label).toBe("策略章節 10");
  });

  it("provides customer-facing persistence fields only for target squads", () => {
    expect(getIgStrategyRecordOverrides("ig-fanzo-live-first")).toEqual({
      taskId: "ig-99-live-first",
      taskLabel: "IG × Live-First 直播優先型策略",
      workspace: "instagram",
      platform: "instagram",
      outputType: "report",
      presentation: "strategy-report",
    });
    expect(getIgStrategyRecordOverrides("ig-hormozi-save-worthy")).toBeNull();
    expect(getIgStrategyRecordOverrides("ig-fanzo-live-first", false)?.taskLabel)
      .toBe("IG × Live-First Strategy");
  });

  it("builds an explicit no-leak and neutral-perspective prompt contract", () => {
    const prompt = buildIgStrategyPublicPromptRules("直播系列規劃");
    const englishPrompt = buildIgStrategyPublicPromptRules("Live Series Plan", false);

    expect(prompt).toContain("直播系列規劃");
    expect(prompt).toContain("直接給客戶看的策略報告");
    expect(prompt).toContain("不得輸出");
    expect(prompt).toContain("outputType");
    expect(prompt).toContain("受眾");
    expect(prompt).toContain("你");
    expect(englishPrompt).toContain("customer-facing strategy report");
    expect(englishPrompt).toContain("Live Series Plan");
    expect(englishPrompt).not.toMatch(/[\u3400-\u9fff]/u);
  });
});
