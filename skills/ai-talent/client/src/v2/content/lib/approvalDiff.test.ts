import { describe, expect, it } from "vitest";
import { captionDiff } from "./approvalDiff";

describe("captionDiff", () => {
  it("只改中間一小段：頭尾相同的部分不算", () => {
    const d = captionDiff("週五新品上市，全館九折。", "週五新品上市，全館八五折。");
    expect(d.removed).toBe("九");
    expect(d.added).toBe("八五");
    expect(d.lead.endsWith("全館")).toBe(true);
    expect(d.tail).toBe("折。");
  });

  it("純新增與純刪除", () => {
    expect(captionDiff("早安", "早安！")).toMatchObject({ removed: "", added: "！" });
    expect(captionDiff("早安！", "早安")).toMatchObject({ removed: "！", added: "" });
  });

  it("完全一樣：沒有差異", () => {
    expect(captionDiff("一樣", "一樣")).toMatchObject({ removed: "", added: "" });
  });

  it("上下文超過長度會截短並標記", () => {
    const head = "前".repeat(60), end = "後".repeat(60);
    const d = captionDiff(`${head}A${end}`, `${head}B${end}`, 10);
    expect(d.lead.length).toBe(10);
    expect(d.tail.length).toBe(10);
    expect(d.leadCut).toBe(true);
    expect(d.tailCut).toBe(true);
  });

  it("一次改了兩個地方：標成兩處，中間沒變的字留著", () => {
    const d = captionDiff("低溫窨製三次。10/12 起全門市開賣，前三天第二杯半價。", "低溫窖製三次。10/12 起全門市開賣，前三天第二杯六折。");
    expect(d.segs.filter((x) => x.t === "del").map((x) => x.s)).toEqual(["窨", "半價"]);
    expect(d.segs.filter((x) => x.t === "ins").map((x) => x.s)).toEqual(["窖", "六折"]);
    expect(d.segs.some((x) => x.t === "same" && x.s.includes("全門市開賣"))).toBe(true);
  });

  it("兩處改動之間只隔一個相同的字：併成一處，不留碎屑", () => {
    const d = captionDiff("買一送一的活動", "買二送二的優惠");
    expect(d.segs.every((x) => x.t !== "same" || Array.from(x.s).length >= 2)).toBe(true);
  });

  it("中間段落太長就整段當一處，不逐字比對", () => {
    const d = captionDiff("x" + "甲".repeat(900) + "y", "x" + "乙".repeat(900) + "y");
    expect(d.segs).toEqual([{ t: "del", s: "甲".repeat(900) }, { t: "ins", s: "乙".repeat(900) }]);
  });

  it("emoji 不會被切成兩半；換行寫法不同不算修改", () => {
    const d = captionDiff("好吃😋", "好吃🥰");
    expect(d.removed).toBe("😋");
    expect(d.added).toBe("🥰");
    expect(captionDiff("a\r\nb", "a\nb")).toMatchObject({ removed: "", added: "" });
  });
});
