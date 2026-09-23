/**
 * 這支鎖住一件會真的出事的事：**哪些欄位不能進貼文**。
 *
 * 核心競爭優勢是競品比較（政策包會拿掉）、產品藍圖是未公開功能（緘默期在擋）、
 * ROI 天然帶數字（數字只能來自有出處的白名單）、智財保障是合約承諾。
 * 這四個欄位如果哪天被誰改成 postSafe，業務的貼文就會開始講競品跟未公開功能，
 * 而且不會有任何測試以外的東西攔得住。
 */
import { describe, expect, it } from "vitest";
import {
  POST_SAFE_KEYS,
  PROFILE_FIELDS,
  PROFILE_KEYS,
  normaliseProfile,
  postSafeProfileLines,
  profileField,
  profileToText,
} from "./solutionProfile";

describe("post safety", () => {
  it("keeps competitor comparison, roadmap, ROI and indemnity out of posts", () => {
    for (const key of ["usp", "roadmap", "roi", "ipIndemnity"]) {
      expect(profileField(key)?.postSafe, `${key} must stay internal`).toBe(false);
    }
  });

  it("makes every internal-only field say why", () => {
    // 只標一個鎖頭不說理由，下一個人會以為是誰忘了開權限。
    for (const f of PROFILE_FIELDS.filter((x) => !x.postSafe)) {
      expect(f.whyNotPostSafe?.[0], `${f.key} needs an English reason`).toBeTruthy();
      expect(f.whyNotPostSafe?.[1], `${f.key} needs a Chinese reason`).toBeTruthy();
    }
  });

  it("only hands post-safe fields to the writer", () => {
    const profile = {
      specs: { en: "10 Gbps", zh: "10 Gbps" },
      usp: { en: "Beats Competitor X on power draw", zh: "功耗贏過競品 X" },
      roadmap: { en: "v3 ships in Q1", zh: "v3 第一季推出" },
      roi: { en: "Saves NT$2m a year", zh: "一年省兩百萬" },
      ipIndemnity: { en: "We indemnify the customer", zh: "我們提供客戶保障" },
    };
    const lines = postSafeProfileLines(profile, false).join("\n");
    expect(lines).toContain("10 Gbps");
    for (const leak of ["Competitor X", "v3 ships", "NT$2m", "indemnify"]) {
      expect(lines, `"${leak}" must not reach the prompt`).not.toContain(leak);
    }
  });

  it("returns nothing when the profile is empty", () => {
    expect(postSafeProfileLines({}, true)).toEqual([]);
  });
});

describe("normaliseProfile", () => {
  it("drops keys that aren't real fields", () => {
    const p = normaliseProfile({ specs: { en: "a", zh: "甲" }, evil: { en: "x", zh: "x" } });
    expect(Object.keys(p)).toEqual(["specs"]);
  });

  it("drops an entry with no text in either language", () => {
    expect(normaliseProfile({ specs: { en: "  ", zh: "" } })).toEqual({});
  });

  it("keeps one language when the other is blank", () => {
    expect(normaliseProfile({ specs: { en: "a", zh: "" } })).toEqual({ specs: { en: "a", zh: "" } });
  });

  it("only keeps a source tag it recognises", () => {
    expect(normaliseProfile({ specs: { en: "a", zh: "甲", source: "demo" } }).specs?.source).toBe("demo");
    expect(normaliseProfile({ specs: { en: "a", zh: "甲", source: "made-up" } }).specs?.source).toBeUndefined();
  });

  it("survives junk instead of throwing", () => {
    for (const junk of [null, undefined, "string", 42, [], { specs: "not an object" }]) {
      expect(() => normaliseProfile(junk)).not.toThrow();
    }
  });
});

describe("profileToText", () => {
  it("renders one line per filled field, in field order", () => {
    const text = profileToText({ useCases: { en: "b", zh: "乙" }, specs: { en: "a", zh: "甲" } });
    expect(text.split("\n")[0]).toContain("specs:");
    expect(text.split("\n")[1]).toContain("useCases:");
  });
});

describe("the field list itself", () => {
  it("covers all four groups CJ asked for", () => {
    expect(new Set(PROFILE_FIELDS.map((f) => f.group))).toEqual(
      new Set(["technical", "value", "commercial", "compliance"]),
    );
  });

  it("has no duplicate keys", () => {
    expect(new Set(PROFILE_KEYS).size).toBe(PROFILE_KEYS.length);
  });

  it("agrees with POST_SAFE_KEYS", () => {
    expect(POST_SAFE_KEYS).toEqual(PROFILE_FIELDS.filter((f) => f.postSafe).map((f) => f.key));
  });
});
