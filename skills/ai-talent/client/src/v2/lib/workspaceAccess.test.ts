import { describe, it, expect } from "vitest";
import { workspaceModesFor, hasWorkspace, hasWorkspaceSwitcher } from "./workspaceAccess";

describe("workspaceAccess", () => {
  it("gives the internal preview account all four workspaces", () => {
    expect(workspaceModesFor("sowork@sowork.tw")).toEqual(["market", "strategy", "content", "performance"]);
  });

  it("gives 媽爹講故事 exactly 策略 + 內容", () => {
    expect(workspaceModesFor("marketing@momdadstory.com")).toEqual(["strategy", "content"]);
  });

  it("keeps 市場 / 成效 closed for 媽爹講故事 — those pages have their own gate", () => {
    expect(hasWorkspace("marketing@momdadstory.com", "market")).toBe(false);
    expect(hasWorkspace("marketing@momdadstory.com", "performance")).toBe(false);
    expect(hasWorkspace("marketing@momdadstory.com", "strategy")).toBe(true);
  });

  it("leaves every other account on the single legacy rail", () => {
    expect(workspaceModesFor("someone@example.com")).toEqual([]);
    expect(hasWorkspaceSwitcher("someone@example.com")).toBe(false);
    // …which is also what keeps 品牌大腦 in their nav
    expect(hasWorkspace("someone@example.com", "strategy")).toBe(false);
  });

  it("is case- and whitespace-insensitive (login emails arrive in either case)", () => {
    expect(hasWorkspaceSwitcher("  Marketing@MomDadStory.com ")).toBe(true);
  });

  it("treats a missing email as no access rather than throwing", () => {
    expect(workspaceModesFor(null)).toEqual([]);
    expect(workspaceModesFor(undefined)).toEqual([]);
    expect(hasWorkspaceSwitcher("")).toBe(false);
  });

  it("shows the switcher only when there is more than one workspace to switch to", () => {
    expect(hasWorkspaceSwitcher("sowork@sowork.tw")).toBe(true);
    expect(hasWorkspaceSwitcher("marketing@momdadstory.com")).toBe(true);
  });
});
