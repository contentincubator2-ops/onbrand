/**
 * RecentRunsTile — drop-in card showing the user's most recent task runs
 * for a given tier × brand. Replaces the per-tier history that used to
 * live in the shell sidebar.
 *
 * CJ direction (2026-05-14):「歷史任務當成一個 tile 更有一致性」.
 * Why this is better than the sidebar version:
 *   · same layout on every page (no sidebar churn)
 *   · scrolls with content on mobile, no off-canvas drawer needed
 *   · easy to drop into any page that wants "what did I just make"
 *
 *   <RecentRunsTile tier="30s" />
 *   <RecentRunsTile tier="60s" brandId={scope.brandId} limit={8} />
 *   <RecentRunsTile />  // unfiltered — for /projects or /
 */
import { useNavigate } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";
import { Clock, ChevronRight } from "lucide-react";

interface Props {
  tier?: "30s" | "60s" | "99s" | "100s";
  brandId?: number | null;
  limit?: number;
  /** Compact mode — 3 rows, no header. Used inside narrow content areas. */
  compact?: boolean;
}

export default function RecentRunsTile({ tier, brandId, limit = 6, compact = false }: Props) {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isEn = lang === "en";

  const q = (trpc as any).output?.recent?.useQuery?.(
    { brandId: brandId ?? null, tier, limit },
    { refetchOnWindowFocus: false, staleTime: 30_000 },
  );
  const items: any[] = q?.data ?? [];

  const headerLabel = isEn
    ? (tier ? `${tier} · recent runs` : "Recent runs")
    : (tier ? `${tier} · 最近任務` : "最近任務");

  if (q?.isLoading) {
    return (
      <div style={cardStyle}>
        {!compact && <Header label={headerLabel} />}
        <p style={{ padding: "12px 14px", color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
          {isEn ? "Loading…" : "讀取中…"}
        </p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={cardStyle}>
        {!compact && <Header label={headerLabel} />}
        <div style={{ padding: "20px 16px", textAlign: "center" }}>
          <Clock size={20} color="#d4d4d4" />
          <p style={{ marginTop: 8, fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>
            {isEn
              ? <>No {tier ?? "task"} runs yet.<br/>Your first run will land here.</>
              : <>還沒有{tier ? ` ${tier}` : ""} 任務紀錄。<br/>跑一個就會出現在這裡。</>}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      {!compact && <Header label={headerLabel} count={items.length} />}
      <div>
        {items.map((r) => (
          <RunRow key={r.id} run={r} onClick={() => navigate(`/run/${r.id}`)} />
        ))}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  overflow: "hidden",
};

function Header({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "10px 14px",
      borderBottom: "1px solid #F3F4F6",
      background: "#FAFAFA",
    }}>
      <Clock size={12} color="#A8A29E" />
      <span style={{
        flex: 1, fontSize: 11, fontWeight: 700, color: "#525252",
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>{label}</span>
      {count != null && (
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{count}</span>
      )}
    </div>
  );
}

function RunRow({ run, onClick }: { run: any; onClick: () => void }) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const title = run.title || run.taskId || (isEn ? "(untitled)" : "(無標題)");
  const tier = run.tier as string | undefined;
  const platform = run.platform as string | undefined;
  const initial = String(title).slice(0, 1).toUpperCase();
  const when = relativeTime(run.createdAt, isEn);
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", border: "none", borderBottom: "1px solid #F9FAFB",
        background: "white", cursor: "pointer", textAlign: "left",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
    >
      <span style={{
        width: 30, height: 30, borderRadius: 8,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#FFF7ED", color: "#F97316",
        fontSize: 13, fontWeight: 700, flexShrink: 0,
      }}>
        {initial}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{
          fontSize: 13, fontWeight: 500, color: "#171717",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: "#9ca3af", display: "flex", gap: 6, alignItems: "center" }}>
          {tier && <span style={{
            padding: "1px 6px", borderRadius: 4,
            background: "rgba(124,58,237,0.10)", color: "#5B21B6",
            fontSize: 10, fontWeight: 600,
          }}>{tier}</span>}
          {platform && <span>{platform}</span>}
          {platform && <span>·</span>}
          <span>{when}</span>
        </span>
      </span>
      <ChevronRight size={14} color="#d4d4d4" style={{ flexShrink: 0 }} />
    </button>
  );
}

function relativeTime(iso: string | null | undefined, isEn: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return isEn ? "just now" : "剛剛";
  if (m < 60) return isEn ? `${m}m ago` : `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return isEn ? `${h}h ago` : `${h} 小時前`;
  const day = Math.floor(h / 24);
  if (day < 7) return isEn ? `${day}d ago` : `${day} 天前`;
  return d.toLocaleDateString(isEn ? "en-US" : "zh-TW", { month: "numeric", day: "numeric" });
}
