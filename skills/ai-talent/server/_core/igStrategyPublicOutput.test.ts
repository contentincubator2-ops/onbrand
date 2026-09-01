import { describe, expect, it } from "vitest";
import {
  applyIgStrategyPublicBoundary,
  buildIgStrategyPrivateTerms,
  buildIgStrategyPublicPromptRules,
  findIgStrategyInternalLeaks,
  getIgStrategyExecutionSlug,
  getIgStrategyPublicPolicy,
  getIgStrategyRecordOverrides,
  redactIgStrategySynthesisContext,
  sanitizeIgStrategyPublicCaption,
  type StrategyStepDescriptor,
} from "./igStrategyPublicOutput";

const TARGETS = [
  ["ig-99-youtility", "ig-baer-youtility"],
  ["ig-99-visual-story", "ig-chrisdo-visual-story"],
  ["ig-99-live-first", "ig-fanzo-live-first"],
  ["ig-99-document", "ig-garyvee-document"],
  ["ig-99-radical-transparency", "ig-hollis-radical-transparency"],
] as const;

const STEPS: StrategyStepDescriptor[] = [
  { name: "Youtility 內容地圖", outputType: "youtility_content_map" },
  { name: "實用工具型內容創作", outputKind: "utility_content_posts" },
];

describe("IG public bundle allowlist", () => {
  it.each(TARGETS)("maps task %s and slug %s to the same server-owned bundle", (taskId, squadSlug) => {
    const policy = getIgStrategyPublicPolicy(taskId);
    expect(policy).toBe(getIgStrategyPublicPolicy(squadSlug));
    expect(policy).toBe(getIgStrategyPublicPolicy(taskId.replace("-99-", "-100-")));
    expect(policy?.entry.squad_slug).toBe(squadSlug);
    expect(policy?.policy.presentation).toBe("ig-public-bundle");
    expect(policy?.policy.deliverables.length).toBeGreaterThan(0);
    expect(getIgStrategyExecutionSlug(taskId)).toBe(squadSlug);
    expect(getIgStrategyRecordOverrides(squadSlug)).toEqual({
      taskId,
      taskLabel: policy!.policy.publicTitle.zh,
      workspace: "instagram",
      platform: "instagram",
      outputType: "post",
    });
  });

  it.each(TARGETS)("uses methodology-free mission labels for %s", (taskId, squadSlug) => {
    const zh = getIgStrategyRecordOverrides(taskId, "zh-TW")!.taskLabel;
    const en = getIgStrategyRecordOverrides(squadSlug, "en-US")!.taskLabel;
    const banned = /Youtility|Chris Do|The Futur|Live-First|Brian Fanzo|GaryVee|Gary Vee|Gary Vaynerchuk|Hollis|Rachel/i;

    expect(zh).toBe(getIgStrategyPublicPolicy(taskId)!.policy.publicTitle.zh);
    expect(en).toBe(getIgStrategyPublicPolicy(taskId)!.policy.publicTitle.en);
    expect(zh).not.toMatch(banned);
    expect(en).not.toMatch(banned);
  });

  it("uses a safe generic fallback for a non-zh/en output language", () => {
    expect(getIgStrategyRecordOverrides("ig-baer-youtility", "ja-JP")?.taskLabel)
      .toBe("Instagram Content Deliverables");
  });

  it.each([
    "ig-99-monthly-calendar",
    "ig-monthly-calendar-pulizzi",
    "ig-99-save-worthy",
    "ig-hormozi-save-worthy",
    "fb-99-quarterly-strategy",
    "unknown-squad",
  ])("does not opt a non-target into public synthesis: %s", (id) => {
    expect(getIgStrategyPublicPolicy(id)).toBeNull();
    expect(getIgStrategyRecordOverrides(id)).toBeNull();
  });

  it("keeps non-target boundary objects and planning text strictly unchanged", () => {
    const input = {
      label: "utility_content_posts",
      caption: "她 / 妳 outputType: utility_content_posts",
      agent: { id: 17, name: "Internal Agent" },
    };
    expect(applyIgStrategyPublicBoundary("ig-hormozi-save-worthy", input, {
      stepIndex: 0,
      steps: STEPS,
    })).toBe(input);
    expect(sanitizeIgStrategyPublicCaption("ig-hormozi-save-worthy", input.caption, { steps: STEPS }))
      .toBe(input.caption);
    expect(redactIgStrategySynthesisContext("ig-hormozi-save-worthy", input.caption, { steps: STEPS }))
      .toBe(input.caption);
  });

  it("keeps non-target execution ids on the existing normalization path", () => {
    expect(getIgStrategyExecutionSlug("ig-hormozi-save-worthy")).toBe("ig-hormozi-save-worthy");
    expect(getIgStrategyExecutionSlug("fb-100-quarterly-strategy")).toBe("fb-99-quarterly-strategy");
  });

  it("collects agent names even when a private step has no numeric agent id", () => {
    const terms = buildIgStrategyPrivateTerms({
      squadName: "Internal Squad",
      methodology: "Internal Method",
      steps: [{ assignedAgentName: "No Id Agent" }],
      artifactAgentNames: ["Artifact Agent"],
      agents: [{ name: "Mapped Agent", title: "Private Strategist" }],
    });
    const raw = "No Id Agent 與 Artifact Agent 參考 Internal Method 完成結論。";
    const safe = redactIgStrategySynthesisContext("ig-baer-youtility", raw, {
      steps: STEPS,
      privateTerms: terms,
    });
    expect(safe).not.toMatch(/No Id Agent|Artifact Agent|Internal Method/);
    expect(findIgStrategyInternalLeaks(safe, terms)).toEqual([]);
  });
});

