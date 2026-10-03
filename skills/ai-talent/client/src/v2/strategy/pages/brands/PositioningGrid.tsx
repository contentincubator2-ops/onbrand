/**
 * 定位總覽：每一格定位欄位的預覽卡與分組。
 */
import { type SegmentSpec } from "../../lib/positioningSchema";
import { useLang } from "../../../../lib/i18n";
import React from "react";
import { faBullseye, faPenNib, faChartPie, faBookOpen, faShieldHalved, faUsers, faTableList, faRocket, faBullhorn, faQuoteLeft, faWandMagicSparkles, faStickyNote, faPlus, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { HelpTip } from "../../../platform/components/HelpTip";

/* ─────────────────────────── PositioningBrainBar ─────────────────────

/* ─────────────────────────── PositioningGrid ───────────────────────── */
// 品牌定位的 card grid — 速查卡/指令庫 + segments 分組顯示
export function PositioningGrid({
  scopeMode, segments, onSelect, segmentData, customSegments, onDeleteCustomSegment, onEditCustomSegment,
}: {
  scopeMode: "brand" | "product" | "event" | "none";
  segments: import("../../lib/positioningSchema").SegmentSpec[];
  onSelect: (section: string) => void;
  /** Map of segment id → its current content (top-level positioning keys). */
  segmentData?: Record<string, any>;
  /** 2026-09-23: cards the user built from an uploaded/pasted positioning doc
   *  that don't map onto any fixed schema segment (e.g. 「品牌願景」). Full
   *  management (create from a document, delete) lives in PositioningDocPanel
   *  ("我的定位文件"); shown here too so they sit alongside the fixed
   *  segments instead of being hidden in a sub-page. */
  customSegments?: { id: string; title: string; fields: { key: string; label: string; value: string }[] }[];
  onDeleteCustomSegment?: (segmentId: string) => void;
  /** 2026-09-24（CJ「按下新增卡片時，只是要她編輯該卡片的標題和內容」）：
   *  開卡片編輯器。傳 null = 新增一張；傳 id = 編輯那一張。 */
  onEditCustomSegment?: (segmentId: string | null) => void;
}) {
  const { lang } = useLang();
  const groupLabels: Record<string, { zh: string; en: string }> = {
    "1": { zh: "品牌識別", en: "Brand identity" },
    "2": { zh: "品牌背景", en: "Brand backstory" },
    "3": { zh: "目標受眾", en: "Target audience" },
    "4": { zh: "市場分析", en: "Market analysis" },
    "5": { zh: "競爭策略", en: "Competitive strategy" },
    "6": { zh: "行銷策略", en: "Marketing strategy" },
    "7": { zh: "市場趨勢", en: "Market trends" },
    "8": { zh: "品牌個性", en: "Brand personality" },
  };
  // 2026-07-28 (CJ「定位的呈現沒有邏輯性…看起來沒有策略感」→ mockup 定案):
  // brand scope reorders into a STRATEGY NARRATIVE — research → synthesis →
  // expression → tools — each act titled by the question it answers.
  // Display numbers follow the acts (data/segment ids untouched); the tools
  // group moves to the END (they're positioning OUTPUTS, not the opening).
  // Product/event keep the original num-prefix grouping.
  //
  // 2026-09-23（CJ「目前第一排是一張卡片，第二排有兩張卡片，版面都沒有排
  // 整齊，我想要每一排都是三張卡片」）：原本 5 幕（1/2/2/2/3 張）沒有一幕
  // 是自己的 grid 容器裡塞滿 3 張，行行都缺角。10 個 segment 重新分成 3 幕
  // 各 3 張——goldenCircle 從「策略結晶」搬到「自我探索」跟起源／價值觀放
  // 一起（WHY 信念本來就該扎根在起源與價值觀，敘事上比跟差異化放一起更
  // 合理，不只是為了湊數）。taglineScore 不再是獨立卡片（資料還在，只是
  // 暫時沒有專屬卡片入口）。
  const BRAND_ACTS: Array<{ label: { zh: string; en: string }; q: { zh: string; en: string }; ids: string[] }> = [
    { label: { zh: "第一幕・市場與競爭研究", en: "Act 1 · Market & competitive research" },
      q: { zh: "她缺什麼？誰已經在滿足她、缺口在哪？—— 定位不是從「我是誰」開始，是先看懂她，再看懂戰場。", en: "What does she lack, and who's already trying to serve her? Positioning starts with her and the battlefield, not with us." },
      ids: ["audience", "competition", "trends"] },
    { label: { zh: "第二幕・自我探索", en: "Act 2 · Self discovery" },
      q: { zh: "憑什麼是我們？—— 起源、價值觀與信念一起回答「為什麼是我們」，三者本來就是同一件事。", en: "Why us? Origin, values, and belief answer 'why us' together — they were never three separate things." },
      ids: ["origin", "values", "goldenCircle"] },
    { label: { zh: "第三幕・策略表達", en: "Act 3 · Strategy & expression" },
      q: { zh: "所以，我們該說什麼、怎麼說 —— 差異化是前兩幕的結論，標語與語氣把它變成日常可執行的文字。", en: "So what do we say, and how — differentiation is the conclusion of the first two acts; tagline and voice turn it into words you use every day." },
      ids: ["differentiation", "tagline", "voice"] },
  ];
  const brandActGroups = React.useMemo(() => {
    if (scopeMode !== "brand") return null;
    const byId = new Map(segments.map((s) => [s.id, s]));
    return BRAND_ACTS
      .map((act, ai) => ({
        label: lang === "en" ? act.label.en : act.label.zh,
        intro: lang === "en" ? act.q.en : act.q.zh,
        segs: act.ids
          .map((id, i) => ({ spec: byId.get(id), num: `${ai + 1}.${i + 1}` }))
          .filter((x): x is { spec: NonNullable<typeof x.spec>; num: string } => !!x.spec),
      }))
      .filter((g) => g.segs.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, lang, scopeMode]);

  // Derive groups from segment num prefix
  const groupedSegs = React.useMemo(() => {
    const map = new Map<string, { label: string; prefix: string; segs: typeof segments }>();
    for (const s of segments) {
      const prefix = s.num.split(".")[0]!;
      // 2026-07-20 (CJ「活動定位頁第 9-11 章顯示通用編號，其餘有描述性名稱，
      // 命名不一致」): groupLabels only covers 1-8 AND its wording is
      // brand-specific (品牌識別/市場分析…). Event segments are one-per-
      // chapter with proper titles of their own (戰略 Brief…用戶旅程) —
      // use those directly so all 11 chapters are descriptive and
      // semantically correct. Brand/product grouping unchanged.
      const pair = scopeMode === "event" ? undefined : groupLabels[prefix];
      const ownTitle = scopeMode === "event"
        ? (lang === "en" ? ((s as any).titleEn ?? s.title) : s.title)
        : null;
      const label = pair
        ? (lang === "en" ? pair.en : pair.zh)
        : ownTitle ?? (lang === "en" ? `Chapter ${prefix}` : `第 ${prefix} 章`);
      // Stable key by zh label so intro lookup works regardless of UI language
      const key = pair ? pair.zh : (scopeMode === "event" ? s.title : `第 ${prefix} 章`);
      if (!map.has(key)) map.set(key, { label, prefix, segs: [] });
      map.get(key)!.segs.push(s);
    }
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, lang, scopeMode]);

  // Icon map per segment id
  const ICONS: Record<string, any> = {
    goldenCircle: faBullseye, tagline: faPenNib, taglineScore: faChartPie,
    origin: faBookOpen, values: faShieldHalved,
    audience: faUsers, competition: faTableList,
    differentiation: faRocket, trends: faBullhorn, voice: faQuoteLeft,
    // product / event fallbacks
    core: faBullseye, positioning: faBullseye, smp: faWandMagicSparkles,
  };

  const segFilled = (sid: string) => {
    const v = segmentData?.[sid];
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "object") return Object.values(v).some(x => x != null && (typeof x !== "string" || x.trim()));
    return true;
  };

  return (
    <div style={{ padding: "8px 0 24px", display: "flex", flexDirection: "column", gap: 36 }}>
      {/* ── Brand scope: four-act strategy narrative ── */}
      {brandActGroups && brandActGroups.map((group) => (
        <div key={group.label}>
          <SectionLabel
            label={group.label}
            counter={`${group.segs.filter(({ spec }) => segFilled(spec.id)).length} / ${group.segs.length}`}
            intro={group.intro}
          />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {group.segs.map(({ spec: s, num }) => {
              const segVal = segmentData?.[s.id];
              const { node: preview, hasContent } = renderSegmentPreview(s.id, segVal, lang);
              return (
                <PositioningCard
                  key={s.id}
                  label={`${num} ${lang === "en" ? (s.titleEn ?? s.title) : s.title}`}
                  icon={ICONS[s.id] ?? faBookOpen}
                  onClick={() => onSelect(`seg:${s.id}`)}
                  preview={preview}
                  hasContent={hasContent}
                  rationale={lang === "en" ? (s.rationaleEn ?? s.rationale) : s.rationale}
                  sourceLabel={lang === "en" ? "SoWork positioning method" : "SoWork 品牌定位法"}
                  headline={segmentHeadline(s.id, segVal)}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Segment groups (product / event — unchanged) ── */}
      {!brandActGroups && groupedSegs.map((group) => (
        <div key={group.label}>
          <SectionLabel
            label={group.label}
            counter={`${group.segs.filter(s => {
              const v = segmentData?.[s.id];
              if (v == null) return false;
              if (typeof v === "string") return v.trim().length > 0;
              if (typeof v === "object") return Object.values(v).some(x => x != null && (typeof x !== "string" || x.trim()));
              return true;
            }).length} / ${group.segs.length}`}
            intro={SOWORK_GROUP_INTRO[group.prefix]?.[lang === "en" ? "en" : "zh"]}
          />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {group.segs.map((s) => {
              const segVal = segmentData?.[s.id];
              const { node: preview, hasContent } = renderSegmentPreview(s.id, segVal, lang);
              return (
                <PositioningCard
                  key={s.id}
                  label={`${s.num} ${lang === "en" ? (s.titleEn ?? s.title) : s.title}`}
                  icon={ICONS[s.id] ?? faBookOpen}
                  onClick={() => onSelect(`seg:${s.id}`)}
                  preview={preview}
                  hasContent={hasContent}
                  rationale={lang === "en" ? (s.rationaleEn ?? s.rationale) : s.rationale}
                  sourceLabel={lang === "en" ? "SoWork positioning method" : "SoWork 品牌定位法"}
                  headline={segmentHeadline(s.id, segVal)}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* ── 自訂卡片 — 從上傳/貼上的定位文件建立、套不進上面任何固定欄位的內容
          （例如「品牌願景」）。跟固定 segment 卡片同一套視覺，永遠顯示（就算目前
          0 張）讓使用者發現這個功能，虛線卡是進入點 —— 完整的建立/確認流程在
          「我的定位文件」("doc")，這裡不重做一次上傳/AI 提案的 UI。 ── */}
      <div>
        <SectionLabel
          label={lang === "en" ? "Your cards" : "自訂卡片"}
          counter={customSegments && customSegments.length > 0 ? String(customSegments.length) : undefined}
          intro={lang === "en"
            ? "Content that didn't fit any fixed field above — built from an uploaded document or a pasted AI conversation. Read by every task just like the fields above."
            : "套不進上面固定欄位的內容 —— 從上傳的定位文件或貼上的 AI 對話建立，一樣會被每次任務執行讀到。"}
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {(customSegments ?? []).map((seg) => (
            <PositioningCard
              key={seg.id}
              label={seg.title}
              icon={faStickyNote}
              // 2026-09-24：點自己的卡片就是要改它的內容，不是跳去「我的定位
              // 文件」那一整套上傳/對映流程（那裡也沒有「編輯這張卡」這個動作）。
              onClick={() => onEditCustomSegment?.(seg.id)}
              hasContent
              preview={
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                  {seg.fields.slice(0, 4).map((f) => (
                    <li key={f.key}>
                      <strong style={{ color: "#171717", fontWeight: 600 }}>{f.label}：</strong>
                      {truncate(f.value, 60)}
                    </li>
                  ))}
                </ul>
              }
              onDelete={onDeleteCustomSegment ? () => onDeleteCustomSegment(seg.id) : undefined}
              sourceLabel={lang === "en" ? "From your document" : "來自你的定位文件"}
              headline={seg.fields[0]?.value ? truncate(seg.fields[0].value, 50) : undefined}
            />
          ))}
          <button
            // 2026-09-24（CJ「按下新增卡片時，只是要她編輯該卡片的標題和內容，
            // 內容可以打字或是直接上傳文件」）：原本按下去是跳到「我的定位文件」
            // ——那是「上傳整份定位書 → AI 對映固定欄位」的流程，跟「我要自己
            // 加一張卡」是兩件事，而且那一頁根本沒有「新增卡片」這個動作。
            onClick={() => onEditCustomSegment?.(null)}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900 transition-colors"
            style={{ minHeight: 124, padding: 16 }}
          >
            <FontAwesomeIcon icon={faPlus} style={{ fontSize: 16 }} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>
              {lang === "en" ? "Add a card" : "新增卡片"}
            </span>
          </button>
        </div>
      </div>

      {/* 2026-05-11 (CJ 4A discipline): removed gradient purple FAB.
          New tasks are launched via top-bar / hero, not a decorative
          floating button. Page stays editorial. */}
    </div>
  );
}

/* ────────────────────── Preview extractors ──────────────────────
   These read the actual positioning JSON shape per segment and render
   a short editorial preview (≤4 lines) for the layer-1 card grid, so
   users see real content without drilling in.
   2026-05-11 (CJ「我希望只有在一頁呈現，不用再點進去」)
   ────────────────────────────────────────────────────────────────── */
export const truncate = (s: string, n = 130) => {
  const t = String(s).trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
};

export const firstTruthy = (...xs: any[]): string | null => {
  for (const x of xs) {
    if (typeof x === "string" && x.trim()) return x.trim();
  }
  return null;
};

export const isFilledArr = (a: any) => Array.isArray(a) && a.some((x: any) =>
  typeof x === "string" ? x.trim() : x != null,
);

/** Render mini list of tokens (used for arrays). */
export function TagRow({ items, max = 4 }: { items: string[]; max?: number }) {
  return (
    <span>
      {items.slice(0, max).map((x, i) => (
        <span key={i} style={{
          display: "inline-block", marginRight: 6, marginBottom: 3,
          fontSize: 12.5, color: "#404040",
          fontFamily: '"SF Mono", Menlo, monospace',
        }}>
          {x}
        </span>
      ))}
      {items.length > max && (
        <span style={{ fontSize: 12, color: "#525252" }}>+{items.length - max}</span>
      )}
    </span>
  );
}

/**
 * 2026-09-23（CJ「卡片上的縮圖，要怎麼樣，才能更具有意義，現在感覺是隨興
 * 出來的圖，是否要改成文字？」）：卡片 header 原本一律放一顆概念 icon——
 * 對定位卡來說，icon 只能代表「這是哪一格」，代表不了「這個品牌在這格寫了
 * 什麼」。改成直接抓這個 segment 自己最有代表性的一小段真實內容，當成
 * pull-quote 放大顯示——每張卡的縮圖因此變成獨一無二、屬於這個品牌自己的
 * 文字，不是套版圖示。回傳 null（還沒填）時 PositioningCard 照舊退回 icon，
 * 空卡片不會看起來壞掉。刻意跟 renderSegmentPreview 分開：這裡要純文字、
 * 更短（header 空間比 body 小很多），不需要 renderSegmentPreview 那套
 * 多行/列表的豐富排版。
 */
export function segmentHeadline(segId: string, v: any): string | null {
  if (v == null) return null;
  if (typeof v === "string") { const t = truncate(v.trim(), 50); return t || null; }
  if (typeof v !== "object") return null;
  switch (segId) {
    case "goldenCircle": {
      const why = firstTruthy(v.why);
      return why ? truncate(why, 50) : null;
    }
    case "tagline": {
      const t = firstTruthy(v.zhTagline, v.enTagline);
      return t ? `「${truncate(t, 40)}」` : null;
    }
    case "origin": {
      const story = firstTruthy(v.story);
      return story ? truncate(story, 50) : null;
    }
    case "values": {
      const first = Array.isArray(v.items) ? v.items.find((x: any) => x?.label) : null;
      return first ? truncate(String(first.label), 30) : null;
    }
    case "audience": {
      const p = firstTruthy(v.primary, v.primaryAudience);
      return p ? truncate(p, 50) : null;
    }
    case "competition": {
      const first = Array.isArray(v.direct) ? v.direct.find((x: any) => x?.name) : null;
      if (first) return truncate(String(first.name), 30);
      const intensity = firstTruthy(v.intensity);
      return intensity ? truncate(intensity, 40) : null;
    }
    case "differentiation": {
      const t = firstTruthy(v.discriminator, v.summary);
      return t ? truncate(t, 50) : null;
    }
    case "trends": {
      const first = Array.isArray(v.favorable) ? v.favorable.find((x: any) => x?.name) : null;
      return first ? truncate(String(first.name), 40) : null;
    }
    case "voice": {
      const arche = isFilledArr(v.archetypes) ? v.archetypes[0] : null;
      return arche ? truncate(String(arche), 30) : null;
    }
    case "core": {
      const t = firstTruthy(v.oneLineValueProp, v.coreStatement, v.zhTagline);
      return t ? truncate(t, 50) : null;
    }
    case "smp": {
      const t = firstTruthy(v.singleMindedProposition);
      return t ? truncate(t, 50) : null;
    }
  }
  const cand = firstTruthy(
    v.summary, v.statement, v.text, v.story, v.body, v.description,
    v.primary, v.primaryAudience, v.coreMessage, v.creativeTheme,
    v.coreStatement, v.briefSummary, v.businessGoal,
  );
  return cand ? truncate(cand, 50) : null;
}

/** Smart preview per segment. Returns React node + whether considered filled. */
export function renderSegmentPreview(segId: string, v: any, lang: "zh-TW" | "en" = "zh-TW"): { node: React.ReactNode | null; hasContent: boolean } {
  if (v == null) return { node: null, hasContent: false };
  if (typeof v === "string") {
    const t = v.trim();
    return t ? { node: <span>{truncate(t, 140)}</span>, hasContent: true } : { node: null, hasContent: false };
  }
  if (typeof v !== "object") return { node: null, hasContent: false };

  // ── Per-segment custom renderers ──
  switch (segId) {
    case "goldenCircle": {
      const why = firstTruthy(v.why);
      if (!why) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            <strong style={{ color: "#171717", fontFamily: "system-ui" }}>WHY · </strong>
            {truncate(why, 120)}
          </span>
        ),
        hasContent: true,
      };
    }
    case "tagline": {
      const zh = firstTruthy(v.zhTagline);
      const en = firstTruthy(v.enTagline);
      if (!zh && !en) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            {zh && (
              <span style={{ display: "block", color: "#171717", fontWeight: 600, fontFamily: "system-ui", fontSize: 13 }}>
                「{truncate(zh, 40)}」
              </span>
            )}
            {en && (
              <span style={{ display: "block", color: "#404040", fontStyle: "italic", marginTop: 2 }}>
                {truncate(en, 60)}
              </span>
            )}
            {v.story && (
              <span style={{ display: "block", marginTop: 4, fontSize: 12 }}>
                {truncate(v.story, 80)}
              </span>
            )}
          </span>
        ),
        hasContent: true,
      };
    }
    case "taglineScore": {
      const total = v.total ?? (Array.isArray(v.rows) ? v.rows.reduce((acc: number, r: any) => acc + Number(r.score ?? 0), 0) : null);
      const rows = Array.isArray(v.rows) ? v.rows.filter((r: any) => r?.dim) : [];
      if (!total && rows.length === 0) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            {total != null && (
              <span style={{ display: "block", marginBottom: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 700, color: "#171717", fontFamily: "system-ui" }}>{total}</span>
                <span style={{ fontSize: 12, color: "#525252", marginLeft: 4 }}>/ 100</span>
              </span>
            )}
            {rows.slice(0, 3).map((r: any, i: number) => (
              <span key={i} style={{ display: "block", fontSize: 12 }}>
                <span style={{ color: "#404040" }}>{r.dim}</span>
                <span style={{ color: "#171717", fontWeight: 600, marginLeft: 6 }}>{r.score}</span>
              </span>
            ))}
          </span>
        ),
        hasContent: true,
      };
    }
    case "origin": {
      const story = firstTruthy(v.story);
      if (!story) return { node: null, hasContent: false };
      return { node: <span>{truncate(story, 150)}</span>, hasContent: true };
    }
    case "values": {
      const items = Array.isArray(v.items) ? v.items.filter((x: any) => x?.label) : [];
      if (items.length === 0) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            {items.slice(0, 4).map((it: any, i: number) => (
              <span key={i} style={{ display: "block", marginBottom: 2 }}>
                <span style={{ color: "#171717", fontWeight: 600, fontFamily: "system-ui" }}>· {it.label}</span>
                {it.body && (
                  <span style={{ color: "#404040", marginLeft: 4, fontSize: 12 }}>
                    {truncate(it.body, 40)}
                  </span>
                )}
              </span>
            ))}
            {items.length > 4 && <span style={{ fontSize: 12, color: "#525252" }}>+{items.length - 4}</span>}
          </span>
        ),
        hasContent: true,
      };
    }
    case "audience": {
      const p = firstTruthy(v.primary, v.primaryAudience);
      if (!p) return { node: null, hasContent: false };
      return { node: <span>{truncate(p, 150)}</span>, hasContent: true };
    }
    case "competition": {
      const intensity = firstTruthy(v.intensity);
      const direct = Array.isArray(v.direct) ? v.direct.filter((x: any) => x?.name) : [];
      if (!intensity && direct.length === 0) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            {intensity && <span style={{ display: "block" }}>{truncate(intensity, 90)}</span>}
            {direct.length > 0 && (
              <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "#404040", fontFamily: "system-ui" }}>
                vs {direct.slice(0, 3).map((d: any) => d.name).join("、")}
                {direct.length > 3 && <span> +{direct.length - 3}</span>}
              </span>
            )}
          </span>
        ),
        hasContent: true,
      };
    }
    case "differentiation": {
      const txt = firstTruthy(v.summary, v.emotional, v.functional);
      if (!txt) return { node: null, hasContent: false };
      return { node: <span>{truncate(txt, 150)}</span>, hasContent: true };
    }
    case "trends": {
      const fav = Array.isArray(v.favorable) ? v.favorable.filter((x: any) => x?.name) : [];
      const risks = Array.isArray(v.risks) ? v.risks.filter((x: any) => x?.name) : [];
      if (fav.length === 0 && risks.length === 0) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            {fav.slice(0, 2).map((t: any, i: number) => (
              <span key={`f${i}`} style={{ display: "block", fontSize: 12 }}>
                <span style={{ color: "#059669", fontWeight: 600, fontFamily: "system-ui" }}>↗</span>
                <span style={{ marginLeft: 4 }}>{truncate(t.name, 50)}</span>
              </span>
            ))}
            {risks.slice(0, 2).map((t: any, i: number) => (
              <span key={`r${i}`} style={{ display: "block", fontSize: 12 }}>
                <span style={{ color: "#B45309", fontWeight: 600, fontFamily: "system-ui" }}>↘</span>
                <span style={{ marginLeft: 4 }}>{truncate(t.name, 50)}</span>
              </span>
            ))}
          </span>
        ),
        hasContent: true,
      };
    }
    case "voice": {
      const arche = isFilledArr(v.archetypes) ? v.archetypes : null;
      const tone = isFilledArr(v.tone) ? v.tone : null;
      if (!arche && !tone) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            {arche && (
              <span style={{ display: "block", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#525252", letterSpacing: "0.15em", textTransform: "uppercase", marginRight: 6 }}>{lang === "en" ? "Archetype" : "原型"}</span>
                <TagRow items={arche} max={3} />
              </span>
            )}
            {tone && (
              <span style={{ display: "block" }}>
                <span style={{ fontSize: 12, color: "#525252", letterSpacing: "0.15em", textTransform: "uppercase", marginRight: 6 }}>{lang === "en" ? "Tone" : "語調"}</span>
                <TagRow items={tone} max={4} />
              </span>
            )}
          </span>
        ),
        hasContent: true,
      };
    }
    // Product / event fall-throughs
    case "core": {
      const txt = firstTruthy(v.oneLineValueProp, v.coreStatement, v.zhTagline);
      if (!txt) return { node: null, hasContent: false };
      return { node: <span>{truncate(txt, 150)}</span>, hasContent: true };
    }
    case "smp": {
      const smp = firstTruthy(v.singleMindedProposition);
      if (!smp) return { node: null, hasContent: false };
      return {
        node: (
          <span>
            <span style={{ display: "block", color: "#171717", fontWeight: 600, fontFamily: "system-ui" }}>
              「{truncate(smp, 60)}」
            </span>
            {v.rationale && (
              <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "#404040" }}>
                {truncate(v.rationale, 80)}
              </span>
            )}
          </span>
        ),
        hasContent: true,
      };
    }
  }

  // ── Generic fallback: pull the first useful string-ish field ──
  const candidates = [
    v.summary, v.statement, v.text, v.story, v.body, v.description,
    v.primary, v.primaryAudience, v.coreMessage, v.creativeTheme,
    v.coreStatement, v.briefSummary, v.businessGoal,
  ].filter((x: any) => typeof x === "string" && x.trim());
  if (candidates.length > 0) {
    return { node: <span>{truncate(candidates[0]!, 140)}</span>, hasContent: true };
  }
  // last resort: arrays
  for (const key of Object.keys(v)) {
    const arr = (v as any)[key];
    if (Array.isArray(arr)) {
      const strs = arr.filter((x: any) => typeof x === "string" && x.trim());
      if (strs.length > 0) {
        return { node: <TagRow items={strs} max={4} />, hasContent: true };
      }
      const named = arr.filter((x: any) => x?.name || x?.label);
      if (named.length > 0) {
        return {
          node: <TagRow items={named.map((x: any) => x.name ?? x.label)} max={4} />,
          hasContent: true,
        };
      }
      // 2026-07-19 (CJ「活動定位總覽第 10/11 章顯示尚未填寫但內容存在」):
      // tableRows segments (event channels.phases / journey.journey) are
      // arrays of row OBJECTS whose keys are stage/channels/step/… — no
      // name/label — so the two checks above missed them and the card
      // showed empty. Any row with a non-empty string value = filled;
      // preview shows the first row's string cells.
      const rowish = arr.filter((x: any) =>
        x && typeof x === "object" && !Array.isArray(x) &&
        Object.values(x).some((val: any) => typeof val === "string" && val.trim()));
      if (rowish.length > 0) {
        const firstVals = Object.values(rowish[0])
          .filter((val: any) => typeof val === "string" && val.trim())
          .map((val: any) => String(val)) as string[];
        return { node: <TagRow items={firstVals} max={4} />, hasContent: true };
      }
    }
  }
  return { node: null, hasContent: false };
}

