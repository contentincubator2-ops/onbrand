import { describe, expect, it } from "vitest";
import {
  getIgPublicVariantMockup,
  getIgPublicVariantImageSize,
  getStrategySelectionMockup,
  getCalendarPublishPayload,
  getPlanningPublishWarning,
  getPlanningConfirmationPayload,
  getStrategyPublicGenerationState,
  getStrategyPublicTabLabel,
  getStrategyRemainingGenerationState,
  getRunContentMutationLocator,
  getRunContentSelectionKey,
  isEmptyStrategyPublicSelection,
  isIgStrategyDeliverableTarget,
  isPlanningArtifactMissingOutput,
  isStrategyPlanningSelection,
  resolveRunContent,
  shouldHideStrategyPlanningTabs,
  shouldApplyMutationPreview,
} from "./strategyContentEnvelope";

const TARGETS = [
  "ig-99-youtility",
  "ig-99-visual-story",
  "ig-99-live-first",
  "ig-99-document",
  "ig-99-radical-transparency",
] as const;

describe("strategy content envelope", () => {
  it.each(TARGETS)("recognizes the public envelope for %s", (taskId) => {
    const planningArtifacts = [{ label: "策略 1", caption: "analysis" }];
    const publicVariants = [{ label: "貼文 1", caption: "publish me", format: "feed" }];
    expect(resolveRunContent({
      schemaVersion: 2,
      contentModel: "ig-strategy-bundle",
      planningArtifacts,
      publicVariants,
    }, taskId)).toEqual({
      isStrategyEnvelope: true,
      planningArtifacts,
      publicVariants,
      legacyVariants: [],
    });
  });

  it("keeps non-target legacy selection strict and unchanged", () => {
    const legacy = [{ label: "original", caption: "unchanged" }];
    const resolvedArray = resolveRunContent(legacy, "ig-99-save-worthy");
    expect(resolvedArray.isStrategyEnvelope).toBe(false);
    expect(resolvedArray.legacyVariants).toBe(legacy);

    const wrapped = { variants: legacy, planningArtifacts: [{ caption: "ignore" }], publicVariants: [] };
    const resolvedWrapped = resolveRunContent(wrapped, "fb-99-quarterly-strategy");
    expect(resolvedWrapped.isStrategyEnvelope).toBe(false);
    expect(resolvedWrapped.legacyVariants).toBe(legacy);
  });

  it("does not opt a target into envelope mode unless both arrays exist", () => {
    expect(resolveRunContent({ publicVariants: [] }, "ig-99-youtility").isStrategyEnvelope).toBe(false);
    expect(resolveRunContent({
      schemaVersion: 2,
      contentModel: "another-model",
      planningArtifacts: [],
      publicVariants: [],
    }, "ig-99-youtility").isStrategyEnvelope).toBe(false);
    expect(resolveRunContent([{ caption: "legacy" }], "ig-99-youtility").isStrategyEnvelope).toBe(false);
  });

  it("treats PR #56 target arrays as planning-only when the legacy report flag is present", () => {
    const legacyPlanning = [{ label: "策略章節", caption: "planning" }];
    expect(resolveRunContent(legacyPlanning, "ig-99-youtility", { presentation: "strategy-report" })).toEqual({
      isStrategyEnvelope: true,
      planningArtifacts: legacyPlanning,
      publicVariants: [],
      legacyVariants: [],
    });
    expect(resolveRunContent(legacyPlanning, "ig-99-youtility", {}).isStrategyEnvelope).toBe(false);
    expect(resolveRunContent(legacyPlanning, "ig-99-save-worthy", { presentation: "strategy-report" }).isStrategyEnvelope).toBe(false);
  });

  it("supports public ids, squad slugs, and the legacy 100s alias only for the five targets", () => {
    expect(isIgStrategyDeliverableTarget("ig-baer-youtility")).toBe(true);
    expect(isIgStrategyDeliverableTarget("ig-100-youtility")).toBe(true);
    expect(isIgStrategyDeliverableTarget("ig-monthly-calendar-pulizzi")).toBe(false);
    expect(isIgStrategyDeliverableTarget("unknown")).toBe(false);
  });

  it("hides planning tabs only behind both the target-id and strategy-envelope gates", () => {
    expect(shouldHideStrategyPlanningTabs("ig-99-youtility", true)).toBe(true);
    expect(shouldHideStrategyPlanningTabs("ig-99-youtility", false)).toBe(false);
    expect(shouldHideStrategyPlanningTabs("fb-60-single-full", true)).toBe(false);
  });

  it("uses day-order labels only for fixed daily feed campaigns", () => {
    const daily = { taskId: "ig-99-youtility", isStrategyEnvelope: true, format: "feed" };
    expect(getStrategyPublicTabLabel({ ...daily, index: 0, language: "zh" })).toBe("第一天");
    expect(getStrategyPublicTabLabel({ ...daily, index: 29, language: "zh" })).toBe("第三十天");
    expect(getStrategyPublicTabLabel({ ...daily, index: 2, language: "en" })).toBe("Day 3");
    expect(getStrategyPublicTabLabel({
      taskId: "ig-99-live-first",
      isStrategyEnvelope: true,
      format: "live",
      index: 0,
      fallbackLabel: "直播場次 1",
      language: "zh",
    })).toBe("直播場次 1");
    expect(getStrategyPublicTabLabel({ ...daily, isStrategyEnvelope: false, index: 0, fallbackLabel: "原標籤", language: "zh" }))
      .toBe("原標籤");
  });

  it.each(["feed", "carousel", "reel", "story", "live"] as const)("restores the Instagram %s mockup for a public variant", (format) => {
    expect(getIgPublicVariantMockup("publicVariants", format)).toEqual({
      platform: "instagram",
      format,
      label: `instagram:${format}`,
    });
    expect(getIgPublicVariantMockup("planningArtifacts", format)).toBeNull();
    expect(getIgPublicVariantMockup("legacy", format)).toBeNull();
  });

  it("renders only strategy-envelope planning tabs as internal research documents", () => {
    expect(getStrategySelectionMockup(true, "planningArtifacts", "feed")).toEqual({
      platform: "generic",
      format: "research-doc",
      label: "generic:research-doc",
    });
    expect(getStrategySelectionMockup(false, "planningArtifacts", "feed")).toBeNull();
    expect(getStrategySelectionMockup(false, "legacy", "feed")).toBeNull();
  });

  it.each(["feed", "carousel", "reel", "story", "live"] as const)("keeps the strategy public %s mockup unchanged", (format) => {
    expect(getStrategySelectionMockup(true, "publicVariants", format))
      .toEqual(getIgPublicVariantMockup("publicVariants", format));
  });

  it("marks only empty or failed strategy planning steps as missing output", () => {
    expect(isStrategyPlanningSelection(true, "planningArtifacts")).toBe(true);
    expect(isStrategyPlanningSelection(true, "publicVariants")).toBe(false);
    expect(isStrategyPlanningSelection(false, "planningArtifacts")).toBe(false);

    expect(isPlanningArtifactMissingOutput(true, "planningArtifacts", "", "failed")).toBe(true);
    expect(isPlanningArtifactMissingOutput(true, "planningArtifacts", "  ", "skipped")).toBe(true);
    expect(isPlanningArtifactMissingOutput(true, "planningArtifacts", "完成的策略", "failed")).toBe(true);
    expect(isPlanningArtifactMissingOutput(true, "planningArtifacts", "完成的策略", "skipped")).toBe(false);
    expect(isPlanningArtifactMissingOutput(true, "publicVariants", "", "failed")).toBe(false);
    expect(isPlanningArtifactMissingOutput(false, "planningArtifacts", "", "failed")).toBe(false);
  });

  it.each([
    ["feed", "1024x1024"],
    ["carousel", "1024x1024"],
    ["reel", "1024x1536"],
    ["story", "1024x1536"],
    ["live", "1024x1536"],
  ] as const)("keeps the Instagram %s image aspect aligned with its mockup", (format, size) => {
    expect(getIgPublicVariantImageSize("publicVariants", format)).toBe(size);
    expect(getIgPublicVariantImageSize("planningArtifacts", format)).toBeUndefined();
    expect(getIgPublicVariantImageSize("legacy", format)).toBeUndefined();
  });

  it("adds contentKind only for envelope mutation requests", () => {
    expect(getRunContentMutationLocator("legacy", 2)).toEqual({ variantIndex: 2 });
    expect(getRunContentMutationLocator("planningArtifacts", 1)).toEqual({ contentKind: "planning", contentIndex: 1 });
    expect(getRunContentMutationLocator("publicVariants", 3)).toEqual({ contentKind: "public", contentIndex: 3 });
  });

  it("keeps asynchronous previews bound to the selection that started them", () => {
    const planning = getRunContentMutationLocator("planningArtifacts", 1);
    expect(shouldApplyMutationPreview(
      getRunContentSelectionKey("planningArtifacts", 1),
      planning,
    )).toBe(true);
    expect(shouldApplyMutationPreview(
      getRunContentSelectionKey("publicVariants", 1),
      planning,
    )).toBe(false);
  });

  it("gates content tools when a legacy target has no public posts", () => {
    expect(isEmptyStrategyPublicSelection(true, "publicVariants", 0)).toBe(true);
    expect(isEmptyStrategyPublicSelection(true, "planningArtifacts", 0)).toBe(false);
    expect(isEmptyStrategyPublicSelection(false, "publicVariants", 0)).toBe(false);
    expect(isEmptyStrategyPublicSelection(true, "publicVariants", 1)).toBe(false);
  });

  it("distinguishes background public synthesis from a settled empty strategy run", () => {
    const base = {
      taskId: "ig-99-youtility",
      isStrategyEnvelope: true,
      publicVariantCount: 0,
    };
    expect(getStrategyPublicGenerationState({ ...base, progress: "caption_ready" })).toBe("generating");
    expect(getStrategyPublicGenerationState({ ...base, progress: "failed" })).toBe("missing");
    expect(getStrategyPublicGenerationState({ ...base, progress: "done" })).toBe("missing");
    expect(getStrategyPublicGenerationState({ ...base, progress: "done", publicVariantCount: 30 })).toBeNull();
  });

  it("never changes caption_ready meaning for 60s or non-strategy runs", () => {
    expect(getStrategyPublicGenerationState({
      taskId: "fb-60-single-full",
      isStrategyEnvelope: false,
      progress: "caption_ready",
      publicVariantCount: 0,
    })).toBeNull();
    expect(getStrategyPublicGenerationState({
      taskId: "ig-99-youtility",
      isStrategyEnvelope: false,
      progress: "caption_ready",
      publicVariantCount: 0,
    })).toBeNull();
  });

  it("offers remaining generation only for incomplete strategy bundles", () => {
    const base = {
      taskId: "ig-99-youtility",
      isStrategyEnvelope: true,
      publicVariantCount: 3,
      publicSlotCount: 30,
    };
    expect(getStrategyRemainingGenerationState({ ...base, progress: "done" })).toBe("ready");
    expect(getStrategyRemainingGenerationState({ ...base, progress: "caption_ready" })).toBe("generating");
    expect(getStrategyRemainingGenerationState({ ...base, publicVariantCount: 30, progress: "done" })).toBeNull();
    expect(getStrategyRemainingGenerationState({
      taskId: "fb-60-single-full",
      isStrategyEnvelope: false,
      publicVariantCount: 1,
      publicSlotCount: 3,
      progress: "caption_ready",
    })).toBeNull();
  });

  it("sends planning confirmation only after the Calendar warning is accepted", () => {
    expect(getCalendarPublishPayload(42, "planning"))
      .toEqual({ id: 42, confirmPlanningContent: true });
    expect(getCalendarPublishPayload(42, "public")).toEqual({ id: 42 });
    expect(getCalendarPublishPayload(42, null)).toEqual({ id: 42 });
  });

  it("warns only when scheduling or publishing a planning artifact", () => {
    expect(getPlanningPublishWarning("planningArtifacts", "schedule", "zh"))
      .toBe("這是內部策略內容，可能包含方法論或企劃說明。確定要直接對外排程嗎？");
    expect(getPlanningPublishWarning("planningArtifacts", "publish", "en")).toContain("internal strategy content");
    expect(getPlanningPublishWarning("publicVariants", "publish", "zh")).toBeNull();
    expect(getPlanningPublishWarning("legacy", "schedule", "en")).toBeNull();
    expect(getPlanningConfirmationPayload("planningArtifacts")).toEqual({ confirmPlanningContent: true });
    expect(getPlanningConfirmationPayload("publicVariants")).toEqual({});
    expect(getPlanningConfirmationPayload("legacy")).toEqual({});
  });
});
