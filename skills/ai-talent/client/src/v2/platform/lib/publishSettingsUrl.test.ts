import { describe, expect, it } from "vitest";
import { publishSettingsUrl } from "./publishSettingsUrl";

describe("publishSettingsUrl", () => {
  it("includes the selected brand", () => {
    expect(publishSettingsUrl(42)).toBe("/brands/edit?b=42&cat=publish");
  });
  it.each([null, undefined, 0])("keeps the category without a brand (%s)", brandId => {
    expect(publishSettingsUrl(brandId)).toBe("/brands/edit?cat=publish");
  });
});
