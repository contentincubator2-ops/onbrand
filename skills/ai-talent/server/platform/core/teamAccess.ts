/**
 * teamAccess — how an invited team member works on the owner's brand.
 *
 * ─── The problem ────────────────────────────────────────────────────────
 * Until 2026-10 an invitation (tenant.invite) only added a workspace_members
 * row. Brand, product, event, positioning and mission queries are all written
 * `WHERE userId = <caller>` (~130 sites in 45 files), so an invited member saw
 * none of the owner's brands. workspace_member_brands (the "which brands may
 * this member see" picker) was written but never read.
 *
 * ─── The model ──────────────────────────────────────────────────────────
 * Team data lives in the OWNER's account. When a member's call targets a brand
 * they reach through a workspace, protectedProcedure runs that call with
 * `ctx.user.id = <brand owner>` and records the real caller in `ctx.actor`.
 * Every existing `WHERE userId = ?` then resolves to the owner's rows with no
 * change, and things created by a member (products, missions, outputs) belong
 * to the team, not to the member's private account. Plan and points are the
 * owner's too — the seats ride on the owner's subscription.
 *
 * Nothing changes for a user working on their own brand: no target brand owned
 * by someone else → no swap → `ctx.actor` stays undefined.
 *
 * ─── Permissions (set by the owner when inviting) ───────────────────────
 *   viewer   read only
 *   editor   write content; optionally + edit strategy, + publish
 *   admin    everything, including connecting social accounts
 *   owner    everything
 * Enforced here by procedure type and namespace (queries read; mutations in
 * strategy namespaces need canEditStrategy; …) so no router has to know.
 *
 * ─── Known limit ────────────────────────────────────────────────────────
 * A member restricted to some brands is checked on brand / product / event /
 * mission ids. Calls that address a row only by another id (jobId, docId, …)
 * while inside an allowed brand run as the owner and are not re-checked
 * against the brand restriction.
 */
import { TRPCError } from "@trpc/server";

export type TeamRole = "owner" | "admin" | "editor" | "viewer";

export interface TeamPermissions {
  role: TeamRole;
  /** Run tasks, create and edit content, add photos to the brand / product library. */
  canWrite: boolean;
  /** Change positioning, products, events, regulations, brand memory; remove other people's photos or change the main one. */
  canEditStrategy: boolean;
  /** Schedule and publish to connected channels. */
  canPublish: boolean;
  /** Connect / disconnect the brand's social accounts. */
  canManage: boolean;
}

type Flag = number | boolean | null | undefined;
const on = (f: Flag): boolean | null => (f == null ? null : Number(f) === 1 || f === true);

/** Role preset, with the two per-member switches applied to editors only. */
export function resolvePermissions(role: string, flags: { canEditStrategy?: Flag; canPublish?: Flag } = {}): TeamPermissions {
  if (role === "owner" || role === "admin") {
    return { role, canWrite: true, canEditStrategy: true, canPublish: true, canManage: true };
  }
  if (role === "editor") {
    return {
      role,
      canWrite: true,
      canEditStrategy: on(flags.canEditStrategy) ?? false,
      canPublish: on(flags.canPublish) ?? false,
      canManage: false,
    };
  }
  return { role: "viewer", canWrite: false, canEditStrategy: false, canPublish: false, canManage: false };
}

/** Owner / admin see every brand of the workspace; others only the picked ones (none picked = all). */
export function brandAllowed(role: string, restrictedTo: readonly number[], brandId: number): boolean {
  if (role === "owner" || role === "admin") return true;
  return restrictedTo.length === 0 || restrictedTo.includes(brandId);
}

// ── Which calls are swapped, and what they need ─────────────────────────

/**
 * Namespaces about the caller's own account. Never swapped: they must see the
 * member's identity, plan, notifications and team list, not the owner's.
 */
