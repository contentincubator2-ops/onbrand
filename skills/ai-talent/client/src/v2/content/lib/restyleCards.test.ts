import { describe, it, expect } from "vitest";
import { buildRestyleOptions, isRestyleKey, restyleKeyOf } from "./restyleCards";

const t = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id, tier: "30s", kind: "fast", ...extra });

describe("buildRestyleOptions", () => {
  const tasks = [
    t("fb-a"), t("fb-b"), t("fb-c"),
    t("u9-mine", { platform: "facebook", ownCardId: "u9-mine" }),
    t("ig-x"),
    t("fb-pack", { tier: "60s" }),
    t("fb-squad", { kind: "squad" }),
  ];

  it("自建在最前、加星號的其次、其餘照原順序；不含目前這張", () => {
    const out = buildRestyleOptions({ tasks, currentTaskId: "fb-a", storedByPlatform: { facebook: ["fb-c"] }, en: false });
    expect(out.map((o) => o.taskId)).toEqual(["u9-mine", "fb-c", "fb-b"]);
    expect(out.map((o) => o.tag)).toEqual(["own", "favorite", "viral"]);
  });

  it("只列同通路、同規模，不列多人協作卡", () => {
    const ids = buildRestyleOptions({ tasks, currentTaskId: "fb-a", storedByPlatform: {}, en: false }).map((o) => o.taskId);
    expect(ids).not.toContain("ig-x");
    expect(ids).not.toContain("fb-pack");
    expect(ids).not.toContain("fb-squad");
  });

  it("沒存過常用清單就沒有常用標記", () => {
    const out = buildRestyleOptions({ tasks, currentTaskId: "fb-a", storedByPlatform: { facebook: null }, en: false });
    expect(out.some((o) => o.tag === "favorite")).toBe(false);
  });

  it("目前這張不在清單裡（例如活動產的貼文）時，照編號前綴判斷通路", () => {
    const out = buildRestyleOptions({ tasks, currentTaskId: "ig-campaign-post", storedByPlatform: {}, en: false });
    expect(out.map((o) => o.taskId)).toEqual(["ig-x"]);
  });

  it("key 帶前綴，跟換人寫的 agent key 分得開", () => {
    expect(restyleKeyOf("fb-a")).toBe("card:fb-a");
    expect(isRestyleKey("card:fb-a")).toBe(true);
    expect(isRestyleKey("12345")).toBe(false);
    expect(isRestyleKey(undefined)).toBe(false);
  });
});
