/**
 * CampaignWorkspace — 活動的「設定 + 宣傳企劃」。**策略層只排，不寫。**
 *
 * 2026-09-25（CJ「在策略層，只做完活動的企劃和編輯，活動撰寫都還是在內容層，在
 * 內容層增加活動的 mission tray」＋「每一格在策略層要也放一顆『去寫這篇』」）。
 *
 * 分層的實作方式：這一頁沒有任何寫作介面。每一格能做的只有「排」——換卡、改切角、
 * 改日期、關掉不做——以及兩顆通往內容層的門：
 *   · 單格「去寫這篇」：真實情況常常是「我只想先把開賣那篇寫掉」
 *   · 底部「開始撰寫（N 篇）」：交棒必須是一個**明說的動作**，不是讓使用者自己
 *     想到左邊 rail 有個新東西
 *
 * 企劃只有一份（events.positioning.campaignPlan），內容層 tray 讀的是同一筆，
 * 所以這裡改了切角，那邊立刻是新的；那邊寫完了，這裡的 ✓ 也會亮。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import {
  CAMPAIGN_TYPES, CAMPAIGN_PHASES, campaignTypeOf, phaseOf,
  EMPTY_CAMPAIGN_SETTINGS, missingForPlan,
  type CampaignSettings, type CampaignPlanItem,
} from "../../lib/campaignSchema";

const INK = "#171717";
const MUTED = "#737373";
const LINE = "#E5E5E5";

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

  const [settings, setSettings] = React.useState<CampaignSettings>(EMPTY_CAMPAIGN_SETTINGS);
  const [productIds, setProductIds] = React.useState<number[]>([]);
  const [plan, setPlan] = React.useState<{ smp: string; items: CampaignPlanItem[]; kol?: any; cobrand?: any } | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [err, setErr] = React.useState("");

  // 伺服器的值進來就覆蓋本地草稿——除非使用者正在改（改到一半被蓋掉比沒存更氣人）
  React.useEffect(() => {
    if (!q.data) return;
    if (!dirty) {
      setSettings({ ...EMPTY_CAMPAIGN_SETTINGS, ...(q.data.settings ?? {}) });
      setProductIds((q.data.products ?? []).map((p: any) => p.id));
    }
    setPlan(q.data.plan ?? null);
  }, [q.data]);   // eslint-disable-line react-hooks/exhaustive-deps

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

  const typeSpec = campaignTypeOf(settings.type);
  const missing = missingForPlan(settings);
  const items = plan?.items ?? [];
  const live = items.filter((i) => i.enabled);
  const done = live.filter((i) => !!i.outputId).length;

  const patch = (next: Partial<CampaignSettings>) => { setSettings((s) => ({ ...s, ...next })); setDirty(true); };
  const toggleChannel = (id: string) =>
    patch({ channels: settings.channels.includes(id) ? settings.channels.filter((c) => c !== id) : [...settings.channels, id] });

  const patchItem = (id: string, next: Partial<CampaignPlanItem>) => {
    setPlan((p) => (p ? { ...p, items: p.items.map((i) => (i.id === id ? { ...i, ...next } : i)) } : p));
  };

  const goWrite = (itemId?: string) => {
    const sp = new URLSearchParams();
    if (brandId) sp.set("b", String(brandId));
    sp.set("e", String(eventId));
    if (itemId) sp.set("item", itemId);
    else sp.set("start", "1");
    navigate(`/campaigns?${sp.toString()}`);
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

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 980 }}>
      {/* ── 標題 ── */}
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: INK }}>{ev?.name}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
          {ev?.startAt ? `${ev.startAt} → ${ev.endAt ?? "?"}` : L("尚未設定期間", "No dates set")}
          {plan ? `｜${L(`企劃 ${live.length} 篇，已寫 ${done} 篇`, `${live.length} planned, ${done} written`)}` : ""}
        </div>
      </div>

      {/* ── ① 設定 ── */}
      <section style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 16, display: "grid", gap: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{L("① 活動設定", "① Campaign setup")}</div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>{L("這是什麼活動", "Campaign type")}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CAMPAIGN_TYPES.map((t) => (
              <button key={t.id} onClick={() => patch({ type: t.id, channels: settings.channels.length ? settings.channels : t.defaultChannels })}
                style={chip(settings.type === t.id)}>{en ? t.en : t.zh}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>
            {L("優惠機制／活動內容", "The offer / what happens")}
          </div>
          <textarea
            value={settings.mechanic}
            onChange={(e) => patch({ mechanic: e.target.value })}
            rows={2} maxLength={600}
            placeholder={typeSpec ? (en ? typeSpec.mechanicHintEn : typeSpec.mechanicHintZh) : L("先選活動類型", "Pick a type first")}
            style={{ width: "100%", fontSize: 13, padding: "8px 10px", border: `1px solid ${LINE}`, borderRadius: 8, resize: "vertical" }}
          />
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
            {L("折數、門檻、期限、限量——寫得多具體，每一篇文案就有多具體。這一段會逐字進到每一篇的脈絡裡。",
               "Discount, threshold, deadline, limits — every post is written from this line.")}
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

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>{L("適用產品", "Products in this campaign")}</div>
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
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
            {L("勾了才拿得到那支產品的售價、規格、份數——折後價與 CP 值要算得出來。",
               "Ticking a product brings its price, spec and servings into every post.")}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>{L("要發的通路", "Channels")}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CHANNELS.map((c) => (
              <button key={c.id} onClick={() => toggleChannel(c.id)} style={chip(settings.channels.includes(c.id))}>
                {en ? c.en : c.zh}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{L("想達成什麼（選填）", "Goal (optional)")}</div>
          <input value={settings.goal} onChange={(e) => patch({ goal: e.target.value })}
            placeholder={L("例：檔期內賣出 200 組 / 帶 50 人到店 / 收 300 筆名單", "e.g. sell 200 bundles / 50 store visits / 300 leads")}
            style={{ fontSize: 13, padding: "7px 10px", border: `1px solid ${LINE}`, borderRadius: 8 }} />
          <div style={{ display: "flex", gap: 14, marginTop: 2 }}>
            {([["kol", "要找網紅合作", "Influencer collab"], ["cobrand", "要做異業合作", "Co-branding"]] as const).map(([k, zh, e2]) => (
              <label key={k} style={{ fontSize: 13, color: INK, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={!!(settings.partners as any)?.[k]}
                  onChange={(ev2) => patch({ partners: { ...(settings.partners ?? {}), [k]: ev2.target.checked } })} />
                {L(zh, e2)}
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => saveSettingsMut.mutate({ eventId, settings, productIds })}
            disabled={saveSettingsMut.isPending}
            style={{ ...btn(dirty), opacity: saveSettingsMut.isPending ? 0.6 : 1 }}
          >
            {saveSettingsMut.isPending ? L("儲存中…", "Saving…") : dirty ? L("儲存設定", "Save setup") : L("已儲存", "Saved")}
          </button>
          {dirty && plan && (
            <span style={{ fontSize: 11, color: "#B45309" }}>
              {L("設定改了——存檔後重新產生企劃才會照新的設定排。", "Settings changed — regenerate the plan to apply them.")}
            </span>
          )}
        </div>
      </section>

      {/* ── ② 企劃 ── */}
      <section style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: 16, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{L("② 宣傳企劃", "② Promotion plan")}</div>
          {plan && (
            <button onClick={() => generateMut.mutate({ eventId })} disabled={generateMut.isPending} style={btn()}>
              {generateMut.isPending ? L("產生中…", "Generating…") : L("重新產生", "Regenerate")}
            </button>
          )}
        </div>

        {!plan && (
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ fontSize: 13, color: MUTED, margin: 0, lineHeight: 1.7 }}>
              {L("按下去會依你的檔期長度排出節奏（預熱→開賣→加溫→倒數→返場），每一格挑一張真實的任務卡，並寫好這一篇要講什麼。排完你可以逐項修改。",
                 "This lays out the beats across your dates, picks a real task card for each, and writes what that post should say. You can edit every row afterwards.")}
            </p>
            {missing.length > 0 && (
              <p style={{ fontSize: 12, color: "#B45309", margin: 0 }}>
                {L(`還差：${missing.join("、")}`, `Still needed: ${missing.join(", ")}`)}
              </p>
            )}
            <button
              onClick={() => { setErr(""); generateMut.mutate({ eventId }); }}
              disabled={missing.length > 0 || generateMut.isPending || dirty}
              style={{ ...btn(true), justifySelf: "start", opacity: (missing.length > 0 || generateMut.isPending || dirty) ? 0.5 : 1 }}
            >
              {generateMut.isPending ? L("產生中…約 20 秒", "Generating… ~20s") : L("產生宣傳企劃", "Generate the plan")}
            </button>
            {dirty && <span style={{ fontSize: 11, color: "#B45309" }}>{L("先儲存設定再產生。", "Save the setup first.")}</span>}
          </div>
        )}

        {plan && (
          <>
            <div style={{ fontSize: 13, color: INK, fontWeight: 600 }}>
              {L("這檔活動的一句話：", "In one line: ")}{plan.smp}
            </div>

            {CAMPAIGN_PHASES.map((ph) => {
              const rows = items.filter((i) => i.phase === ph.id);
              if (!rows.length) return null;
              return (
                <div key={ph.id} style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: INK }}>
                    {en ? ph.en : ph.zh}
                    <span style={{ fontWeight: 400, color: MUTED }}>　{ph.purposeZh}</span>
                  </div>
                  {rows.map((i) => (
                    <div key={i.id} style={{
                      border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 12px",
                      display: "grid", gap: 6, opacity: i.enabled ? 1 : 0.5,
                    }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: MUTED }}>
                        <input type="date" value={i.date} onChange={(e) => patchItem(i.id, { date: e.target.value })}
                          style={{ fontSize: 12, padding: "3px 6px", border: `1px solid ${LINE}`, borderRadius: 6 }} />
                        <span style={{ fontWeight: 600, color: INK }}>{i.taskLabel}</span>
                        <span>{i.platform}</span>
                        {i.repaired && (
                          <span title={L("這一格的卡是系統補的——模型挑的卡不存在", "Auto-filled: the model picked a card that doesn't exist")}
                            style={{ fontSize: 11, color: "#B45309" }}>{L("卡片為系統補選", "auto-picked")}</span>
                        )}
                        {i.outputId ? <span style={{ color: "#15803D", fontWeight: 600 }}>{L("✓ 已寫", "✓ written")}</span> : null}
                      </div>
                      <textarea value={i.angle} onChange={(e) => patchItem(i.id, { angle: e.target.value })}
                        rows={2} maxLength={400}
                        style={{ width: "100%", fontSize: 13, padding: "6px 9px", border: `1px solid ${LINE}`, borderRadius: 6, resize: "vertical" }} />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={() => goWrite(i.id)} style={{ ...btn(), padding: "4px 10px", fontSize: 12 }}>
                          {i.outputId ? L("再寫一次", "Write again") : L("去寫這篇", "Write this one")}
                        </button>
                        <button onClick={() => patchItem(i.id, { enabled: !i.enabled })} style={{ ...btn(), padding: "4px 10px", fontSize: 12 }}>
                          {i.enabled ? L("這篇不做", "Skip this") : L("放回企劃", "Put back")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}

            {(plan.kol || plan.cobrand) && (
              <div style={{ display: "grid", gap: 10 }}>
                {([["kol", "網紅合作", "Influencer collab"], ["cobrand", "異業合作", "Co-branding"]] as const).map(([k, zh, e2]) => {
                  const b = (plan as any)[k];
                  if (!b) return null;
                  return (
                    <div key={k} style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: INK, marginBottom: 4 }}>{L(zh, e2)}</div>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6, lineHeight: 1.6 }}>{b.summary}</div>
                      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                        {(b.steps ?? []).map((st: any) => (
                          <li key={st.id} style={{ fontSize: 12, color: INK, lineHeight: 1.6 }}>
                            {st.text}
                            {st.taskId && <span style={{ color: MUTED }}>（{st.taskLabel}）</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
              <button onClick={() => goWrite()} style={btn(true)}>
                {L(`開始撰寫（${live.length - done} 篇）`, `Start writing (${live.length - done})`)}
              </button>
              <button onClick={() => savePlanMut.mutate({ eventId, plan: { ...plan, items } })}
                disabled={savePlanMut.isPending} style={btn()}>
                {savePlanMut.isPending ? L("儲存中…", "Saving…") : L("儲存企劃", "Save plan")}
              </button>
              <span style={{ fontSize: 11, color: MUTED }}>
                {L("撰寫在內容層的「活動」裡進行——這一頁只負責排。", "Writing happens in the Campaigns tray — this page only plans.")}
              </span>
            </div>
          </>
        )}

        {err && <p style={{ fontSize: 12, color: "#B91C1C", margin: 0 }}>{err.slice(0, 300)}</p>}
      </section>
    </div>
  );
}
