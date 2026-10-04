/**
 * tenantRouter — Team / Agency multi-tenant container (workspaces table).
 *
 * 2026-05-11 (CJ「Team / Agency 方案 + 多客戶 workspace 都要完成」).
 *
 * NAMING NOTE: the existing `workspaceRouter` is for user-defined
 * personal folders (sidebar mission organisation à la Notion). This
 * `tenantRouter` operates on the multi-tenant `workspaces` / member /
 * brand-scoping tables. tRPC key = `tenant.*`.
 *
 * Concept:
 *   - A tenant workspace = an agency / team / solo container
 *   - Every user has at least 1 default tenant workspace (auto-created)
 *   - Brands belong to a tenant workspace (brands.workspaceId)
 *   - Members have a role (owner / admin / editor / viewer)
 *   - Editor / viewer can be scoped to specific brands (great for
 *     inviting clients to view only their own brand)
 *
 * Plan gates (PLANS.*.quota.team_members):
 *   solo plan   — 1 member (owner only)
 *   team plan   — 5 members + multi_client allowed
 *   agency plan — unlimited + white label
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../core/trpc";

const RoleEnum = z.enum(["owner", "admin", "editor", "viewer"]);
/** Same wording as the team settings page (WorkspaceSettingsPage ROLE_LABEL_ZH). */
const ROLE_LABEL: Record<z.infer<typeof RoleEnum>, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer（僅查看）",
};