/* Editorial section label — tiny eyebrow + thin rule, optional counter chip.
   2026-05-11: added optional `intro` line (serif italic) that explains the
   methodology rationale for this group of segments. Surfaces the
   "why this order matters" narrative reviewer flagged. */
export function SectionLabel({ label, counter, intro }: { label: string; counter?: string; intro?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: "#525252",
          letterSpacing: "0.22em", textTransform: "uppercase",
        }}>
          {label}
        </span>
        {intro && <HelpTip>{intro}</HelpTip>}
        <div style={{ flex: 1, height: 1, background: "#D4D4D4" }} />
        {counter && (
          // 2026-09-23：改成小圓角計數 chip（跟 content 層任務卡格頭的計數
          // Chip 呼應），純灰階、不上色 —— 只是換個容器，不違反「不要彩色」。
          <span style={{
            fontSize: 11.5, fontWeight: 600, color: "#525252",
            letterSpacing: "0.1em", fontVariantNumeric: "tabular-nums",
            background: "#F5F5F5", borderRadius: 999, padding: "3px 10px",
          }}>
            {counter}
          </span>
        )}
      </div>
    </div>
  );
}

/* SoWork 品牌定位法 — group-level narrative explaining why each
   block of segments sits where it does in the sequence. Keyed by the
   prefix-derived label produced in PositioningGrid. */
