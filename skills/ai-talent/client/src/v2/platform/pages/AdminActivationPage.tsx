/**
 * AdminActivationPage — Time-to-First-Value funnel dashboard.
 *
 * Visualises the 5-stage activation funnel using events that the client
 * fires via activationTelemetry.ts. Server route ops.activationFunnel
 * does the heavy lifting (MIN(createdAt) per (userId, stage), TTFV
 * stats, daily aggregation).
 *
 * 2026-06-21 (CJ「量 TTFV + 後台漏斗」): created. Admin-only via the
 * adminProcedure-gated tRPC route — non-admins get FORBIDDEN.
 */
import React, { useState } from "react";
import { trpc } from "../../../lib/trpc";

// SoWork editorial palette (matches LandingPage / Mia badge)
const C = {
  cream: "#F7F2EB",
  ink: "#0F0F0E",
  inkSoft: "#3A3633",
  muted: "#6B6660",
  orange: "#E85D2E",
  orangeDark: "#C84516",
  orangeChip: "#FDE6D8",
  border: "#E8DECC",
  borderSoft: "#EFE7D6",
  white: "#FFFFFF",
  ok: "#10b981",
  warn: "#F59E0B",
};

const WINDOWS: Array<{ label: string; days: number }> = [
  { label: "7 天",  days: 7 },
  { label: "30 天", days: 30 },
  { label: "90 天", days: 90 },
];

function formatDuration(ms: number): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  if (m < 60) return `${m}m ${sec}s`;
  const h = Math.floor(m / 60);
  const mr = m - h * 60;
  return `${h}h ${mr}m`;
}

