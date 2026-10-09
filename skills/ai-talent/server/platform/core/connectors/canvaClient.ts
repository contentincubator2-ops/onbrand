/**
 * canvaClient — Canva Connect API 的薄封裝：授權網址、換 token、列設計、匯出成 PNG。
 *
 * 2026-10-09（CJ「直接導入用戶在 CANVA 做好的圖…用戶就可以圖文一起送給客戶審查」）。
 *
 * 幾條 Canva 自己的規則決定了這支的寫法（皆查自 canva.dev/docs/connect）：
 *   · 授權一定要 PKCE（S256）；client 憑證走 HTTP Basic，只能從後端打。
 *   · refresh token **只能用一次**，每次換新會連 refresh token 一起換——換到的那組要立刻存。
 *   · 匯出是非同步工作：POST /exports 拿 job id，再輪詢到 success／failed。
 *   · 匯出的下載網址 24 小時後失效，所以呼叫端要把位元組抓回來存，不能只記網址。
 *   · 設計清單的縮圖網址 15 分鐘失效——只給當下的挑選視窗用。
 *
 * 這支不碰資料庫、不碰 express；fetch 可注入，測試不必連外。
 */
import crypto from "node:crypto";

export const CANVA_AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize";
export const CANVA_API_BASE = "https://api.canva.com/rest/v1";
/** 列設計、匯出設計、讀顯示名稱——只讀，不要求寫入用戶的 Canva。 */
export const CANVA_SCOPES = "design:meta:read design:content:read profile:read";
/** 開新設計、把 onBrand 的圖送進用戶的 Canva 要多這兩個。 */
export const CANVA_WRITE_SCOPES = ["design:content:write", "asset:write"] as const;

/**
 * 實際要求哪些 scope。Canva 規定 scope 要先在 Developer Portal 勾好，要求一個沒勾的會讓整個
 * 授權失敗——所以寫入類的 scope 不寫死在程式裡，由環境變數 CANVA_SCOPES 決定（integration
 * 勾了才設）。沒設就是只讀三個。
 */
export function canvaScopes(env: string | undefined | null = process.env.CANVA_SCOPES): string {
  const cleaned = String(env ?? "").split(/[\s,]+/).filter((x) => /^[a-z_]+(:[a-z_]+)+$/.test(x));
  return cleaned.length ? [...new Set(cleaned)].join(" ") : CANVA_SCOPES;
}

/** 這組設定能不能替用戶在 Canva 開新設計、送圖進去。 */
export function canvaCanWrite(env: string | undefined | null = process.env.CANVA_SCOPES): boolean {
  const have = new Set(canvaScopes(env).split(" "));
  return CANVA_WRITE_SCOPES.every((x) => have.has(x));
}

type FetchLike = typeof fetch;

export interface CanvaCredentials { clientId: string; clientSecret: string }

export interface CanvaTokens {
  access: string;
  refresh: string;
  expiresAt: number; // epoch ms
}

export interface CanvaDesign {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  pageCount: number;
  updatedAt: string | null;
}

/** Canva 回的錯誤碼原樣帶出來，由呼叫端決定對用戶怎麼說。 */
export class CanvaApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 0) {
    super(message);
    this.name = "CanvaApiError";
  }
}

// ── PKCE ─────────────────────────────────────────────────────────────────────

export function newCodeVerifier(): string {
  return crypto.randomBytes(64).toString("base64url"); // 86 字元，落在規定的 43–128 內
}

