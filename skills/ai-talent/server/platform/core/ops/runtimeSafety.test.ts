import { afterEach, describe, expect, it } from "vitest";
import { isRuntimeFeatureEnabled } from "./runtimeSafety";

const FEATURE = "BACKGROUND_WORKERS_ENABLED" as const;
const originalValue = process.env[FEATURE];

afterEach(() => {
  if (originalValue == null) delete process.env[FEATURE];
  else process.env[FEATURE] = originalValue;
});

describe("isRuntimeFeatureEnabled", () => {
  it("preserves production behaviour when the switch is absent", () => {
    delete process.env[FEATURE];
    expect(isRuntimeFeatureEnabled(FEATURE)).toBe(true);
  });

  it.each(["false", "FALSE", "0", "off", "no"])(
    "fails closed for %s",
    (value) => {
      process.env[FEATURE] = value;
      expect(isRuntimeFeatureEnabled(FEATURE)).toBe(false);
    },
  );

  it("accepts an explicit true value", () => {
    process.env[FEATURE] = "true";
    expect(isRuntimeFeatureEnabled(FEATURE)).toBe(true);
  });
});