export const tenantRouter = router({
  /** Workspaces the calling user is a member of.
   *
   *  2026-05-12 (CJ): prod workspaces table may be an older schema (organizationId/
   *  workspaceKey/status) without the new agency-tier columns. We probe column
   *  presence dynamically so this query never 500s — missing columns are
   *  returned as NULL/0/defaults and the UI shows a sensible empty state. */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const { default: localPool } = await import("../../localDb");

    // Discover which agency-tier columns actually exist in this DB
    const [colRows]: any = await localPool.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'workspaces'`,
    );
    const cols = new Set<string>((colRows as any[]).map((r) => r.COLUMN_NAME));
    if (!cols.has("ownerUserId")) {
      // Old workspaces table — not yet migrated to multi-tenant model. Return
      // empty list so the UI can render its empty state.
      return [] as any[];
    }
    const memberTable = await tableExists("workspace_members");
    if (!memberTable) return [] as any[];

    const has = (c: string) => cols.has(c);
    const col = (c: string, fallback: string) => (has(c) ? `w.${c}` : `${fallback} AS ${c}`);

    const sql = `
      SELECT w.id,
             ${col("slug",           "NULL")},
             w.name,
             ${col("planCode",       "'solo'")},
             ${col("planStatus",     "'trial'")},
             ${col("billingMode",    "'solo'")},
             ${col("whiteLabelName", "NULL")},
             ${col("whiteLabelLogo", "NULL")},
             w.ownerUserId = ? AS isOwner,
             m.role AS myRole,
             (SELECT COUNT(*) FROM workspace_members WHERE workspaceId = w.id) AS memberCount,
             (SELECT COUNT(*) FROM brands WHERE workspaceId = w.id) AS brandCount
      FROM workspaces w
      JOIN workspace_members m ON m.workspaceId = w.id AND m.userId = ?
      ORDER BY w.createdAt ASC
    `;
    try {
      const [rows]: any = await localPool.execute(sql, [ctx.user.id, ctx.user.id]);
      return rows;
    } catch (e) {
      console.warn("[tenant.listMine] query failed, returning empty:", e);
      return [];
    }
  }),

  detail: protectedProcedure
    .input(z.object({ workspaceId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { default: localPool } = await import("../../localDb");
      const myRole = await getMemberRole(input.workspaceId, ctx.user.id);
      if (!myRole) throw new TRPCError({ code: "FORBIDDEN", message: "你不是此 workspace 的成員" });
      const [wRows]: any = await localPool.execute(
        `SELECT * FROM workspaces WHERE id = ? LIMIT 1`,
        [input.workspaceId],
      );
      const ws = (wRows as any[])[0];
      if (!ws) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
      const [members]: any = await localPool.execute(
        `SELECT m.userId, m.role, m.invitedAt, m.joinedAt, m.invitedBy,
                u.name, u.email
         FROM workspace_members m
         JOIN users u ON u.id = m.userId
         WHERE m.workspaceId = ?
         ORDER BY m.role = 'owner' DESC, m.joinedAt ASC`,
        [input.workspaceId],
      );
      const [brands]: any = await localPool.execute(
        `SELECT id, name, workspaceId, userId AS ownerUserId, createdAt
         FROM brands WHERE workspaceId = ? ORDER BY id DESC`,
        [input.workspaceId],
      );
      return { workspace: ws, members, brands, myRole };
    }),

  invite: protectedProcedure
    .input(z.object({
      workspaceId: z.number().int().positive(),
      email: z.string().email(),
      role: RoleEnum.default("viewer"),
      brandIds: z.array(z.number().int().positive()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../../localDb");
      const myRole = await getMemberRole(input.workspaceId, ctx.user.id);
      if (myRole !== "owner" && myRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有 owner / admin 可以邀請成員" });
      }
      await enforceMemberLimit(input.workspaceId);
      const [uRows]: any = await localPool.execute(
        `SELECT id, name FROM users WHERE email = ? LIMIT 1`,
        [input.email],
      );
      const invitee = (uRows as any[])[0];
      if (!invitee) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${input.email} 還沒註冊 onBrand Studio。請他先到 onbrand.sowork.ai 註冊後再邀請。`,
        });
      }
      await localPool.execute(
        `INSERT INTO workspace_members (workspaceId, userId, role, invitedBy, joinedAt)
         VALUES (?, ?, ?, ?, NOW(3))
         ON DUPLICATE KEY UPDATE role = VALUES(role)`,
        [input.workspaceId, invitee.id, input.role, ctx.user.id],
      );
      if (input.brandIds && input.brandIds.length > 0) {
        for (const bid of input.brandIds) {
          await localPool.execute(
            `INSERT IGNORE INTO workspace_member_brands (workspaceId, userId, brandId)
             VALUES (?, ?, ?)`,
            [input.workspaceId, invitee.id, bid],
          );
        }
      }
      // Tell the invitee — otherwise the new team just appears with no explanation.
      void (async () => {
        const [wRows]: any = await localPool.execute(`SELECT name FROM workspaces WHERE id = ? LIMIT 1`, [input.workspaceId]);
        const { sendWorkspaceInvite } = await import("../auth/emailService");
        await sendWorkspaceInvite({
          to: input.email,
          name: invitee.name ?? "",
          inviterName: (ctx.user as any).name ?? (ctx.user as any).email ?? "團隊管理員",
          workspaceName: (wRows as any[])[0]?.name ?? "團隊",
          roleLabel: ROLE_LABEL[input.role],
          appUrl: process.env.APP_URL ?? "https://onbrand.sowork.ai",
        });
      })().catch((e) => console.warn("[tenant.invite] invite email not sent:", (e as Error)?.message));
      return { ok: true, userId: invitee.id };
    }),

  setRole: protectedProcedure
    .input(z.object({
      workspaceId: z.number().int().positive(),
      userId: z.number().int().positive(),
      role: RoleEnum,
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../../localDb");
      const myRole = await getMemberRole(input.workspaceId, ctx.user.id);
      if (myRole !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有 owner 可改 role" });
      }
      if (input.userId === ctx.user.id && input.role !== "owner") {
        const [r]: any = await localPool.execute(
          `SELECT COUNT(*) AS c FROM workspace_members WHERE workspaceId = ? AND role = 'owner'`,
          [input.workspaceId],
        );
        if (Number((r as any[])[0]?.c ?? 0) <= 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "至少要有一位 owner" });
        }
      }
      await localPool.execute(
        `UPDATE workspace_members SET role = ? WHERE workspaceId = ? AND userId = ?`,
        [input.role, input.workspaceId, input.userId],
      );
      return { ok: true };
    }),

  removeMember: protectedProcedure
    .input(z.object({
      workspaceId: z.number().int().positive(),
      userId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../../localDb");
      const myRole = await getMemberRole(input.workspaceId, ctx.user.id);
      if (myRole !== "owner" && myRole !== "admin" && ctx.user.id !== input.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只能由 owner/admin 移除其他人，或自己離開" });
      }
      const [r]: any = await localPool.execute(
        `SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ? LIMIT 1`,
        [input.workspaceId, input.userId],
      );
      const targetRole = (r as any[])[0]?.role;
      if (targetRole === "owner") {
        const [c]: any = await localPool.execute(
          `SELECT COUNT(*) AS c FROM workspace_members WHERE workspaceId = ? AND role = 'owner'`,
          [input.workspaceId],
        );
        if (Number((c as any[])[0]?.c ?? 0) <= 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "唯一 owner 不能離開，請先指派另一位 owner" });
        }
      }
      await localPool.execute(
        `DELETE FROM workspace_members WHERE workspaceId = ? AND userId = ?`,
        [input.workspaceId, input.userId],
      );
      await localPool.execute(
        `DELETE FROM workspace_member_brands WHERE workspaceId = ? AND userId = ?`,
        [input.workspaceId, input.userId],
      );
      return { ok: true };
    }),

  /** Update workspace metadata (name, white-label). Owner only.
   *  White-label fields gated to the enterprise plan（Agency 方案 2026-09-07 下架）. */
  update: protectedProcedure
    .input(z.object({
      workspaceId: z.number().int().positive(),
      name: z.string().min(1).max(160).optional(),
      whiteLabelName: z.string().max(160).optional(),
      whiteLabelLogo: z.string().url().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../../localDb");
      const myRole = await getMemberRole(input.workspaceId, ctx.user.id);
      if (myRole !== "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有 owner 可更新 workspace" });
      }
      if (input.whiteLabelLogo || input.whiteLabelName) {
        const [wsRow]: any = await localPool.execute(
          `SELECT planCode FROM workspaces WHERE id = ? LIMIT 1`,
          [input.workspaceId],
        );
        const plan = (wsRow as any[])[0]?.planCode;
        if (plan !== "enterprise") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "White Label 屬於企業客製版，由 SoWork 導入時設定",
          });
        }
      }
      const sets: string[] = [];
      const vals: any[] = [];
      if (input.name           !== undefined) { sets.push("name = ?");           vals.push(input.name); }
      if (input.whiteLabelName !== undefined) { sets.push("whiteLabelName = ?"); vals.push(input.whiteLabelName); }
      if (input.whiteLabelLogo !== undefined) { sets.push("whiteLabelLogo = ?"); vals.push(input.whiteLabelLogo); }
      if (sets.length === 0) return { ok: true };
      vals.push(input.workspaceId);
      await localPool.execute(`UPDATE workspaces SET ${sets.join(", ")} WHERE id = ?`, vals);
      return { ok: true };
    }),

  /** Move a brand from one workspace to another (owner of source + dest required). */
  moveBrand: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      toWorkspaceId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { default: localPool } = await import("../../localDb");
      const [bRows]: any = await localPool.execute(
        `SELECT workspaceId, userId FROM brands WHERE id = ? LIMIT 1`,
        [input.brandId],
      );
      const brand = (bRows as any[])[0];
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      // Verify caller has write access on both workspaces
      const srcRole = brand.workspaceId ? await getMemberRole(brand.workspaceId, ctx.user.id) : null;
      const dstRole = await getMemberRole(input.toWorkspaceId, ctx.user.id);
      const canSrc = srcRole === "owner" || srcRole === "admin" || brand.userId === ctx.user.id;
      const canDst = dstRole === "owner" || dstRole === "admin";
      if (!canSrc || !canDst) {
        throw new TRPCError({ code: "FORBIDDEN", message: "兩邊 workspace 都要有 owner/admin 權限" });
      }
      await localPool.execute(
        `UPDATE brands SET workspaceId = ? WHERE id = ?`,
        [input.toWorkspaceId, input.brandId],
      );
      return { ok: true };
    }),
});

