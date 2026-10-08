/**
 * fbPageSync — 粉專貼文成效回填（成效層第一個真實資料來源）。
 *
 * 2026-09-29（CJ「也可以單純看粉絲團的報告」）。
 *
 * 用的是發布時早就拿到的授權：Pipedream 管的 FB user token → 經 Connect Proxy 列出
 * 粉專並取 Page token（跟 publishRouter.importFbPostsForDNA 同一條路）→ 直接打 Graph。
 * 不需要用戶再授權一次。
 *
 * 每篇貼文存成一筆事實（date＝發文日，數字是 lifetime），每次同步覆蓋 → 數字會長大。
 *
 * ── Graph 指標會被 Meta 淘汰 ─────────────────────────────────────────────
 * 2025 年底 Meta 把 impressions 系列指標換成 views 系列。這裡不綁死名稱：每個標準指標
 * 列一串候選，打一次 insights，錯誤訊息點名哪個不合法就拿掉那個再打，直到成功。
 * 反應／留言／分享用貼文欄位的 summary（這三個不會被淘汰），所以最差也有互動數。
 *
 * ── 標籤 ────────────────────────────────────────────────────────────────
 * 從 OnBrand 發出去的貼文，scheduled_posts.externalPostId 對得回 mission_outputs，
 * 產出時打的 perfTags 直接帶進來；其他貼文先只有 format，其餘靠補標規則或 AI 補標。
 */
import localPool from "../../localDb";
import { buildPipedreamAccountsUrl } from "../../platform/core/connectors/pipedreamConnect";
import { getPipedreamAccounts, getPipedreamAppSlug, prioritizePipedreamAccounts } from "../../platform/core/connectors/pipedreamAccounts";
import { findPipedreamFacebookPage, probePipedreamFacebookAccounts } from "../../platform/core/connectors/pipedreamFacebook";
import { upsertFacts, type FactInput } from "./perfStore";
import { isRuntimeFeatureEnabled } from "../../platform/core/ops/runtimeSafety";
import { getPublishProvider } from "../../platform/core/connectors/publish/publishProvider";

const GRAPH = "https://graph.facebook.com/v25.0";

export class FbSyncError extends Error {
  constructor(public code: "not_connected" | "no_auth" | "no_page_access" | "graph_error" | "disabled", message: string) { super(message); }
}

/** 跟 publishRouter.socialProcedure 同一個開關：dev 關掉社群連接，這裡也不去打 Pipedream／Graph。 */
export function fbSyncEnabled(): boolean {
  return getPublishProvider("facebook") !== "zernio" && isRuntimeFeatureEnabled("SOCIAL_PUBLISH_ENABLED");
}

/** 標準指標 ← Graph insights 候選名稱（依偏好排序）。 */
export const INSIGHT_CANDIDATES: Record<string, string[]> = {
  reach: ["post_total_media_view_unique", "post_impressions_unique"],
  impressions: ["post_media_view", "post_impressions"],
  clicks: ["post_clicks"],
};

export async function resolvePage(brandId: number): Promise<{ pageId: string; pageName: string | null } | null> {
  const [rows]: any = await localPool.execute(`SELECT fbPageId, fbPageName FROM brands WHERE id = ? LIMIT 1`, [brandId]);
  const b = (rows as any[])[0];
  if (b?.fbPageId) return { pageId: String(b.fbPageId), pageName: b.fbPageName ?? null };
  try {
    const [ir]: any = await localPool.execute(
      `SELECT selectedResourceId FROM brand_integrations
        WHERE brandId = ? AND integrationType = 'facebook_pages' AND status = 'connected' AND selectedResourceId IS NOT NULL
        ORDER BY id DESC LIMIT 1`, [brandId],
    );
    const r = (ir as any[])[0];
    if (r?.selectedResourceId) return { pageId: String(r.selectedResourceId), pageName: null };
  } catch { /* table missing on some envs */ }
  return null;
}