export const SOWORK_GROUP_INTRO: Record<string, { zh: string; en: string }> = {
  "1": {
    zh: "起手式 — 沒有 WHY，後面所有差異化、Voice 都會飄。先把信念 → 標語 → 評分鎖好。",
    en: "Opening move — without a WHY, every differentiation and voice choice drifts. Lock the belief, the tagline, and the score first.",
  },
  "2": {
    zh: "信念的證據 — 起源故事 + 價值觀回答「為什麼是你？」沒有這層，黃金圈就只是抽象口號。",
    en: "Evidence for the belief — origin story plus values answer 'why you?'. Without this layer, the golden circle is just slogans.",
  },
  "3": {
    zh: "從『我』轉到『你』— 鎖定主受眾後，每篇貼文才知道對誰說話、要打哪個情感按鈕。",
    en: "Pivot from 'me' to 'you' — once the primary audience is locked, every post knows who it's talking to and which emotional button to press.",
  },
  "4": {
    zh: "外部座標 — 直接 / 間接 / 潛在競品看清楚，才知道差異化要切哪一刀。",
    en: "External coordinates — see direct, indirect, and latent competitors clearly so you know where to cut your differentiation.",
  },
  "5": {
    zh: "把功能 × 情感雙差異化結合成一句話 — 這是所有內容的母題。",
    en: "Fuse functional × emotional differentiation into one line — this becomes the parent theme for every piece.",
  },
  "7": {
    zh: "切入時機 — 對的策略放錯時機等於 0。識別有利趨勢 + 風險，作為議題日曆的母本。",
    en: "Timing the entry — the right strategy at the wrong time is zero. Spot the favorable trends and risks; they seed your editorial calendar.",
  },
  "8": {
    zh: "AI 寫貼文的最後濾鏡 — 人格原型 + 語調詞 + 禁區字三件套，把品牌「說話的方式」變成可複製規則。",
    en: "The final filter the AI runs every post through — archetype, tone words, and forbidden words turn 'how the brand talks' into a repeatable rule.",
  },
};

