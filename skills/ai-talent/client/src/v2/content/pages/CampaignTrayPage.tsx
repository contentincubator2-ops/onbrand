/**
 * CampaignTrayPage — 內容層的「活動」tray：把策略層排好的企劃，一篇一篇寫出來。
 *
 * 2026-09-25（CJ「在內容層增加活動的 mission tray，當我新增活動企劃時，就會出現
 * 該活動的任務卡，並且可以一次撰寫完企劃時，想要寫的內容」）。
 *
 * ── 這一頁的邊界 ─────────────────────────────────────────────────────
 * 策略層（活動企劃頁）決定「要做什麼」，這裡只負責「寫出來」。所以這一頁**沒有**
 * 任何「要不要做這篇」的決策——沒有增刪格子、沒有改日期。要改順序或切角，回企劃頁。
 *
 * 讀的是同一筆資料（campaign.get → events.positioning.campaignPlan），不是複製
 * 一份再同步：策略層改了切角，這裡下一次進來就是新的。
 *
 * ── 兩層結構 ─────────────────────────────────────────────────────────
 *   沒有 ?e=  → 列出這個品牌有企劃的活動（每檔一列：期間、進度）
 *   有 ?e=    → 這檔活動要寫的任務卡（用 TaskCardShell，跟平台任務卡同一個殼）
 *
 * ?start=1 會自動開第一張還沒寫的卡，?item=<id> 會直接開那一張——「開始撰寫」跟
 * 單格「去寫這篇」都從企劃頁帶著這兩個參數過來。交棒是明說的一個動作，不是丟一個
 * 列表讓使用者自己再找一次。
 */
import React from "react";
import { useNavigate, useSearchParams, useOutletContext } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import type { ShellOutletCtx } from "../../app/shell/ShellLayout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebookF, faInstagram, faLinkedinIn, faYoutube, faTiktok, faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope, faBullhorn, faGlobe, faPenNib, faCheck } from "@fortawesome/free-solid-svg-icons";
import { TaskCardShell, TaskCardAvatar } from "../components/TaskCardShell";
import { CAMPAIGN_PHASES } from "../../strategy/lib/campaignSchema";

const INK = "#171717";
const MUTED = "#737373";
const LINE = "#E5E5E5";

const PLATFORM_META: Record<string, { icon: any; bg: string; route: string; label: string }> = {
  facebook:  { icon: faFacebookF,  bg: "#1877F2", route: "fb",    label: "Facebook" },
  instagram: { icon: faInstagram,  bg: "#E1306C", route: "ig",    label: "Instagram" },
  linkedin:  { icon: faLinkedinIn, bg: "#0A66C2", route: "li",    label: "LinkedIn" },
  youtube:   { icon: faYoutube,    bg: "#FF0000", route: "yt",    label: "YouTube" },
  tiktok:    { icon: faTiktok,     bg: "#010101", route: "tt",    label: "TikTok" },
  x:         { icon: faXTwitter,   bg: "#000000", route: "x",     label: "X" },
  email:     { icon: faEnvelope,   bg: "#6B7280", route: "email", label: "Email" },
  pr:        { icon: faBullhorn,   bg: "#B45309", route: "pr",    label: "PR" },
  website:   { icon: faGlobe,      bg: "#0F766E", route: "web",   label: "Website" },
};
const metaOf = (p: string) => PLATFORM_META[p] ?? { icon: faPenNib, bg: "#525252", route: "fb", label: p };