async function pageToken(brandId: number, pageId: string): Promise<string> {
  const clientId = process.env.PIPEDREAM_CLIENT_ID;
  const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET;
  const projectId = process.env.PIPEDREAM_PROJECT_ID;
  const pdEnv = process.env.PIPEDREAM_PROJECT_ENV ?? "production";
  if (!clientId || !clientSecret || !projectId) throw new FbSyncError("no_auth", "Facebook 授權服務尚未啟用。");
  const PD = "https://api.pipedream.com/v1";
  const tk = await fetch(`${PD}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tk.ok) throw new FbSyncError("no_auth", "Pipedream token 失敗");
  const { access_token } = (await tk.json()) as { access_token: string };
  const headers = { Authorization: `Bearer ${access_token}`, "X-PD-Environment": pdEnv, "x-pd-project-id": projectId };
  const externalUserId = `sowork-brand-${brandId}`;
  const accRes = await fetch(buildPipedreamAccountsUrl(PD, projectId, externalUserId), { headers, signal: AbortSignal.timeout(15_000) });
  if (!accRes.ok) throw new FbSyncError("no_auth", "無法取得 Pipedream 帳號");
  const FB = new Set(["facebook_pages", "facebook", "facebook_oauth2"]);
  const accounts = prioritizePipedreamAccounts(
    getPipedreamAccounts(await accRes.json()).filter((a) => { const s = getPipedreamAppSlug(a.app); return s ? FB.has(s) : false; }),
  );
  if (!accounts.length) throw new FbSyncError("no_auth", "找不到 Facebook 授權，請重新連接粉專。");
  const probes = await probePipedreamFacebookAccounts({ apiBase: PD, projectId, externalUserId, headers, accounts, fields: ["access_token"] });
  const page = findPipedreamFacebookPage(probes, pageId)?.page;
  if (!page?.access_token) throw new FbSyncError("no_page_access", `找不到粉專 ${pageId} 的存取權限，請確認授權帳號是粉專管理員。`);
  return page.access_token;
}

async function graph(path: string, token: string): Promise<any> {
  const url = `${GRAPH}/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) {
    const msg = String(body?.error?.message ?? `HTTP ${res.status}`);
    const err = new FbSyncError("graph_error", msg);
    throw err;
  }
  return body;
}

/** 從錯誤訊息找出被點名的不合法指標；找不到就回 null。 */
export function invalidMetricFrom(message: string, tried: string[]): string | null {
  for (const m of tried) if (message.includes(m)) return m;
  return null;
}

export function formatOf(post: any): string {
  const att = post?.attachments?.data?.[0];
  const mt = String(att?.media_type ?? "").toLowerCase();
  const url = String(post?.permalink_url ?? "");
  if (url.includes("/reel/")) return "reel";
  if (mt === "photo") return "photo";
  if (mt === "album") return "album";
  if (mt === "video" || String(post?.status_type ?? "") === "added_video") return "video";
  if (mt === "link" || mt === "share") return "link";
  if (mt === "event") return "event";
  if (!att) return "status";
  return "other";
}

/** 台灣時區的發文日期（YYYY-MM-DD）。 */
export function taipeiDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

async function fetchInsights(ids: string[], token: string, metrics: string[]): Promise<{ data: Record<string, Record<string, number>>; metrics: string[] }> {
  let live = [...metrics];
  for (let attempt = 0; attempt < metrics.length + 1 && live.length; attempt++) {
    try {
      const body = await graph(`?ids=${ids.join(",")}&fields=insights.metric(${live.join(",")})`, token);
      const out: Record<string, Record<string, number>> = {};
      for (const id of ids) {
        const rows = body?.[id]?.insights?.data ?? [];
        const m: Record<string, number> = {};
        for (const r of rows) {
          const v = r?.values?.[0]?.value;
          if (typeof v === "number") m[r.name] = v;
        }
        out[id] = m;
      }
      return { data: out, metrics: live };
    } catch (e) {
      const bad = invalidMetricFrom((e as Error).message, live);
      if (!bad) break;
      live = live.filter((x) => x !== bad);
    }
  }
  return { data: {}, metrics: [] };
}

export interface FbSyncResult { pageId: string; pageName: string | null; posts: number; metricsUsed: string[]; tagged: number }

