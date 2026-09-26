/**
 * CampaignWorkspace — 活動的「設定 + 宣傳企劃」。**策略層只排，不寫。**
 *
 * 2026-09-25（CJ「在策略層，只做完活動的企劃和編輯，活動撰寫都還是在內容層」
 * ＋「每一格在策略層要也放一顆『去寫這篇』」）
 * 2026-09-26（CJ「我怎麼還是覺得，現在的顯示方式很複雜」）——這一版把畫面砍掉一半：
 *
 * 第一版在寫出第一個字之前，要面對約 70 個可點的元素：設定區 24 個控制項
 * （6 種類型 chips、10 個通路 chips、產品、目標、合作模組…），企劃區每一格
 * 4 個決定 ×8 格，再加上五個階段的區塊標題、合作段落、三顆底部按鈕。
 *
 * 現在：
 *   · 設定＝**一段話**（活動在賣什麼、優惠是什麼）。類型／通路／產品由 AI 從那段話
 *     推斷，只呈現成一行摘要；猜錯才點「調整」展開原本那些控制項。
 *   · 企劃＝**一條清單**，一行就是「日期・平台・要發什麼」，行末一顆「寫」。
 *     換卡、改日期、不做都收進「⋯」——排企劃的當下只需要決定一件事：這篇要不要。
 *   · 階段不再是區塊標題，只是那一行前面的兩個字。
 *
 * 分層沒有變：這一頁仍然沒有任何寫作介面，「寫」是通往內容層活動 tray 的門。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import {
  CAMPAIGN_TYPES, campaignTypeOf, phaseOf,
  EMPTY_CAMPAIGN_SETTINGS,
  type CampaignSettings, type CampaignPlanItem,
} from "../../lib/campaignSchema";

const INK = "#171717";
const MUTED = "#737373";
const LINE = "#E5E5E5";
const SURFACE = "#FAFAF9";

const CHANNELS: Array<{ id: string; zh: string; en: string }> = [
  { id: "facebook", zh: "Facebook", en: "Facebook" },
  { id: "instagram", zh: "Instagram", en: "Instagram" },
  { id: "email", zh: "電子報", en: "Email" },
  { id: "pr", zh: "新聞稿", en: "PR" },
  { id: "website", zh: "官網", en: "Website" },
  { id: "linkedin", zh: "LinkedIn", en: "LinkedIn" },
  { id: "threads", zh: "Threads", en: "Threads" },
  { id: "x", zh: "X", en: "X" },
  { id: "youtube", zh: "YouTube", en: "YouTube" },
  { id: "tiktok", zh: "TikTok", en: "TikTok" },
];
const channelLabel = (id: string, en: boolean) => {
  const c = CHANNELS.find((x) => x.id === id);
  return c ? (en ? c.en : c.zh) : id;
};

const btn = (primary = false) => ({
  fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
  border: primary ? "0" : `1px solid ${LINE}`, background: primary ? INK : "#fff", color: primary ? "#fff" : INK,
}) as const;

const chip = (on: boolean) => ({
  fontSize: 12, fontWeight: 500, padding: "5px 11px", borderRadius: 999, cursor: "pointer",
  border: `1px solid ${on ? INK : LINE}`, background: on ? INK : "#fff", color: on ? "#fff" : INK,
}) as const;

export default function CampaignWorkspace({ eventId, brandId }: { eventId: number; brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const navigate = useNavigate();
  const utils = (trpc as any).useUtils();

  const q = (trpc as any).campaign.get.useQuery({ eventId }, { refetchOnWindowFocus: false });
  const productsQ = (trpc as any).product?.list?.useQuery?.(
    { brandId: brandId ?? undefined }, { enabled: !!brandId, refetchOnWindowFocus: false },
  ) ?? { data: [] };

  const [brief, setBrief] = React.useState("");
  const [settings, setSettings] = React.useState<CampaignSettings>(EMPTY_CAMPAIGN_SETTINGS);
  const [productIds, setProductIds] = React.useState<number[]>([]);
  const [plan, setPlan] = React.useState<{ smp: string; items: CampaignPlanItem[]; kol?: any; cobrand?: any } | null>(null);
  const [expanded, setExpanded] = React.useState(false);   // 設定的細項，預設收起來
  const [openRow, setOpenRow] = React.useState<string | null>(null);   // 哪一行按了「⋯」
  const [dirty, setDirty] = React.useState(false);
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (!q.data) return;
    if (!dirty) {
      const s = { ...EMPTY_CAMPAIGN_SETTINGS, ...(q.data.settings ?? {}) };
      setSettings(s);
      setBrief((prev) => prev || s.mechanic || "");
      setProductIds((q.data.products ?? []).map((p: any) => p.id));
    }
    setPlan(q.data.plan ?? null);
  }, [q.data]);   // eslint-disable-line react-hooks/exhaustive-deps

  const inferMut = (trpc as any).campaign.infer.useMutation({
    onSuccess: (r: any) => {
      setSettings((s) => ({ ...s, type: r.type, mechanic: r.mechanic || brief, goal: r.goal ?? "", channels: r.channels }));
      setProductIds(r.productIds ?? []);
      setDirty(true);
    },
    onError: (e: any) => setErr(e?.message ?? ""),
  });
  const saveSettingsMut = (trpc as any).campaign.saveSettings.useMutation({
    onSuccess: () => { setDirty(false); utils?.campaign?.get?.invalidate?.({ eventId }); },
    onError: (e: any) => setErr(e?.message ?? ""),
  });
  const generateMut = (trpc as any).campaign.generate.useMutation({
    onSuccess: (p: any) => { setPlan(p); utils?.campaign?.get?.invalidate?.({ eventId }); },
    onError: (e: any) => setErr(e?.message ?? ""),
  });
  const savePlanMut = (trpc as any).campaign.savePlan.useMutation({
    onSuccess: () => utils?.campaign?.get?.invalidate?.({ eventId }),
    onError: (e: any) => setErr(e?.message ?? ""),
  });

  const items = plan?.items ?? [];
  const live = items.filter((i) => i.enabled);
  const done = live.filter((i) => !!i.outputId).length;
  const ready = !!settings.type && !!(settings.mechanic || brief).trim() && settings.channels.length > 0;

  const patch = (next: Partial<CampaignSettings>) => { setSettings((s) => ({ ...s, ...next })); setDirty(true); };
  const patchItem = (id: string, next: Partial<CampaignPlanItem>) =>
    setPlan((p) => (p ? { ...p, items: p.items.map((i) => (i.id === id ? { ...i, ...next } : i)) } : p));

  const goWrite = (itemId?: string) => {
    const sp = new URLSearchParams();
    if (brandId) sp.set("b", String(brandId));
    sp.set("e", String(eventId));
    if (itemId) sp.set("item", itemId); else sp.set("start", "1");
    navigate(`/campaigns?${sp.toString()}`);
  };

  /** 一步到位：存設定 → 產生企劃。使用者要的是企劃，不是「儲存成功」。 */
  const saveAndGenerate = () => {
    setErr("");
    const next = { ...settings, mechanic: (settings.mechanic || brief).trim() };
    saveSettingsMut.mutate({ eventId, settings: next, productIds }, {
      onSuccess: () => generateMut.mutate({ eventId }),
    });
  };

  if (q.isLoading) return <p style={{ fontSize: 13, color: MUTED }}>{L("載入中…", "Loading…")}</p>;
  if (q.error) {
    return (
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 16 }}>
        <p style={{ fontSize: 13, color: "#B91C1C", margin: 0 }}>{String(q.error?.message ?? "").slice(0, 200)}</p>
        <button onClick={() => q.refetch?.()} style={{ ...btn(), marginTop: 10 }}>{L("重試", "Retry")}</button>
      </div>
    );
  }

  const ev = q.data?.event;
  const busy = inferMut.isPending || saveSettingsMut.isPending || generateMut.isPending;
  const summaryLine = [
    campaignTypeOf(settings.type) ? (en ? campaignTypeOf(settings.type)!.en : campaignTypeOf(settings.type)!.zh) : null,
    settings.channels.length ? settings.channels.map((c) => channelLabel(c, en)).join(" + ") : null,
    productIds.length
      ? productIds.map((id) => ((productsQ.data as any[]) ?? []).find((p: any) => p.id === id)?.name).filter(Boolean).join("、")
      : null,
  ].filter(Boolean).join("　·　");

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 820 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: INK }}>{ev?.name}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
          {ev?.startAt ? `${ev.startAt} → ${ev.endAt ?? "?"}` : L("尚未設定期間", "No dates set")}
          {plan ? `　·　${L(`${live.length} 篇，已寫 ${done}`, `${live.length} posts, ${done} written`)}` : ""}
        </div>
      </div>

      {/* ── 設定：一段話 ───────────────────────────────────────────── */}
      <section style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 16, display: "grid", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>
          {L("這檔活動在賣什麼、優惠是什麼？", "What's on offer?")}
        </div>
        <textarea
          value={brief}
          onChange={(e) => { setBrief(e.target.value); setDirty(true); }}
          rows={2} maxLength={800}
          placeholder={L("例：中秋檔期，橫膈牛排＋厚切牛舌組合早鳥 8 折，9/20–9/28，數量有限",
                         "e.g. Mid-Autumn bundle, 20% off early bird, 9/20–9/28, limited stock")}
          style={{ width: "100%", fontSize: 14, padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 8, resize: "vertical", lineHeight: 1.7 }}
        />

        {/* 推斷結果：一行摘要。猜錯才點開改。 */}
        {summaryLine ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: SURFACE, borderRadius: 8, padding: "8px 10px" }}>
            <span style={{ fontSize: 12, color: INK }}>{summaryLine}</span>
            <button onClick={() => setExpanded((v) => !v)} style={{ ...btn(), padding: "2px 9px", fontSize: 11 }}>
              {expanded ? L("收起", "Close") : L("調整", "Adjust")}
            </button>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: MUTED }}>
            {L("寫完按下面的按鈕，我會判斷活動類型、要發的通路與適用產品——猜錯可以改。",
               "We'll work out the type, channels and products from this — you can correct it.")}
          </div>
        )}

        {/* 細項：預設收起來。這些就是第一版一開場就全部攤開的 24 個控制項。 */}
        {expanded && (
          <div style={{ display: "grid", gap: 12, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>{L("活動類型", "Type")}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {CAMPAIGN_TYPES.map((t) => (
                  <button key={t.id} onClick={() => patch({ type: t.id })} style={chip(settings.type === t.id)}>
                    {en ? t.en : t.zh}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>{L("要發的通路", "Channels")}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {CHANNELS.map((c) => (
                  <button key={c.id} style={chip(settings.channels.includes(c.id))}
                    onClick={() => patch({ channels: settings.channels.includes(c.id)
                      ? settings.channels.filter((x) => x !== c.id) : [...settings.channels, c.id] })}>
                    {en ? c.en : c.zh}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>{L("適用產品", "Products")}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {((productsQ.data as any[]) ?? []).map((p: any) => {
                  const on = productIds.includes(p.id);
                  return (
                    <button key={p.id} style={chip(on)}
                      onClick={() => { setDirty(true); setProductIds((ids) => on ? ids.filter((x) => x !== p.id) : [...ids, p.id]); }}>
                      {p.name}
                    </button>
                  );
                })}
                {!((productsQ.data as any[]) ?? []).length && (
                  <span style={{ fontSize: 12, color: MUTED }}>{L("這個品牌還沒有產品", "No products yet")}</span>
                )}
              </div>
            </div>
            {settings.type === "offline" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {([["venue", "地點", "Venue"], ["sessions", "場次", "Sessions"], ["signupUrl", "報名連結", "Sign-up URL"]] as const).map(([k, zh, e2]) => (
                  <div key={k}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>{L(zh, e2)}</div>
                    <input value={(settings as any)[k] ?? ""} onChange={(ev2) => patch({ [k]: ev2.target.value } as any)}
                      style={{ width: "100%", fontSize: 13, padding: "7px 10px", border: `1px solid ${LINE}`, borderRadius: 8 }} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 14 }}>
              {([["kol", "要找網紅合作", "Influencer collab"], ["cobrand", "要做異業合作", "Co-branding"]] as const).map(([k, zh, e2]) => (
                <label key={k} style={{ fontSize: 13, color: INK, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!(settings.partners as any)?.[k]}
                    onChange={(ev2) => patch({ partners: { ...(settings.partners ?? {}), [k]: ev2.target.checked } })} />
                  {L(zh, e2)}
                </label>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!summaryLine && (
            <button onClick={() => { setErr(""); inferMut.mutate({ eventId, brief }); }}
              disabled={!brief.trim() || busy}
              style={{ ...btn(true), opacity: (!brief.trim() || busy) ? 0.5 : 1 }}>
              {inferMut.isPending ? L("判斷中…", "Working…") : L("下一步", "Next")}
            </button>
          )}
          {summaryLine && (
            <button onClick={saveAndGenerate} disabled={!ready || busy}
              style={{ ...btn(true), opacity: (!ready || busy) ? 0.5 : 1 }}>
              {generateMut.isPending ? L("排企劃中…約 20 秒", "Planning… ~20s")
                : plan ? L("依現在的設定重排", "Re-plan") : L("排出宣傳企劃", "Build the plan")}
            </button>
          )}
          {err && <span style={{ fontSize: 12, color: "#B91C1C" }}>{err.slice(0, 200)}</span>}
        </div>
      </section>

      {/* ── 企劃：一條清單 ─────────────────────────────────────────── */}
      {plan && (
        <section style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: INK }}>{plan.smp}</div>
            <div style={{ fontSize: 11, color: MUTED }}>
              {L("一行一篇。按「寫」會在內容層打開這一篇。", "One row per post. “Write” opens it in the content layer.")}
            </div>
          </div>

          <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" }}>
            {items.map((i, idx) => {
              const ph = phaseOf(i.phase);
              const open = openRow === i.id;
              return (
                <div key={i.id} style={{
                  borderTop: idx === 0 ? "none" : `1px solid ${LINE}`,
                  background: i.enabled ? "#fff" : SURFACE, opacity: i.enabled ? 1 : 0.55,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px" }}>
                    <span style={{ fontSize: 12, color: MUTED, width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                      {i.date.slice(5).replace("-", "/")}
                    </span>
                    <span style={{ fontSize: 11, color: MUTED, width: 52, flexShrink: 0 }}>{ph ? (en ? ph.en : ph.zh) : ""}</span>
                    <span style={{ fontSize: 11, color: MUTED, width: 64, flexShrink: 0 }}>{channelLabel(i.platform, en)}</span>
                    <input
                      value={i.angle}
                      onChange={(e) => patchItem(i.id, { angle: e.target.value })}
                      style={{ flex: 1, minWidth: 0, fontSize: 13, color: INK, border: "none", outline: "none", background: "transparent", padding: "2px 0" }}
                    />
                    {i.outputId ? (
                      <button onClick={() => navigate(`/run/${i.outputId}`)} style={{ ...btn(), padding: "3px 10px", fontSize: 12, flexShrink: 0 }}>
                        {L("✓ 看", "✓ View")}
                      </button>
                    ) : (
                      <button onClick={() => goWrite(i.id)} disabled={!i.enabled}
                        style={{ ...btn(true), padding: "3px 12px", fontSize: 12, flexShrink: 0, opacity: i.enabled ? 1 : 0.4 }}>
                        {L("寫", "Write")}
                      </button>
                    )}
                    <button onClick={() => setOpenRow(open ? null : i.id)} aria-label="more"
                      style={{ ...btn(), padding: "3px 8px", fontSize: 12, flexShrink: 0 }}>⋯</button>
                  </div>

                  {/* 「⋯」展開才出現的三件事——排企劃的當下不該同時面對它們 */}
                  {open && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "0 12px 10px 66px" }}>
                      <label style={{ fontSize: 11, color: MUTED }}>{L("日期", "Date")}</label>
                      <input type="date" value={i.date} onChange={(e) => patchItem(i.id, { date: e.target.value })}
                        style={{ fontSize: 12, padding: "3px 6px", border: `1px solid ${LINE}`, borderRadius: 6 }} />
                      <span style={{ fontSize: 11, color: MUTED }}>
                        {L("用的卡：", "Card: ")}{i.taskLabel}
                        {i.repaired ? L("（系統補選）", " (auto-picked)") : ""}
                      </span>
                      <button onClick={() => patchItem(i.id, { enabled: !i.enabled })} style={{ ...btn(), padding: "3px 9px", fontSize: 11 }}>
                        {i.enabled ? L("這篇不做", "Skip") : L("放回企劃", "Put back")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 合作：勾了才有，收成兩行摘要，細節在 tray 裡跟著那幾張卡走 */}
          {(plan.kol || plan.cobrand) && (
            <div style={{ display: "grid", gap: 6 }}>
              {([["kol", "網紅合作", "Influencer collab"], ["cobrand", "異業合作", "Co-branding"]] as const).map(([k, zh, e2]) => {
                const b = (plan as any)[k];
                if (!b) return null;
                return (
                  <details key={k} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "8px 12px" }}>
                    <summary style={{ fontSize: 12, fontWeight: 600, color: INK, cursor: "pointer" }}>
                      {L(zh, e2)}　<span style={{ fontWeight: 400, color: MUTED }}>{b.summary}</span>
                    </summary>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
                      {(b.steps ?? []).map((st: any) => (
                        <li key={st.id} style={{ fontSize: 12, color: INK, lineHeight: 1.6 }}>
                          {st.text}{st.taskId && <span style={{ color: MUTED }}>（{st.taskLabel}）</span>}
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => goWrite()} style={btn(true)}>
              {L(`開始撰寫（還有 ${live.length - done} 篇）`, `Start writing (${live.length - done} left)`)}
            </button>
            <button onClick={() => savePlanMut.mutate({ eventId, plan: { ...plan, items } })}
              disabled={savePlanMut.isPending} style={btn()}>
              {savePlanMut.isPending ? L("儲存中…", "Saving…") : L("儲存企劃", "Save plan")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
