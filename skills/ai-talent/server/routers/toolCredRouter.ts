/**
 * toolCredRouter — Phase 2A Ext Batch 2-1.
 *
 * Per-brand credentials for third-party marketing tools. Payload encrypted at
 * rest via _core/encryption.ts (AES-256-GCM, key from ENCRYPTION_KEY env).
 *
 * Principles:
 *   - We NEVER return the decrypted payload to the client. UI receives only a
 *     masked view (e.g. api_key → "abc1****wxyz", password → "********").
 *   - Decryption happens only inside the server when an agent actually needs
 *     to call the tool (see loadToolCredential() — internal use only).
 *   - Browser-automation tools (username_password) require the user to accept
 *     a ToS-risk disclaimer before we store credentials (termsAcceptedAt).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { encrypt, decrypt } from "../_core/encryption";
import { getBrowserProvider, currentProviderName } from "../_core/browser";

// ─── Tool catalog ───────────────────────────────────────────────────────────
// Declared here so the router, the UI, and future agents share one source of
// truth. Extend this list when onboarding new tools.

type ToolCategory = "seo" | "audience" | "social_listening" | "social_api" | "search_api";
type AuthType = "api_key" | "username_password" | "oauth_token";
type TierLabel = "free_public" | "user_api_key" | "user_browser";

interface ToolSpec {
  slug: string;              // canonical id, used as `tool` column
  label: string;             // zh-TW display name
  category: ToolCategory;
  authType: AuthType;
  tier: TierLabel;
  docsUrl?: string;
  fields: Array<{
    key: string;             // payload key, also used as form field name
    label: string;
    placeholder?: string;
    secret: boolean;         // true = mask in getAll response
    required: boolean;
  }>;
  requiresTerms: boolean;    // true = show ToS disclaimer before save
  notes?: string;
}

export const TOOL_CATALOG: ToolSpec[] = [
  // Tier: user-supplied API keys (preferred path — legal, stable)
  {
    slug: "ahrefs", label: "Ahrefs", category: "seo",
    authType: "api_key", tier: "user_api_key",
    docsUrl: "https://ahrefs.com/api",
    fields: [{ key: "apiKey", label: "API Token", secret: true, required: true }],
    requiresTerms: false,
  },
  {
    slug: "similarweb", label: "Similarweb", category: "seo",
    authType: "api_key", tier: "user_api_key",
    docsUrl: "https://developers.similarweb.com/",
    fields: [{ key: "apiKey", label: "API Key", secret: true, required: true }],
    requiresTerms: false,
  },
  {
    slug: "semrush", label: "SEMrush", category: "seo",
    authType: "api_key", tier: "user_api_key",
    docsUrl: "https://www.semrush.com/api-documentation/",
    fields: [{ key: "apiKey", label: "API Key", secret: true, required: true }],
    requiresTerms: false,
  },
  {
    slug: "youtube_data", label: "YouTube Data API", category: "social_api",
    authType: "api_key", tier: "user_api_key",
    docsUrl: "https://developers.google.com/youtube/v3",
    fields: [{ key: "apiKey", label: "API Key", secret: true, required: true }],
    requiresTerms: false,
  },
  {
    slug: "reddit", label: "Reddit", category: "social_api",
    authType: "oauth_token", tier: "user_api_key",
    docsUrl: "https://www.reddit.com/dev/api",
    fields: [
      { key: "clientId", label: "Client ID", secret: false, required: true },
      { key: "clientSecret", label: "Client Secret", secret: true, required: true },
    ],
    requiresTerms: false,
  },

  // Tier: free / public (no credential but listed so UI can surface status)
  // We still store a row when user "enables" so we can disable per-brand.
  {
    slug: "google_trends", label: "Google Trends", category: "search_api",
    authType: "api_key", tier: "free_public",
    fields: [],
    requiresTerms: false,
    notes: "免費公開資料，無需憑證",
  },
  {
    slug: "google_news", label: "Google News RSS", category: "search_api",
    authType: "api_key", tier: "free_public",
    fields: [],
    requiresTerms: false,
    notes: "免費公開資料，無需憑證",
  },

  // Tier: browser-automation (ToS-risk — requires disclaimer)
  {
    slug: "opview", label: "OpView 意藍", category: "social_listening",
    authType: "username_password", tier: "user_browser",
    docsUrl: "https://www.opview.com.tw/",
    fields: [
      { key: "username", label: "帳號", secret: false, required: true },
      { key: "password", label: "密碼", secret: true, required: true },
      { key: "totpSecret", label: "TOTP Secret（若啟用 2FA）", secret: true, required: false },
    ],
    requiresTerms: true,
    notes: "虛擬瀏覽器代操登入抓資料。使用條款禁止自動化存取，帳號可能被鎖定，需同意免責條款。",
  },
  {
    slug: "meltwater", label: "Meltwater", category: "social_listening",
    authType: "username_password", tier: "user_browser",
    docsUrl: "https://www.meltwater.com/",
    fields: [
      { key: "username", label: "帳號", secret: false, required: true },
      { key: "password", label: "密碼", secret: true, required: true },
      { key: "totpSecret", label: "TOTP Secret（若啟用 2FA）", secret: true, required: false },
    ],
    requiresTerms: true,
    notes: "虛擬瀏覽器代操。ToS 禁止自動化，帳號可能被封，需簽免責。",
  },
  {
    slug: "gwi", label: "GlobalWebIndex (GWI)", category: "audience",
    authType: "username_password", tier: "user_browser",
    docsUrl: "https://www.gwi.com/",
    fields: [
      { key: "username", label: "帳號", secret: false, required: true },
      { key: "password", label: "密碼", secret: true, required: true },
      { key: "totpSecret", label: "TOTP Secret（若啟用 2FA）", secret: true, required: false },
    ],
    requiresTerms: true,
    notes: "虛擬瀏覽器代操。ToS 禁止自動化，帳號可能被封，需簽免責。",
  },
];

export function getToolSpec(slug: string): ToolSpec | null {
  return TOOL_CATALOG.find((t) => t.slug === slug) ?? null;
}

// ─── Mask helpers ───────────────────────────────────────────────────────────
function maskValue(v: string, kind: "secret" | "plain"): string {
  if (!v) return "";
  if (kind === "plain") return v;
  // secret: show first 2 + last 2, mask middle, fixed-length readout
  if (v.length <= 6) return "****";
  return `${v.slice(0, 2)}${"*".repeat(Math.max(4, v.length - 4))}${v.slice(-2)}`;
}

// ─── Auth / ownership ──────────────────────────────────────────────────────
async function assertBrandOwner(userId: number, brandId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const { brands } = await import("../../drizzle/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, brandId), eq(brands.userId, userId)))
    .limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found or not owned" });
}

// ─── Internal: load decrypted payload (server-side agent use only) ─────────
// Do NOT expose this via tRPC. Agents import this function directly.
export async function loadToolCredential(
  brandId: number,
  tool: string
): Promise<{ authType: AuthType; payload: Record<string, string>; status: string } | null> {
  const db = await getDb();
  if (!db) return null;
  const [rows] = (await db.execute(sql`
    SELECT authType, encryptedPayload, status
    FROM brand_tool_credentials
    WHERE brandId = ${brandId} AND tool = ${tool}
    LIMIT 1
  `)) as any;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !row.encryptedPayload) return null;
  try {
    const plain = JSON.parse(decrypt(String(row.encryptedPayload)));
    return { authType: row.authType, payload: plain, status: row.status };
  } catch (e: any) {
    console.error(`[toolCred.load] decrypt failed for brand=${brandId} tool=${tool}:`, e?.message);
    return null;
  }
}

// ─── Router ────────────────────────────────────────────────────────────────
export const toolCredRouter = router({
  // Client-facing tool catalog (no secrets, safe to ship to browser).
  catalog: protectedProcedure.query(async () => {
    return TOOL_CATALOG.map((t) => ({
      slug: t.slug,
      label: t.label,
      category: t.category,
      authType: t.authType,
      tier: t.tier,
      docsUrl: t.docsUrl,
      requiresTerms: t.requiresTerms,
      notes: t.notes,
      fields: t.fields.map((f) => ({ key: f.key, label: f.label, secret: f.secret, required: f.required })),
    }));
  }),

  // List all credentials for a brand with masked values.
  listByBrand: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) return [];
      const [rows] = (await db.execute(sql`
        SELECT id, tool, authType, encryptedPayload, status,
               lastTestedAt, lastError, termsAcceptedAt, updatedAt
        FROM brand_tool_credentials
        WHERE brandId = ${input.brandId}
        ORDER BY updatedAt DESC
      `)) as any;
      const out: any[] = [];
      for (const row of ((rows as any[]) ?? [])) {
        const spec = getToolSpec(row.tool);
        let maskedFields: Record<string, string> = {};
        try {
          const plain = JSON.parse(decrypt(String(row.encryptedPayload ?? "")));
          for (const f of spec?.fields ?? []) {
            const v = plain?.[f.key];
            if (v == null) continue;
            maskedFields[f.key] = maskValue(String(v), f.secret ? "secret" : "plain");
          }
        } catch {
          // unreadable — row still shown but with empty fields (possibly key rotated)
        }
        out.push({
          id: row.id,
          tool: row.tool,
          label: spec?.label ?? row.tool,
          category: spec?.category,
          tier: spec?.tier,
          authType: row.authType,
          status: row.status,
          lastTestedAt: row.lastTestedAt,
          lastError: row.lastError,
          termsAcceptedAt: row.termsAcceptedAt,
          updatedAt: row.updatedAt,
          maskedFields,
        });
      }
      return out;
    }),

  // Upsert a credential. Payload is encrypted before it hits disk.
  upsert: protectedProcedure
    .input(
      z.object({
        brandId: z.number(),
        tool: z.string().min(1).max(64),
        payload: z.record(z.string(), z.string().max(2000)),
        acceptTerms: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const spec = getToolSpec(input.tool);
      if (!spec) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown tool: ${input.tool}` });

      // Free tools don't store secrets but still create a row to mark enabled.
      if (spec.tier !== "free_public") {
        for (const f of spec.fields) {
          if (f.required && !(input.payload[f.key] ?? "").trim()) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `${spec.label}: 必填欄位「${f.label}」未填寫`,
            });
          }
        }
      }
      if (spec.requiresTerms && !input.acceptTerms) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${spec.label} 屬於虛擬瀏覽器代操，必須勾選免責條款才能啟用`,
        });
      }

      // Drop any keys not in spec to avoid storing stray data
      const allowedKeys = new Set(spec.fields.map((f) => f.key));
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(input.payload)) {
        if (allowedKeys.has(k) && typeof v === "string") clean[k] = v;
      }

      const encrypted = encrypt(JSON.stringify(clean));
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const termsClause = spec.requiresTerms
        ? sql`, termsAcceptedAt = NOW(3)`
        : sql``;
      const insertTerms = spec.requiresTerms ? sql`NOW(3)` : sql`NULL`;

      await db.execute(sql`
        INSERT INTO brand_tool_credentials
          (brandId, userId, tool, authType, encryptedPayload, status, termsAcceptedAt)
        VALUES
          (${input.brandId}, ${ctx.user.id}, ${input.tool}, ${spec.authType},
           ${encrypted}, 'pending', ${insertTerms})
        ON DUPLICATE KEY UPDATE
          authType = ${spec.authType},
          encryptedPayload = ${encrypted},
          status = 'pending',
          lastError = NULL
          ${termsClause}
      `);
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(z.object({ brandId: z.number(), tool: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.execute(sql`
        DELETE FROM brand_tool_credentials
        WHERE brandId = ${input.brandId} AND tool = ${input.tool}
      `);
      return { ok: true };
    }),

  // Real per-tool health check (Batch 2-2d).
  // Routes to credTesters.ts which actually pings the API or runs the
  // browser login flow. For browser-login tools (opview/meltwater/gwi)
  // this takes 20-40s and spends one Browserbase session credit.
  test: protectedProcedure
    .input(z.object({ brandId: z.number(), tool: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandOwner(ctx.user.id, input.brandId);
      const cred = await loadToolCredential(input.brandId, input.tool);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      if (!cred) {
        await db.execute(sql`
          UPDATE brand_tool_credentials
          SET status = 'error', lastTestedAt = NOW(3), lastError = 'Credential not readable'
          WHERE brandId = ${input.brandId} AND tool = ${input.tool}
        `);
        return { ok: false, status: "error", message: "Credential not readable (may need re-entry)" };
      }

      const { runCredTest } = await import("../_core/scouts/credTesters");
      const started = Date.now();
      const result = await runCredTest(input.tool, cred.payload);
      const elapsedMs = Date.now() - started;
      const newStatus = result.ok ? "ok" : "error";
      const errorMsg = result.ok ? null : result.message;

      await db.execute(sql`
        UPDATE brand_tool_credentials
        SET status = ${newStatus}, lastTestedAt = NOW(3), lastError = ${errorMsg}
        WHERE brandId = ${input.brandId} AND tool = ${input.tool}
      `);

      return {
        ok: result.ok,
        status: newStatus,
        message: result.message,
        detail: result.detail,
        elapsedMs,
      };
    }),

  // ─── Browser runtime smoke test (Batch 2-2a) ──────────────────────────────
  // Verifies the headless-browser pipeline end-to-end: picks the configured
  // provider (Browserbase or local), opens a session, navigates to a safe
  // target (example.com by default), grabs title + H1, closes cleanly.
  //
  // Runs end-to-end in ~5-10s for Browserbase, slightly faster locally.
  // Safe to call repeatedly — each call costs one Browserbase session credit.
  browserPing: protectedProcedure
    .input(
      z.object({
        url: z.string().url().max(500).default("https://example.com"),
      })
    )
    .mutation(async ({ input }) => {
      const started = Date.now();
      let provider;
      try {
        provider = await getBrowserProvider();
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Browser provider init failed: ${err?.message ?? String(err)}`,
        });
      }

      try {
        const payload = await provider.run(
          async ({ page, sessionId, providerName, debugUrl }) => {
            await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
            const title = await page.title();
            const h1 = await page
              .locator("h1")
              .first()
              .textContent({ timeout: 3_000 })
              .catch(() => null);
            const finalUrl = page.url();
            return { sessionId, providerName, debugUrl, title, h1, finalUrl };
          },
          { timeoutMs: 60_000, label: "browserPing" }
        );
        return {
          ok: true,
          provider: currentProviderName() ?? payload.providerName,
          elapsedMs: Date.now() - started,
          ...payload,
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `browserPing failed after ${Date.now() - started}ms: ${err?.message ?? String(err)}`,
        });
      }
    }),
});
