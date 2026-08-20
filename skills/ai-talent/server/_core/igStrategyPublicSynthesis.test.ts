import { describe, expect, it } from "vitest";
import {
  assertPrivateStrategyArtifactsReady,
  assertRedactedStrategyContextReady,
  buildIgStrategyPublicSlots,
  buildIgStrategySynthesisMessages,
  getRemainingStrategyPostPermission,
  mergeIgStrategyPublicVariants,
  parseIgStrategyPublicVariants,
  runSynthesisBatchesWithDeadline,
  splitIgStrategyPublicSlots,
  type IgStrategyPublicSlot,
} from "./igStrategyPublicSynthesis";
import {
  findIgStrategyInternalLeaks,
  redactIgStrategySynthesisContext,
  type StrategyStepDescriptor,
} from "./igStrategyPublicOutput";

const TARGETS = [
  ["ig-99-youtility", "ig-baer-youtility"],
  ["ig-99-visual-story", "ig-chrisdo-visual-story"],
  ["ig-99-live-first", "ig-fanzo-live-first"],
  ["ig-99-document", "ig-garyvee-document"],
  ["ig-99-radical-transparency", "ig-hollis-radical-transparency"],
] as const;

const PRIVATE_STEPS: StrategyStepDescriptor[] = [
  { name: "Live 直播策略規劃", outputType: "live_strategy_plan" },
  { name: "直播後內容再製", outputKind: "post_live_content_set" },
];

describe("IG strategy phased generation", () => {
  it("selects only the first three slots initially and all ungenerated slots later", () => {
    const slots = buildIgStrategyPublicSlots("ig-99-youtility", "省時技巧")!;
    const first = splitIgStrategyPublicSlots(slots);
    expect(first.initial.map((slot) => slot.slotId)).toEqual([
      "useful-feed-1", "useful-feed-2", "useful-feed-3",
    ]);
    expect(first.remaining).toHaveLength(27);

    const continuation = splitIgStrategyPublicSlots(slots, first.initial.map((slot) => slot.slotId));
    expect(continuation.initial).toEqual([]);
    expect(continuation.remaining.map((slot) => slot.slotId)).toEqual(
      slots.slice(3).map((slot) => slot.slotId),
    );
  });

  it("decides remaining-post permission without weakening ownership or artifact gates", () => {
    const base = {
      isOwner: true,
      isStrategyOutput: true,
      progress: "done",
      remainingSlotCount: 27,
      artifactsReady: true,
    };
    expect(getRemainingStrategyPostPermission(base)).toEqual({ allowed: true });
    expect(getRemainingStrategyPostPermission({ ...base, isOwner: false }))
      .toEqual({ allowed: false, reason: "not_owner" });
    expect(getRemainingStrategyPostPermission({ ...base, progress: "caption_ready" }))
      .toEqual({ allowed: false, reason: "busy" });
    expect(getRemainingStrategyPostPermission({ ...base, artifactsReady: false }))
      .toEqual({ allowed: false, reason: "artifacts_incomplete" });
  });

  it("merges generated posts into immutable slot order without blanks", () => {
    const slots = buildIgStrategyPublicSlots("ig-99-youtility", "省時技巧")!.slice(0, 4);
    const variant = (id: string) => ({
      id,
      label: id,
      format: "feed" as const,
      caption: id,
      hashtags: [],
      image: { style: null, url: null as null, status: "skipped" as const },
    });
    expect(mergeIgStrategyPublicVariants(
      slots,
      [variant(slots[0]!.slotId), variant(slots[1]!.slotId)],
      [variant(slots[3]!.slotId), variant(slots[2]!.slotId)],
    ).map((item) => item.id)).toEqual(slots.map((slot) => slot.slotId));
  });
});

