/**
 * CampaignTrayPage — 內容層的「活動」：把策略層排好的企劃，一天一天寫出來。
 *
 * 2026-09-25（CJ「在內容層增加活動的 mission tray」）
 * 2026-09-26（CJ「點進去，會展開該活動的時間與發佈平台的圖，每天的內容點進去，
 * 可以跳出視窗，看到預計要發布的內容」）——這一版把卡片牆換成**檔期日曆**。
 *
 * 為什麼換：活動本來就是一張時間表。第一版把它畫成一格一格的卡片，時間維度整個
 * 消失了——使用者得自己從八張卡的角標上把日期拼回來。日曆讓「哪幾天有東西要發、
 * 分在哪些平台」變成一眼的事，而細節收在點擊之後。
 *
 * 三層資訊，一層只做一件事：
 *   1. 沒帶活動 → 哪幾檔活動、進度多少
 *   2. 帶了活動 → 日曆：每一天有什麼平台要發（有寫完的打勾）
 *   3. 點某一天 → 視窗：那天要發的內容（用跟其他任務頁同一個卡殼），按下去開始寫
 *
 * 讀的是同一筆 campaignPlan（策略層改了切角，這裡下一次進來就是新的）；這一頁
 * 沒有「要不要做這篇」的決策，那是策略層的事。
 */
