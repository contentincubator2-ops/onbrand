import { describe, it, expect } from "vitest";
import { cardPublishedItems } from "./notificationRouter";

describe("notifications · card_published", () => {
  it("30 天內的上架日各合成一則，navUrl 指到 /tasks/<平台>?new=1，未看過就 unread", () => {
    // 2026-09-29：通知只算前台看得到的新卡（近 3 個月的爆款結構），所以日期要落在新卡上架之後。
    const now = new Date("2026-09-30T00:00:00Z");
    const items = cardPublishedItems(now, new Date("2026-08-01T00:00:00Z"), false);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(it.kind).toBe("card_published");
      expect(it.navUrl).toMatch(/^[/]tasks[/][a-z]+[?]new=1$/);
      expect(it.title).toContain("新任務卡上架");
      expect(it.unread).toBe(true);
    }
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("看過之後就不再 unread", () => {
    const now = new Date("2026-09-08T00:00:00Z");
    const items = cardPublishedItems(now, now, false);
    for (const it of items) expect(it.unread).toBe(false);
  });
});
