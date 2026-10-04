import { describe, it, expect } from "vitest";
import { buildMyCardRows, ownStatusLabel } from "./myTaskCards";

const viral = (id: string, label: string) => ({ id, label, source: { type: "viral", asOf: "2099-01" } } as any);
const ownTask = (id: string, label: string) => ({ id, label, ownCardId: id } as any);

describe("buildMyCardRows", () => {
  it("常用的照常用順序排在前面，內建卡不能改、自建卡可以", () => {
    const rows = buildMyCardRows({
      tasks: [viral("fb-a", "爆款 A"), ownTask("u1-promo", "促購文")],
      trayIds: ["u1-promo", "fb-a"],
      ownCards: [{ id: "u1-promo", name: "促購文", channel: "facebook", status: "ready", skill: "x" }],
      en: false,
    });
    expect(rows.map((r) => [r.id, r.favorite, r.own, r.runnable])).toEqual([
      ["u1-promo", true, true, true],
      ["fb-a", true, false, true],
    ]);
  });

  it("沒加常用的自建卡也要列（不然建了卡卻找不到）；沒加常用的內建卡不列", () => {
    const rows = buildMyCardRows({
      tasks: [viral("fb-a", "爆款 A"), viral("fb-b", "爆款 B"), ownTask("u1-x", "X")],
      trayIds: ["fb-a"],
      ownCards: [{ id: "u1-x", name: "X", channel: "facebook", status: "ready", skill: "s" }],
      en: false,
    });
    expect(rows.map((r) => r.id)).toEqual(["fb-a", "u1-x"]);
    expect(rows[1]).toMatchObject({ favorite: false, own: true, runnable: true });
  });

  it("還沒上架的自建卡排最後、不能開始寫；SKILL 有了才給上架", () => {
    const rows = buildMyCardRows({
      tasks: [ownTask("u1-ok", "OK")],
      trayIds: [],
      ownCards: [
        { id: "u1-building", name: "生成中", channel: "facebook", status: "drafting", skill: "" },
        { id: "u1-ok", name: "OK", channel: "facebook", status: "ready", skill: "s" },
        { id: "u1-draft", name: "草稿", channel: "facebook", status: "drafting", skill: "s" },
      ],
      en: false,
    });
    expect(rows.map((r) => r.id)).toEqual(["u1-ok", "u1-building", "u1-draft"]);
    expect(rows[1]).toMatchObject({ runnable: false, canPublish: false, statusLabel: "生成中" });
    expect(rows[2]).toMatchObject({ runnable: false, canPublish: true, statusLabel: "未上架" });
  });

  it("常用清單裡有、但任務清單已經沒有的 id 不列（卡退役／方案擋掉）", () => {
    expect(buildMyCardRows({ tasks: [], trayIds: ["gone"], ownCards: [], en: false })).toEqual([]);
  });

  it("狀態標籤：已上架不標、失敗要標", () => {
    expect(ownStatusLabel({ status: "ready", skill: "s" }, false)).toBeNull();
    expect(ownStatusLabel({ status: "failed", skill: "" }, false)).toBe("生成失敗");
  });
});
