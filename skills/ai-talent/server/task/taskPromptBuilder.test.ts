import { describe, it, expect } from "vitest";
import { formatAgentSkills } from "./taskPromptBuilder";

describe("formatAgentSkills", () => {
  it("formats skills as numbered list", () => {
    const result = formatAgentSkills(["SEO", "Content Strategy", "Data Analysis"]);
    expect(result).toContain("1. SEO");
    expect(result).toContain("2. Content Strategy");
    expect(result).toContain("3. Data Analysis");
  });
  it("returns empty string for empty array", () => {
    expect(formatAgentSkills([])).toBe("");
  });
});
