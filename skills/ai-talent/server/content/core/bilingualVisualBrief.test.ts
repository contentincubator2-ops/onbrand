import { describe, expect, it } from "vitest";
import {
  parseBilingualBrief,
  parseBilingualBriefChoice,
  normalizeImagePromptInput,
  recoverModelPromptFromJsonLike,
} from "./bilingualVisualBrief";

const caption = "中秋節一起烤肉賞月";

describe("bilingual visual brief parsing", () => {
  it("parses a complete bilingual JSON response", () => {
    expect(parseBilingualBrief(JSON.stringify({
      prompt: "A family barbecue beneath a full moon.",
      promptZh: "一家人在滿月下烤肉。",
    }), caption)).toEqual({
      prompt: "A family barbecue beneath a full moon.",
      promptZh: "一家人在滿月下烤肉。",
    });
  });

  it("falls back instead of returning truncated JSON as content", () => {
    const broken = '{"prompt":"A family barbecue beneath a full moon.","promptZh":"一家人在滿月下';
    const result = parseBilingualBrief(broken, caption);

    expect(result.prompt).toBe(`Photorealistic editorial scene representing: ${caption}`);
    expect(result.promptZh).not.toContain(broken);
  });

  it("falls back when finish_reason reports truncation", () => {
    const result = parseBilingualBriefChoice({
      finish_reason: "max_tokens",
      message: { content: JSON.stringify({ prompt: "English", promptZh: "中文" }) },
    }, caption);

    expect(result.prompt).toBe(`Photorealistic editorial scene representing: ${caption}`);
  });

  it("preserves a provider's plain English prose response", () => {
    const prose = "A warm editorial photograph of friends sharing a meal.";
    expect(parseBilingualBrief(prose, caption)).toEqual({
      prompt: prose,
      promptZh: `寫實的編輯攝影場景，呈現：${caption}`,
    });
  });
});

describe("historical polluted prompt recovery", () => {
  it("extracts a complete English field from truncated bilingual JSON", () => {
    expect(recoverModelPromptFromJsonLike(
      '{"prompt":"A moonlit barbecue with \\"warm\\" lanterns.","promptZh":"月光下的烤肉',
    )).toBe('A moonlit barbecue with "warm" lanterns.');
  });

  it("marks unrecoverable JSON-like content unsafe", () => {
    expect(recoverModelPromptFromJsonLike('{"prompt":"cut off')).toBeNull();
  });

  it("leaves ordinary user-authored prompts alone", () => {
    expect(recoverModelPromptFromJsonLike("Draw a minimal studio scene.")).toBeUndefined();
  });

  it("leaves unrelated structured image prompts alone", () => {
    expect(recoverModelPromptFromJsonLike('{"scene":"studio","lighting":"soft"}')).toBeUndefined();
  });

  it("does not persist truncated bilingual JSON back into the editable field", () => {
    expect(normalizeImagePromptInput(
      '{"prompt":"A moonlit barbecue.","promptZh":"月光下的烤肉',
    )).toEqual({
      modelPrompt: "A moonlit barbecue.",
      displayPrompt: "A moonlit barbecue.",
    });
  });

  it("keeps the Chinese counterpart for a complete historical response", () => {
    expect(normalizeImagePromptInput(JSON.stringify({
      prompt: "A moonlit barbecue.",
      promptZh: "月光下的烤肉。",
    }))).toEqual({
      modelPrompt: "A moonlit barbecue.",
      displayPrompt: "月光下的烤肉。",
    });
  });
});