export function codeChallengeOf(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthorizeUrl(args: { clientId: string; redirectUri: string; state: string; codeVerifier: string; scopes?: string }): string {
  const url = new URL(CANVA_AUTHORIZE_URL);
  url.searchParams.set("code_challenge", codeChallengeOf(args.codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", args.scopes ?? canvaScopes());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("state", args.state);
  url.searchParams.set("redirect_uri", args.redirectUri);
  return url.toString();
}

// ── Token ────────────────────────────────────────────────────────────────────

async function tokenRequest(creds: CanvaCredentials, body: Record<string, string>, fetchImpl: FetchLike): Promise<CanvaTokens> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const resp = await fetchImpl(`${CANVA_API_BASE}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok || !data?.access_token || !data?.refresh_token) {
    throw new CanvaApiError(String(data?.code ?? data?.error ?? "token_error"), `Canva token HTTP ${resp.status}`, resp.status);
  }
  return {
    access: String(data.access_token),
    refresh: String(data.refresh_token),
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000,
  };
}

export function exchangeCanvaCode(
  creds: CanvaCredentials, args: { code: string; codeVerifier: string; redirectUri: string }, fetchImpl: FetchLike = fetch,
): Promise<CanvaTokens> {
  return tokenRequest(creds, {
    grant_type: "authorization_code", code: args.code, code_verifier: args.codeVerifier, redirect_uri: args.redirectUri,
  }, fetchImpl);
}

export function refreshCanvaToken(creds: CanvaCredentials, refreshToken: string, fetchImpl: FetchLike = fetch): Promise<CanvaTokens> {
  return tokenRequest(creds, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}

// ── API ──────────────────────────────────────────────────────────────────────

async function api(accessToken: string, path: string, init: RequestInit, fetchImpl: FetchLike): Promise<any> {
  const resp = await fetchImpl(`${CANVA_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const data: any = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new CanvaApiError(String(data?.code ?? `http_${resp.status}`), String(data?.message ?? `Canva HTTP ${resp.status}`), resp.status);
  }
  return data;
}

/** 連接後顯示「已連接：某某」用；拿不到不算錯。 */
export async function getCanvaDisplayName(accessToken: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  try {
    const data = await api(accessToken, "/users/me/profile", { method: "GET" }, fetchImpl);
    const name = data?.profile?.display_name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch { return null; }
}

export async function listCanvaDesigns(
  accessToken: string, args: { query?: string; continuation?: string; limit?: number } = {}, fetchImpl: FetchLike = fetch,
): Promise<{ designs: CanvaDesign[]; continuation: string | null }> {
  const qs = new URLSearchParams();
  const query = (args.query ?? "").trim();
  if (query) qs.set("query", query.slice(0, 255));
  // 有搜尋字就照相關度，沒有就最近改過的排前面（用戶通常是剛做完來匯入）。
  qs.set("sort_by", query ? "relevance" : "modified_descending");
  qs.set("limit", String(Math.min(50, Math.max(1, args.limit ?? 24))));
  if (args.continuation) qs.set("continuation", args.continuation);
  const data = await api(accessToken, `/designs?${qs.toString()}`, { method: "GET" }, fetchImpl);
  const designs: CanvaDesign[] = (Array.isArray(data?.items) ? data.items : [])
    .filter((d: any) => d && typeof d.id === "string")
    .map((d: any) => ({
      id: d.id,
      title: typeof d.title === "string" ? d.title : "",
      thumbnailUrl: typeof d.thumbnail?.url === "string" ? d.thumbnail.url : null,
      pageCount: Math.max(0, Math.trunc(Number(d.page_count) || 0)),
      updatedAt: Number(d.updated_at) > 0 ? new Date(Number(d.updated_at) * 1000).toISOString() : null,
    }));
  return { designs, continuation: typeof data?.continuation === "string" ? data.continuation : null };
}

/**
 * 把一份設計匯出成 PNG，回每一頁的下載網址（依頁序）。
 *
 * 用 regular 品質：pro 品質在用戶沒買到設計裡的付費素材時會失敗，而審稿用的圖不需要它。
 * 即使如此，設計裡有未授權的付費素材仍可能回 license_required——原樣丟出去讓呼叫端講清楚。
 */
export async function exportCanvaDesignPng(
  accessToken: string,
  args: { designId: string; pages?: number[] },
  opts: { fetchImpl?: FetchLike; pollMs?: number; timeoutMs?: number } = {},
): Promise<string[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const pollMs = opts.pollMs ?? 1500;
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000);

  const format: Record<string, unknown> = { type: "png", export_quality: "regular" };
  if (args.pages?.length) format.pages = args.pages;
  let job: any = (await api(accessToken, "/exports", {
    method: "POST", body: JSON.stringify({ design_id: args.designId, format }),
  }, fetchImpl))?.job;

  while (job?.status === "in_progress") {
    if (Date.now() > deadline) throw new CanvaApiError("export_timeout", "Canva export timed out");
    await new Promise((r) => setTimeout(r, pollMs));
    job = (await api(accessToken, `/exports/${encodeURIComponent(String(job.id))}`, { method: "GET" }, fetchImpl))?.job;
  }
  if (job?.status !== "success") {
    throw new CanvaApiError(String(job?.error?.code ?? "export_failed"), String(job?.error?.message ?? "Canva export failed"));
  }
  const urls = (Array.isArray(job.urls) ? job.urls : []).filter((u: unknown): u is string => typeof u === "string" && isCanvaDownloadUrl(u));
  if (urls.length === 0) throw new CanvaApiError("export_empty", "Canva export returned no files");
  return urls;
}

// ── 在 Canva 編輯（來回）────────────────────────────────────────────────────

export interface CanvaDesignDetail {
  id: string;
  title: string;
  /** 只有發出這個請求的那位用戶打得開，30 天有效——要用的時候才拿，不要存。 */
  editUrl: string;
  /** Canva 那邊最後一次修改（epoch 秒）。用來判斷「回來之後到底有沒有改」。 */
  updatedAt: number;
  pageCount: number;
}

function toDetail(d: any): CanvaDesignDetail {
  const editUrl = typeof d?.urls?.edit_url === "string" ? d.urls.edit_url : "";
  if (!d || typeof d.id !== "string" || !isCanvaDownloadUrl(editUrl)) {
    throw new CanvaApiError("design_unusable", "Canva returned a design without a usable edit link");
  }
  return {
    id: d.id, title: typeof d.title === "string" ? d.title : "", editUrl,
    updatedAt: Math.max(0, Math.trunc(Number(d.updated_at) || 0)),
    pageCount: Math.max(0, Math.trunc(Number(d.page_count) || 0)),
  };
}

export async function getCanvaDesign(accessToken: string, designId: string, fetchImpl: FetchLike = fetch): Promise<CanvaDesignDetail> {
  const data = await api(accessToken, `/designs/${encodeURIComponent(designId)}`, { method: "GET" }, fetchImpl);
  return toDetail(data?.design);
}

/** Canva 自訂尺寸的規定：每邊 40–8000px，面積不超過 2,500 萬。超出就等比縮進去。 */
export function clampCanvaSize(width: number, height: number): { width: number; height: number } {
  let w = Math.max(40, Math.round(Number(width) || 1080));
  let h = Math.max(40, Math.round(Number(height) || 1080));
  const k = Math.min(1, 8000 / w, 8000 / h, Math.sqrt(25_000_000 / (w * h)));
  if (k < 1) { w = Math.max(40, Math.floor(w * k)); h = Math.max(40, Math.floor(h * k)); }
  return { width: w, height: h };
}

/**
 * 開一張新設計（需要 design:content:write）。帶 assetId 就把那張圖放進去——是一整張平面圖，
 * 用戶可以移動、縮放、在上面加字。空白設計 7 天沒編輯 Canva 會自己刪掉。
 */
export async function createCanvaDesign(
  accessToken: string, args: { width: number; height: number; title?: string; assetId?: string }, fetchImpl: FetchLike = fetch,
): Promise<CanvaDesignDetail> {
  const title = (args.title ?? "").trim().slice(0, 255);
  const data = await api(accessToken, "/designs", {
    method: "POST",
    body: JSON.stringify({
      design_type: { type: "custom", ...clampCanvaSize(args.width, args.height) },
      ...(args.assetId ? { asset_id: args.assetId } : {}),
      ...(title ? { title } : {}),
    }),
  }, fetchImpl);
  return toDetail(data?.design);
}

/** 把一張圖送進用戶的 Canva 素材（需要 asset:write），回 asset id。 */
export async function uploadCanvaAsset(
  accessToken: string, args: { bytes: Buffer; name: string },
  opts: { fetchImpl?: FetchLike; pollMs?: number; timeoutMs?: number } = {},
): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const deadline = Date.now() + (opts.timeoutMs ?? 60_000);
  // 名稱上限 50 個字元（Canva 規定）；用陣列切才不會把一個中文字或 emoji 切成兩半。
  const name = Array.from((args.name || "onBrand").trim() || "onBrand").slice(0, 50).join("");
  let job: any = (await api(accessToken, "/asset-uploads", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Asset-Upload-Metadata": JSON.stringify({ name_base64: Buffer.from(name, "utf8").toString("base64") }),
    },
    body: args.bytes as any,
  }, fetchImpl))?.job;
  while (job?.status === "in_progress") {
    if (Date.now() > deadline) throw new CanvaApiError("upload_timeout", "Canva asset upload timed out");
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 1200));
    job = (await api(accessToken, `/asset-uploads/${encodeURIComponent(String(job.id))}`, { method: "GET" }, fetchImpl))?.job;
  }
  const id = job?.asset?.id;
  if (job?.status !== "success" || typeof id !== "string") {
    throw new CanvaApiError(String(job?.error?.code ?? "upload_failed"), String(job?.error?.message ?? "Canva asset upload failed"));
  }
  return id;
}

