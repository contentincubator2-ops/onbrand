import { describe, it, expect } from "vitest";
import { buildTaskCatalogIndex } from "./taskCatalogIndex";
import { EVERGREEN_RATIONALE, evergreenRationaleFor } from "./evergreenRationale";

/**
 * 長青卡沒有出處，所以「憑什麼」得自己說。這支測試讓規則有牙齒：
 * 目錄裡每一張 evergreen 卡都要有一行背後邏輯；表裡也不能留已經下架的 id。
 */
describe("evergreenRationale", () => {
  const evergreen = buildTaskCatalogIndex().filter((t) => t.source.type === "evergreen");

  it("目錄裡每一張長青卡都有背後邏輯", () => {
    const missing = evergreen.filter((t) => !evergreenRationaleFor(t.id)).map((t) => t.id);
    expect(missing, `缺背後邏輯：${missing.join(", ")}`).toEqual([]);
  });

  it("表裡沒有目錄上不存在的 id（下架的卡要一起拿掉）", () => {
    const ids = new Set(buildTaskCatalogIndex().map((t) => t.id));
    const stale = Object.keys(EVERGREEN_RATIONALE).filter((id) => !ids.has(id));
    expect(stale, `過期的 id：${stale.join(", ")}`).toEqual([]);
  });

  it("每一行都是在講理由，不是重複 description：至少 30 字", () => {
    for (const [id, text] of Object.entries(EVERGREEN_RATIONALE)) {
      expect([...text].length, id).toBeGreaterThanOrEqual(30);
    }
  });
});