export default function AdminActivationPage() {
  const [days, setDays] = useState<number>(30);
  const q = (trpc as any).ops?.activationFunnel?.useQuery({ days }, { refetchInterval: 60_000 });
  const d = q?.data;

  return (
    <div style={{ background: C.cream, minHeight: "100vh", color: C.ink }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{
            display: "inline-block", fontSize: 12, fontWeight: 700,
            letterSpacing: "0.2em", textTransform: "uppercase",
            background: C.orangeChip, color: C.orangeDark,
            padding: "5px 11px", borderRadius: 5, marginBottom: 12,
          }}>
            Activation · Time-to-First-Value
          </div>
          <h1 style={{
            fontSize: 32, fontWeight: 900, letterSpacing: "-0.02em",
            margin: 0, lineHeight: 1.15,
          }}>
            註冊 → 靈感舞台第一次採用切角 漏斗
          </h1>
          <p style={{ fontSize: 14, color: C.muted, marginTop: 8, marginBottom: 0 }}>
            事件來源：error_log（level="info" + source LIKE 'activation.%'）。
            每個 (userId, stage) 取 MIN(createdAt)。
            2026-09-30 前的用戶以「七日發布台產完一週」計為同一終點。
          </p>
        </div>

        {/* Window selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onClick={() => setDays(w.days)}
              style={{
                padding: "8px 16px", fontSize: 13, fontWeight: 700, borderRadius: 8,
                border: `1.5px solid ${w.days === days ? C.ink : C.border}`,
                background: w.days === days ? C.ink : C.white,
                color: w.days === days ? C.white : C.ink,
                cursor: "pointer", transition: "all 0.12s",
              }}
            >
              {w.label}
            </button>
          ))}
          {q?.isLoading && (
            <span style={{ fontSize: 12, color: C.muted, alignSelf: "center", marginLeft: 8 }}>
              載入中…
            </span>
          )}
          {q?.error && (
            <span style={{ fontSize: 12, color: "#dc2626", alignSelf: "center", marginLeft: 8 }}>
              載入失敗：{String((q.error as any)?.message ?? q.error).slice(0, 120)}
            </span>
          )}
        </div>

        {/* TTFV summary cards */}
        {d && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12, marginBottom: 28,
          }}>
            <SummaryCard
              label="Cohort 大小"
              value={String(d.cohortSize)}
              hint={`${days} 天內註冊用戶`}
            />
            <SummaryCard
              label="完成活化"
              value={String(d.ttfvMs.count)}
              hint={`${d.cohortSize > 0 ? Math.round((d.ttfvMs.count / d.cohortSize) * 100) : 0}% activation rate`}
              accent
            />
            <SummaryCard
              label="TTFV p50"
              value={formatDuration(d.ttfvMs.p50)}
              hint="中位數"
            />
            <SummaryCard
              label="TTFV p90"
              value={formatDuration(d.ttfvMs.p90)}
              hint="90 百分位"
            />
            <SummaryCard
              label="TTFV avg"
              value={formatDuration(d.ttfvMs.avg)}
              hint="平均"
            />
          </div>
        )}

        {/* Funnel bars */}
        {d && (
          <div style={{
            background: C.white, border: `2px solid ${C.ink}`,
            borderRadius: 14, padding: 24, marginBottom: 24,
            boxShadow: `4px 4px 0 ${C.ink}`,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 900, letterSpacing: "0.18em",
              color: C.orangeDark, marginBottom: 16, textTransform: "uppercase",
            }}>
              漏斗 · {days} 天
            </div>
            {d.funnel.map((s: any, i: number) => {
              const widthPct = d.cohortSize > 0
                ? Math.max(8, (s.users / d.cohortSize) * 100)
                : 8;
              const dropFromPrev = i > 0
                ? d.funnel[i - 1].users - s.users
                : 0;
              return (
                <div key={s.id} style={{ marginBottom: 14 }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "baseline", marginBottom: 4,
                  }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                      {String(i + 1).padStart(2, "0")}. {s.label}
                    </span>
                    <span style={{
                      fontSize: 13, fontVariantNumeric: "tabular-nums",
                      color: C.inkSoft,
                    }}>
                      <strong style={{ fontSize: 16, color: C.ink }}>{s.users}</strong>
                      <span style={{ opacity: 0.55, marginLeft: 6 }}>
                        ({s.pctOfRegistered}% of cohort
                        {i > 0 ? ` · ${s.pctFromPrev}% from prev` : ""})
                      </span>
                      {dropFromPrev > 0 && (
                        <span style={{
                          fontSize: 12, color: "#dc2626", marginLeft: 6,
                          fontWeight: 700,
                        }}>
                          ↓ {dropFromPrev}
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{
                    height: 22, background: C.borderSoft, borderRadius: 6,
                    overflow: "hidden", border: `1px solid ${C.border}`,
                  }}>
                    <div style={{
                      height: "100%", width: `${widthPct}%`,
                      background: i === d.funnel.length - 1
                        ? `${C.orange}`
                        : C.ink,
                      borderRadius: 5,
                      transition: "width 0.4s",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Daily trend */}
        {d && d.daily.length > 0 && (
          <div style={{
            background: C.white, border: `2px solid ${C.ink}`,
            borderRadius: 14, padding: 24, marginBottom: 24,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 900, letterSpacing: "0.18em",
              color: C.orangeDark, marginBottom: 16, textTransform: "uppercase",
            }}>
              每日趨勢
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto auto",
              gap: "8px 16px",
              fontSize: 13, fontVariantNumeric: "tabular-nums",
            }}>
              <div style={{ fontWeight: 800, color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em" }}>日期</div>
              <div style={{ fontWeight: 800, color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em" }}>註冊</div>
              <div style={{ fontWeight: 800, color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em" }}>完成</div>
              <div style={{ fontWeight: 800, color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em" }}>轉換</div>
              {d.daily.slice(0, 14).map((row: any) => {
                const conv = row.registered > 0
                  ? Math.round((row.completed / row.registered) * 100)
                  : 0;
                return (
                  <React.Fragment key={row.day}>
                    <div>{row.day}</div>
                    <div>{row.registered}</div>
                    <div style={{ color: row.completed > 0 ? C.ok : C.muted }}>{row.completed}</div>
                    <div style={{
                      color: conv >= 60 ? C.ok : conv >= 30 ? C.warn : "#dc2626",
                      fontWeight: 700,
                    }}>
                      {row.registered > 0 ? `${conv}%` : "—"}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent completions feed */}
        {d && d.recent.length > 0 && (
          <div style={{
            background: C.white, border: `2px solid ${C.ink}`,
            borderRadius: 14, padding: 24,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 900, letterSpacing: "0.18em",
              color: C.orangeDark, marginBottom: 16, textTransform: "uppercase",
            }}>
              最近完成活化（{d.recent.length}）
            </div>
            <div style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
              {d.recent.map((r: any) => (
                <div key={r.userId + r.completedAt} style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 1fr 90px",
                  gap: 12, padding: "8px 0",
                  borderBottom: `1px solid ${C.borderSoft}`,
                  alignItems: "center",
                }}>
                  <span style={{ color: C.muted }}>#{r.userId}</span>
                  <span style={{ color: C.inkSoft, fontSize: 12 }}>
                    註冊：{r.registeredAt.slice(0, 16).replace("T", " ")}
                  </span>
                  <span style={{ color: C.inkSoft, fontSize: 12 }}>
                    完成：{r.completedAt.slice(0, 16).replace("T", " ")}
                  </span>
                  <span style={{
                    color: r.ttfvMs < 5 * 60_000 ? C.ok
                         : r.ttfvMs < 15 * 60_000 ? C.warn
                         : "#dc2626",
                    fontWeight: 700, textAlign: "right",
                  }}>
                    {formatDuration(r.ttfvMs)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {d && d.cohortSize === 0 && (
          <div style={{
            background: C.white, border: `1px dashed ${C.border}`,
            borderRadius: 14, padding: 32, textAlign: "center",
            color: C.muted, fontSize: 14,
          }}>
            這個時間窗口內還沒有 activation 事件。等新用戶註冊 + 跑完整個流程後資料會出現。
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label, value, hint, accent,
}: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? C.ink : C.white,
      color: accent ? C.white : C.ink,
      border: `2px solid ${C.ink}`,
      borderRadius: 12, padding: "16px 18px",
      boxShadow: accent ? `4px 4px 0 ${C.orange}` : `3px 3px 0 ${C.ink}`,
    }}>
      <div style={{
        fontSize: 12, fontWeight: 800, letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: accent ? C.orangeChip : C.muted, marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em",
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      {hint && (
        <div style={{
          fontSize: 12, marginTop: 6,
          color: accent ? "rgba(255,255,255,0.65)" : C.muted,
        }}>
          {hint}
        </div>
      )}
    </div>
  );
}