/**
 * 編輯連結加上 correlation_state：用戶在 Canva 按「返回」時，Canva 會把它放進簽過名的 JWT
 * 帶回我們的返回網址。規定 50 個字元以內、網址安全——所以只放一把鑰匙，內容存在我們的資料庫。
 */
export function withCorrelationState(editUrl: string, state: string): string {
  if (!/^[A-Za-z0-9_-]{1,50}$/.test(state)) throw new Error("correlation_state must be 1-50 url-safe characters");
  const url = new URL(editUrl);
  url.searchParams.set("correlation_state", state);
  return url.toString();
}

/** 匯出檔只從 Canva 自己的網域抓——回應裡的網址不是我們產的，不能照單全收。 */
export function isCanvaDownloadUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "canva.com" || u.hostname.endsWith(".canva.com"));
  } catch { return false; }
}

/** Canva 的錯誤碼 → 給用戶看的一句話。 */
export function canvaErrorMessage(e: unknown, en = false): string {
  const code = e instanceof CanvaApiError ? e.code : "";
  switch (code) {
    case "license_required":
      return en
        ? "This design uses premium Canva elements that aren't licensed yet. Purchase or replace them in Canva, then import again."
        : "這份設計用了還沒授權的 Canva 付費素材。請先在 Canva 購買或換掉那些素材，再匯入一次。";
    case "approval_required":
      return en ? "This design needs approval inside your Canva team before it can be exported." : "這份設計要先在你的 Canva 團隊內通過審核，才能匯出。";
    case "design_not_found":
    case "permission_denied":
      return en ? "Canva can't find this design, or this account can't open it." : "Canva 找不到這份設計，或這個帳號沒有開啟它的權限。";
    case "too_many_requests":
      return en ? "Too many exports from Canva just now. Wait a minute and try again." : "Canva 這一分鐘匯出太多次了，等一下再試。";
    case "file_too_big":
      return en ? "This image is too large for Canva." : "這張圖太大，Canva 收不下。";
    case "upload_timeout":
    case "upload_failed":
    case "import_failed":
      return en ? "Couldn't send the image to Canva. Try again." : "圖片沒有成功送進 Canva，請再試一次。";
    case "missing_scope":
      return en
        ? "Canva needs a fresh permission for this. Disconnect Canva and connect again."
        : "這個動作需要 Canva 多一項授權。請先中斷 Canva 連接，再重新連接一次。";
    case "write_not_enabled":
      return en
        ? "This image didn't come from Canva, so there's no design to open. Import a design from Canva first."
        : "這張圖不是從 Canva 匯入的，沒有對應的設計可以開。請先從 Canva 匯入一份設計。";
    case "session_not_found":
      return en ? "This Canva editing session wasn't found. Start again from the post." : "找不到這次的 Canva 編輯，請回到貼文重新開始。";
    case "output_not_found":
      return en ? "This post wasn't found." : "找不到這一篇貼文。";
    case "store_failed":
      return e instanceof CanvaApiError && e.message ? e.message : (en ? "Couldn't save the image." : "圖片沒有存成功。");
    case "export_timeout":
      return en ? "Canva took too long to export. Try again." : "Canva 匯出太久沒有回應，請再試一次。";
    default:
      return en ? "Couldn't import from Canva. Try again." : "從 Canva 匯入沒有成功，請再試一次。";
  }
}
