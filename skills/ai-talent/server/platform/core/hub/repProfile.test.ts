import { describe, expect, it } from "vitest";
import {
  BIND_CODE_RE,
  DEMO_REP_PROFILES,
  lineBindUrl,
  normaliseRepProfile,
  personaPromptLines,
  profileCompleteness,
} from "./repProfile";

const rep = { name: "Priya Patel", title: "Solutions Sales Lead", team: "North America · Partners" };

describe("normaliseRepProfile", () => {
  it("fills every field from null, a bad JSON string, or a partial row", () => {
    for (const raw of [null, "not json", { headline: "Hi" }]) {
      const p = normaliseRepProfile(raw);
      expect(p.voice.traits).toEqual([]);
      expect(p.experience).toEqual([]);
      expect(p.yearsExperience).toBeNull();
    }
    expect(normaliseRepProfile('{"headline":"From a string"}').headline).toBe("From a string");
  });

  it("clips lengths, drops empty list items and experience rows with no role or company", () => {
    const p = normaliseRepProfile({
      headline: "x".repeat(500),
      expertise: ["  AI  ", "", 42],
      experience: [{ role: "", company: "" }, { role: "AE", company: "Acme", period: "2020", highlight: "" }],
      yearsExperience: "7",
    });
    expect(p.headline).toHaveLength(160);
    expect(p.expertise).toEqual(["AI"]);
    expect(p.experience).toEqual([{ role: "AE", company: "Acme", period: "2020", highlight: "" }]);
    expect(p.yearsExperience).toBe(7);
  });

  it("rejects nonsense years instead of storing them", () => {
    expect(normaliseRepProfile({ yearsExperience: -3 }).yearsExperience).toBeNull();
    expect(normaliseRepProfile({ yearsExperience: 400 }).yearsExperience).toBeNull();
  });
});

describe("profileCompleteness", () => {
  it("is 0 for an empty profile and 100 for a full demo profile", () => {
    expect(profileCompleteness(normaliseRepProfile(null))).toBe(0);
    expect(profileCompleteness(DEMO_REP_PROFILES.priya)).toBe(100);
  });

  it("keeps the deliberately thin demo rep visibly incomplete", () => {
    expect(profileCompleteness(DEMO_REP_PROFILES.hank)).toBeLessThan(40);
  });
});

describe("personaPromptLines", () => {
  it("is only the name line when nothing is filled — no empty labels, no voice rule", () => {
    expect(personaPromptLines(rep, normaliseRepProfile(null), false)).toEqual([
      "Priya Patel, Solutions Sales Lead (North America · Partners)",
    ]);
  });

  it("carries voice and stories, and states that company rules win", () => {
    const text = personaPromptLines(rep, DEMO_REP_PROFILES.priya, false).join("\n");
    expect(text).toContain("Voice: Curious, upbeat and evidence-minded");
    expect(text).toContain("bakery owner");
    expect(text).toMatch(/company rules above .* always override personal style/i);
    expect(text).toMatch(/never quote or invent numbers/i);
  });

  it("writes the labels in Chinese for the TW pack", () => {
    const text = personaPromptLines(rep, DEMO_REP_PROFILES.amy, true).join("\n");
    expect(text).toContain("語氣:");
    expect(text).toContain("公司規則");
  });
});

describe("demo seed", () => {
  it("has no digits in any story (statistics must come from approved facts)", () => {
    for (const [seed, p] of Object.entries(DEMO_REP_PROFILES)) {
      for (const s of p.stories) expect(s, `${seed}: ${s}`).not.toMatch(/\d/);
    }
  });

  it("survives its own normaliser unchanged", () => {
    for (const p of Object.values(DEMO_REP_PROFILES)) expect(normaliseRepProfile(p)).toEqual(p);
  });
});

describe("access link", () => {
  it("accepts only the 6-hex bind codes the bot accepts", () => {
    expect(BIND_CODE_RE.test("A1B2C3")).toBe(true);
    expect(BIND_CODE_RE.test("a1b2c3")).toBe(false);
    expect(BIND_CODE_RE.test("A1B2C")).toBe(false);
    expect(BIND_CODE_RE.test("ZZZZZZ")).toBe(false);
  });

  it("opens the LINE chat with the code pre-typed", () => {
    expect(lineBindUrl("@123abcd", "A1B2C3")).toBe("https://line.me/R/oaMessage/@123abcd/?A1B2C3");
  });
});
