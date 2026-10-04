/**
 * listingBatch.test — 批次產出的純邏輯：貼上的表格怎麼解析、項目怎麼組、成品怎麼摘要、狀態怎麼推。
 *
 * 風險集中在「用戶貼的東西五花八門」：Excel 複製（Tab）、一行一個商品名稱、逗號分隔、
 * 第一列沒有欄位名。解析錯了的後果是替錯的商品扣點，所以每種形狀都鎖住。
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../localDb", () => ({ default: { execute: vi.fn() } }));

import {
  parseBatchTable, buildBatchItems, summarizeOutput, deriveStatus, countItems, isStaleRunning,
  splitCsvLine, MAX_BATCH_ITEMS, RUNNING_STALE_MS, type BatchItem,
} from "./listingBatch";
import { sanitizeListingFields } from "../engine/listingContract";
import { listingBatchRouter } from "../../routers/listingBatchRouter";

const ASK = [
  { key: "specs", label: "規格／尺寸／成分" },
  { key: "price", label: "價格與優惠" },
];

describe("parseBatchTable", () => {
  it("一行一個商品名稱（沒有分隔符號）", () => {
    const r = parseBatchTable("薑母茶\n\n  桂圓紅棗茶 \n", ASK);
    expect(r.rows.map((x) => x.label)).toEqual(["薑母茶", "桂圓紅棗茶"]);
    expect(r.rows[0]!.inputs).toEqual({});
  });

  it("Excel／試算表複製（Tab）：第一列欄位名，對得上卡片額外欄位的帶入，對不上的忽略並回報", () => {
    const t = "商品名稱\t規格／尺寸／成分\t價格與優惠\t備註\n薑母茶\t10 入\t$299\t內部用\n桂圓茶\t8 入\t\t";
    const r = parseBatchTable(t, ASK);
    expect(r.rows).toEqual([
      { label: "薑母茶", inputs: { specs: "10 入", price: "$299" } },
      { label: "桂圓茶", inputs: { specs: "8 入" } },          // 空格子不帶入（不送空字串）
    ]);
    expect(r.ignoredColumns).toEqual(["備註"]);
    expect(r.note).toBeNull();
  });

  it("商品欄不在第一欄也找得到", () => {
    const r = parseBatchTable("價格與優惠\t商品\n$299\t薑母茶", ASK);
    expect(r.rows).toEqual([{ label: "薑母茶", inputs: { price: "$299" } }]);
  });

  it("逗號分隔：第一列看得出是欄位名才當表格；引號內的逗號不切", () => {
    const r = parseBatchTable('商品,價格與優惠\n"薑母茶,10 入",$299', ASK);
    expect(r.rows).toEqual([{ label: "薑母茶,10 入", inputs: { price: "$299" } }]);
  });

  it("商品名稱本身有逗號、又沒有欄位名時，不亂切（一行一個商品）", () => {
    const r = parseBatchTable("薑母茶,10 入裝\n桂圓茶,8 入裝", ASK);
    expect(r.rows.map((x) => x.label)).toEqual(["薑母茶,10 入裝", "桂圓茶,8 入裝"]);
  });

  it("Tab 分隔但第一列不是欄位名：整份當第一欄商品名稱，並在 note 說明", () => {
    const r = parseBatchTable("薑母茶\t10 入\n桂圓茶\t8 入", ASK);
    expect(r.rows.map((x) => x.label)).toEqual(["薑母茶", "桂圓茶"]);
    expect(r.rows[0]!.inputs).toEqual({});
    expect(r.note).toMatch(/第一列/);
  });

  it("上限 50 筆，超過標 truncated；空白列丟掉；過長的值被截", () => {
    const many = Array.from({ length: 60 }, (_, i) => `商品${i + 1}`).join("\n");
    const r = parseBatchTable(many, ASK);
    expect(r.rows.length).toBe(MAX_BATCH_ITEMS);
    expect(r.truncated).toBe(true);
    expect(parseBatchTable("", ASK).rows).toEqual([]);
    const long = parseBatchTable(`商品\t規格／尺寸／成分\nA\t${"x".repeat(5000)}`, ASK);
    expect(long.rows[0]!.inputs.specs!.length).toBe(2000);
  });

  it("splitCsvLine：跳脫雙引號", () => {
    expect(splitCsvLine('a,"b ""q"" c",d')).toEqual(["a", 'b "q" c', "d"]);
  });
});

describe("buildBatchItems", () => {
  it("品牌產品在前、貼上的在後；同名（不分大小寫）只留一筆，避免同一個商品扣兩次點", () => {
    const items = buildBatchItems(
      [{ id: 5, name: "薑母茶" }],
      [{ label: "薑母茶", inputs: {} }, { label: "桂圓茶", inputs: { price: "$99" } }, { label: "桂圓茶", inputs: {} }],
    );
    expect(items.map((i) => [i.label, i.productId])).toEqual([["薑母茶", 5], ["桂圓茶", null]]);
    expect(items[1]!.inputs).toEqual({ topic: "桂圓茶", price: "$99" });
    expect(items.every((i) => i.state === "queued" && i.approval === "pending" && i.outputId === null)).toBe(true);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it("總數不超過上限", () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ label: `p${i}`, inputs: {} }));
    expect(buildBatchItems([], rows).length).toBe(MAX_BATCH_ITEMS);
  });
});

describe("summarizeOutput", () => {
  const spec = { fields: sanitizeListingFields([
    { label: "商品標題", kind: "text", maxChars: 6 },
    { label: "賣點條列", kind: "bullets" },
  ]) };
  const mk = (caption: string) => JSON.stringify([{ label: "版本 1", caption }]);

  it("乾淨：欄位齊全、沒超標；待補資料列出缺項但不擋", () => {
    const s = summarizeOutput(mk("【商品標題】\n薑母茶\n\n【賣點條列】\n・a\n・b\n\n【待補資料】\n・成分比例"), spec);
    expect(s.clean).toBe(true);
    expect(s.todo).toEqual(["成分比例"]);
    expect(s.missing).toBe(0);
    expect(s.over).toBe(0);
  });

  it("超標與缺欄位都算有問題；『無』不算待補", () => {
    const over = summarizeOutput(mk("【商品標題】\n薑母茶暖身沖泡十入\n\n【賣點條列】\n・a\n・b\n\n【待補資料】\n無"), spec);
    expect(over.over).toBe(1);
    expect(over.clean).toBe(false);
    expect(over.todo).toEqual([]);
    const missing = summarizeOutput(mk("【商品標題】\n薑母茶\n\n【待補資料】\n無"), spec);
    expect(missing.missing).toBe(1);
    expect(missing.clean).toBe(false);
  });

  it("內容壞掉或空白：不丟錯，算成全部缺欄位", () => {
    for (const bad of ["not json", "[]", "", null]) {
      const s = summarizeOutput(bad, spec);
      expect(s.clean).toBe(false);
      expect(s.missing).toBe(2);
    }
  });
});

describe("狀態推導", () => {
  const item = (state: BatchItem["state"], over: Partial<BatchItem> = {}): BatchItem => ({
    id: "i", productId: null, label: "x", inputs: {}, state, outputId: null, error: null, approval: "pending", ...over,
  });

  it("deriveStatus：沒有進行中的就是 done；暫停原因＋沒有在跑的＝paused；取消優先", () => {
    expect(deriveStatus({ status: "running", pausedReason: null, items: [item("done"), item("failed")] })).toBe("done");
    expect(deriveStatus({ status: "running", pausedReason: null, items: [item("done"), item("queued")] })).toBe("running");
    expect(deriveStatus({ status: "running", pausedReason: "點數不足", items: [item("done"), item("queued")] })).toBe("paused");
    expect(deriveStatus({ status: "running", pausedReason: "點數不足", items: [item("running"), item("queued")] })).toBe("running");
    expect(deriveStatus({ status: "cancelled", pausedReason: null, items: [item("queued")] })).toBe("cancelled");
  });

  it("countItems：核准／退回／待審只算已完成的", () => {
    const c = countItems([
      item("done", { approval: "approved" }), item("done", { approval: "rejected" }), item("done"),
      item("failed"), item("queued"), item("running"), item("cancelled"),
    ]);
    expect(c).toMatchObject({ total: 7, done: 3, approved: 1, rejected: 1, pendingReview: 1, failed: 1, queued: 1, running: 1, cancelled: 1 });
  });

  it("isStaleRunning：進行中超過門檻、或沒有開始時間，才算殭屍", () => {
    const now = Date.now();
    expect(isStaleRunning({ state: "running", startedAt: new Date(now - 1000).toISOString() }, now)).toBe(false);
    expect(isStaleRunning({ state: "running", startedAt: new Date(now - RUNNING_STALE_MS - 1).toISOString() }, now)).toBe(true);
    expect(isStaleRunning({ state: "running" }, now)).toBe(true);
    expect(isStaleRunning({ state: "done", startedAt: "2020-01-01T00:00:00Z" }, now)).toBe(false);
  });
});

describe("router", () => {
  it("procedure 名稱不撞 tRPC 保留字，且是預期那幾個", () => {
    const names = Object.keys((listingBatchRouter as any)._def.procedures).sort();
    expect(names).toEqual(["cancel", "create", "get", "list", "quote", "remove", "resume", "retry", "setApproval"]);
    for (const n of names) expect(Object.getOwnPropertyNames(Function.prototype)).not.toContain(n);
  });
});