async function tableExists(name: string): Promise<boolean> {
  const { default: localPool } = await import("../../localDb");
  try {
    const [rows]: any = await localPool.execute(
      `SELECT COUNT(*) AS c FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [name],
    );
    return Number((rows as any[])[0]?.c ?? 0) > 0;
  } catch { return false; }
}

async function getMemberRole(workspaceId: number, userId: number): Promise<string | null> {
  const { default: localPool } = await import("../../localDb");
  const [rows]: any = await localPool.execute(
    `SELECT role FROM workspace_members WHERE workspaceId = ? AND userId = ? LIMIT 1`,
    [workspaceId, userId],
  );
  return (rows as any[])[0]?.role ?? null;
}

async function enforceMemberLimit(workspaceId: number): Promise<void> {
  const { default: localPool } = await import("../../localDb");
  const [wsRow]: any = await localPool.execute(
    `SELECT planCode FROM workspaces WHERE id = ? LIMIT 1`,
    [workspaceId],
  );
  const plan = (wsRow as any[])[0]?.planCode ?? "solo";
  const { PLANS } = await import("../core/billing/plans");
  const limit = (PLANS as any)[plan]?.quota?.team_members ?? 1;
  if (limit < 0) return; // unlimited
  const [c]: any = await localPool.execute(
    `SELECT COUNT(*) AS c FROM workspace_members WHERE workspaceId = ?`,
    [workspaceId],
  );
  const current = Number((c as any[])[0]?.c ?? 0);
  if (current >= limit) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `此 workspace 已達 ${limit} 位成員上限。請升級方案以邀請更多成員。`,
    });
  }
}