/* ─────────────────────────── PositioningCard ───────────────────────────
   2026-09-23 (CJ 看到自訂卡片後：「我們首先，先將品牌定位的卡片，改成跟
   內容層一致的呈現方式」— 貼了 PlatformTaskPage.tsx 的任務卡截圖當參照)。
   AssetCard 只把外殼（圓角/hover）改了一輪，內部排版還是原本的純文字編輯
   卡；這支才是真的照 content 層任務卡的解剖結構重做，只用在 PositioningGrid
   （固定 segment、自訂卡片、速查卡），品牌視覺資產格（logo/
   調色盤）繼續用原本的 AssetCard，不在這次範圍內：
   - 上方灰底 header block（PlatformTaskPage 是置中大頭貼，這裡沒有「人」
     可以當頭貼，換成置中的圓形 icon徽章 —— 概念的頭貼）
   - 左上角編號徽章（對應 content 卡的平台徽章位置，一樣是純資訊不是裝飾）
   - 右下角一律顯示「已填寫／未填寫」深色膠囊（對應 content 卡的「上次
     使用」膠囊位置與樣式，換成定位卡真正有意義的狀態）
   - 自訂卡片的刪除鈕移到 header block 右上角，對應 content 卡「自己的卡」
     編輯鈕的位置
   - 內文下方一顆「出處」膠囊（對應 content 卡的來源標籤 + 「出處與說明」
     連結）：固定 segment 一律標「SoWork 品牌定位法」，自訂卡片標「來自你
     的定位文件」，速查卡（純輸出物，沒有方法論出處）不顯示。
   - 不做的：agent 頭像 + 具名掛名的頁尾列——定位卡沒有「誰寫的」這個概念，
     硬套會是編出來的資訊，寧可不做。
   ─────────────────────────────────────────────────────────────────────── */
