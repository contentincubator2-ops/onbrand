import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  buildAuthorizeUrl, CanvaApiError, canvaErrorMessage, codeChallengeOf, exchangeCanvaCode, exportCanvaDesignPng,
  isCanvaDownloadUrl, listCanvaDesigns, newCodeVerifier, refreshCanvaToken,
} from "./canvaClient";

type Call = { url: string; init: any };
function fakeFetch(replies: Array<{ status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const impl = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body } as any;
  }) as typeof fetch;
  return { impl, calls };
}

describe("canvaClient", () => {
  it("PKCE：verifier 長度合規，challenge 是它的 SHA-256（base64url）", () => {
    const v = newCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(codeChallengeOf(v)).toBe(crypto.createHash("sha256").update(v).digest("base64url"));
    expect(newCodeVerifier()).not.toBe(v);
  });

  it("授權網址帶齊 Canva 要的參數，而且不把 verifier 洩漏出去", () => {
    const url = new URL(buildAuthorizeUrl({ clientId: "cid", redirectUri: "https://x.test/cb", state: "st", codeVerifier: "verifier-value" }));
    expect(url.origin + url.pathname).toBe("https://www.canva.com/api/oauth/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(codeChallengeOf("verifier-value"));
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("redirect_uri")).toBe("https://x.test/cb");
    expect(url.searchParams.get("scope")).toContain("design:content:read");
    expect(url.toString()).not.toContain("verifier-value");
  });

  it("換 token：Basic 驗證＋表單，回來的 refresh token 一起帶出（只能用一次，必須存新的）", async () => {
    const { impl, calls } = fakeFetch([{ body: { access_token: "a1", refresh_token: "r1", expires_in: 14400 } }]);
    const before = Date.now();
    const t = await exchangeCanvaCode({ clientId: "cid", clientSecret: "sec" }, { code: "c", codeVerifier: "v", redirectUri: "https://x.test/cb" }, impl);
    expect(t.access).toBe("a1");
    expect(t.refresh).toBe("r1");
    expect(t.expiresAt).toBeGreaterThanOrEqual(before + 14400 * 1000);
    expect(calls[0]!.url).toBe("https://api.canva.com/rest/v1/oauth/token");
    expect(calls[0]!.init.headers.Authorization).toBe(`Basic ${Buffer.from("cid:sec").toString("base64")}`);
    const body = new URLSearchParams(String(calls[0]!.init.body));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe("v");

    const r = fakeFetch([{ body: { access_token: "a2", refresh_token: "r2", expires_in: 100 } }]);
    const t2 = await refreshCanvaToken({ clientId: "cid", clientSecret: "sec" }, "r1", r.impl);
    expect(t2.refresh).toBe("r2");
    expect(new URLSearchParams(String(r.calls[0]!.init.body)).get("refresh_token")).toBe("r1");
  });

  it("換 token 失敗（或沒給 refresh token）要丟錯，不能存一組撐不過一輪的連接", async () => {
    await expect(refreshCanvaToken({ clientId: "c", clientSecret: "s" }, "old", fakeFetch([{ status: 400, body: { code: "invalid_grant" } }]).impl))
      .rejects.toMatchObject({ code: "invalid_grant" });
    await expect(refreshCanvaToken({ clientId: "c", clientSecret: "s" }, "old", fakeFetch([{ body: { access_token: "a" } }]).impl))
      .rejects.toBeInstanceOf(CanvaApiError);
  });

  it("列設計：沒搜尋字照最近修改排，有搜尋字照相關度；欄位缺了不炸", async () => {
    const { impl, calls } = fakeFetch([{ body: {
      items: [
        { id: "D1", title: "十月促銷", thumbnail: { url: "https://t.canva.com/1.png" }, page_count: 3, updated_at: 1760000000 },
        { id: "D2" },
        { title: "沒有 id 的不要" },
      ],
      continuation: "next",
    } }]);
    const page = await listCanvaDesigns("tok", {}, impl);
    expect(page.designs).toEqual([
      { id: "D1", title: "十月促銷", thumbnailUrl: "https://t.canva.com/1.png", pageCount: 3, updatedAt: new Date(1760000000 * 1000).toISOString() },
      { id: "D2", title: "", thumbnailUrl: null, pageCount: 0, updatedAt: null },
    ]);
    expect(page.continuation).toBe("next");
    expect(new URL(calls[0]!.url).searchParams.get("sort_by")).toBe("modified_descending");
    expect(calls[0]!.init.headers.Authorization).toBe("Bearer tok");

    const s = fakeFetch([{ body: { items: [] } }]);
    await listCanvaDesigns("tok", { query: " 促銷 ", continuation: "c1" }, s.impl);
    const qs = new URL(s.calls[0]!.url).searchParams;
    expect(qs.get("query")).toBe("促銷");
    expect(qs.get("sort_by")).toBe("relevance");
    expect(qs.get("continuation")).toBe("c1");
  });

  it("匯出：開工作 → 輪詢到成功 → 回每頁的下載網址（依頁序）", async () => {
    const { impl, calls } = fakeFetch([
      { body: { job: { id: "J1", status: "in_progress" } } },
      { body: { job: { id: "J1", status: "in_progress" } } },
      { body: { job: { id: "J1", status: "success", urls: ["https://export-download.canva.com/a.png", "https://export-download.canva.com/b.png"] } } },
    ]);
    const urls = await exportCanvaDesignPng("tok", { designId: "D1", pages: [1, 2] }, { fetchImpl: impl, pollMs: 1 });
    expect(urls).toEqual(["https://export-download.canva.com/a.png", "https://export-download.canva.com/b.png"]);
    expect(calls[0]!.url).toBe("https://api.canva.com/rest/v1/exports");
    expect(JSON.parse(calls[0]!.init.body)).toEqual({ design_id: "D1", format: { type: "png", export_quality: "regular", pages: [1, 2] } });
    expect(calls[1]!.url).toBe("https://api.canva.com/rest/v1/exports/J1");
    expect(calls).toHaveLength(3);
  });

  it("匯出失敗把 Canva 的錯誤碼原樣帶出（付費素材沒授權要講得出來）", async () => {
    const failed = fakeFetch([{ body: { job: { id: "J", status: "failed", error: { code: "license_required", message: "x" } } } }]);
    await expect(exportCanvaDesignPng("tok", { designId: "D" }, { fetchImpl: failed.impl, pollMs: 1 })).rejects.toMatchObject({ code: "license_required" });
    const http = fakeFetch([{ status: 404, body: { code: "design_not_found", message: "nope" } }]);
    await expect(exportCanvaDesignPng("tok", { designId: "D" }, { fetchImpl: http.impl, pollMs: 1 })).rejects.toMatchObject({ code: "design_not_found", status: 404 });
    const stuck = fakeFetch([{ body: { job: { id: "J", status: "in_progress" } } }]);
    await expect(exportCanvaDesignPng("tok", { designId: "D" }, { fetchImpl: stuck.impl, pollMs: 1, timeoutMs: 20 })).rejects.toMatchObject({ code: "export_timeout" });
  });

  it("下載網址只認 Canva 自己的網域——回應裡混進別的網址要擋掉", async () => {
    expect(isCanvaDownloadUrl("https://export-download.canva.com/x.png?sig=1")).toBe(true);
    expect(isCanvaDownloadUrl("http://export-download.canva.com/x.png")).toBe(false);
    expect(isCanvaDownloadUrl("https://canva.com.evil.test/x.png")).toBe(false);
    expect(isCanvaDownloadUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isCanvaDownloadUrl("not a url")).toBe(false);
    const { impl } = fakeFetch([{ body: { job: { id: "J", status: "success", urls: ["https://evil.test/a.png"] } } }]);
    await expect(exportCanvaDesignPng("tok", { designId: "D" }, { fetchImpl: impl, pollMs: 1 })).rejects.toMatchObject({ code: "export_empty" });
  });

  it("錯誤訊息：認得的錯誤碼各有一句話，不認得的給通用句；中英都有", () => {
    const lic = new CanvaApiError("license_required", "x");
    expect(canvaErrorMessage(lic)).toContain("付費素材");
    expect(canvaErrorMessage(lic, true)).toContain("premium");
    expect(canvaErrorMessage(new Error("boom"))).toBe(canvaErrorMessage(null));
    expect(canvaErrorMessage(null, true)).not.toBe(canvaErrorMessage(null));
  });
});