describe("IG public synthesis batch scheduling", () => {
  it("retries one failed batch once and succeeds", async () => {
    let calls = 0;
    await runSynthesisBatchesWithDeadline({
      batchIndexes: [0],
      concurrency: 1,
      deadlineAt: 1_000,
      perAttemptTimeoutMs: 100,
      now: () => 0,
      executeBatch: async () => {
        calls += 1;
        if (calls === 1) throw new Error("incomplete JSON");
      },
    });
    expect(calls).toBe(2);
  });

  it("does not retry after the overall deadline is exhausted", async () => {
    let now = 0;
    let calls = 0;
    await expect(runSynthesisBatchesWithDeadline({
      batchIndexes: [0],
      concurrency: 1,
      deadlineAt: 100,
      perAttemptTimeoutMs: 100,
      now: () => now,
      executeBatch: async () => {
        calls += 1;
        now = 100;
        throw new Error("timed out");
      },
    })).rejects.toThrow("public synthesis timeout");
    expect(calls).toBe(1);
  });
});

function formatCounts(slots: readonly IgStrategyPublicSlot[]) {
  return slots.reduce<Record<string, number>>((counts, slot) => {
    counts[slot.format] = (counts[slot.format] ?? 0) + 1;
    return counts;
  }, {});
}

function modelJson(slots: readonly IgStrategyPublicSlot[], caption: (slot: IgStrategyPublicSlot) => string) {
  return JSON.stringify({
    variants: [...slots].reverse().map((slot) => ({
      slotId: slot.slotId,
      // These model-owned fields must never override the server slot contract.
      format: "feed",
      label: "model label",
      agent: { id: 99, name: "Internal Agent" },
      outputType: "secret_output_key",
      caption: caption(slot),
      hashtags: ["one", 17, "two"],
      imageStyle: `style for ${slot.slotId}`,
    })),
  });
}

describe("IG public deliverable slot contract", () => {
  const artifact = (stepOrder: number, overrides: Partial<{
    status: "done" | "failed";
    rawContent: string;
  }> = {}) => ({
    stepOrder,
    status: overrides.status ?? "done" as const,
    internalLabel: `Step ${stepOrder}`,
    outputType: null,
    outputKind: null,
    agentId: null,
    agentName: null,
    rawContent: overrides.rawContent ?? `analysis ${stepOrder}`,
    errorCode: null,
    latencyMs: 1,
  });

  it("synthesizes from only the four usable artifacts when one of five steps fails", () => {
    const artifacts = [
      artifact(1, { status: "failed", rawContent: "" }),
      artifact(2),
      artifact(3),
      artifact(4),
      artifact(5),
    ];

    const usableArtifacts = assertPrivateStrategyArtifactsReady(artifacts, 5);
    const strategyContext = usableArtifacts.map((item) => item.rawContent);
    expect(strategyContext).toEqual([
      "analysis 2", "analysis 3", "analysis 4", "analysis 5",
    ]);
    expect(() => assertRedactedStrategyContextReady(strategyContext, 4)).not.toThrow();
  });

  it("rejects synthesis when fewer than ceil(n / 2) artifacts are usable", () => {
    const artifacts = [
      artifact(1, { status: "failed", rawContent: "" }),
      artifact(2, { status: "failed", rawContent: "" }),
      artifact(3, { status: "failed", rawContent: "" }),
      artifact(4),
      artifact(5),
    ];
    expect(() => assertPrivateStrategyArtifactsReady(artifacts, 5)).toThrow("incomplete");
  });

  it("rejects synthesis while an artifact row is missing", () => {
    const ready = [
      artifact(1),
      artifact(2),
    ];
    expect(() => assertPrivateStrategyArtifactsReady(ready, 2)).not.toThrow();
    expect(() => assertPrivateStrategyArtifactsReady(ready.slice(0, 1), 2)).toThrow("incomplete");
    expect(() => assertRedactedStrategyContextReady(["safe A", "safe B"], 2)).not.toThrow();
    expect(() => assertRedactedStrategyContextReady(["safe A", ""], 2)).toThrow("incomplete");
  });

  it.each(TARGETS)("resolves identical slots for task id %s and squad slug %s", (taskId, squadSlug) => {
    const topic = "一個明確主題";
    expect(buildIgStrategyPublicSlots(taskId, topic)).toEqual(buildIgStrategyPublicSlots(squadSlug, topic));
    expect(buildIgStrategyPublicSlots(taskId.replace("-99-", "-100-"), topic))
      .toEqual(buildIgStrategyPublicSlots(taskId, topic));
  });

  it.each([
    ["ig-99-youtility", 30, { feed: 30 }],
    ["ig-99-visual-story", 30, { feed: 30 }],
    ["ig-99-live-first", 12, { live: 1, story: 4, reel: 4, carousel: 3 }],
    ["ig-99-document", 4, { feed: 1, reel: 1, story: 1, carousel: 1 }],
    ["ig-99-radical-transparency", 1, { feed: 1 }],
  ] as const)("builds the default public count/format contract for %s", (taskId, count, expectedFormats) => {
    const slots = buildIgStrategyPublicSlots(taskId, "一個明確主題")!;
    expect(slots).toHaveLength(count);
    expect(formatCounts(slots)).toEqual(expectedFormats);
    expect(new Set(slots.map((slot) => slot.slotId)).size).toBe(count);
  });

  it("derives live deliverables from an explicit session count, independent of three private steps", () => {
    const slots = buildIgStrategyPublicSlots("ig-fanzo-live-first", "預計 2 場直播，每週一次")!;
    expect(slots).toHaveLength(24);
    expect(formatCounts(slots)).toEqual({ live: 2, story: 9, reel: 7, carousel: 6 });
    expect(slots.filter((slot) => slot.slotId.startsWith("live-session-"))).toHaveLength(2);
    expect(slots.filter((slot) => slot.slotId.startsWith("live-teaser-"))).toHaveLength(2);
    expect(slots.filter((slot) => slot.slotId.startsWith("post-live-"))).toHaveLength(20);
  });

  it("derives one four-format bundle per documented asset", () => {
    const slots = buildIgStrategyPublicSlots(
      "ig-garyvee-document",
      "規劃 3 個場景：設計師接案日常、產品打樣到出貨、客戶會議紀錄",
    )!;
    expect(slots).toHaveLength(12);
    expect(formatCounts(slots)).toEqual({ feed: 3, reel: 3, story: 3, carousel: 3 });
  });

  it("derives one feed post per explicitly separated authentic story", () => {
    const slots = buildIgStrategyPublicSlots(
      "ig-hollis-radical-transparency",
      "規劃 3 個故事：第一年虧損差點收掉；改配方失敗；曾被客戶退單",
    )!;
    expect(slots).toHaveLength(3);
    expect(formatCounts(slots)).toEqual({ feed: 3 });
  });

  it.each([
    "ig-99-monthly-calendar",
    "ig-hormozi-save-worthy",
    "fb-99-quarterly-strategy",
    "unknown-squad",
  ])("returns null without adapting a non-target task: %s", (id) => {
    expect(buildIgStrategyPublicSlots(id, "任意輸入")).toBeNull();
  });
});

