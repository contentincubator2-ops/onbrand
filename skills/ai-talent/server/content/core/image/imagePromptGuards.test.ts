import { describe, expect, it } from "vitest";
import { buildImageGuardBlock } from "./imagePromptGuards";

describe("buildImageGuardBlock", () => {
  const sharedBlocks = {
    productFaithfulBlock: "SHARED PRODUCT FIDELITY WITH CLOSED TEXT RULE",
    noMirrorBlock: "SHARED NO MIRROR RULE",
  };

  it("adds a high-salience competitor-logo guard for text-to-image generation", () => {
    const block = buildImageGuardBlock({ subjectMode: false, ...sharedBlocks });

    expect(block).toContain("BRAND SAFETY");
    expect(block).toContain("generic, unbranded, and plain");
    expect(block).toContain("real-world brand logos");
    expect(block).toContain("swooshes");
    expect(block).toContain("three-stripe motifs");
    expect(block).toContain("best-known brands");
    expect(block).toContain(sharedBlocks.noMirrorBlock);
    expect(block).not.toContain(sharedBlocks.productFaithfulBlock);
  });

  it("preserves the attached product's own marks without applying the blanket logo ban", () => {
    const block = buildImageGuardBlock({ subjectMode: true, ...sharedBlocks });

    expect(block).toContain(sharedBlocks.productFaithfulBlock);
    expect(block).toContain(sharedBlocks.noMirrorBlock);
    expect(block).not.toContain("BRAND SAFETY");
    expect(block).not.toContain("real-world brand logos");
    expect(block).not.toContain("generic, unbranded, and plain");
  });
});