const PERSONAL_NAMESPACES = new Set([
  "credits", "notifications", "support", "navPrefs", "billing", "addon", "ops", "adminStats",
  "review", "tenant", "stripe", "festival", "promptTemplate", "landing", "agent", "cloudDrive", "proactive",
]);
/** Brand procedures that are about "my brands", not about one brand's data. */
const PERSONAL_PATHS = new Set([
  "brand.list", "brand.listByMember", "brand.listWithStats", "brand.create", "brand.createWithMember",
  "brand.delete", "brand.resourceCount",
]);

const STRATEGY_NAMESPACES = new Set([
  "brand", "brandBrain", "assetPhoto", "strategyMonitor", "brandRegulation", "eventCalendar", "touchpoints",
  "competitor", "entity", "product", "event", "scope", "pipeline", "tabLock", "positioningJobs",
  "positioningDocs", "channelRole", "workbench", "strategistChat", "brandKnowledge", "personaAgent",
  "brandColors", "campaign", "vendor", "customChannel",
]);
const MANAGE_NAMESPACES = new Set(["bundleConnect", "platformConnect"]);
const PUBLISH_PATHS = new Set(["calendar.schedule", "calendar.reschedule", "calendar.retry", "calendar.publish"]);
/**
 * Adding a photo is part of making a post, so it only needs `write` even
 * though the photo library sits in a strategy namespace. Removing is `write`
 * too, but assetPhotoRouter narrows it with canRemovePhoto: without the
 * strategy permission a member removes only what they uploaded themselves.
 * Changing the main photo still needs the strategy permission.
 */
const WRITE_PATHS = new Set(["assetPhoto.saveGeneratedImage", "assetPhoto.remove"]);
/** What the upload route (assetPhotoRoute.ts) asks for — kept here so both entrances agree. */
export const PHOTO_UPLOAD_NEED = "write" as const;

const namespaceOf = (path: string) => path.split(".")[0] ?? "";

export function isPersonalPath(path: string): boolean {
  return PERSONAL_PATHS.has(path) || PERSONAL_NAMESPACES.has(namespaceOf(path));
}

export type Need = "view" | "write" | "strategy" | "publish" | "manage";

/** What a call needs. Queries only read; everything else is a write of some kind. */
export function permissionNeeded(path: string, type: string): Need {
  if (type === "query") return "view";
  const ns = namespaceOf(path);
  if (MANAGE_NAMESPACES.has(ns)) return "manage";
  if (ns === "publish" || PUBLISH_PATHS.has(path)) return "publish";
  if (WRITE_PATHS.has(path)) return "write";
  if (STRATEGY_NAMESPACES.has(ns)) return "strategy";
  return "write";
}

const DENIED: Record<Exclude<Need, "view">, string> = {
  write: "你在這個團隊的權限是「檢視」，只能查看，不能產出或修改。需要調整請找團隊擁有者。",
  strategy: "你在這個團隊沒有「修改品牌定位」的權限，可以查看與撰寫內容。需要調整請找團隊擁有者。",
  publish: "你在這個團隊沒有「發布」的權限。請送審，或請團隊擁有者開啟你的發布權限。",
  manage: "只有團隊擁有者或管理者可以連結或中斷品牌的社群帳號。",
};

export function isAllowed(perms: TeamPermissions, need: Need): boolean {
  switch (need) {
    case "view": return true;
    case "write": return perms.canWrite;
    case "strategy": return perms.canEditStrategy;
    case "publish": return perms.canPublish;
    case "manage": return perms.canManage;
  }
}

export const REMOVE_OTHERS_PHOTO_DENIED =
  "你只能刪除自己上傳的照片。要刪其他人的照片，請找團隊擁有者，或請他開啟你的「修改品牌定位」權限。";

/**
 * May this caller remove a photo uploaded by `uploadedBy`?
 * `actor` is undefined when the caller works on their own brand (always yes).
 */
