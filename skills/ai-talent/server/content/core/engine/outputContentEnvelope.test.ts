import { describe, expect, it } from "vitest";
import {
  outputItemCaption,
  requirePlanningConfirmation,
  resolveOutputContent,
  resolveStoredContentSelector,
  updateOutputContent,
} from "./outputContentEnvelope";

const v2 = {
  schemaVersion: 2,
  contentModel: "ig-strategy-bundle",
  planningArtifacts: [{ label: "Plan A", caption: "private plan" }],
  publicVariants: [
    { label: "Post A", caption: "public zero" },
    { label: "Post B", caption: "public one" },
  ],
};

describe("output content envelope", () => {
  it("infers pre-envelope target schedules as planning-only", () => {
    expect(resolveStoredContentSelector({
      variantIndex: 2,
      outputMetadata: JSON.stringify({
        taskId: "ig-99-youtility",
        presentation: "strategy-report",
      }),
    })).toEqual({ variantIndex: 2, contentKind: "planning", contentIndex: 2 });

    expect(resolveStoredContentSelector({
      variantIndex: 1,
      outputMetadata: { presentation: "strategy-report" },
      missionSquadSlug: "ig-garyvee-document",
    })).toEqual({ variantIndex: 1, contentKind: "planning", contentIndex: 1 });
  });

  it("does not reclassify unrelated legacy schedules or explicit public rows", () => {
    expect(resolveStoredContentSelector({
      variantIndex: 3,
      outputMetadata: { taskId: "ig-monthly-calendar-pulizzi", presentation: "strategy-report" },
    })).toEqual({ variantIndex: 3 });

    expect(resolveStoredContentSelector({
      variantIndex: 0,
      contentKind: "public",
      contentIndex: 4,
      outputMetadata: { taskId: "ig-99-youtility", presentation: "strategy-report" },
    })).toEqual({ variantIndex: 0, contentKind: "public", contentIndex: 4 });
  });

  it("keeps legacy variantIndex semantics unchanged", () => {
    const legacy = [{ caption: "zero" }, { caption: "one" }];
    const selected = resolveOutputContent(JSON.stringify(legacy), { variantIndex: 1 });
    expect(outputItemCaption(selected.item)).toBe("one");
    expect(selected.kind).toBe("public");
    expect(selected.storageKind).toBeNull();
  });

  it("allows an explicitly classified legacy report item as planning", () => {
    const legacy = [{ caption: "internal zero" }, { caption: "internal one" }];
    const selected = resolveOutputContent(legacy, {
      variantIndex: 0,
      contentKind: "planning",
      contentIndex: 1,
    });
    expect(outputItemCaption(selected.item)).toBe("internal one");
    expect(selected).toMatchObject({
      kind: "planning",
      index: 1,
      isEnvelopeV2: false,
      storageKind: "planning",
      storageIndex: 1,
    });
    expect(() => requirePlanningConfirmation(selected, undefined, "publish")).toThrow("請先確認警告");
    expect(() => requirePlanningConfirmation(selected, true, "publish")).not.toThrow();
  });

  it("does not route unrelated schemaVersion 2 content into the IG envelope", () => {
    const unrelated = {
      schemaVersion: 2,
      contentModel: "another-feature",
      planningArtifacts: [{ caption: "not our planning contract" }],
      publicVariants: [{ caption: "not our public contract" }],
      variants: [{ caption: "legacy zero" }, { caption: "legacy one" }],
    };
    const before = JSON.stringify(unrelated);
    const selected = resolveOutputContent(unrelated, { variantIndex: 1 });
    expect(outputItemCaption(selected.item)).toBe("legacy one");
    expect(selected.isEnvelopeV2).toBe(false);
    expect(JSON.stringify(unrelated)).toBe(before);

    const updated = JSON.parse(updateOutputContent(unrelated, { variantIndex: 1 }, (item) => ({
      ...item,
      caption: "legacy edited",
    })).content);
    expect(updated).toEqual({
      ...unrelated,
      variants: [{ caption: "legacy zero" }, { caption: "legacy edited" }],
    });
    expect(unrelated.variants[1].caption).toBe("legacy one");
  });

  it("maps legacy variantIndex to publicVariants for v2 clients", () => {
    const selected = resolveOutputContent(JSON.stringify(v2), { variantIndex: 1 });
    expect(selected).toMatchObject({ kind: "public", index: 1, storageKind: "public", storageIndex: 1 });
    expect(outputItemCaption(selected.item)).toBe("public one");
  });

  it("keeps planning and public indices independent", () => {
    const selected = resolveOutputContent(v2, {
      variantIndex: 99,
      contentKind: "planning",
      contentIndex: 0,
    });
    expect(outputItemCaption(selected.item)).toBe("private plan");
  });

  it("rejects partial selectors and out-of-range indices", () => {
    expect(() => resolveOutputContent(v2, { variantIndex: 0, contentKind: "public" }))
      .toThrow("contentKind and contentIndex must be provided together");
    expect(() => resolveOutputContent(v2, { variantIndex: 0, contentKind: "planning", contentIndex: 1 }))
      .toThrow("planning content index out of range");
  });

  it("requires an explicit warning confirmation for planning schedule/publish", () => {
    const selected = resolveOutputContent(v2, {
      variantIndex: 0,
      contentKind: "planning",
      contentIndex: 0,
    });
    expect(() => requirePlanningConfirmation(selected, false, "schedule")).toThrow("請先確認警告");
    expect(() => requirePlanningConfirmation(selected, undefined, "publish")).toThrow("請先確認警告");
    expect(() => requirePlanningConfirmation(selected, true, "publish")).not.toThrow();
  });

  it("updates only the selected v2 collection", () => {
    const updated = updateOutputContent(v2, {
      variantIndex: 0,
      contentKind: "planning",
      contentIndex: 0,
    }, (item) => ({ ...item, caption: "edited plan" }));
    const parsed = JSON.parse(updated.content);
    expect(parsed.planningArtifacts[0].caption).toBe("edited plan");
    expect(parsed.publicVariants).toEqual(v2.publicVariants);
  });

  it("omitting contentKind updates only publicVariants at the legacy variantIndex", () => {
    const updated = updateOutputContent(v2, { variantIndex: 1 }, (item) => ({ ...item, caption: "edited public" }));
    const parsed = JSON.parse(updated.content);
    expect(parsed.planningArtifacts).toEqual(v2.planningArtifacts);
    expect(parsed.publicVariants).toEqual([
      v2.publicVariants[0],
      { ...v2.publicVariants[1], caption: "edited public" },
    ]);
  });

  it("preserves legacy object variants when editing", () => {
    const legacy = { note: "keep", variants: [{ caption: "zero" }, { caption: "one" }] };
    const updated = updateOutputContent(legacy, { variantIndex: 1 }, (item) => ({ ...item, caption: "edited" }));
    expect(JSON.parse(updated.content)).toEqual({
      note: "keep",
      variants: [{ caption: "zero" }, { caption: "edited" }],
    });
  });
});
