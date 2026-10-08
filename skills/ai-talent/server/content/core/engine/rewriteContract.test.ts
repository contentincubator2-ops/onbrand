import { describe, expect, it } from "vitest";
import {
  countChars, isOverLimit, looksLikeReplyToUser, parseRewriteReply, replyFormatBlock, rewriteContractBlock, stripMarkdown,
} from "./rewriteContract";

describe("rewriteContract", () => {
  it("strips markdown but keeps hashtags", () => {
    expect(stripMarkdown("意味著**什麼**。\n## 小標\n#行銷策略 `x`")).toBe("意味著什麼。\n小標\n#行銷策略 x");
  });
  it("counts characters without whitespace", () => {
    expect(countChars("一 二\n三")).toBe(3);
  });
  it("flags only clearly-over-limit rewrites (25% slack)", () => {
    expect(isOverLimit("字".repeat(188), { maxChars: 150 })).toBe(false);
    expect(isOverLimit("字".repeat(189), { maxChars: 150 })).toBe(true);
    expect(isOverLimit("字".repeat(999), { maxChars: 0 })).toBe(false);
  });
  it("puts the card's limit into the contract", () => {
    const b = rewriteContractBlock({ label: "FB Reels：固定角色短劇", minChars: 60, maxChars: 150 });
    expect(b).toContain("60–150 字");
    expect(b).toContain("FB Reels：固定角色短劇");
    expect(b).toContain("markdown");
  });

  // 2026-10-08（CJ「他把內心話寫在貼文了」）——dev 實際發生的那一則回覆。
  const ORIGINAL = "GO 曠野地帶回來了。訓練家們，帶上你的夥伴，一起走進這片還沒被探索過的天空之下，" +
    "這一季最稀有的寶可夢正在等你。集合地點與時間都在活動頁，現在就約好你的隊友。";
  const LEAKED = "我理解你的意見了。我重新檢查了用詞，發現原文在幾處違反了品牌聲音指南：1.「回來了」語氣過於宣告。" +
    "\n\n\n你是想要我直接提出用詞修改清單，還是要我改寫整篇文案？";

  it("splits on the explicit markers", () => {
    const r = parseRewriteReply("【說明】\n把宣告語氣改成邀請。\n【文案】\n訓練家，一起出發吧。\n#PokémonGO");
    expect(r.explanation).toBe("把宣告語氣改成邀請。");
    expect(r.rewritten).toBe("訓練家，一起出發吧。\n#PokémonGO");
  });
  it("still reads the old blank-line and hr separators", () => {
    expect(parseRewriteReply("改短了。\n\n\n新文案").rewritten).toBe("新文案");
    expect(parseRewriteReply("改短了。\n\n---\n\n新文案").rewritten).toBe("新文案");
    expect(parseRewriteReply("只有文案").explanation).toBe("");
  });
  it("catches a question to the user sitting where the copy should be", () => {
    const r = parseRewriteReply(LEAKED);
    expect(r.rewritten).toContain("還是要我改寫整篇文案");
    expect(looksLikeReplyToUser(r.rewritten, ORIGINAL)).toBe(true);
    expect(looksLikeReplyToUser("", ORIGINAL)).toBe(true);
    expect(looksLikeReplyToUser("Would you like me to rewrite the whole post or list the wording changes?", ORIGINAL)).toBe(true);
  });
  it("leaves real copy alone, even short copy that addresses the reader", () => {
    expect(looksLikeReplyToUser("訓練家，你準備好了嗎？這個週末一起出發。", ORIGINAL)).toBe(false);
    expect(looksLikeReplyToUser(ORIGINAL.replace("回來了", "等你出發"), ORIGINAL)).toBe(false);
    // 完整長度的文案裡剛好有「請告訴我」這種句子，不算。
    expect(looksLikeReplyToUser(ORIGINAL + "你最想遇見哪一隻？請告訴我們，留言區見。", ORIGINAL)).toBe(false);
  });
  it("tells the model not to ask back", () => {
    const b = replyFormatBlock();
    expect(b).toContain("【文案】");
    expect(b).toContain("不要反問");
  });
});