export function canRemovePhoto(
  actor: { id: number; perms: TeamPermissions } | undefined,
  uploadedBy: number | null,
): boolean {
  if (!actor || actor.perms.canEditStrategy) return true;
  return actor.perms.canWrite && uploadedBy != null && uploadedBy === actor.id;
}

export function assertTeamPermission(perms: TeamPermissions, path: string, type: string): void {
  const need = permissionNeeded(path, type);
  if (need !== "view" && !isAllowed(perms, need)) {
    throw new TRPCError({ code: "FORBIDDEN", message: DENIED[need] });
  }
}

// ── Lookups ─────────────────────────────────────────────────────────────

export interface TeamAccess {
  brandId: number;
  ownerId: number;
  workspaceId: number;
  perms: TeamPermissions;
}

interface Db { execute(sql: string, params?: any[]): Promise<any> }
async function pool(): Promise<Db> {
  return (await import("../../localDb")).default as unknown as Db;
}

/**
 * The join that defines "this brand is in that workspace": assigned to it, or
 * unassigned and owned by the workspace's owner (brands created before
 * workspaces existed have no workspaceId).
 */
const BRAND_IN_WORKSPACE = `(b.workspaceId = w.id OR (b.workspaceId IS NULL AND w.ownerUserId = b.userId))`;

/** canEditStrategy / canPublish are late columns; a DB that has not migrated reads them as unset. */
async function memberRows(db: Db, sqlWithFlags: string, sqlNoFlags: string, params: any[]): Promise<any[]> {
  try {
    const [rows]: any = await db.execute(sqlWithFlags, params);
    return rows as any[];
  } catch (e: any) {
    if (e?.code !== "ER_BAD_FIELD_ERROR") throw e;
    const [rows]: any = await db.execute(sqlNoFlags, params);
    return rows as any[];
  }
}

async function restrictions(db: Db, userId: number): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  try {
    const [rows]: any = await db.execute(
      `SELECT workspaceId, brandId FROM workspace_member_brands WHERE userId = ?`, [userId],
    );
    for (const r of rows as any[]) {
      const ws = Number(r.workspaceId);
      out.set(ws, [...(out.get(ws) ?? []), Number(r.brandId)]);
    }
  } catch { /* table missing on a very old DB = nobody is restricted */ }
  return out;
}

const RANK: Record<string, number> = { owner: 4, admin: 3, editor: 2, viewer: 1 };

/** Pick the strongest membership when a user reaches a brand through several workspaces. */
function strongest(rows: any[]): any | null {
  return [...rows].sort((a, b) => (RANK[b.role] ?? 0) - (RANK[a.role] ?? 0))[0] ?? null;
}

const FLAGS = `m.canEditStrategy, m.canPublish`;
const NO_FLAGS = `NULL AS canEditStrategy, NULL AS canPublish`;

/** How `userId` reaches someone else's brand through a workspace; null when they don't (or it is their own). */
export async function teamAccessForBrand(userId: number, brandId: number, db?: Db): Promise<TeamAccess | null> {
  const d = db ?? (await pool());
  const q = (flags: string) => `
    SELECT b.userId AS ownerId, w.id AS workspaceId, m.role, ${flags}
      FROM brands b
      JOIN workspaces w ON ${BRAND_IN_WORKSPACE}
      JOIN workspace_members m ON m.workspaceId = w.id AND m.userId = ?
     WHERE b.id = ? AND b.userId <> ?`;
  const rows = await memberRows(d, q(FLAGS), q(NO_FLAGS), [userId, brandId, userId]);
  if (rows.length === 0) return null;
  const limits = await restrictions(d, userId);
  const usable = rows.filter((r) =>
    RANK[String(r.role)] && Number(r.ownerId) > 0 &&
    brandAllowed(String(r.role), limits.get(Number(r.workspaceId)) ?? [], brandId));
  const best = strongest(usable);
  if (!best) return null;
  return {
    brandId,
    ownerId: Number(best.ownerId),
    workspaceId: Number(best.workspaceId),
    perms: resolvePermissions(String(best.role), best),
  };
}