export async function syncFbPage(brandId: number, days = 120): Promise<FbSyncResult> {
  if (!fbSyncEnabled()) throw new FbSyncError("disabled", "此環境已停用社群連接，粉專成效只在正式站同步。");
  const page = await resolvePage(brandId);
  if (!page) throw new FbSyncError("not_connected", "此品牌尚未連結 Facebook 粉專。");
  const token = await pageToken(brandId, page.pageId);

  const since = Math.floor((Date.now() - days * 86400_000) / 1000);
  const fields = "id,message,created_time,permalink_url,status_type,attachments{media_type},shares,comments.summary(true).limit(0),reactions.summary(true).limit(0)";
  const posts: any[] = [];
  let next: string | null = `${page.pageId}/posts?fields=${fields}&since=${since}&limit=100`;
  for (let i = 0; next && i < 10; i++) {
    const body = await graph(next, token);
    posts.push(...(body?.data ?? []));
    const n = body?.paging?.next as string | undefined;
    next = n ? n.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, "").replace(/&access_token=[^&]+/, "") : null;
  }

  // insights：每 50 篇一批；第一批決定哪些指標名稱還活著，之後沿用。
  let metricPool = Object.values(INSIGHT_CANDIDATES).flat();
  const insights: Record<string, Record<string, number>> = {};
  for (let i = 0; i < posts.length; i += 50) {
    const ids = posts.slice(i, i + 50).map((p) => p.id);
    const r = await fetchInsights(ids, token, metricPool);
    Object.assign(insights, r.data);
    if (r.metrics.length) metricPool = r.metrics;
  }

  // OnBrand 發出去的貼文 → 產出時的 perfTags
  const tagsByPost: Record<string, Record<string, string>> = {};
  const ownIds = new Set<string>();
  try {
    const [rows]: any = await localPool.execute(
      `SELECT sp.externalPostId, mo.metadata
         FROM scheduled_posts sp JOIN mission_outputs mo ON mo.id = sp.outputId
        WHERE sp.brandId = ? AND sp.externalPostId IS NOT NULL`, [brandId],
    );
    for (const r of rows as any[]) ownIds.add(String(r.externalPostId));
    for (const r of rows as any[]) {
      const meta = typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata;
      const t = meta?.perfTags;
      if (t && typeof t === "object") tagsByPost[String(r.externalPostId)] = t;
    }
  } catch { /* 沒有這些表就算了 */ }

  let tagged = 0;
  const facts: FactInput[] = posts.map((p) => {
    const ins = insights[p.id] ?? {};
    const pick = (key: string) => {
      for (const name of INSIGHT_CANDIDATES[key] ?? []) if (typeof ins[name] === "number") return ins[name];
      return undefined;
    };
    const reactions = Number(p?.reactions?.summary?.total_count ?? 0);
    const comments = Number(p?.comments?.summary?.total_count ?? 0);
    const shares = Number(p?.shares?.count ?? 0);
    const metrics: Record<string, number> = { reactions, comments, shares, engagement: reactions + comments + shares };
    for (const k of Object.keys(INSIGHT_CANDIDATES)) { const v = pick(k); if (v != null) metrics[k] = v; }
    const suffix = String(p.id).split("_").pop()!;
    const own = tagsByPost[p.id] ?? tagsByPost[suffix] ?? {};
    const origin = ownIds.has(String(p.id)) || ownIds.has(suffix) ? "onbrand" : "external";
    if (Object.keys(own).length) tagged++;
    const msg = String(p.message ?? "");
    return {
      source: "fb_page", entityType: "post", entityId: String(p.id),
      entityLabel: msg.replace(/\s+/g, " ").slice(0, 60) || "(無文字貼文)",
      text: msg, date: taipeiDate(p.created_time), permalink: p.permalink_url ?? null,
      tags: { ...own, format: formatOf(p), origin }, metrics,
    };
  });
  await upsertFacts(brandId, facts);
  return { pageId: page.pageId, pageName: page.pageName, posts: facts.length, metricsUsed: metricPool, tagged };
}

/**
 * 每日回填 worker：一拍只同步一個品牌（最久沒同步的那個），且只挑「有在用成效層」的品牌
 * —— 建過至少一個視角、而且有連粉專。沒在用的品牌不去打 Graph。
 */
export async function tickFbPageSync(): Promise<void> {
  if (!fbSyncEnabled()) return;
  const [rows]: any = await localPool.execute(
    `SELECT b.id AS brandId, MAX(f.updatedAt) AS lastSync
       FROM brands b
       JOIN (SELECT DISTINCT brandId FROM perf_lenses) l ON l.brandId = b.id
       LEFT JOIN perf_facts f ON f.brandId = b.id AND f.source = 'fb_page'
      WHERE b.fbPageId IS NOT NULL AND b.fbPageId <> ''
      GROUP BY b.id
     HAVING lastSync IS NULL OR lastSync < NOW() - INTERVAL 20 HOUR
      ORDER BY lastSync IS NOT NULL, lastSync
      LIMIT 1`,
  );
  const pick = (rows as any[])[0];
  if (!pick) return;
  try {
    const r = await syncFbPage(Number(pick.brandId), 120);
    console.log(`[fbPageSync] brand ${pick.brandId}: ${r.posts} posts, metrics=${r.metricsUsed.join(",") || "(none)"}`);
  } catch (e) {
    console.warn(`[fbPageSync] brand ${pick.brandId} failed:`, (e as Error)?.message);
  }
}
