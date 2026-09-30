/**
 * PositioningNotificationCenter — fixed bottom-left toast feed for
 * background positioning pipeline completions.
 *
 * Polls trpc.positioningJobs.getRecentDone every 12s and surfaces a
 * stack of small chips ("xxx 完整定位完成 / 失敗"). Each chip auto-
 * dismisses after 12s; user can also dismiss manually.
 *
 * CJ direction (2026-05-07):
 *   "完成時左下通知，不要 toast 跳出來打斷流程。"
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "../../../lib/trpc";
import { Link } from "react-router-dom";
import { useLang } from "../../../lib/i18n";
import { DoneIcon, WarningIcon } from "./icons";

interface Notif {
  id: number;
  entityKind: "brand" | "product" | "event";
  entityId: number;
  status: "done" | "failed";
  finishedAt: string;
}

const SEEN_KEY = "positioning_notif_seen_ids";
function loadSeen(): Set<number> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch { return new Set(); }
}
function saveSeen(ids: Set<number>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids).slice(-200)));
  } catch {/* ignore */}
}

export default function PositioningNotificationCenter() {
  const since = useRef<string>(new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  const seen = useRef<Set<number>>(loadSeen());
  const [active, setActive] = useState<Notif[]>([]);

  const q = (trpc as any).positioningJobs?.getRecentDone?.useQuery(
    { sinceIso: since.current },
    { refetchInterval: 12_000, refetchOnWindowFocus: true },
  );
  const data: Notif[] = (q?.data as Notif[] | undefined) ?? [];

  useEffect(() => {
    if (!data.length) return;
    const fresh = data.filter((n) => !seen.current.has(n.id));
    if (!fresh.length) return;
    fresh.forEach((n) => seen.current.add(n.id));
    saveSeen(seen.current);
    setActive((cur) => [...fresh, ...cur].slice(0, 6));
    // auto-dismiss after 12s
    fresh.forEach((n) => {
      setTimeout(() => {
        setActive((cur) => cur.filter((x) => x.id !== n.id));
      }, 12_000);
    });
  }, [data]);

  if (active.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 left-4 flex flex-col gap-2 z-[60]"
      style={{ pointerEvents: "none" }}
    >
      {active.map((n) => (
        <NotifChip key={n.id} notif={n} onDismiss={() => setActive((cur) => cur.filter((x) => x.id !== n.id))} />
      ))}
    </div>
  );
}

function NotifChip({ notif, onDismiss }: { notif: Notif; onDismiss: () => void }) {
  const { lang } = useLang();
  const ok = notif.status === "done";
  const kindLabel = lang === "en"
    ? (notif.entityKind === "brand" ? "Brand" : notif.entityKind === "product" ? "Product" : "Event")
    : (notif.entityKind === "brand" ? "品牌" : notif.entityKind === "product" ? "產品" : "活動");
  const statusLabel = lang === "en"
    ? (ok ? "positioning ready" : "positioning failed (retried 5×)")
    : (ok ? "完整定位完成" : "定位產生失敗（已重試 5 次）");
  const linkTo =
    notif.entityKind === "brand" ? `/brands/${notif.entityId}`
    : notif.entityKind === "product" ? `/products/${notif.entityId}`
    : `/events/${notif.entityId}`;

  return (
    <div
      style={{
        pointerEvents: "auto",
        background: "white",
        border: `1px solid ${ok ? "#10b981" : "#ef4444"}`,
        borderLeft: `4px solid ${ok ? "#10b981" : "#ef4444"}`,
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        padding: "10px 14px",
        minWidth: 280,
        maxWidth: 340,
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span style={{ fontSize: 16, display: "inline-flex" }}>{ok ? <DoneIcon size={16} /> : <WarningIcon size={16} />}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#111", fontWeight: 600 }}>{kindLabel} #{notif.entityId} {statusLabel}</div>
        <Link to={linkTo} style={{ fontSize: 12, color: "#6b7280" }} onClick={onDismiss}>{lang === "en" ? "View" : "查看"}</Link>
      </div>
      <button
        onClick={onDismiss}
        style={{ color: "#9ca3af", padding: 4, cursor: "pointer", fontSize: 14 }}
        aria-label="dismiss"
      >×</button>
    </div>
  );
}