export interface TeamBrandRow { id: number; ownerId: number; workspaceId: number; perms: TeamPermissions; [k: string]: any }

/** Every brand `userId` reaches through a workspace (not their own), newest first. */
export async function listTeamBrands(userId: number, db?: Db): Promise<TeamBrandRow[]> {
  const d = db ?? (await pool());
  const q = (flags: string) => `
    SELECT b.*, w.id AS teamWorkspaceId, w.name AS teamName, m.role AS teamRole, ${flags}
      FROM workspace_members m
      JOIN workspaces w ON w.id = m.workspaceId
      JOIN brands b ON ${BRAND_IN_WORKSPACE}
     WHERE m.userId = ? AND b.userId <> ?
     ORDER BY b.createdAt DESC`;
  const rows = await memberRows(d, q(FLAGS), q(NO_FLAGS), [userId, userId]);
  const limits = await restrictions(d, userId);
  const byBrand = new Map<number, any[]>();
  for (const r of rows) {
    if (!RANK[String(r.teamRole)]) continue;
    if (!brandAllowed(String(r.teamRole), limits.get(Number(r.teamWorkspaceId)) ?? [], Number(r.id))) continue;
    byBrand.set(Number(r.id), [...(byBrand.get(Number(r.id)) ?? []), { ...r, role: r.teamRole }]);
  }
  return [...byBrand.values()].map((group) => {
    const best = strongest(group)!;
    const { canEditStrategy, canPublish, teamRole, ...brand } = best;
    return {
      ...brand,
      role: teamRole,
      ownerId: Number(best.userId),
      workspaceId: Number(best.teamWorkspaceId),
      perms: resolvePermissions(String(teamRole), { canEditStrategy, canPublish }),
    };
  });
}

// ── Which brand does this call target? ──────────────────────────────────

/** In these routers a bare `id` is the entity's own id. */
const ID_IS: Record<string, "brand" | "product" | "event"> = { brand: "brand", product: "product", event: "event" };

/**
 * The brand a call is about: an explicit brand id in the input wins, then the
 * brand of a product / event / mission in the input, then the brand the user
 * has open in the UI (x-onbrand-brand header).
 */
export async function resolveTargetBrand(
  path: string,
  input: unknown,
  activeBrandId: number | null | undefined,
  deps: { collect: (input: unknown) => Array<{ kind: string; id: number }>; db?: Db },
): Promise<number | null> {
  const ids = deps.collect(input);
  const alias = ID_IS[namespaceOf(path)];
  const bare = (input as any)?.id;
  if (alias && typeof bare === "number" && Number.isInteger(bare) && bare > 0) ids.unshift({ kind: alias, id: bare });

  const brand = ids.find((i) => i.kind === "brand");
  if (brand) return brand.id;

  const child = ids.find((i) => i.kind === "product" || i.kind === "event" || i.kind === "mission");
  if (child) {
    const d = deps.db ?? (await pool());
    const table = child.kind === "product" ? "products" : child.kind === "event" ? "events" : "missions";
    const [rows]: any = await d.execute(`SELECT brandId FROM ${table} WHERE id = ? LIMIT 1`, [child.id]);
    const bid = Number((rows as any[])[0]?.brandId ?? 0);
    if (bid > 0) return bid;
  }
  return activeBrandId && activeBrandId > 0 ? activeBrandId : null;
}

// ── Cache ───────────────────────────────────────────────────────────────

const TTL_MS = 30_000;
const cache = new Map<string, { until: number; value: TeamAccess | null }>();

/** teamAccessForBrand, remembered for 30s — the swap check runs on every call. */
export async function teamAccessCached(userId: number, brandId: number, now = Date.now()): Promise<TeamAccess | null> {
  const key = `${userId}:${brandId}`;
  const hit = cache.get(key);
  if (hit && hit.until > now) return hit.value;
  const value = await teamAccessForBrand(userId, brandId);
  if (cache.size > 20_000) cache.clear();
  cache.set(key, { until: now + TTL_MS, value });
  return value;
}

