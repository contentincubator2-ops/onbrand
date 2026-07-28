/**
 * StrategyWorkbench — 品牌大腦策略工作台（P1，2026-07-28 CJ「開工」）.
 *
 * 三個輸入槽（受眾 × 競爭組 × 主打優勢）→「重新推導」→ 四區看板：
 * 🎯 甜蜜點（含 need←gap←ours 推導鏈＋各自長出的標語）／⚔️ 基本籌碼／
 * 🚫 對手地盤／💤 自嗨區。受眾與競品 chip 可下鑽原始研究面板。
 *
 * 設計紀律（CJ）：圖示一律單色線條；色彩只留功能語意——甜蜜點區橙框、
 * 推導鏈紅（對手缺口）／綠（我方能力）底線。
 *
 * P1 =選擇＋單次推導＋情境儲存（positioning._workbench）；
 * P2 情境比較／套用回寫、深挖此點在後續 phase。
 */
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { showToastGlobal } from "../../../components/ui/Toast";

/* 單色線條 icon（stroke currentColor） */
const Ic = ({ d, vb = "0 0 24 24" }: { d: string; vb?: string }) => (
  <svg viewBox={vb} style={{ width: 13, height: 13, verticalAlign: -2 }}
       fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {d.split("|").map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const IC = {
  user:   "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M4 21c0-4 3.5-7 8-7s8 3 8 7",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18|M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9|M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
  gem:    "M12 3l7 6-7 12L5 9z|M5 9h14",
  redo:   "M20 11a8 8 0 1 0-2.3 6|M20 5v6h-6",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13|M15.5 15.5L21 21",
  close:  "M6 6l12 12|M18 6L6 18",
};

type Chip = { key: string; label: string; value: string; drill?: "audience" | "competitor" };

export default function StrategyWorkbench({
  brandId, positioning, lang,
}: {
  brandId: number;
  positioning: Record<string, any>;
  lang: "zh-TW" | "en";
}) {
  const en = lang === "en";
  const navigate = useNavigate();
  const utils = (trpc as any).useUtils?.();
  const deriveMut = (trpc as any).workbench?.derive?.useMutation?.();
  const digMut = (trpc as any).workbench?.digSpot?.useMutation?.();
  const applyMut = (trpc as any).workbench?.applyScenario?.useMutation?.();
  const [digging, setDigging] = useState<number | null>(null);

  const aud = positioning?.audience ?? {};
  const compRows: any[] = Array.isArray(positioning?.competition?.direct) ? positioning.competition.direct : [];
  const diff = positioning?.differentiation ?? {};

  const audienceChips: Chip[] = useMemo(() => {
    const out: Chip[] = [];
    if (aud.primary) out.push({ key: "primary", label: en ? "Primary audience" : "主受眾", value: String(aud.primary), drill: "audience" });
    if (aud.secondary) out.push({ key: "secondary", label: en ? "Secondary audience" : "次受眾", value: String(aud.secondary), drill: "audience" });
    return out;
  }, [aud.primary, aud.secondary, en]);

  const competitorChips: Chip[] = useMemo(
    () => compRows.map((c: any, i: number) => ({
      key: `c${i}`, label: String(c?.name ?? `競品 ${i + 1}`), value: String(c?.name ?? ""), drill: "competitor" as const,
    })),
    [compRows],
  );

  const advantageChips: Chip[] = useMemo(() => {
    const out: Chip[] = [];
    if (diff.functional) out.push({ key: "functional", label: en ? "Functional edge" : "功能差異化", value: String(diff.functional) });
    if (diff.emotional) out.push({ key: "emotional", label: en ? "Emotional edge" : "情感差異化", value: String(diff.emotional) });
    if (diff.summary && out.length === 0) out.push({ key: "summary", label: en ? "Differentiation" : "差異化總結", value: String(diff.summary) });
    return out;
  }, [diff.functional, diff.emotional, diff.summary, en]);

  const scenarios: any[] = Array.isArray(positioning?._workbench?.scenarios) ? positioning._workbench.scenarios : [];
  const appliedId: string | null = positioning?._workbench?.appliedId ?? null;
  const [activeName, setActiveName] = useState<string | null>(null);
  const active = scenarios.find((s) => s?.name === (activeName ?? "")) ??
    (activeName ? null : scenarios[scenarios.length - 1] ?? null);

  const [selAudience, setSelAudience] = useState<string>("primary");
  const [selComp, setSelComp] = useState<Set<string>>(() => new Set(competitorChips.slice(0, 2).map((c) => c.key)));
  const [selAdv, setSelAdv] = useState<Set<string>>(() => new Set(advantageChips.map((c) => c.key)));
  const [drill, setDrill] = useState<{ kind: "audience" | "competitor"; key: string } | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // P2: switching to a stored scenario restores its slot selection so the
  // slots always show what THIS scenario was derived from.
  const restoreSelection = (scn: any) => {
    const sel = scn?.selection;
    if (!sel) return;
    const audKey = audienceChips.find((c) => c.value === sel.audience)?.key;
    if (audKey) setSelAudience(audKey);
    if (Array.isArray(sel.competitors)) {
      const keys = competitorChips.filter((c) => sel.competitors.includes(c.value)).map((c) => c.key);
      if (keys.length > 0) setSelComp(new Set(keys));
    }
    if (Array.isArray(sel.advantages)) {
      const keys = advantageChips.filter((c) => sel.advantages.some((a: string) => c.value.startsWith(a.slice(0, 30)))).map((c) => c.key);
      if (keys.length > 0) setSelAdv(new Set(keys));
    }
  };
  const nextScenarioName = () => {
    const letters = "ABCDEFGH";
    for (const ch of letters) {
      const name = `情境 ${ch}`;
      if (!scenarios.some((s) => s?.name === name)) return name;
    }
    return `情境 ${letters[scenarios.length % letters.length]}`;
  };

  // 資料還不足（受眾或競品段未完成）→ 不佔版面
  if (audienceChips.length === 0 || competitorChips.length === 0) return null;

  const toggle = (set: Set<string>, key: string, min = 1) => {
    const next = new Set(set);
    if (next.has(key)) { if (next.size > min) next.delete(key); } else next.add(key);
    return next;
  };

  const runDerive = () => {
    const audienceText = audienceChips.find((c) => c.key === selAudience)?.value ?? audienceChips[0]!.value;
    const competitors = competitorChips.filter((c) => selComp.has(c.key)).map((c) => c.value);
    const advantages = advantageChips.filter((c) => selAdv.has(c.key)).map((c) => c.value.slice(0, 200));
    if (competitors.length === 0 || advantages.length === 0) {
      showToastGlobal(en ? "Pick at least one competitor and one advantage" : "請至少選一個競爭者與一個優勢");
      return;
    }
    const name = activeName ?? active?.name ?? "情境 A";
    deriveMut?.mutate?.(
      { brandId, scenarioName: name, selection: { audience: audienceText.slice(0, 600), competitors, advantages } },
      {
        onSuccess: (r: any) => {
          if (r?.ok) {
            showToastGlobal(en ? "Derivation complete" : "✓ 推導完成，看板已更新", "success");
            setActiveName(r.scenario?.name ?? name);
            utils?.scope?.active?.invalidate?.();
          } else {
            showToastGlobal(r?.error ?? (en ? "Derivation failed" : "推導失敗，請再試一次"));
          }
        },
        onError: (e: any) => showToastGlobal((typeof e?.message === "string" ? e.message : null) ?? (en ? "Derivation failed" : "推導失敗，請再試一次")),
      },
    );
  };

  const derived = active?.derived as undefined | {
    spots: Array<{
      lane: string; title: string; need: string; gap: string; ours: string;
      tagline?: { zh: string; en?: string };
      dig?: { scenes?: Array<{ scene: string; mot: string }>; contentAngles?: string[]; risks?: string[] };
    }>;
    stakes: Array<{ title: string; note?: string }>;
    rivalTurf: Array<{ title: string; note?: string }>;
    vanity: Array<{ title: string; note?: string }>;
    currentTaglineSpot?: string | null;
  };

  const S = {
    chip: (on: boolean): React.CSSProperties => ({
      fontSize: 12, fontWeight: 600, padding: "4px 13px", borderRadius: 999, cursor: "pointer",
      border: `1.5px solid ${on ? "#2A2630" : "#D9D5CD"}`,
      background: on ? "#2A2630" : "#FAF9F6", color: on ? "#fff" : "#6E6878",
    }),
    zoneCard: { background: "#fff", borderRadius: 10, padding: "9px 13px", marginBottom: 8, boxShadow: "0 1px 2px rgba(0,0,0,.06)" } as React.CSSProperties,
    act: { fontSize: 11, fontWeight: 700, border: "1.5px solid #C9C4BC", color: "#2A2630", borderRadius: 8, padding: "3px 10px", background: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 } as React.CSSProperties,
  };

  const drillAudience = drill?.kind === "audience" ? audienceChips.find((c) => c.key === drill.key) : null;
  const drillComp = drill?.kind === "competitor"
    ? compRows[Number(drill.key.slice(1))] ?? null
    : null;

  return (
    <div style={{ margin: "0 0 28px", border: "1.5px solid #C9C4BC", borderRadius: 14, background: "#FCFBF9", position: "relative" }}>
      {/* header */}
      <div onClick={() => setCollapsed(!collapsed)}
           style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}><Ic d={IC.target} /> {en ? "Strategy Workbench" : "策略工作台"}</span>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".1em", border: "1px solid #C9C4BC", borderRadius: 5, padding: "1px 6px", color: "#8A8494" }}>BETA</span>
          <span style={{ fontSize: 11.5, color: "#8A8494" }}>
            {en ? "consumer wants × rivals can't × we can" : "消費者想要 × 競爭者無法 × 我們能提供"}
          </span>
        </div>
        <span style={{ fontSize: 12, color: "#8A8494" }}>{collapsed ? "▸" : "▾"}</span>
      </div>
      {collapsed ? null : (
      <div style={{ padding: "0 18px 16px" }}>
        {/* P2 情境分頁 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {scenarios.map((s) => (
            <span key={s.id}
                  onClick={() => { setActiveName(s.name); restoreSelection(s); }}
                  style={{
                    fontSize: 11.5, fontWeight: 700, padding: "4px 13px", borderRadius: 8, cursor: "pointer",
                    border: `1.5px solid ${active?.id === s.id ? "#2A2630" : "#D9D5CD"}`,
                    background: active?.id === s.id ? "#2A2630" : "#fff",
                    color: active?.id === s.id ? "#fff" : "#6E6878",
                  }}>
              {s.name}{appliedId === s.id ? (en ? " · applied" : " · 已套用") : ""}
            </span>
          ))}
          <span onClick={() => setActiveName(nextScenarioName())}
                style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 13px", borderRadius: 8, cursor: "pointer", border: "1.5px dashed #C9C4BC", color: "#A8A29E", background: "transparent" }}>
            ＋ {en ? "New scenario" : "新情境"}
          </span>
          {activeName && !scenarios.some((s) => s.name === activeName) && (
            <span style={{ fontSize: 11, color: "#8A8494", alignSelf: "center" }}>
              {en ? `“${activeName}” — pick anchors and derive` : `「${activeName}」尚未推導——選好錨點按「重新推導」`}
            </span>
          )}
        </div>
        {/* 輸入槽 */}
        <div style={{ background: "#fff", border: "1px solid #E5E1DA", borderRadius: 12, padding: "10px 14px 12px", marginBottom: 14 }}>
          {[
            { icon: IC.user, label: en ? "Audience" : "目標受眾", hint: en ? "click chip to view research" : "點 chip 名稱可查原始研究", body: (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {audienceChips.map((c) => (
                  <span key={c.key} style={S.chip(selAudience === c.key)}>
                    <span onClick={() => setSelAudience(c.key)}>{selAudience === c.key ? "✓ " : ""}{c.label}・{c.value.slice(0, 18)}…</span>
                    <span onClick={(e) => { e.stopPropagation(); setDrill({ kind: "audience", key: c.key }); }}
                          style={{ marginLeft: 6, fontSize: 10.5, opacity: .8, borderBottom: "1px dotted currentColor" }}>
                      {en ? "research ↗" : "查看研究 ↗"}
                    </span>
                  </span>
                ))}
              </div>
            )},
            { icon: IC.target, label: en ? "Competitor set" : "競爭組合", hint: en ? "multi-select" : "可多選；點名稱可查競品研究", body: (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {competitorChips.map((c) => (
                  <span key={c.key} style={S.chip(selComp.has(c.key))}>
                    <span onClick={() => setSelComp(toggle(selComp, c.key))}>{selComp.has(c.key) ? "✓ " : ""}{c.label}</span>
                    <span onClick={(e) => { e.stopPropagation(); setDrill({ kind: "competitor", key: c.key }); }}
                          style={{ marginLeft: 6, fontSize: 10.5, opacity: .8, borderBottom: "1px dotted currentColor" }}>↗</span>
                  </span>
                ))}
              </div>
            )},
            { icon: IC.gem, label: en ? "Lead advantages" : "主打優勢", hint: en ? "from differentiation" : "取自差異化資產", body: (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {advantageChips.map((c) => (
                  <span key={c.key} style={S.chip(selAdv.has(c.key))} onClick={() => setSelAdv(toggle(selAdv, c.key))}>
                    {selAdv.has(c.key) ? "✓ " : ""}{c.label}・{c.value.slice(0, 16)}…
                  </span>
                ))}
              </div>
            )},
          ].map((row, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "7px 0", borderTop: i > 0 ? "1px dashed #EFEDE8" : "none" }}>
              <div style={{ flex: "none", width: 118, fontSize: 12, fontWeight: 800, paddingTop: 4 }}>
                <Ic d={row.icon} /> {row.label}
                <div style={{ fontWeight: 500, fontSize: 9.5, color: "#A8A29E" }}>{row.hint}</div>
              </div>
              <div style={{ flex: 1 }}>{row.body}</div>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginTop: 10, paddingTop: 10, borderTop: "1px solid #EFEDE8" }}>
            <p style={{ fontSize: 11, color: "#8A8494", margin: 0 }}>
              {en ? "Changing any slot re-derives only the downstream (gaps → sweet spots → taglines), ~30s."
                  : "改動任一選擇後按「重新推導」— 只重算下游（需求缺口 → 甜蜜點 → 標語），約 30 秒，結果存入情境。"}
            </p>
            <button onClick={runDerive} disabled={deriveMut?.isPending}
                    style={{ flex: "none", fontSize: 12.5, fontWeight: 800, background: deriveMut?.isPending ? "#8A8494" : "#2A2630", color: "#fff", border: "none", borderRadius: 10, padding: "8px 18px", cursor: deriveMut?.isPending ? "wait" : "pointer" }}>
              <Ic d={IC.redo} /> {deriveMut?.isPending ? (en ? "Deriving…" : "推導中…約 30 秒") : (en ? "Derive" : "重新推導")}
            </button>
          </div>
        </div>

        {/* 看板 */}
        {!derived ? (
          <div style={{ textAlign: "center", padding: "26px 0 18px", color: "#8A8494", fontSize: 12.5 }}>
            {en ? "Pick your anchors above and hit Derive — the four-zone board renders here."
                : "選好上方三個錨點後按「重新推導」——四區策略看板會出現在這裡。"}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 12 }}>
            {/* 甜蜜點（大區，含標語） */}
            <div style={{ gridRow: "span 2", background: "#FDF1EC", border: "2px solid #E8542F", borderRadius: 13, padding: "13px 14px 8px" }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>{en ? "Sweet spots" : "甜蜜點"}
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "#8A8494", marginLeft: 8 }}>
                  {en ? "she wants · rivals can't · we can" : "她要・所選對手沒有・我們有 → 差異化主軸"}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: "#8A8494", marginBottom: 9 }}>{en ? "All copy firepower goes here" : "文案與活動的火力集中區"}</div>
              {derived.spots.map((s, i) => (
                <div key={i} style={{ ...S.zoneCard, borderLeft: "4px solid #E8542F" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".1em", color: "#E8542F" }}>
                    SPOT {i + 1} · {s.lane === "function" ? (en ? "FUNCTION" : "功能") : (en ? "EMOTION" : "情感")}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13.5, margin: "2px 0 3px" }}>{s.title}</div>
                  <div style={{ fontSize: 11.5, color: "#6E6878", lineHeight: 1.65 }}>
                    {s.need}
                    <span style={{ color: "#C9C4BC", padding: "0 4px" }}>←</span>
                    <b style={{ color: "#2A2630", borderBottom: "2px solid #D9A5A3", fontWeight: 700 }}>{s.gap}</b>
                    <span style={{ color: "#C9C4BC", padding: "0 4px" }}>←</span>
                    <b style={{ color: "#2A2630", borderBottom: "2px solid #9CC3AB", fontWeight: 700 }}>{s.ours}</b>
                  </div>
                  {s.tagline?.zh && (
                    <div style={{ marginTop: 7, paddingTop: 7, borderTop: "1px dashed #F0DFD6", display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "#8A8494" }}>{en ? "TAGLINE FROM THIS SPOT" : "此點長出的標語"}</span>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>{s.tagline.zh}</span>
                      {s.tagline.en && <span style={{ fontSize: 11, color: "#8A8494", fontStyle: "italic" }}>{s.tagline.en}</span>}
                      {derived.currentTaglineSpot && derived.currentTaglineSpot === s.title && (
                        <span style={{ fontSize: 9.5, fontWeight: 800, background: "#2A2630", color: "#fff", borderRadius: 5, padding: "1px 7px" }}>
                          {en ? "current tagline origin" : "現行標語來源"}
                        </span>
                      )}
                    </div>
                  )}
                  {/* P2 spot actions: 深挖 / 套用此標語 */}
                  <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
                    <span style={{ ...S.act, background: "#2A2630", borderColor: "#2A2630", color: "#fff", opacity: digging === i ? .6 : 1 }}
                          onClick={() => {
                            if (digging !== null || !active?.id) return;
                            setDigging(i);
                            digMut?.mutate?.({ brandId, scenarioId: active.id, spotIndex: i }, {
                              onSuccess: (r: any) => {
                                setDigging(null);
                                if (r?.ok) { showToastGlobal(en ? "Deep-dive ready" : "✓ 深挖完成", "success"); utils?.scope?.active?.invalidate?.(); }
                                else showToastGlobal(r?.error ?? (en ? "Deep-dive failed" : "深挖失敗，請再試一次"));
                              },
                              onError: () => { setDigging(null); showToastGlobal(en ? "Deep-dive failed" : "深挖失敗，請再試一次"); },
                            });
                          }}>
                      <Ic d={IC.search} />{digging === i ? (en ? "Digging…" : "深挖中…") : (en ? "Deep-dive" : "深挖此點")}
                    </span>
                    {s.tagline?.zh && (() => { const tagZh = s.tagline!.zh; return (
                      <span style={S.act}
                            onClick={() => {
                              if (!active?.id) return;
                              if (!window.confirm(en
                                ? `Apply this scenario?\n· audience anchor ← selected audience\n· main tagline ←「${tagZh}」`
                                : `套用此情境為正式定位？\n· 受眾錨點 ← 本情境所選受眾\n· 主標語 ←「${tagZh}」\n之後所有文案任務與定位重跑都以此為準。`)) return;
                              applyMut?.mutate?.({ brandId, scenarioId: active.id, taglineSpotIndex: i }, {
                                onSuccess: (r: any) => {
                                  if (r?.ok) { showToastGlobal(en ? "Applied as official positioning" : "✓ 已套用為正式定位", "success"); utils?.scope?.active?.invalidate?.(); }
                                  else showToastGlobal(r?.error ?? (en ? "Apply failed" : "套用失敗"));
                                },
                                onError: () => showToastGlobal(en ? "Apply failed" : "套用失敗"),
                              });
                            }}>
                        {en ? "Apply + set tagline" : "套用定位＋設此標語"}
                      </span>
                    ); })()}
                  </div>
                  {/* P2 dig accordion */}
                  {s.dig && (
                    <div style={{ marginTop: 8, background: "#FBF7F4", borderRadius: 9, padding: "9px 12px", fontSize: 11.5, color: "#4A4552" }}>
                      {Array.isArray(s.dig.scenes) && s.dig.scenes.length > 0 && (<>
                        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".12em", color: "#A8A29E" }}>{en ? "SCENES & MOT" : "場景與關鍵時刻"}</div>
                        <ul style={{ margin: "3px 0 7px", paddingLeft: 16 }}>
                          {s.dig.scenes.map((sc: any, j: number) => <li key={j} style={{ margin: "2px 0" }}>{sc.scene} — <b>{sc.mot}</b></li>)}
                        </ul>
                      </>)}
                      {Array.isArray(s.dig.contentAngles) && s.dig.contentAngles.length > 0 && (<>
                        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".12em", color: "#A8A29E" }}>
                          {en ? "CONTENT ANGLES — click to open as a task topic" : "內容角度（點一下 → 帶著題目開任務）"}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "4px 0 7px" }}>
                          {s.dig.contentAngles.map((a: string, j: number) => (
                            <span key={j}
                                  onClick={() => navigate(`/tasks/fb?b=${brandId}&topic=${encodeURIComponent(a)}`)}
                                  title={en ? "Open the task wall with this topic prefilled" : "帶著這個題目前往任務牆，點任一任務即自動填入"}
                                  style={{ fontSize: 11, border: "1px solid #2A2630", borderRadius: 999, padding: "2px 10px", background: "#fff", cursor: "pointer", fontWeight: 600 }}>
                              {a} ↗
                            </span>
                          ))}
                        </div>
                      </>)}
                      {Array.isArray(s.dig.risks) && s.dig.risks.length > 0 && (<>
                        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".12em", color: "#A8A29E" }}>{en ? "RISKS" : "風險與對手反應"}</div>
                        <ul style={{ margin: "3px 0 0", paddingLeft: 16 }}>
                          {s.dig.risks.map((rk: string, j: number) => <li key={j} style={{ margin: "2px 0" }}>{rk}</li>)}
                        </ul>
                      </>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* 基本籌碼 */}
            <div style={{ background: "#EEF1F6", border: "1.5px solid #C6CEDD", borderRadius: 13, padding: "13px 14px 6px" }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{en ? "Table stakes" : "基本籌碼"}
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "#8A8494", marginLeft: 8 }}>{en ? "must match, never lead" : "她要・對手也有 → 跟上，不當主軸"}</span>
              </div>
              <ul style={{ margin: "6px 0 8px", paddingLeft: 18, fontSize: 12, color: "#4A4552" }}>
                {derived.stakes.map((z, i) => <li key={i} style={{ margin: "3px 0" }}><b>{z.title}</b>{z.note ? ` — ${z.note}` : ""}</li>)}
              </ul>
            </div>
            {/* 對手地盤 */}
            <div style={{ background: "#FBF6F5", border: "1.5px solid #DFC0BE", borderRadius: 13, padding: "13px 14px 6px" }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{en ? "Rival turf" : "對手地盤"}
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "#8A8494", marginLeft: 8 }}>{en ? "real demand we concede" : "她要・對手強 → 策略性不跟"}</span>
              </div>
              <ul style={{ margin: "6px 0 8px", paddingLeft: 18, fontSize: 12, color: "#4A4552" }}>
                {derived.rivalTurf.map((z, i) => <li key={i} style={{ margin: "3px 0" }}><b>{z.title}</b>{z.note ? ` — ${z.note}` : ""}</li>)}
              </ul>
            </div>
            {/* 自嗨區 */}
            <div style={{ gridColumn: "1 / -1", background: "#F4F3F0", border: "1.5px dashed #C9C4BC", borderRadius: 13, padding: "11px 14px 4px" }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{en ? "Vanity zone" : "自嗨區"}
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "#8A8494", marginLeft: 8 }}>{en ? "we love it, she doesn't care" : "我們想講・她無感 → 停止直說，轉化再用"}</span>
              </div>
              <ul style={{ margin: "6px 0 8px", paddingLeft: 18, fontSize: 12, color: "#4A4552" }}>
                {derived.vanity.map((z, i) => <li key={i} style={{ margin: "3px 0" }}><b>{z.title}</b>{z.note ? ` — ${z.note}` : ""}</li>)}
              </ul>
            </div>
          </div>
        )}
      </div>
      )}

      {/* 下鑽面板 */}
      {drill && (
        <div style={{ position: "absolute", top: 8, right: 8, bottom: 8, width: "min(430px, 82%)", background: "#fff", border: "1.5px solid #C9C4BC", borderRadius: 13, boxShadow: "-6px 0 22px rgba(0,0,0,.10)", overflowY: "auto", zIndex: 30 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid #EFEDE8", position: "sticky", top: 0, background: "#fff" }}>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>
              {drill.kind === "audience"
                ? (en ? "Audience research" : `${drillAudience?.label ?? "受眾"}・原始研究資料`)
                : (en ? "Competitor research" : `競品・${String(drillComp?.name ?? "")}`)}
              <div style={{ fontWeight: 500, fontSize: 10, color: "#A8A29E" }}>
                {en ? "why the AI says what it says" : "AI 憑什麼這樣說——可回查的研究內容"}
              </div>
            </div>
            <span onClick={() => setDrill(null)} style={{ cursor: "pointer", color: "#A8A29E" }}><Ic d={IC.close} /></span>
          </div>
          <div style={{ padding: "12px 16px 16px", fontSize: 12.5, color: "#4A4552" }}>
            {drill.kind === "audience" ? (
              <>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".12em", color: "#A8A29E", marginBottom: 4 }}>{en ? "NARRATIVE" : "完整敘事"}</div>
                <p style={{ lineHeight: 1.75 }}>{drillAudience?.value}</p>
                {Array.isArray(aud.pains) && aud.pains.length > 0 && (<>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".12em", color: "#A8A29E", margin: "12px 0 4px" }}>{en ? "PAINS" : "痛點"}</div>
                  <ul style={{ paddingLeft: 18 }}>{aud.pains.map((p: any, i: number) => <li key={i}>{String(p)}</li>)}</ul>
                </>)}
                {Array.isArray(aud.needs) && aud.needs.length > 0 && (<>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".12em", color: "#A8A29E", margin: "12px 0 4px" }}>{en ? "NEEDS" : "需求"}</div>
                  <ul style={{ paddingLeft: 18 }}>{aud.needs.map((p: any, i: number) => <li key={i}>{String(p)}</li>)}</ul>
                </>)}
                {Array.isArray(aud.matrix) && aud.matrix.length > 0 && (<>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".12em", color: "#A8A29E", margin: "12px 0 4px" }}>{en ? "EMOTIONAL MATRIX" : "情感需求矩陣"}</div>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11.5 }}>
                    <tbody>
                      {aud.matrix.slice(0, 6).map((m: any, i: number) => (
                        <tr key={i} style={{ borderBottom: "1px solid #F5F3EF" }}>
                          <td style={{ padding: "3px 8px 3px 0" }}>{String(m?.dim ?? "")}</td>
                          <td style={{ padding: "3px 8px 3px 0", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{String(m?.primary ?? "")}</td>
                          <td style={{ padding: "3px 0", color: "#8A8494" }}>{String(m?.weight ?? "")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>)}
              </>
            ) : drillComp ? (
              <>
                {[
                  [en ? "POSITION" : "市場地位", drillComp.position],
                  [en ? "TONE" : "品牌調性", drillComp.tone],
                  [en ? "WEAKNESS (OUR OPENING)" : "弱點（我們的機會）", drillComp.weakness],
                  [en ? "OUR EDGE" : "我方差異點", drillComp.ourEdge],
                ].map(([t, v], i) => v ? (
                  <div key={i}>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".12em", color: "#A8A29E", margin: i > 0 ? "12px 0 4px" : "0 0 4px" }}>{String(t)}</div>
                    <p style={{ lineHeight: 1.7 }}>{String(v)}</p>
                  </div>
                ) : null)}
              </>
            ) : null}
            <div style={{ background: "#F7F6F3", borderRadius: 10, padding: "8px 12px", marginTop: 14, fontSize: 11, color: "#6E6878" }}>
              <b style={{ color: "#2A2630" }}>{en ? "Sources: " : "資料來源："}</b>
              {en ? "brand handbook · website crawl · positioning pipeline (official-audience anchored)"
                  : "品牌手冊（官方定義）・官網／社群爬取・定位管線推導（官方客群錨定）"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
