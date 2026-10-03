/**
 * StrategyMonitorNotice — 策略監測有新情報時，左下角跳一張通知卡。
 *
 * 2026-09-30（CJ「策略監測有新的資料的時候，可以跳出通知，也會在品牌 mission
 * tray 跳出通知」）：側欄「品牌」圖示的數字只在策略層看得到；這張卡掛在 shell，
 * 在內容層、成效層寫東西的時候也會知道外面有新動靜。
 *
 * 「新」＝比上次通知過的那一則更新（localStorage 記每個品牌通知到哪一則 id），
 * 不是「還有未讀」——不然每次換頁都會再跳一次。每一則只通知一次；要回頭看，
 * 側欄的數字與定位頁的策略監測 chip 都還在。
 *
 * 位置跟 PositioningNotificationCenter 同一個角落但讓開側欄（CJ 2026-05-07
 * 「完成時左下通知，不要 toast 跳出來打斷流程」）；單色，顏色只給狀態。
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSatelliteDish, faXmark } from "@fortawesome/free-solid-svg-icons";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";

const KEY = (brandId: number) => `strategy_monitor_notified:${brandId}`;
function readNotified(brandId: number): number {
  try { return Number(localStorage.getItem(KEY(brandId)) ?? 0) || 0; } catch { return 0; }
}
function writeNotified(brandId: number, id: number) {
  try { localStorage.setItem(KEY(brandId), String(id)); } catch { /* 私密模式：頂多重複通知一次 */ }
}

type Summary = { count: number; latestId: number | null; latestTitle: string | null };

export default function StrategyMonitorNotice({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const location = useLocation();
  const q = (trpc as any).strategyMonitor.unreadSummary.useQuery(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: true, refetchInterval: 5 * 60_000, staleTime: 30_000 },
  );
  const data = q.data as Summary | undefined;
  const [shown, setShown] = useState<{ brandId: number; summary: Summary } | null>(null);

  // 使用者正開著策略監測本身，就不用再通知他。
  const onMonitor = location.pathname.startsWith("/brands") && new URLSearchParams(location.search).get("tool") === "monitor";

  useEffect(() => {
    if (!brandId || !data?.latestId || data.count <= 0) return;
    if (data.latestId <= readNotified(brandId)) return;
    writeNotified(brandId, data.latestId);
    if (onMonitor) return;
    setShown({ brandId, summary: data });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, data?.latestId, data?.count]);

  // 20 秒後自己收起來（計時跟著「這一張卡」走，資料刷新不會把它重設或清掉）。
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 20_000);
    return () => clearTimeout(t);
  }, [shown]);

  // 換品牌時，前一個品牌的通知不要留在畫面上。
  if (!shown || shown.brandId !== brandId) return null;
  const { count, latestTitle } = shown.summary;

  const open = () => {
    setShown(null);
    navigate(`/brands/edit?b=${shown.brandId}&cat=positioning&tool=monitor`);
  };

  return (
    <div
      role="status"
      style={{
        position: "fixed", left: 86, bottom: 16, zIndex: 60,
        width: 320, maxWidth: "calc(100vw - 102px)",
        background: "#fff", border: "1px solid #D4D4D4", borderRadius: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.10)", padding: "12px 14px",
        display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13,
      }}
    >
      <FontAwesomeIcon icon={faSatelliteDish} style={{ fontSize: 14, marginTop: 3, color: "#18181b" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: "#18181b" }}>
          {en ? `Strategy monitoring · ${count} new` : `策略監測有 ${count} 則新情報`}
        </div>
        {latestTitle && (
          <div style={{ color: "#52525b", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={latestTitle}>
            {latestTitle}
          </div>
        )}
        <button
          type="button"
          onClick={open}
          style={{ marginTop: 6, padding: 0, background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "#18181b", textDecoration: "underline" }}
        >
          {en ? "View" : "查看"}
        </button>
      </div>
      <button
        type="button"
        onClick={() => setShown(null)}
        aria-label={en ? "Dismiss" : "關閉"}
        style={{ background: "none", border: "none", cursor: "pointer", color: "#a1a1aa", padding: 2 }}
      >
        <FontAwesomeIcon icon={faXmark} style={{ fontSize: 13 }} />
      </button>
    </div>
  );
}