/** Call after changing a member's role, switches or brand list so it applies at once. */
export function clearTeamAccessCache(): void {
  cache.clear();
}

// ── Plan inheritance ────────────────────────────────────────────────────

const PLAN_RANK: Record<string, number> = { trial: 0, drop_starter: 1, drop_pro: 2, enterprise: 3 };
const isStaff = (email: unknown) => typeof email === "string" && /@sowork\.(tw|ai)$/i.test(email);

export interface TeamPlan { planCode: string; planStatus: string; planEndsAt: Date | null }

/** Pure: the best plan that is still in force among the owners of a member's teams. */
export function bestTeamPlan(
  owners: Array<{ email?: string | null; planCode?: string | null; planStatus?: string | null; planEndsAt?: Date | string | null }>,
  now: Date = new Date(),
): TeamPlan | null {
  let best: TeamPlan | null = null;
  for (const o of owners) {
    const plan: TeamPlan = isStaff(o.email)
      ? { planCode: "enterprise", planStatus: "active", planEndsAt: null }
      : { planCode: String(o.planCode ?? "trial"), planStatus: String(o.planStatus ?? "trial"), planEndsAt: o.planEndsAt ? new Date(o.planEndsAt) : null };
    const inForce = plan.planStatus === "active" && (!plan.planEndsAt || plan.planEndsAt > now);
    if (!inForce || plan.planCode === "trial") continue;
    if (!best || (PLAN_RANK[plan.planCode] ?? 0) > (PLAN_RANK[best.planCode] ?? 0)) best = plan;
  }
  return best;
}

/** True when `team` gives the member more than their own plan does. */
export function teamPlanWins(own: { planCode: string; planStatus: string; planEndsAt: Date | null }, team: TeamPlan | null, now: Date = new Date()): boolean {
  if (!team) return false;
  const ownInForce = own.planStatus === "active" && (!own.planEndsAt || own.planEndsAt > now);
  return !ownInForce || (PLAN_RANK[team.planCode] ?? 0) > (PLAN_RANK[own.planCode] ?? 0);
}

/**
 * The paid plan a member rides on: seats are part of the owner's subscription,
 * so an invited member must not be stopped by their own expired trial.
 * Null when they are in nobody else's team, or no owner has a plan in force.
 */
export async function teamPlanFor(userId: number, db?: Db): Promise<TeamPlan | null> {
  try {
    const d = db ?? (await pool());
    const [rows]: any = await d.execute(
      `SELECT u.email, u.planCode, u.planStatus, u.planEndsAt
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspaceId
         JOIN users u ON u.id = w.ownerUserId
        WHERE m.userId = ? AND w.ownerUserId <> ?`,
      [userId, userId],
    );
    return bestTeamPlan(rows as any[]);
  } catch (e) {
    console.warn("[teamAccess] teamPlanFor failed, using own plan:", (e as Error)?.message);
    return null;
  }
}

// ── Express routes (uploads) ────────────────────────────────────────────

/**
 * For routes outside tRPC: whose rows should this request read / write?
 * A member with enough permission acts as the brand owner (same model as the
 * tRPC swap); a member without it gets `denied`; anyone else is unchanged and
 * the route's own ownership check decides.
 */
export async function actingUserForBrand(
  userId: number,
  brandId: number,
  need: Need,
): Promise<{ userId: number; denied: string | null }> {
  if (!Number.isInteger(brandId) || brandId <= 0) return { userId, denied: null };
  const team = await teamAccessCached(userId, brandId);
  if (!team) return { userId, denied: null };
  if (need !== "view" && !isAllowed(team.perms, need)) return { userId, denied: DENIED[need] };
  return { userId: team.ownerId, denied: null };
}
