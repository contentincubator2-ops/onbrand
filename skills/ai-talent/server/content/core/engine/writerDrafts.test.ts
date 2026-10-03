import { describe, expect, it } from "vitest";
import { LEAD_WRITER_KEY, switchWriter } from "./writerDrafts";

const now = new Date("2026-09-29T00:00:00Z");

describe("switchWriter", () => {
  it("first switch keeps the lead's text (with the user's edits) so it can be restored", () => {
    const item = { caption: "主筆原稿＋用戶手改", label: "v" };
    const out = switchWriter(item, { key: "180006", name: "Grace Wu", agentId: 180006 }, "Grace 版", now);
    expect(out.caption).toBe("Grace 版");
    expect(out.activeWriter).toBe("180006");
    expect(out.writerDrafts[LEAD_WRITER_KEY].caption).toBe("主筆原稿＋用戶手改");
    expect(out.writerDrafts["180006"]).toMatchObject({ name: "Grace Wu", caption: "Grace 版" });
    expect(out.label).toBe("v");
  });

  it("switching back restores the cached draft and saves the current writer's edits", () => {
    const a = switchWriter({ caption: "主筆稿" }, { key: "180006", name: "Grace Wu" }, "Grace 版", now);
    const edited = { ...a, caption: "Grace 版（用戶改了一句）" };
    const back = switchWriter(edited, { key: LEAD_WRITER_KEY, name: "主筆" }, a.writerDrafts[LEAD_WRITER_KEY].caption, now);
    expect(back.caption).toBe("主筆稿");
    expect(back.activeWriter).toBe(LEAD_WRITER_KEY);
    expect(back.writerDrafts["180006"].caption).toBe("Grace 版（用戶改了一句）");
    expect(back.writerDrafts["180006"].name).toBe("Grace Wu");
  });
});