import React from "react";
import { useNavigate, useSearchParams, useOutletContext } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import type { ShellOutletCtx } from "../../app/shell/ShellLayout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebookF, faInstagram, faLinkedinIn, faYoutube, faTiktok, faXTwitter } from "@fortawesome/free-brands-svg-icons";
import { faEnvelope, faBullhorn, faGlobe, faPenNib, faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { TaskCardShell, TaskCardAvatar } from "../components/TaskCardShell";
import { phaseOf } from "../../strategy/lib/campaignSchema";
import { weeksFor } from "../lib/campaignCalendar";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const INK = "#171717";
const MUTED = "#737373";
const LINE = "#E5E5E5";
const SURFACE = "#FAFAF9";

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

  const [openDay, setOpenDay] = React.useState<string | null>(null);

  const listQ = (trpc as any).campaign.trayList.useQuery(
    { brandId: brandId ?? 0 }, { enabled: !!brandId && !eventId, refetchOnWindowFocus: false },
  );
  const oneQ = (trpc as any).campaign.get.useQuery(
    { eventId: eventId ?? 0 }, { enabled: !!eventId, refetchOnWindowFocus: false },
  );

  const openItem = React.useCallback((item: any) => {
    const m = metaOf(item.platform);
    const sp = new URLSearchParams();
    sp.set("task", item.taskId);
    sp.set("camp", String(eventId ?? ""));
    sp.set("item", item.id);
    if (item.angle) sp.set("topic", item.angle);
    navigate(`/tasks/${m.route}?${sp.toString()}`);
  }, [eventId, navigate]);

  // ?start=1 / ?item= 的自動開卡：交棒要一路到底，不是把人丟在日曆前面再找一次。
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
      <div style={{ padding: "28px 28px 40px", maxWidth: 860 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: INK, margin: 0 }}>{L("活動", "Campaigns")}</h1>
        <p style={{ fontSize: 13, color: MUTED, marginTop: 6, lineHeight: 1.7 }}>
          {L("照企劃一天一天寫。要改企劃本身（節奏、切角、用哪張卡），回策略層的活動頁。",
             "Write the plan out day by day. To change the plan itself, go back to the campaign page in Strategy.")}
        </p>

        {listQ.isLoading && <p style={{ fontSize: 13, color: MUTED }}>{L("載入中…", "Loading…")}</p>}
        {listQ.error && <p style={{ fontSize: 13, color: "#B91C1C" }}>{String(listQ.error?.message ?? "").slice(0, 200)}</p>}

        {!listQ.isLoading && !listQ.error && rows.length === 0 && (
          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 20, marginTop: 16 }}>
            <p style={{ fontSize: 13, color: INK, margin: 0, fontWeight: 600 }}>{L("還沒有任何活動企劃", "No campaign plans yet")}</p>
            <p style={{ fontSize: 12, color: MUTED, margin: "6px 0 12px", lineHeight: 1.7 }}>
              {L("這裡的內容是從企劃長出來的：先到策略層建立活動、寫一句「賣什麼、優惠是什麼」，排出企劃之後這裡就會有東西。",
                 "Everything here comes from a plan: create the campaign in Strategy, say what's on offer, build the plan — then it shows up here.")}
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
                    style={{ textAlign: "left", border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 14px", background: "#fff", cursor: "pointer", display: "grid", gap: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: MUTED }}>
                      {r.startAt ? `${r.startAt} → ${r.endAt ?? "?"}` : L("未設定期間", "No dates")}
                      {`　·　${r.done}/${r.total} ${L("已寫", "written")}`}
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

  // ── 層二：檔期日曆 ──
  const plan = oneQ.data?.plan;
  const ev = oneQ.data?.event;
  const items: any[] = (plan?.items ?? []).filter((i: any) => i.enabled);
  const done = items.filter((i) => !!i.outputId).length;
  const byDay = new Map<string, any[]>();
  for (const i of items) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  const weeks = weeksFor(items.map((i) => i.date));
  const today = ymd(new Date());
  const dayItems = openDay ? (byDay.get(openDay) ?? []) : [];
  const WEEKDAYS = en ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <div style={{ padding: "28px 28px 40px", maxWidth: 980 }}>
      <button onClick={() => navigate(`/campaigns${brandId ? `?b=${brandId}` : ""}`)}
        style={{ ...btn(), padding: "4px 10px", fontSize: 12, marginBottom: 12 }}>
        {L("← 所有活動", "← All campaigns")}
      </button>

      {oneQ.isLoading && <p style={{ fontSize: 13, color: MUTED }}>{L("載入中…", "Loading…")}</p>}
      {oneQ.error && <p style={{ fontSize: 13, color: "#B91C1C" }}>{String(oneQ.error?.message ?? "").slice(0, 200)}</p>}

      {ev && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: INK, margin: 0 }}>{ev.name}</h1>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
              {plan?.smp ? `${plan.smp}　·　` : ""}{`${done}/${items.length} ${L("已寫", "written")}`}
              {ev.startAt ? `　·　${ev.startAt} → ${ev.endAt ?? "?"}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {items.some((i) => !i.outputId) && (
              <button onClick={() => { const n = items.find((i) => !i.outputId); if (n) openItem(n); }} style={btn(true)}>
                {L("從下一篇開始寫", "Write the next one")}
              </button>
            )}
            <button onClick={() => navigate(`/brands/edit?cat=campaign&e=${eventId}${brandId ? `&b=${brandId}` : ""}`)} style={btn()}>
              {L("回企劃調整", "Edit the plan")}
            </button>
          </div>
        </div>
      )}

      {plan && items.length === 0 && (
        <p style={{ fontSize: 13, color: MUTED, marginTop: 16 }}>
          {L("這檔活動的企劃目前沒有啟用的項目——回企劃頁把要寫的放回來。",
             "Every row in this plan is switched off — put some back in the plan page.")}
        </p>
      )}

      {/* 日曆：一眼看出哪幾天有東西、分在哪些平台 */}
      {weeks.length > 0 && (
        <div style={{ marginTop: 18, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: SURFACE }}>
            {WEEKDAYS.map((d) => (
              <div key={d} style={{ fontSize: 11, color: MUTED, textAlign: "center", padding: "6px 0", fontWeight: 600 }}>{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderTop: `1px solid ${LINE}` }}>
              {week.map((day) => {
                const list = byDay.get(day) ?? [];
                const allDone = list.length > 0 && list.every((i) => !!i.outputId);
                const isToday = day === today;
                return (
                  <button
                    key={day}
                    onClick={() => list.length && setOpenDay(day)}
                    disabled={!list.length}
                    style={{
                      minHeight: 86, textAlign: "left", padding: "6px 8px", background: list.length ? "#fff" : SURFACE,
                      border: "none", borderLeft: `1px solid ${LINE}`, cursor: list.length ? "pointer" : "default",
                      display: "flex", flexDirection: "column", gap: 6,
                    }}
                  >
                    <span style={{
                      fontSize: 11, fontWeight: isToday ? 700 : 500,
                      color: list.length ? INK : "#C4C4C4",
                      fontVariantNumeric: "tabular-nums",
                      ...(isToday ? { background: INK, color: "#fff", borderRadius: 999, padding: "1px 6px", alignSelf: "flex-start" } : {}),
                    }}>
                      {Number(day.slice(8))}
                    </span>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                      {list.map((i) => {
                        const m = metaOf(i.platform);
                        return (
                          <span key={i.id} title={`${m.label}｜${i.angle}`}
                            style={{
                              width: 18, height: 18, borderRadius: 999, background: m.bg,
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              opacity: i.outputId ? 0.45 : 1,
                            }}>
                            <FontAwesomeIcon icon={m.icon} className="text-white" style={{ fontSize: 9 }} />
                          </span>
                        );
                      })}
                      {allDone && <FontAwesomeIcon icon={faCheck} style={{ fontSize: 10, color: "#15803D" }} />}
                    </div>
                    {list.length > 0 && (
                      <span style={{ fontSize: 10, color: MUTED, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {list[0]!.angle}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* 某一天的內容：一天通常一到兩則，用跟其他任務頁同一個卡殼 */}
      {openDay && (
        <div
          role="dialog" aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) setOpenDay(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 620, maxHeight: "88vh", overflowY: "auto", padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: INK }}>
                  {openDay.replace(/^\d{4}-/, "").replace("-", " / ")}
                  <span style={{ fontSize: 12, fontWeight: 400, color: MUTED }}>
                    {"　"}{L(`預計發布 ${dayItems.length} 則`, `${dayItems.length} scheduled`)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{ev?.name}</div>
              </div>
              <button onClick={() => setOpenDay(null)} aria-label="close" style={{ ...btn(), padding: "4px 10px" }}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {dayItems.map((i) => {
                const m = metaOf(i.platform);
                const ph = phaseOf(i.phase);
                const written = !!i.outputId;
                return (
                  <TaskCardShell
                    key={i.id}
                    onClick={() => (written ? navigate(`/run/${i.outputId}`) : openItem(i))}
                    ariaLabel={i.angle}
                    media={<>
                      <TaskCardAvatar src={dicebear(i.taskId)} />
                      <span className="absolute top-2 right-2 text-tiny font-bold px-2 py-0.5 rounded-full text-white shadow-sm"
                        style={{ background: written ? "#15803D" : INK, fontSize: 12, letterSpacing: "0.06em" }}>
                        {written ? <><FontAwesomeIcon icon={faCheck} /> {L("已寫", "done")}</> : (ph ? (en ? ph.en : ph.zh) : "")}
                      </span>
                      <div className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: m.bg }}>
                        <FontAwesomeIcon icon={m.icon} className="text-white" style={{ fontSize: 12 }} />
                      </div>
                    </>}
                  >
                    {/* 主角是「這則要發什麼」，用哪張卡是實作細節（降成小字） */}
                    <p className="text-small font-semibold leading-snug line-clamp-3">{i.angle}</p>
                    <p className="text-tiny text-default-400 line-clamp-1">{i.taskLabel}</p>
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
        </div>
      )}
    </div>
  );
}