export function PositioningCard({
  label, icon, onClick, preview, hasContent, rationale, onDelete, sourceLabel, headline,
}: {
  label: string; icon: any; onClick: () => void;
  preview?: React.ReactNode;
  hasContent?: boolean;
  rationale?: string;
  onDelete?: () => void;
  /** Small "where this came from" pill, echoing content layer's source pill. */
  sourceLabel?: string;
  /** 2026-09-23：這個 segment 自己最有代表性的一小段真實內容（見
   *  segmentHeadline()）。有值時取代 header 裡的概念 icon，用品牌自己的
   *  文字當縮圖；沒有（通常代表還沒填）就退回 icon，避免空卡片看起來壞掉。 */
  headline?: string | null;
}) {
  const { lang } = useLang();
  const m = label.match(/^([\d.]+)\s+(.+)$/);
  const eyebrow = m ? m[1] : "";
  const titleText = m ? m[2] : label;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      title={rationale}
      // 2026-09-23 (CJ「策略監測的按鈕再小一點，我想讓底下的策略卡片更明顯」)：
      // 邊框加深一級（neutral-200→300）＋常駐 shadow-sm，卡片在白底頁面上
      // 不用 hover 就有存在感，跟同時縮小的策略監測按鈕形成對比。
      className="group relative flex flex-col text-left cursor-pointer overflow-hidden transition-all duration-150 rounded-2xl border border-neutral-300 shadow-sm hover:border-neutral-900 hover:shadow-lg hover:scale-[1.02] bg-white"
    >
      {/* Header block — content 卡是置中大頭貼 + 平台徽章；定位卡沒有「人」，
          換成置中的概念 icon，其餘位置語意照搬（左上角資訊徽章、右上角
          「自己的卡」動作、右下角狀態膠囊）。 */}
      <div style={{
        height: 100, background: "#F5F4F2", borderBottom: "1px solid rgba(0,0,0,0.06)",
        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {eyebrow && (
          <span style={{
            position: "absolute", top: 8, left: 8,
            fontSize: 10, fontWeight: 700, color: "#fff", background: "#171717",
            borderRadius: 5, padding: "2px 6px", letterSpacing: "0.05em",
            fontVariantNumeric: "tabular-nums",
          }}>
            {eyebrow}
          </span>
        )}
        {onDelete && (
          <button
            type="button"
            aria-label={lang === "en" ? "Delete card" : "刪除卡片"}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-1.5 bg-white/85 hover:bg-white"
            style={{ color: "#525252" }}
          >
            <FontAwesomeIcon icon={faTrashCan} style={{ fontSize: 11 }} />
          </button>
        )}
        {headline ? (
          <p style={{
            margin: 0, padding: "0 18px", textAlign: "center",
            fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
            fontSize: 14.5, fontWeight: 600, color: "#171717", lineHeight: 1.4,
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}>
            {headline}
          </p>
        ) : (
          <div style={{
            width: 58, height: 58, borderRadius: "50%", background: "#fff",
            border: "1px solid #D4D4D4", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <FontAwesomeIcon icon={icon} style={{ fontSize: 21, color: hasContent ? "#171717" : "#A3A3A3" }} />
          </div>
        )}
        <span style={{
          position: "absolute", bottom: 8, right: 8,
          fontSize: 10, fontWeight: 600, color: "#fff",
          background: hasContent ? "rgba(23,23,23,0.75)" : "rgba(115,115,115,0.6)",
          borderRadius: 999, padding: "2px 8px", letterSpacing: "0.05em",
        }}>
          {hasContent ? (lang === "en" ? "Filled" : "已填寫") : (lang === "en" ? "Empty" : "未填寫")}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <h3 style={{ fontSize: 14.5, fontWeight: 700, color: "#171717", margin: 0, lineHeight: 1.3 }}>
          {titleText}
        </h3>
        {preview ? (
          <div style={{
            fontSize: 12, lineHeight: 1.55, color: "#525252",
            fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
            overflow: "hidden", maxHeight: 56,
          }}>
            {preview}
          </div>
        ) : rationale ? (
          <p style={{
            fontSize: 12, lineHeight: 1.5, color: "#525252", fontStyle: "italic", margin: 0,
            fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
            overflow: "hidden", maxHeight: 56,
          }}>
            {rationale}
          </p>
        ) : (
          <span style={{ fontSize: 12, color: "#A3A3A3" }}>
            {lang === "en" ? "Tap to start" : "點擊開始"}
          </span>
        )}
        {sourceLabel && (
          <span style={{
            display: "inline-flex", alignSelf: "flex-start", alignItems: "center",
            borderRadius: 999, border: "1px solid #E5E5E5", background: "#fff",
            padding: "2px 9px", fontSize: 10.5, color: "#525252", marginTop: 2,
          }}>
            {sourceLabel}
          </span>
        )}
      </div>
    </div>
  );
}