describe("IG public synthesis parsing", () => {
  it("drops a kebab-case imageStyle slug for Traditional Chinese output", () => {
    const slots = buildIgStrategyPublicSlots("ig-hollis-radical-transparency", "一次失敗故事")!;
    const payload = JSON.parse(modelJson(slots, () => "你可以誠實分享這次經驗。"));
    payload.variants[0].imageStyle = "authentic-lifestyle-photography-warm-natural-light-family-table-scene";

    const variants = parseIgStrategyPublicVariants({
      idOrSlug: "ig-hollis-radical-transparency",
      modelText: JSON.stringify(payload),
      outputLanguage: "zh-TW",
      slots,
      steps: [],
    });

    expect(variants[0]!.image.style).toBeNull();
  });

  it("preserves a natural English imageStyle for English output", () => {
    const slots = buildIgStrategyPublicSlots("ig-hollis-radical-transparency", "A candid failure story", "en")!;
    const payload = JSON.parse(modelJson(slots, () => "Share the hard moment honestly and without polish."));
    const naturalImageStyle = "A candid family table scene in warm natural light, framed at eye level with a sincere, unstaged mood.";
    payload.variants[0].imageStyle = naturalImageStyle;

    const variants = parseIgStrategyPublicVariants({
      idOrSlug: "ig-hollis-radical-transparency",
      modelText: JSON.stringify(payload),
      outputLanguage: "en",
      slots,
      steps: [],
    });

    expect(variants[0]!.image.style).toBe(naturalImageStyle);
  });

  it("parses Qwen-style fenced JSON, restores server order, and ignores model-owned format/index fields", () => {
    const slots = buildIgStrategyPublicSlots("ig-garyvee-document", "一個真實素材")!;
    const qwenText = `Qwen result follows:\n\`\`\`json\n${modelJson(slots, () => "妳可以從這次失敗說起，讓真實經驗成為下一步。")}\n\`\`\``;
    const variants = parseIgStrategyPublicVariants({
      idOrSlug: "ig-garyvee-document",
      modelText: qwenText,
      outputLanguage: "zh-TW",
      slots,
      steps: PRIVATE_STEPS,
    });

    expect(variants.map((variant) => variant.id)).toEqual(slots.map((slot) => slot.slotId));
    expect(variants.map((variant) => variant.format)).toEqual(slots.map((slot) => slot.format));
    expect(variants[0]).toMatchObject({
      label: slots[0]!.label,
      caption: "妳可以從這次失敗說起，讓真實經驗成為下一步。",
      hashtags: ["one", "two"],
      image: { style: `style for ${slots[0]!.slotId}`, url: null, status: "skipped" },
    });
    expect(JSON.stringify(variants)).not.toMatch(/Internal Agent|secret_output_key|model label/);
  });

  it("removes private step names, output keys, agents, and methodology aliases from public variants", () => {
    const slots = buildIgStrategyPublicSlots("ig-fanzo-live-first", "預計 1 場直播")!;
    const privateTerms = [
      { value: "王小明", replacement: { zh: "內容團隊", en: "content team" } },
    ];
    const variants = parseIgStrategyPublicVariants({
      idOrSlug: "ig-fanzo-live-first",
      modelText: modelJson(slots, () => [
        "Agent: 王小明",
        "Live 直播策略規劃",
        "outputType: live_strategy_plan",
        "Brian Fanzo 是內部方法。",
        "你可以先把直播重點整理成一句承諾。",
      ].join("\n")),
      outputLanguage: "zh-TW",
      slots,
      steps: PRIVATE_STEPS,
      privateTerms,
    });

    const publicJson = JSON.stringify(variants);
    expect(publicJson).not.toMatch(/Agent|王小明|Brian Fanzo|Live 直播策略規劃|live_strategy_plan|outputType/);
    for (const variant of variants) {
      expect(findIgStrategyInternalLeaks(variant.caption, privateTerms)).toEqual([]);
    }
  });

  it("preserves one audience-aware address and rejects a mixed address inside a public caption", () => {
    const slots = buildIgStrategyPublicSlots("ig-hollis-radical-transparency", "女性創業者的失敗故事")!;
    const female = parseIgStrategyPublicVariants({
      idOrSlug: "ig-hollis-radical-transparency",
      modelText: modelJson(slots, () => "妳可以誠實說出卡關的時刻，妳不需要把過程美化。"),
      outputLanguage: "zh-TW",
      slots,
      steps: [],
    });
    expect(female[0]!.caption).toContain("妳");

    expect(() => parseIgStrategyPublicVariants({
      idOrSlug: "ig-hollis-radical-transparency",
      modelText: modelJson(slots, () => "妳可以說出卡關的時刻，你不需要把過程美化。"),
      outputLanguage: "zh-TW",
      slots,
      steps: [],
    })).toThrow("strategy public audience address validation failed");
  });

  it("sanitizes hashtags and visual direction and rejects cross-field audience mixing", () => {
    const slots = buildIgStrategyPublicSlots("ig-hollis-radical-transparency", "女性創業者的失敗故事")!;
    const payload = JSON.parse(modelJson(slots, () => "妳可以誠實分享這次經驗。"));
    payload.variants[0].hashtags = ["#RadicalTransparency", "outputType: live_strategy_plan"];
    payload.variants[0].imageStyle = "Rachel Hollis inspired visual";
    const sanitized = parseIgStrategyPublicVariants({
      idOrSlug: "ig-hollis-radical-transparency",
      modelText: JSON.stringify(payload),
      outputLanguage: "zh-TW",
      slots,
      steps: PRIVATE_STEPS,
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/RadicalTransparency|live_strategy_plan|Rachel Hollis|outputType/);

    payload.variants[0].hashtags = ["#你也可以"];
    expect(() => parseIgStrategyPublicVariants({
      idOrSlug: "ig-hollis-radical-transparency",
      modelText: JSON.stringify(payload),
      outputLanguage: "zh-TW",
      slots,
      steps: PRIVATE_STEPS,
    })).toThrow("strategy public audience address validation failed");
  });

  it("applies brand substitutions locally and fails closed on banned words without another model", () => {
    const slots = buildIgStrategyPublicSlots("ig-hollis-radical-transparency", "一次失敗故事")!;
    const rules = {
      banned: ["浮誇禁詞"],
      subs: [{ from: "舊品牌用語", to: "新品牌用語" }],
      preferred: ["真實"],
    };
    const replaced = parseIgStrategyPublicVariants({
      idOrSlug: "ig-hollis-radical-transparency",
      modelText: modelJson(slots, () => "你可以用舊品牌用語說出真實經驗。"),
      outputLanguage: "zh-TW",
      slots,
      steps: [],
      brandRules: rules,
    });
    expect(replaced[0]!.caption).toContain("新品牌用語");
    expect(replaced[0]!.caption).not.toContain("舊品牌用語");

    expect(() => parseIgStrategyPublicVariants({
      idOrSlug: "ig-hollis-radical-transparency",
      modelText: modelJson(slots, () => "你可以使用浮誇禁詞。"),
      outputLanguage: "zh-TW",
      slots,
      steps: [],
      brandRules: rules,
    })).toThrow("violates brand word rules");
  });

  it("applies Latin brand substitutions case-insensitively across every public field", () => {
    const slots = buildIgStrategyPublicSlots("ig-hollis-radical-transparency", "一次失敗故事")!;
    const payload = JSON.parse(modelJson(slots, () => "你可以用 OLD VOICE 分享真實經驗。"));
    payload.variants[0].hashtags = ["#old voice"];
    payload.variants[0].imageStyle = "Old Voice editorial style";

    const variants = parseIgStrategyPublicVariants({
      idOrSlug: "ig-hollis-radical-transparency",
      modelText: JSON.stringify(payload),
      outputLanguage: "zh-TW",
      slots,
      steps: [],
      brandRules: {
        banned: [],
        subs: [{ from: "Old Voice", to: "New Voice" }],
        preferred: [],
      },
    });

    expect(JSON.stringify(variants)).not.toMatch(/old voice/i);
    expect(variants[0]).toMatchObject({
      caption: expect.stringContaining("New Voice"),
      hashtags: ["#New Voice"],
      image: { style: "New Voice editorial style" },
    });
  });

  it.each(["caption", "hashtags", "imageStyle"] as const)(
    "rejects a case-variant Latin banned term in %s",
    (field) => {
      const slots = buildIgStrategyPublicSlots("ig-hollis-radical-transparency", "一次失敗故事")!;
      const payload = JSON.parse(modelJson(slots, () => field === "caption" ? "HARD SELL" : "你可以分享真實經驗。"));
      if (field === "hashtags") payload.variants[0].hashtags = ["#hard sell"];
      if (field === "imageStyle") payload.variants[0].imageStyle = "Hard Sell visual";

      expect(() => parseIgStrategyPublicVariants({
        idOrSlug: "ig-hollis-radical-transparency",
        modelText: JSON.stringify(payload),
        outputLanguage: "zh-TW",
        slots,
        steps: [],
        brandRules: { banned: ["Hard Sell"], subs: [], preferred: [] },
      })).toThrow("violates brand word rules");
    },
  );

  it("re-applies brand rules after private-term redaction", () => {
    const slots = buildIgStrategyPublicSlots("ig-hollis-radical-transparency", "一次失敗故事")!;
    const privateTerms = [
      { value: "Jane Doe", replacement: { zh: "內容團隊", en: "content team" } },
    ];
    const payload = JSON.parse(modelJson(slots, () => "你可以參考 #JaneDoe 的整理方式。"));

    expect(() => parseIgStrategyPublicVariants({
      idOrSlug: "ig-hollis-radical-transparency",
      modelText: JSON.stringify(payload),
      outputLanguage: "zh-TW",
      slots,
      steps: [],
      privateTerms,
      brandRules: { banned: ["內容團隊"], subs: [], preferred: [] },
    })).toThrow("violates brand word rules");
  });

  it("fails closed on a missing, duplicate, or extra server-owned slot", () => {
    const slots = buildIgStrategyPublicSlots("ig-garyvee-document", "一個素材")!;
    const valid = JSON.parse(modelJson(slots, () => "你可以記錄一個真實工作的瞬間。"));

    expect(() => parseIgStrategyPublicVariants({
      idOrSlug: "ig-garyvee-document", modelText: JSON.stringify({ variants: valid.variants.slice(1) }),
      outputLanguage: "zh-TW", slots, steps: [],
    })).toThrow("wrong variant count");

    valid.variants[1].slotId = valid.variants[0].slotId;
    expect(() => parseIgStrategyPublicVariants({
      idOrSlug: "ig-garyvee-document", modelText: JSON.stringify(valid),
      outputLanguage: "zh-TW", slots, steps: [],
    })).toThrow("invalid slot ids");
  });
});

describe("private planning and public index separation", () => {
  it("requires imageStyle to match the output language and use a natural visual description", () => {
    const slots = buildIgStrategyPublicSlots("ig-hollis-radical-transparency", "一次失敗故事")!;
    const messages = buildIgStrategySynthesisMessages({
      idOrSlug: "ig-hollis-radical-transparency",
      topic: "一次失敗故事",
      brandContext: "",
      outputLanguage: "zh-TW",
      slots,
      strategyContext: ["以真實場景呈現故事。"],
    });
    const systemPrompt = messages[0]!.content;

    expect(systemPrompt).toContain("For imageStyle");
    expect(systemPrompt).toContain("Traditional Chinese (zh-TW)");
    expect(systemPrompt).toContain("the same output language as caption");
    expect(systemPrompt).toContain("subject or scene, lighting, composition, and mood");
    expect(systemPrompt).toContain("40–120 characters");
    expect(systemPrompt).toContain("Never use kebab-case, snake_case");
  });

  it("redacts planning material before it is placed in the public synthesis prompt", () => {
    const privateTerms = [
      { value: "王小明", replacement: { zh: "內容團隊", en: "content team" } },
    ];
    const rawPlanning = [
      "Agent: 王小明",
      "Live 直播策略規劃",
      "outputType: live_strategy_plan",
      "Brian Fanzo 建議先寫一個明確承諾。",
    ].join("\n");
    const safePlanning = redactIgStrategySynthesisContext("ig-fanzo-live-first", rawPlanning, {
      steps: PRIVATE_STEPS,
      privateTerms,
    });
    const slots = buildIgStrategyPublicSlots("ig-fanzo-live-first", "預計 1 場直播")!;
    const messages = buildIgStrategySynthesisMessages({
      idOrSlug: "ig-fanzo-live-first",
      topic: "預計 1 場直播",
      brandContext: "品牌語氣沉穩",
      outputLanguage: "zh-TW",
      slots,
      strategyContext: [safePlanning],
      brandRules: {
        banned: ["空洞套語"],
        subs: [{ from: "舊詞", to: "新詞" }],
        preferred: ["務實"],
      },
    });
    const prompt = messages.map((message) => message.content).join("\n");

    expect(safePlanning).not.toMatch(/Agent|王小明|Brian Fanzo|Live 直播策略規劃|live_strategy_plan|outputType/);
    expect(prompt).not.toMatch(/Agent:|王小明|Brian Fanzo|live_strategy_plan/);
    expect(prompt).toContain("SERVER-OWNED SLOTS");
    expect(prompt).toContain(slots[0]!.slotId);
    expect(prompt).toContain("Do not add, remove, rename, or reorder slots");
    expect(prompt).toContain("BRAND WORD RULES");
  });

  it("leaves non-target planning text byte-for-byte unchanged", () => {
    const raw = "Agent: Internal Agent\noutputType: legacy_key";
    expect(redactIgStrategySynthesisContext("ig-hormozi-save-worthy", raw, { steps: PRIVATE_STEPS })).toBe(raw);
  });
});
