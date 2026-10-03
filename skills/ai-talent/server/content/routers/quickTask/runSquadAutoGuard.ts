/**
 * runSquadAuto 的單飛與併發上限。
 */
import { STRATEGY_SCOUT_BUDGET_MS, STRATEGY_STEP_DEADLINE_MS, STRATEGY_PERSISTENCE_BUDGET_MS } from "../../../strategy/core/positioning/strategyPublicStepRouting";
import { singleFlightPerUser } from "../../../platform/core/trpc";

// Production's largest DB-owned squad has seven planning steps. Its strictly
// sequential wall-clock ceiling is 12s scout + (7 * 45s step deadline) + 4s
// persistence = 331s (5m31s). A 2x safety factor covers scheduling jitter,
// DB/context work outside those named budgets, and one full ceiling again,
// while still guaranteeing recovery in 662s instead of leaking until PM2
// restarts. This is intentionally independent of the 220s socket limit: a
// disconnected handler/provider can outlive that socket, which is precisely
// the stale-slot failure this upper bound must contain.
export const MAX_RUN_SQUAD_AUTO_PLANNING_STEPS = 7;

export const RUN_SQUAD_AUTO_SINGLE_FLIGHT_SAFETY_FACTOR = 2;

export const RUN_SQUAD_AUTO_SINGLE_FLIGHT_TTL_MS =
  (
    STRATEGY_SCOUT_BUDGET_MS
    + (MAX_RUN_SQUAD_AUTO_PLANNING_STEPS * STRATEGY_STEP_DEADLINE_MS)
    + STRATEGY_PERSISTENCE_BUDGET_MS
  ) * RUN_SQUAD_AUTO_SINGLE_FLIGHT_SAFETY_FACTOR;

export const RUN_SQUAD_AUTO_MAX_CONCURRENT_PER_USER = 5;

export const runSquadAutoSingleFlight = singleFlightPerUser({
  key: "quickTask.runSquadAuto",
  message: "這個帳號同時產生中的企劃已達 5 個，請等其中一個完成後再開。",
  ttlMs: RUN_SQUAD_AUTO_SINGLE_FLIGHT_TTL_MS,
  maxConcurrent: RUN_SQUAD_AUTO_MAX_CONCURRENT_PER_USER,
});
