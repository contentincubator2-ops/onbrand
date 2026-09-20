import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeMock, sendEmailMock } = vi.hoisted(() => ({ executeMock: vi.fn(), sendEmailMock: vi.fn() }));

vi.mock("../../localDb", () => ({ default: { execute: executeMock } }));
vi.mock("../auth/emailService", () => ({ sendEmail: sendEmailMock }));

import { createEcomReportingRequest, quoteEcomReporting } from "./addonRequests";

const row = (over: Record<string, unknown> = {}) => ({
  id: 7, addonId: "ecom_reporting", brandId: null, skus: 30, storePlatform: "Shopline", notes: null,
  quotedOneTimeTwd: 56000, quotedMonthlyTwd: 30000, projectQuote: 0, status: "new",
  createdAt: new Date("2026-09-21T00:00:00Z"), ...over,
});

describe("quoteEcomReporting — 對照報價頁的品項級距表", () => {
  it.each([
    [1, 48000, 25000], [20, 48000, 25000],
    [21, 56000, 30000], [50, 56000, 30000],
    [51, 60000, 35000], [100, 60000, 35000],
    [101, 66000, 40000], [200, 66000, 40000],
  ])("%i 品項 → 建置 %i／月費 %i", (skus, oneTime, monthly) => {
    expect(quoteEcomReporting(skus)).toEqual({ projectQuote: false, oneTimeTwd: oneTime, monthlyTwd: monthly });
  });

  it("超過 200 品項是專案報價，不給數字", () => {
    expect(quoteEcomReporting(201)).toEqual({ projectQuote: true, oneTimeTwd: null, monthlyTwd: null });
  });
});

describe("createEcomReportingRequest", () => {
  beforeEach(() => {
    executeMock.mockReset();
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue(undefined);
  });

  it("沒有進行中的申請 → 寫一筆、算好報價、寄信給業務", async () => {
    executeMock
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 7 }])
      .mockResolvedValueOnce([[row()]]);

    const r = await createEcomReportingRequest({ userId: 1, userEmail: "a@b.co", brandId: null, skus: 30, storePlatform: "Shopline" });

    expect(r.alreadyOpen).toBe(false);
    expect(r.request.quotedOneTimeTwd).toBe(56000);
    const insertArgs = executeMock.mock.calls[1]![1];
    expect(insertArgs).toEqual([1, null, 30, "Shopline", null, 56000, 30000, 0]);
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock.mock.calls[0]![0].subject).toContain("#7");
  });

  it("已經有進行中的申請 → 回那一筆，不重複寫、不重複寄信", async () => {
    executeMock.mockResolvedValueOnce([[row({ status: "contacted" })]]);

    const r = await createEcomReportingRequest({ userId: 1, userEmail: "a@b.co", brandId: null, skus: 30 });

    expect(r.alreadyOpen).toBe(true);
    expect(r.request.status).toBe("contacted");
    expect(executeMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("寄信失敗不影響申請（資料庫那筆才是正本）", async () => {
    executeMock
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 8 }])
      .mockResolvedValueOnce([[row({ id: 8 })]]);
    sendEmailMock.mockRejectedValue(new Error("Outbound email is disabled in this environment"));

    const r = await createEcomReportingRequest({ userId: 1, userEmail: null, brandId: null, skus: 30 });

    expect(r.request.id).toBe(8);
  });

  it("備註裡的 HTML 會被跳脫，不能塞進給業務的信", async () => {
    executeMock
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 9 }])
      .mockResolvedValueOnce([[row({ id: 9, notes: "<script>alert(1)</script>" })]]);

    await createEcomReportingRequest({ userId: 1, userEmail: "a@b.co", brandId: null, skus: 30, notes: "<script>alert(1)</script>" });

    const html = sendEmailMock.mock.calls[0]![0].html as string;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("專案報價（201 品項）寫進去的兩個金額是 NULL、projectQuote=1", async () => {
    executeMock
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ insertId: 10 }])
      .mockResolvedValueOnce([[row({ id: 10, skus: 201, quotedOneTimeTwd: null, quotedMonthlyTwd: null, projectQuote: 1 })]]);

    const r = await createEcomReportingRequest({ userId: 1, userEmail: "a@b.co", brandId: null, skus: 201 });

    expect(executeMock.mock.calls[1]![1]).toEqual([1, null, 201, null, null, null, null, 1]);
    expect(r.request.projectQuote).toBe(true);
  });
});
