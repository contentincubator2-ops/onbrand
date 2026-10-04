/**
 * tenantGuard — one chokepoint for "may this user touch this brand / product /
 * event / mission?".
 *
 * Why a middleware: ownership used to depend on every procedure remembering to
 * call assertBrandAccess. A 2026-10 audit of 444 procedures found ~30 that did
 * not (quickTask.setChannels rewrote any brand's positioning; squad.stepUndo
 * rewrote any mission; brandBrain.list returned any brand's brain; …). The
 * shared readers (buildBrandPrefix, loadBrandPositioning, listBrandTaskCards)
 * load by id with no user filter, so one forgotten check is a cross-tenant leak.
 *
 * protectedProcedure now inspects the raw input of EVERY call: any id found
 * under the well-known field names below is checked before the procedure runs.
 * A new procedure that takes `brandId` is therefore guarded without its author
 * doing anything. Ids under other names (`id`, `outputId`, `conversationId`, …)
 * are not covered here and still need a check in the procedure.
 */
import { TRPCError } from "@trpc/server";
import {
  assertBrandAccess, assertEventAccess, assertMissionOwner, assertProductAccess,
} from "./brandAuth";

export type ScopeKind = "brand" | "product" | "event" | "mission";

const SINGLE: Record<string, ScopeKind> = {
  brandId: "brand", scopeBrandId: "brand",
  productId: "product", scopeProductId: "product",
  eventId: "event", scopeEventId: "event",
  missionId: "mission",
};
const PLURAL: Record<string, ScopeKind> = {
  brandIds: "brand", productIds: "product", eventIds: "event", missionIds: "mission",
};

/** How deep / wide to look. Inputs are small JSON; the caps only bound hostile payloads. */
const MAX_DEPTH = 4;
const MAX_NODES = 2000;
const MAX_IDS = 200;

const isId = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/** Every scope id mentioned in a procedure input, de-duplicated as "kind:id". */
export function collectScopeIds(input: unknown): Array<{ kind: ScopeKind; id: number }> {
  const seen = new Set<string>();
  const out: Array<{ kind: ScopeKind; id: number }> = [];
  let nodes = 0;
  const add = (kind: ScopeKind, id: number) => {
    const key = `${kind}:${id}`;
    if (seen.has(key) || out.length >= MAX_IDS) return;
    seen.add(key);
    out.push({ kind, id });
  };
  const walk = (value: unknown, depth: number) => {
    if (value == null || typeof value !== "object" || depth > MAX_DEPTH || ++nodes > MAX_NODES) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const single = SINGLE[key];
      const plural = PLURAL[key];
      if (single && isId(v)) add(single, v);
      else if (plural && Array.isArray(v)) { for (const id of v) if (isId(id)) add(plural, id); }
      else walk(v, depth + 1);
    }
  };
  walk(input, 0);
  return out;
}

/**
 * Procedures where the id is only a hint and the procedure's own SQL is
 * already scoped by userId. Guarding them would turn a stale brand id (deleted
 * brand still in the browser's localStorage) into a failed request.
 */
const EXEMPT_PREFIXES = [
  "support.",   // brandId = "which page is the user on"; lookups are `AND userId = ?`
  "ops.logError",
];

export function isExemptPath(path: string): boolean {
  return EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(p));
}

const CHECK: Record<ScopeKind, (userId: number, id: number) => Promise<void>> = {
  brand: assertBrandAccess,
  product: assertProductAccess,
  event: assertEventAccess,
  mission: assertMissionOwner,
};

/** Recent grants, so a polling query does not re-query ownership every few seconds. */
const GRANT_TTL_MS = 30_000;
const grants = new Map<string, number>();

export interface GuardDeps {
  check?: typeof CHECK;
  /** Staff may open any tenant's data (admin tools pass arbitrary brand ids). */
  isAdmin: (userId: number) => Promise<boolean>;
  now?: () => number;
}

/** Throws NOT_FOUND unless `userId` may use every scope id in `input`. */
export async function assertInputScopes(
  userId: number,
  path: string,
  input: unknown,
  deps: GuardDeps,
): Promise<void> {
  if (isExemptPath(path)) return;
  const ids = collectScopeIds(input);
  if (ids.length === 0) return;
  const check = deps.check ?? CHECK;
  const now = (deps.now ?? Date.now)();

  let admin: boolean | null = null;
  for (const { kind, id } of ids) {
    const key = `${userId}:${kind}:${id}`;
    const until = grants.get(key);
    if (until && until > now) continue;
    try {
      await check[kind](userId, id);
    } catch (e) {
      if (!(e instanceof TRPCError) || e.code !== "NOT_FOUND") throw e;
      admin ??= await deps.isAdmin(userId);
      if (!admin) {
        console.warn("[tenantGuard] denied", { path, userId, kind, id });
        throw e;
      }
    }
    if (grants.size > 20_000) grants.clear();
    grants.set(key, now + GRANT_TTL_MS);
  }
}

/** Test hook. */
export function _resetGrantCache(): void {
  grants.clear();
}