const dicebear = (seed: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=transparent`;

const btn = (primary = false) => ({
  fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
  border: primary ? "0" : `1px solid ${LINE}`, background: primary ? INK : "#fff", color: primary ? "#fff" : INK,
}) as const;

export default function CampaignTrayPage() {
  const { lang } = useLang();
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const ctx = useOutletContext<ShellOutletCtx>();

  const brandId = Number(searchParams.get("b") ?? ctx?.scope?.brandId ?? 0) || null;
  const eventId = Number(searchParams.get("e") ?? 0) || null;
  const startFlag = searchParams.get("start") === "1";
  const wantItem = searchParams.get("item");

  const listQ = (trpc as any).campaign.trayList.useQuery(
    { brandId: brandId ?? 0 }, { enabled: !!brandId && !eventId, refetchOnWindowFocus: false },
  );
  const oneQ = (trpc as any).campaign.get.useQuery(
    { eventId: eventId ?? 0 }, { enabled: !!eventId, refetchOnWindowFocus: false },
  );

  /** 開一張卡去寫：帶著活動、企劃格子與切角，使用者不必再選一次產品或重打折數。 */
  const openItem = React.useCallback((item: any) => {
    const m = metaOf(item.platform);
    const sp = new URLSearchParams();
    sp.set("task", item.taskId);
    sp.set("camp", String(eventId ?? ""));
    sp.set("item", item.id);
    if (item.angle) sp.set("topic", item.angle);
    navigate(`/tasks/${m.route}?${sp.toString()}`);
  }, [eventId, navigate]);

  // ?start=1 / ?item= 的自動開卡。只跑一次——跑兩次會在使用者按上一頁時又把他彈走。
  const firedRef = React.useRef(false);
  React.useEffect(() => {
    if (firedRef.current || !oneQ.data?.plan?.items?.length) return;
    const items = oneQ.data.plan.items.filter((i: any) => i.enabled);
    const target = wantItem
      ? items.find((i: any) => i.id === wantItem)
      : startFlag ? items.find((i: any) => !i.outputId) : null;
    if (!target) return;
    firedRef.current = true;
    openItem(target);
  }, [oneQ.data, wantItem, startFlag, openItem]);

  // ── 層一：這個品牌有企劃的活動 ──
  if (!eventId) {
    const rows: any[] = (listQ.data as any[]) ?? [];
    const live = rows.filter((r) => !r.ended);
    const ended = rows.filter((r) => r.ended);
    return (
      <div style={{ padding: "28px 28px 40px", maxWidth: 900 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: INK, margin: 0 }}>{L("活動", "Campaigns")}</h1>
        <p style={{ fontSize: 13, color: MUTED, marginTop: 6, lineHeight: 1.7 }}>
          {L("這裡是照企劃一篇一篇寫的地方。要改企劃內容（節奏、切角、用哪張卡），回策略層的活動頁。",
             "Write the plan out, one post at a time. To change the plan itself, go back to the campaign page in Strategy.")}
        </p>

        {listQ.isLoading && <p style={{ fontSize: 13, color: MUTED }}>{L("載入中…", "Loading…")}</p>}
        {listQ.error && <p style={{ fontSize: 13, color: "#B91C1C" }}>{String(listQ.error?.message ?? "").slice(0, 200)}</p>}

        {!listQ.isLoading && !listQ.error && rows.length === 0 && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 20, marginTop: 16 }}>
            <p style={{ fontSize: 13, color: INK, margin: 0, fontWeight: 600 }}>
              {L("還沒有任何活動企劃", "No campaign plans yet")}
            </p>
            <p style={{ fontSize: 12, color: MUTED, margin: "6px 0 12px", lineHeight: 1.7 }}>
              {L("任務卡是從企劃長出來的：先到策略層建立活動、填好優惠機制，產生宣傳企劃之後，這裡就會出現要寫的卡。",
                 "Cards here come from a plan: create the campaign in Strategy, fill in the offer, generate the plan — then the cards appear here.")}
            </p>
            <button onClick={() => navigate(`/brands/edit?cat=events${brandId ? `&b=${brandId}` : ""}`)} style={btn(true)}>
              {L("去建立活動企劃", "Go set up a campaign")}
            </button>
          </div>
        )}

        {[["進行中", "Active", live], ["已結束", "Ended", ended]].map(([zh, e2, list]: any) => (
          (list as any[]).length > 0 && (
            <div key={zh} style={{ marginTop: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, marginBottom: 8 }}>{L(zh, e2)}</div>
              <div style={{ display: "grid", gap: 8 }}>
                {(list as any[]).map((r) => (
                  <button key={r.id} onClick={() => navigate(`/campaigns?b=${brandId}&e=${r.id}`)}
                    style={{
                      textAlign: "left", border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px",
                      background: "#fff", cursor: "pointer", display: "grid", gap: 4,
                    }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: MUTED }}>
                      {r.startAt ? `${r.startAt} → ${r.endAt ?? "?"}` : L("未設定期間", "No dates")}
                      {`　｜　${r.done}/${r.total} ${L("已寫", "written")}`}
                    </div>
                    <div style={{ height: 4, borderRadius: 999, background: "#F5F4F2", overflow: "hidden" }}>
                      <div style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%`, height: "100%", background: INK }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        ))}
      </div>
    );
  }

  // ── 層二：這檔活動要寫的任務卡 ──
  const plan = oneQ.data?.plan;
  const ev = oneQ.data?.event;
  const items: any[] = (plan?.items ?? []).filter((i: any) => i.enabled);
  const done = items.filter((i) => !!i.outputId).length;

  return (
    <div style={{ padding: "28px 28px 40px" }}>
      <button onClick={() => navigate(`/campaigns${brandId ? `?b=${brandId}` : ""}`)}
        style={{ ...btn(), padding: "4px 10px", fontSize: 12, marginBottom: 12 }}>
        {L("← 所有活動", "← All campaigns")}
      </button>

      {oneQ.isLoading && <p style={{ fontSize: 13, color: MUTED }}>{L("載入中…", "Loading…")}</p>}
      {oneQ.error && <p style={{ fontSize: 13, color: "#B91C1C" }}>{String(oneQ.error?.message ?? "").slice(0, 200)}</p>}

      {ev && (
        <>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: INK, margin: 0 }}>{ev.name}</h1>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
            {plan?.smp ? `${plan.smp}　｜　` : ""}
            {`${done}/${items.length} ${L("已寫", "written")}`}
            {ev.startAt ? `　｜　${ev.startAt} → ${ev.endAt ?? "?"}` : ""}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {items.some((i) => !i.outputId) && (
              <button onClick={() => { const n = items.find((i) => !i.outputId); if (n) openItem(n); }} style={btn(true)}>
                {L("從下一篇開始寫", "Write the next one")}
              </button>
            )}
            <button onClick={() => navigate(`/brands/edit?cat=campaign&e=${eventId}${brandId ? `&b=${brandId}` : ""}`)} style={btn()}>
              {L("回企劃調整", "Edit the plan")}
            </button>
          </div>
        </>
      )}

      {plan && items.length === 0 && (
        <p style={{ fontSize: 13, color: MUTED, marginTop: 16 }}>
          {L("這檔活動的企劃目前沒有啟用的項目——回企劃頁把要寫的放回來。",
             "Every row in this plan is switched off — put some back in the plan page.")}
        </p>
      )}

      {/* 依檔期節奏分段。卡片用的是跟平台任務卡同一個殼（TaskCardShell）。 */}
      {CAMPAIGN_PHASES.map((ph) => {
        const rows = items.filter((i) => i.phase === ph.id);
        if (!rows.length) return null;
        return (
          <div key={ph.id} style={{ marginTop: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 2 }}>{en ? ph.en : ph.zh}</div>
            <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>{ph.purposeZh}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {rows.map((i) => {
                const m = metaOf(i.platform);
                const written = !!i.outputId;
                return (
                  <TaskCardShell
                    key={i.id}
                    onClick={() => (written && i.outputId ? navigate(`/run/${i.outputId}`) : openItem(i))}
                    ariaLabel={i.taskLabel}
                    media={<>
                      <TaskCardAvatar src={dicebear(i.taskId)} />
                      <span className="absolute top-2 right-2 text-tiny font-bold px-2 py-0.5 rounded-full text-white shadow-sm"
                        style={{ background: written ? "#15803D" : INK, fontSize: 12, letterSpacing: "0.06em" }}>
                        {written ? <><FontAwesomeIcon icon={faCheck} /> {L("已寫", "done")}</> : i.date.slice(5).replace("-", "/")}
                      </span>
                      <div className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: m.bg }}>
                        <FontAwesomeIcon icon={m.icon} className="text-white" style={{ fontSize: 12 }} />
                      </div>
                    </>}
                  >
                    <p className="text-small font-semibold leading-tight line-clamp-2">{i.taskLabel}</p>
                    <p className="text-tiny text-default-500 line-clamp-3">{i.angle}</p>
                    <div className="mt-auto pt-2 flex items-center gap-2 border-t border-default-100">
                      <span className="text-tiny font-medium text-default-700 truncate">
                        {written ? L("看產出 →", "View output →") : L("開始寫 →", "Write it →")}
                      </span>
                    </div>
                  </TaskCardShell>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
