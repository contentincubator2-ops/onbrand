import { describe, expect, it } from "vitest";
import {
  buildReport,
  findIssues,
  findPercentMentions,
  findPriceMentions,
  repairPost,
  type ComplianceContext,
} from "./complianceContract";
import { packFor } from "./policyPacks";

const LINK = "https://experthub.onbrand.sowork.ai/r/ab12cd";

const twCtx: ComplianceContext = {
  pack: packFor("TW"),
  approvedAmounts: [1065, 925, 100, 1000, 1600, 5500, 100_000],
  approvedPercents: [
    { value: 7.4, anchors: ["中小企業", "SMB"] },
    { value: 63.9, anchors: ["需求", "use case"] },
    { value: 80, anchors: ["就業", "workforce"] },
  ],
  trackedLink: LINK,
};
const usCtx: ComplianceContext = { ...twCtx, pack: packFor("US") };

describe("price detection", () => {
  it("reads currency-marked amounts, including 萬", () => {
    const amounts = findPriceMentions("筆電每月 NT$1,065 起，補助最高新台幣 10 萬元，另一方案 999 元").map((p) => p.amount);
    expect(amounts).toEqual(expect.arrayContaining([1065, 100_000, 999]));
  });
  it("ignores bare counts that are not prices", () => {
    expect(findPriceMentions("台灣有 171.5 萬家中小企業")).toEqual([]);
  });
  it("reads percentages in both scripts", () => {
    expect(findPercentMentions("約 7.4% 的企業，百分之 20 的人").map((p) => p.value)).toEqual([7.4, 20]);
  });
});

describe("findIssues", () => {
  it("passes a compliant Taiwan post", () => {
    const post = `我在華碩 ExpertHub 服務。筆電 DaaS 每月 NT$1,065 起，白皮書指出僅 7.4% 中小企業已導入 AI。\n${LINK}`;
    expect(findIssues(post, twCtx)).toEqual([]);
  });

  it("catches every rule on a deliberately bad post", () => {
    const post = "全台最便宜！保證補助過件，每月只要 NT$99，營收一定會成長 50%，比中華電信划算 https://experthub.asus.com/smb";
    const rules = findIssues(post, twCtx).map((i) => i.rule).sort();
    expect(rules).toEqual(["claims", "competitors", "disclosure", "evidence", "link", "price"]);
  });

  it("does not treat 第一步 or best practices as claims", () => {
    const tw = `我在華碩服務。數位轉型的第一步是診斷。\n${LINK}`;
    const us = `I work at ASUS. Here are some best practices for SMBs.\n${LINK}`;
    expect(findIssues(tw, twCtx)).toEqual([]);
    expect(findIssues(us, usCtx)).toEqual([]);
  });
});

describe("statistics need context, not just a matching number", () => {
  it("rejects an approved value used for a different claim", () => {
    const post = `I work at ASUS. 80% of our clients doubled revenue.\n${LINK}`;
    expect(findIssues(post, usCtx).map((i) => i.rule)).toEqual(["evidence"]);
  });
  it("accepts the value next to its anchor", () => {
    const post = `I work at ASUS. SMBs employ nearly 80% of Taiwan's workforce.\n${LINK}`;
    expect(findIssues(post, usCtx)).toEqual([]);
  });
});

describe("repairPost", () => {
  it("drops the sentence with an unapproved price instead of splicing text into it", () => {
    const post = `I work at ASUS. ExpertHub is a strong platform in Taiwan. Only $299/month.\n${LINK}`;
    const { text } = repairPost(post, usCtx);
    expect(text).not.toMatch(/Only/);
    expect(text).toContain(usCtx.pack.priceFallback);
    expect(findIssues(text, usCtx)).toEqual([]);
  });

  it("repairs the booth's 'break it' draft into something a rep could post", () => {
    const post = "ExpertHub is the best platform in Taiwan — guaranteed ROI! 80% of our clients doubled revenue. Way cheaper than Microsoft. Only $299/month. Sign up at https://experthub.asus.com";
    const { text } = repairPost(post, usCtx);
    expect(findIssues(text, usCtx)).toEqual([]);
    expect(text).not.toMatch(/80%|Microsoft|\$299|guaranteed|best/i);
  });

  it("turns a bad Taiwan post into one with no remaining issues", () => {
    const post = "全台最便宜！保證補助過件，每月只要 NT$99。營收一定會成長 50%。比中華電信划算。快來 https://experthub.asus.com/smb";
    const { text, fixes } = repairPost(post, twCtx);
    expect(findIssues(text, twCtx)).toEqual([]);
    expect(text).toContain(twCtx.pack.disclosureLine);
    expect(text).not.toContain("NT$99");
    expect(text).not.toContain("中華電信");
    expect(text.split(LINK).length - 1).toBe(1);
    expect(Object.keys(fixes).sort()).toEqual(["claims", "competitors", "disclosure", "evidence", "link", "price"]);
  });

  it("leads with the disclosure for US posts (FTC: visible before 'see more')", () => {
    const post = `ExpertHub is the best way to modernize. Guaranteed results!\n${LINK}`;
    const { text } = repairPost(post, usCtx);
    expect(text.startsWith(usCtx.pack.disclosureLine)).toBe(true);
    expect(findIssues(text, usCtx)).toEqual([]);
  });
});

describe("buildReport", () => {
  it("marks retry fixes and deterministic fixes differently", () => {
    const first = findIssues("保證有效 NT$99", twCtx);
    const afterRetry = findIssues(`我在華碩服務。保證有效。\n${LINK}`, twCtx);
    const report = buildReport({
      ctx: twCtx,
      firstDraftIssues: first,
      afterRetryIssues: afterRetry,
      finalIssues: [],
      fixes: { claims: "Softened: 保證" },
      attempts: 2,
    });
    expect(report.verdict).toBe("auto_fixed");
    const byRule = Object.fromEntries(report.checks.map((c) => [c.rule, c]));
    expect(byRule.price.detail).toMatch(/rewritten by the AI writer/);
    expect(byRule.claims.detail).toMatch(/Softened/);
    expect(byRule.competitors.status).toBe("pass");
  });
});

describe("Chinese repairs keep the clauses that were fine", () => {
  it("drops only the offending clauses from the booth's TW preset", () => {
    const post = "全台最便宜的電子簽核！保證三個月營收成長 50%，每月只要 NT$499，比中華電信划算，快到 https://experthub.asus.com/smb 報名";
    const { text } = repairPost(post, twCtx);
    expect(findIssues(text, twCtx)).toEqual([]);
    expect(text).toContain("價格實惠的電子簽核");
    expect(text).not.toMatch(/NT\$499|50%|中華電信/);
    expect(text).toContain(LINK);
  });
});

describe("Taiwan disclosure placement", () => {
  it("closes the post with the disclosure instead of splitting an inline-link sentence", () => {
    const post = `快到 ${LINK} 報名`;
    const { text } = repairPost(post, twCtx);
    expect(text.endsWith(twCtx.pack.disclosureLine)).toBe(true);
    expect(text).toContain(`快到 ${LINK} 報名`);
  });
});
