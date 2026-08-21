import { describe, it, expect } from "vitest";
import {
  parsePersonas,
  matchPersonaForTask,
  composePersonaPrompt,
  type BrandPersona,
} from "./brandPersonas";

const mk = (over: Partial<BrandPersona>): BrandPersona => ({
  id: "p1", name: "阿母", title: "睡前故事主筆", persona: "我是阿母。",
  scope: { taskIds: [], platforms: [] }, enabled: true,
  createdAt: "", updatedAt: "", ...over,
});

describe("parsePersonas", () => {
  it("returns [] for anything that isn't an array of personas", () => {
    expect(parsePersonas(null)).toEqual([]);
    expect(parsePersonas({})).toEqual([]);
    expect(parsePersonas({ _personas: "nope" })).toEqual([]);
  });

  it("skips entries with no id or no name instead of throwing", () => {
    const out = parsePersonas({
      _personas: [
        { id: "", name: "無 id" },
        { id: "p2", name: "" },
        { id: "p3", name: "阿母" },
      ],
    });
    expect(out.map((p) => p.id)).toEqual(["p3"]);
  });

  it("defaults enabled to true and coerces a missing scope", () => {
    const [p] = parsePersonas({ _personas: [{ id: "p1", name: "阿母" }] });
    expect(p!.enabled).toBe(true);
    expect(p!.scope).toEqual({ taskIds: [], platforms: [] });
  });

  it("treats enabled:false as disabled", () => {
    const [p] = parsePersonas({ _personas: [{ id: "p1", name: "阿母", enabled: false }] });
    expect(p!.enabled).toBe(false);
  });
});

describe("matchPersonaForTask", () => {
  it("matches a task listed explicitly", () => {
    const p = mk({ scope: { taskIds: ["fb-30-caption-short"], platforms: [] } });
    expect(matchPersonaForTask([p], "fb-30-caption-short", "facebook")?.id).toBe("p1");
  });

  it("matches every task of a whole platform", () => {
    const p = mk({ scope: { taskIds: [], platforms: ["instagram"] } });
    expect(matchPersonaForTask([p], "ig-30-reel-hook", "instagram")?.id).toBe("p1");
  });

  it("does not match a task outside the scope", () => {
    const p = mk({ scope: { taskIds: ["fb-30-caption-short"], platforms: ["instagram"] } });
    expect(matchPersonaForTask([p], "yt-30-title", "youtube")).toBeNull();
  });

  it("lets an explicit task id beat another persona's whole-platform claim", () => {
    const platformWide = mk({ id: "wide", name: "全平台", scope: { taskIds: [], platforms: ["facebook"] } });
    const pinned = mk({ id: "pinned", name: "指定", scope: { taskIds: ["fb-30-ad-headline"], platforms: [] } });
    // order deliberately puts the platform-wide persona first — precision still wins
    expect(matchPersonaForTask([platformWide, pinned], "fb-30-ad-headline", "facebook")?.id).toBe("pinned");
    // …and the platform-wide one still covers everything else on that platform
    expect(matchPersonaForTask([platformWide, pinned], "fb-30-story-text", "facebook")?.id).toBe("wide");
  });

  it("breaks a same-level tie by list order", () => {
    const a = mk({ id: "a", scope: { taskIds: ["fb-30-caption-short"], platforms: [] } });
    const b = mk({ id: "b", scope: { taskIds: ["fb-30-caption-short"], platforms: [] } });
    expect(matchPersonaForTask([a, b], "fb-30-caption-short", "facebook")?.id).toBe("a");
  });

  it("ignores disabled personas and empty persona text", () => {
    const off = mk({ id: "off", enabled: false, scope: { taskIds: ["fb-30-caption-short"], platforms: [] } });
    const blank = mk({ id: "blank", persona: "   ", scope: { taskIds: ["fb-30-caption-short"], platforms: [] } });
    expect(matchPersonaForTask([off, blank], "fb-30-caption-short", "facebook")).toBeNull();
  });

  it("returns null when the brand has no personas at all", () => {
    expect(matchPersonaForTask([], "fb-30-caption-short", "facebook")).toBeNull();
  });
});

describe("composePersonaPrompt", () => {
  it("puts the custom identity first and demotes the assigned agent to craft", () => {
    const out = composePersonaPrompt(mk({}), "你是 林曉青，感性故事文案。經歷：…");
    expect(out.indexOf("阿母")).toBeLessThan(out.indexOf("林曉青"));
    expect(out).toContain("最高優先");
  });

  it("works when the assigned agent has no persona text", () => {
    const out = composePersonaPrompt(mk({}), "");
    expect(out).toContain("阿母");
    expect(out).not.toContain("最高優先");
  });
});
