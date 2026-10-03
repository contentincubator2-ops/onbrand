/**
 * pickOwnAngle.test — which task cards let the AI decide its own version angle vs. get a fixed one.
 *
 * 2026-09-22 (CJ「不應該將所有產品都規定為情感版、理性版還有數據版」→「其他有混用的，也請檢查」):
 * `OrchestraConfig.pickOwnAngle` is opt-in, task by task — set only where the task applies to ANY
 * pasted content/product with a fixed generic label set the task's own systemPrompt never elaborates
 * on (see each task's inline comment for why). This test locks the exact set so a future edit to any
 * of these ~150 configs has to touch this list on purpose, not drift silently.
 *
 * Deliberately NOT converted, despite mixing in a generic word:
 *   - tt-60-viral-rewrite: its systemPrompt has its own 「各版本改寫角度」 bullet list defining every
 *     label — unlike its FB/IG/YT siblings, this one was actually designed per-label.
 *   - li-60-case-study: B2B case studies almost always carry a metric, and the task has its own
 *     「數字 Verbatim 保護協議」 guarding accuracy — a fixed 數據式 slot is a reasonable fit there.
 */
import { describe, expect, it } from "vitest";
import { FB_30S_ORCHESTRA } from "../catalog/quickTaskFB";
import { FB_60S_ORCHESTRA } from "../catalog/quickTaskFB60";
import { IG_60S_ORCHESTRA } from "../catalog/quickTaskIG60";
import { ALL_99S_ORCHESTRA } from "../catalog/quickTask100";
import { YT_60S_ORCHESTRA } from "../catalog/quickTaskYT60";
import { MULTI_60S_ORCHESTRA } from "../catalog/quickTaskMulti60";

const ALL_CONFIGS = {
  ...FB_30S_ORCHESTRA, ...FB_60S_ORCHESTRA, ...IG_60S_ORCHESTRA,
  ...ALL_99S_ORCHESTRA, ...YT_60S_ORCHESTRA, ...MULTI_60S_ORCHESTRA,
};

const EXPECTED_PICK_OWN_ANGLE = [
  "fb-30-caption-short", "fb-60-single-full", "ig-60-feed-full",
  "fb-99-viral-rewrite", "ig-60-viral-rewrite", "yt-60-viral-rewrite",
  "fb-99-testimonial-rewrite", "ig-60-testimonial-rewrite",
].sort();

describe("OrchestraConfig.pickOwnAngle — exactly these task cards, on purpose", () => {
  it("every id in the expected list still exists and is opted in", () => {
    for (const id of EXPECTED_PICK_OWN_ANGLE) {
      expect(ALL_CONFIGS[id], `${id} missing from the loaded orchestra configs`).toBeDefined();
      expect(ALL_CONFIGS[id]?.pickOwnAngle, id).toBe(true);
    }
  });

  it("nothing else has quietly picked it up", () => {
    const actual = Object.entries(ALL_CONFIGS)
      .filter(([, c]) => c.pickOwnAngle)
      .map(([id]) => id)
      .sort();
    expect(actual).toEqual(EXPECTED_PICK_OWN_ANGLE);
  });

  it("the well-designed siblings that were deliberately left out stay fixed-label", () => {
    expect(MULTI_60S_ORCHESTRA["tt-60-viral-rewrite"]?.pickOwnAngle).toBeFalsy();
    expect(MULTI_60S_ORCHESTRA["li-60-case-study"]?.pickOwnAngle).toBeFalsy();
  });
});
