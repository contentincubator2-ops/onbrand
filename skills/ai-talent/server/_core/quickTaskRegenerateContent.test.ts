import { describe, expect, it } from "vitest";
import {
  assertGenericRegenerationAllowed,
  preserveExistingVariantImage,
  selectRegenerationTarget,
  replaceRegeneratedContent,
} from "./quickTaskRegenerateContent";

const envelope = {
  schemaVersion: 2,
  contentModel: "ig-strategy-bundle",
  runId: "run-1",
  planningArtifacts: [
    { label: "Plan 0", caption: "private zero" },
    { label: "Plan 1", caption: "private one" },
  ],
  publicVariants: [
    { label: "Post 0", caption: "public zero" },
    { label: "Post 1", caption: "public one" },
  ],
};

describe("quickTask regenerate content", () => {
  it("fails closed before generic regeneration can rewrite a strategy bundle", () => {
    const selector = { variantIndex: 0 };
    const target = selectRegenerationTarget(envelope, selector);

    expect(() => assertGenericRegenerationAllowed(target, selector))
      .toThrow("目前不支援通用版本重生");
  });

  it("keeps the legacy variantIndex-only regeneration contract enabled", () => {
    const selector = { variantIndex: 0 };
    const target = selectRegenerationTarget([{ caption: "legacy" }], selector);

    expect(() => assertGenericRegenerationAllowed(target, selector)).not.toThrow();
  });

  it("rejects new selectors even when used with legacy content", () => {
    const selector = { variantIndex: 0, contentKind: "planning" as const, contentIndex: 0 };
    const target = selectRegenerationTarget([{ caption: "planning" }], selector);

    expect(() => assertGenericRegenerationAllowed(target, selector))
      .toThrow("目前不支援通用版本重生");
  });

  it("replaces a public item without flattening the IG strategy envelope", () => {
    const selector = { variantIndex: 0, contentKind: "public" as const, contentIndex: 1 };
    const target = selectRegenerationTarget(envelope, selector);
    const result = JSON.parse(replaceRegeneratedContent(envelope, selector, {
      label: target.item?.label,
      caption: "new public",
    }, target));

    expect(target).toMatchObject({ kind: "public", index: 1, isEnvelopeV2: true });
    expect(result).toEqual({
      ...envelope,
      publicVariants: [envelope.publicVariants[0], { label: "Post 1", caption: "new public" }],
    });
    expect(envelope.publicVariants[1].caption).toBe("public one");
  });

  it("replaces planning content without changing public variants", () => {
    const selector = { variantIndex: 99, contentKind: "planning" as const, contentIndex: 0 };
    const target = selectRegenerationTarget(envelope, selector);
    const result = JSON.parse(replaceRegeneratedContent(envelope, selector, {
      label: target.item?.label,
      caption: "new private",
    }, target));

    expect(result.planningArtifacts).toEqual([
      { label: "Plan 0", caption: "new private" },
      envelope.planningArtifacts[1],
    ]);
    expect(result.publicVariants).toEqual(envelope.publicVariants);
  });

  it("keeps omitted contentKind mapped to publicVariants by variantIndex", () => {
    const selector = { variantIndex: 1 };
    const target = selectRegenerationTarget(envelope, selector);
    const result = JSON.parse(replaceRegeneratedContent(envelope, selector, { caption: "new public" }, target));

    expect(target).toMatchObject({ kind: "public", index: 1 });
    expect(result.planningArtifacts).toEqual(envelope.planningArtifacts);
    expect(result.publicVariants).toEqual([envelope.publicVariants[0], { caption: "new public" }]);
  });

  it("keeps unrelated schemaVersion 2 and legacy wrapper runtime behaviour unchanged", () => {
    const unrelated = {
      schemaVersion: 2,
      contentModel: "another-feature",
      keep: true,
      variants: [{ caption: "zero" }, { caption: "one" }],
    };
    const before = JSON.stringify(unrelated);
    const selector = { variantIndex: 1 };
    const target = selectRegenerationTarget(unrelated, selector);
    const result = JSON.parse(replaceRegeneratedContent(unrelated, selector, { caption: "edited" }, target));

    expect(target).toMatchObject({ item: { caption: "one" }, kind: "public", index: 1, isEnvelopeV2: false });
    expect(result).toEqual([{ caption: "zero" }, { caption: "edited" }]);
    expect(JSON.stringify(unrelated)).toBe(before);
  });

  it("keeps legacy array variantIndex and sparse assignment semantics", () => {
    const legacy = [{ caption: "zero" }];
    const selector = { variantIndex: 2 };
    const target = selectRegenerationTarget(legacy, selector);
    const result = JSON.parse(replaceRegeneratedContent(legacy, selector, { caption: "two" }, target));

    expect(target.item).toBeUndefined();
    expect(result).toEqual([{ caption: "zero" }, null, { caption: "two" }]);
  });

  it("validates partial explicit selectors", () => {
    expect(() => selectRegenerationTarget(envelope, {
      variantIndex: 0,
      contentKind: "planning",
    })).toThrow("contentKind and contentIndex must be provided together");
  });

  it("keeps the current image and its model prompt when only copy is regenerated", () => {
    const current = {
      caption: "old caption",
      image: { style: "display direction", prompt: "actual visual brief", url: "https://example.com/image.png", status: "ready" },
      imagePrompt: "flat compatibility prompt",
    };
    const regenerated = {
      caption: "new caption",
      image: { style: "new direction", url: null, status: "skipped" },
    };

    expect(preserveExistingVariantImage(regenerated, current)).toEqual({
      caption: "new caption",
      image: current.image,
      imagePrompt: "flat compatibility prompt",
    });
  });
});
