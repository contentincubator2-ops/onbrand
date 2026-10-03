/**
 * activationFunnel — 後台活化漏斗與 TTFV（註冊 → 第一次拿到成果）的計算。
 *
 * 2026-06-21（CJ「量 TTFV」）建立時，終點是「七日發布台第一次產完一週」。
 * 2026-09-30（CJ「七日發布台整個拿掉」→ 同意「改用在靈感舞台第一次採用切角當終點」）：
 *   第 4 步改成「進到靈感舞台」、第 5 步（TTFV 終點）改成「第一次採用切角」。
 *   舊用戶的七日發布台事件（first_theater_arrived／first_week_generated）當成同一步的別名，
 *   取最早那次——改版前後的曲線是連續的，不會突然掉到 0。
 */

export interface FunnelStage {
  id: string;
  label: string;
  /** error_log.source 值；第一個是現在前端會送的，其餘是舊版事件（別名）。 */
  sources: string[];
}

export const ACTIVATION_STAGES: FunnelStage[] = [
  { id: "activation.register_completed",       label: "Registered",          sources: ["activation.register_completed"] },
  { id: "activation.first_brand_created",      label: "Brand created",       sources: ["activation.first_brand_created"] },
  { id: "activation.express_brain_ready",      label: "Express brain ready", sources: ["activation.express_brain_ready"] },
  { id: "activation.first_inspiration_arrived", label: "Arrived at Idea Stage",
    sources: ["activation.first_inspiration_arrived", "activation.first_theater_arrived"] },
  { id: "activation.first_angle_adopted",      label: "First angle adopted",
    sources: ["activation.first_angle_adopted", "activation.first_week_generated"] },
];

export const START_STAGE = ACTIVATION_STAGES[0]!;
/** TTFV 的終點。 */
export const END_STAGE = ACTIVATION_STAGES[ACTIVATION_STAGES.length - 1]!;

/** 每位用戶各事件第一次出現的時間 → 每一步第一次達成的時間（別名取最早）。 */
export function stageTimes(seen: Record<string, Date>): Record<string, Date> {
  const out: Record<string, Date> = {};
  for (const s of ACTIVATION_STAGES) {
    let first: Date | null = null;
    for (const src of s.sources) {
      const t = seen[src];
      if (t && (!first || t.getTime() < first.getTime())) first = t;
    }
    if (first) out[s.id] = first;
  }
  return out;
}

export interface FunnelSummary {
  funnel: Array<{ id: string; label: string; users: number; pctOfRegistered: number; pctFromPrev: number }>;
  ttfvMs: { count: number; p50: number; p90: number; avg: number };
  recent: Array<{ userId: number; registeredAt: string; completedAt: string; ttfvMs: number }>;
}

export function summarizeFunnel(byUser: Map<number, Record<string, Date>>): FunnelSummary {
  const funnel = ACTIVATION_STAGES.map((s) => ({ id: s.id, label: s.label, users: 0, pctOfRegistered: 0, pctFromPrev: 0 }));
  const ttfvs: number[] = [];
  const recent: FunnelSummary["recent"] = [];

  for (const [uid, seen] of byUser) {
    const st = stageTimes(seen);
    ACTIVATION_STAGES.forEach((s, i) => { if (st[s.id]) funnel[i]!.users++; });
    const start = st[START_STAGE.id];
    const end = st[END_STAGE.id];
    if (start && end && end.getTime() > start.getTime()) {
      const ms = end.getTime() - start.getTime();
      ttfvs.push(ms);
      recent.push({ userId: uid, registeredAt: start.toISOString(), completedAt: end.toISOString(), ttfvMs: ms });
    }
  }

  const registered = funnel[0]!.users || 1;
  funnel.forEach((s, i) => {
    s.pctOfRegistered = Math.round((s.users / registered) * 1000) / 10;
    const prev = i > 0 ? funnel[i - 1]!.users : s.users;
    s.pctFromPrev = prev > 0 ? Math.round((s.users / prev) * 1000) / 10 : 0;
  });

  ttfvs.sort((a, b) => a - b);
  const pick = (q: number) => (ttfvs.length ? ttfvs[Math.min(ttfvs.length - 1, Math.floor(ttfvs.length * q))]! : 0);
  recent.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  return {
    funnel,
    ttfvMs: {
      count: ttfvs.length,
      p50: pick(0.5),
      p90: pick(0.9),
      avg: ttfvs.length ? Math.round(ttfvs.reduce((a, b) => a + b, 0) / ttfvs.length) : 0,
    },
    recent,
  };
}