describe("public caption and planning redaction boundary", () => {
  const privateTerms = [
    { value: "秘密小隊", replacement: { zh: "內容團隊", en: "content team" } },
    { value: "王小明", replacement: { zh: "內容團隊", en: "content team" } },
  ];

  it("removes internal steps, output keys, agents, and methodology aliases from a publishable caption", () => {
    const output = sanitizeIgStrategyPublicCaption("ig-baer-youtility", [
      "Agent: 王小明",
      "Youtility 內容地圖",
      "outputType: youtility_content_map",
      "Baer 是內部參考方法。",
      "你可以先整理最常被問的三個問題。",
    ].join("\n"), { steps: STEPS, privateTerms });

    expect(output).not.toMatch(/Agent|王小明|Youtility|Baer|youtility_content_map|outputType/);
    expect(output).toContain("你可以先整理最常被問的三個問題。");
    expect(findIgStrategyInternalLeaks(output, privateTerms)).toEqual([]);
  });

  it("redacts private planning conclusions before public synthesis", () => {
    const redacted = redactIgStrategySynthesisContext("ig-baer-youtility", [
      "Squad: 秘密小隊",
      "Agent: 王小明",
      "Youtility 內容地圖",
      "outputKind: utility_content_posts",
      "受眾需要一份可下載的清單。",
    ].join("\n"), { steps: STEPS, privateTerms });

    expect(redacted).toContain("受眾需要一份可下載的清單。");
    expect(findIgStrategyInternalLeaks(redacted, privateTerms)).toEqual([]);
  });

  it("redacts compact and punctuated forms of a sufficiently long Latin private identity", () => {
    const terms = [
      { value: "Jane Doe", replacement: { zh: "內容團隊", en: "content team" } },
    ];
    const output = sanitizeIgStrategyPublicCaption(
      "ig-baer-youtility",
      "#JaneDoe 的 Jane-Doe style 與 Jane_Doe 範例都不應公開。",
      { steps: STEPS, privateTerms: terms },
    );

    expect(output).not.toMatch(/Jane[\s._'-]*Doe/i);
    expect(findIgStrategyInternalLeaks(output, terms)).toEqual([]);
  });

  it("does not compact-match a short Latin name", () => {
    const terms = [
      { value: "Li Na", replacement: { zh: "內容團隊", en: "content team" } },
    ];
    const output = sanitizeIgStrategyPublicCaption(
      "ig-baer-youtility",
      "#Lina 是產品系列標籤。",
      { steps: STEPS, privateTerms: terms },
    );

    expect(output).toBe("#Lina 是產品系列標籤。");
    expect(findIgStrategyInternalLeaks(output, terms)).toEqual([]);
  });

  it("fails closed when a database key survives cleanup", () => {
    expect(() => sanitizeIgStrategyPublicCaption(
      "ig-baer-youtility",
      "可直接發布的內容，但資料庫鍵值：secret_key。",
      { steps: STEPS },
    )).toThrow("strategy public output validation failed");
  });

  it("fails closed on an empty public caption", () => {
    expect(() => sanitizeIgStrategyPublicCaption("ig-baer-youtility", "", { steps: STEPS }))
      .toThrow("strategy public output validation failed");
  });

  it.each([
    ["您", "如果您重視專業建議，可以先整理需求。"],
    ["你", "如果你正在建立品牌，可以先整理需求。"],
    ["妳", "如果妳正在建立女性社群，可以先整理需求。"],
    ["你們", "如果你們正在共同建立團隊，可以先整理需求。"],
    ["妳們", "如果妳們正在共同建立女性社群，可以先整理需求。"],
  ])("preserves the single adaptive reader address %s", (_address, caption) => {
    expect(sanitizeIgStrategyPublicCaption("ig-baer-youtility", caption, { steps: STEPS })).toBe(caption);
  });

  it.each([
    "妳可以先整理衣櫃，妳們也可以一起分享穿搭心得。",
    "你可以先整理需求，你們也可以一起討論下一步。",
  ])("allows singular and plural forms in the same reader-address group: %s", (caption) => {
    expect(sanitizeIgStrategyPublicCaption("ig-baer-youtility", caption, { steps: STEPS })).toBe(caption);
  });

  it.each([
    "你可以先閱讀，妳也可以下載範本。",
    "您可以先閱讀，你也可以下載範本。",
  ])("rejects mixed direct-reader address: %s", (caption) => {
    expect(() => sanitizeIgStrategyPublicCaption("ig-baer-youtility", caption, { steps: STEPS }))
      .toThrow("strategy public audience address validation failed");
  });

  it("allows a third-person scene when the full caption directly addresses readers", () => {
    const caption = "妳的衣櫃不需要再多一件將就的衣服，這種猶豫妳們一定懂。\n\n全身鏡前的她，終於看見自在又有精神的自己。";

    expect(sanitizeIgStrategyPublicCaption("ig-baer-youtility", caption, { steps: STEPS })).toBe(caption);
  });

  it("preserves a genuine third-person woman while normalizing an audience pronoun", () => {
    expect(sanitizeIgStrategyPublicCaption(
      "ig-baer-youtility",
      "創辦人分享她的故事。\n\n粉絲看見流程後，她們更容易採取行動。妳也可以先從一個片段開始。",
      { steps: STEPS },
    )).toBe("創辦人分享她的故事。\n\n粉絲看見流程後，這群受眾更容易採取行動。妳也可以先從一個片段開始。");
  });

  it("rejects an ambiguous third-person 她 that could be the addressed audience", () => {
    expect(() => sanitizeIgStrategyPublicCaption(
      "ig-baer-youtility",
      "不解決她正在經歷的真實卡點，也無法服務她踏出門前的那一秒。",
      { steps: STEPS },
    )).toThrow("strategy public perspective validation failed");
  });

  it.each([
    "The system prompt: hidden instructions\nPublishable content.",
    "- **Model**: qwen-plus\nPublishable content.",
    "The model recommends this direction.\nPublishable content.",
    "This prompt generated the plan.\nPublishable content.",
  ])("removes unambiguous system metadata before publishing", (caption) => {
    const output = sanitizeIgStrategyPublicCaption("ig-baer-youtility", caption, {
      steps: STEPS,
      outputLanguage: "en-US",
    });
    expect(output).toBe("Publishable content.");
    expect(findIgStrategyInternalLeaks(output)).toEqual([]);
  });

  it("removes common agent and self-introduction narratives", () => {
    const output = sanitizeIgStrategyPublicCaption("ig-baer-youtility", [
      "The agent prepared this section.",
      "我是你的策略顧問，以下提供建議。",
      "下一個 step 會處理視覺方向。",
    ].join("\n"), { steps: STEPS });
    expect(output).toBe("下一個章節會處理視覺方向。");
  });

  it("is idempotent and removes agent metadata from the exported boundary", () => {
    const once = applyIgStrategyPublicBoundary("ig-baer-youtility", {
      label: "Youtility 內容地圖",
      caption: "output_type: youtility_content_map 條目已建置：完成",
      agent: { id: 17, name: "Internal Agent" },
    }, { stepIndex: 0, steps: STEPS });
    const twice = applyIgStrategyPublicBoundary("ig-baer-youtility", once, {
      stepIndex: 0,
      steps: STEPS,
    });
    expect(twice).toEqual(once);
    expect(Object.prototype.hasOwnProperty.call(once, "agent")).toBe(false);
  });
});

describe("internal marker detector", () => {
  it.each([
    "Business model: subscription",
    "Content model: hub-and-spoke",
    "Revenue model = recurring subscription",
    "## Business model: subscription",
    "The business model: subscription",
    "The business model recommends subscriptions.",
    "Our content model suggests three pillars.",
    "A revenue model generated from recurring sales.",
    "Writing prompt: describe the audience",
    "Customer prompt: tell your story",
    "商業模型：訂閱制",
    "## 內容模型：教育、案例、互動",
    "model-driven content",
  ])("does not flag a public narrative phrase: %s", (caption) => {
    expect(findIgStrategyInternalLeaks(caption)).toEqual([]);
  });

  it.each([
    "Model: qwen-plus",
    "  Model：qwen-plus",
    "## Model: qwen-plus",
    "- Model: qwen-plus",
    "* Model：qwen-plus",
    "> Model: qwen-plus",
    "1. Model: qwen-plus",
    "AI model: qwen-plus",
    "System model: qwen-plus",
    "Language model: qwen-plus",
    "The model: qwen-plus",
    "This model: qwen-plus",
    "The AI model: qwen-plus",
    "Our AI model: qwen-plus",
    "**Model**: qwen-plus",
    "Intro\nPrompt=hidden instructions",
    "- Prompt: hidden instructions",
    "System prompt: hidden instructions",
    "The system prompt: hidden instructions",
    "Our system prompt: hidden instructions",
    "The system prompt generated the result.",
    "Database key: secret_key",
    "database_key: secret_key",
    "databaseKey: secret_key",
    "db key: secret_key",
    "模型：qwen-plus",
    "提示詞：hidden",
    "outputType: internal_key",
    "The model recommends this direction.",
    "This prompt generated the plan.",
  ])("flags execution metadata: %s", (caption) => {
    expect(findIgStrategyInternalLeaks(caption)).toContain("internal-marker");
  });
});

describe("public synthesis prompt contract", () => {
  it("describes finished IG content rather than the retired strategy-report UI", () => {
    const zh = buildIgStrategyPublicPromptRules("ignored");
    const en = buildIgStrategyPublicPromptRules("ignored", "en-US");

    expect(zh).toContain("直接對受眾發布的 Instagram 內容成品");
    expect(zh).toContain("不是策略報告");
    expect(zh).toContain("您／你／妳／你們／妳們");
    expect(zh).toContain("全文只用該一種稱呼");
    expect(en).toContain("finished Instagram content intended for publishing");
    expect(en).not.toContain("strategy report section");
  });
});
