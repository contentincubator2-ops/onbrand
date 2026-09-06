/**
 * BriefPanel — 智慧型 Brief 面板 v2
 *
 * 結構：
 *   摘要 tab（永遠第一個，最後由系統統整所有資訊填入）
 *   Layer tabs（L1→品牌/競品/受眾, L2→品牌/產品/定價/競品, …）
 *
 * 自動執行流程：
 *   點「自動填寫」→ 依序切換每個 tab，逐字填入欄位
 *   → 所有 tab 完成後切回「摘要」自動統整
 *   → 「開始執行」亮起
 *
 * 每個欄位：
 *   ✏️ 編輯（inline textarea）
 *   🔄 重新抓取（重觸發 Brand Brain / Web 搜尋）
 *   來源 badge（Scope / Brand Brain / Web）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "../../lib/trpc";
import { useLang } from "../../lib/i18n";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBrain, faGlobe, faLink, faRotateRight, faPen, faCheck,
  faSpinner, faRocket, faArrowLeft, faWandSparkles,
  faBuilding, faBoxOpen, faUsers, faTrophy, faTag, faCalendar,
  faChartLine, faBullseye, faHashtag, faImage, faAlignLeft,
  faPlay, faPause,
} from "@fortawesome/free-solid-svg-icons";

// ── Types ────────────────────────────────────────────────────────────────────

type FieldSource = "scope" | "brand_brain" | "web_search" | "user_input";
type FieldType   = "text" | "textarea" | "url" | "list";
type FieldStatus = "idle" | "loading" | "filled" | "editing" | "error";

interface BriefField {
  id: string;
  label: string;
  source: FieldSource;
  type: FieldType;
  icon?: any;
  placeholder?: string;
  searchQuery?: string;
  brainCategory?: "positioning" | "audience" | "voice" | "competitors" | "custom";
}

interface BriefTab {
  id: string;
  label: string;
  fields: BriefField[];
}

interface FieldState {
  status: FieldStatus;
  value: string;
  source?: FieldSource;
  editDraft?: string;
}

// ── Exported tab metadata (id + label only) — used by PickerWorkspace rail ──

export const LAYER_TAB_IDS: Record<string, Array<{ id: string; label: string }>> = {
  L1: [
    { id: "_summary",    label: "摘要" },
    { id: "brand",       label: "品牌" },
    { id: "competitors", label: "競品" },
    { id: "audience",    label: "受眾" },
  ],
  L2: [
    { id: "_summary",    label: "摘要" },
    { id: "brand",       label: "品牌" },
    { id: "product",     label: "產品" },
    { id: "pricing",     label: "定價" },
    { id: "competitors", label: "競品" },
  ],
  L3: [
    { id: "_summary", label: "摘要" },
    { id: "brand",    label: "品牌" },
    { id: "audience", label: "受眾" },
    { id: "persona",  label: "Persona" },
  ],
  L4: [
    { id: "_summary", label: "摘要" },
    { id: "brand",    label: "品牌" },
    { id: "channel",  label: "頻道" },
    { id: "content",  label: "素材" },
  ],
  L5: [
    { id: "_summary",  label: "摘要" },
    { id: "brand",     label: "品牌" },
    { id: "campaign",  label: "活動" },
    { id: "audience",  label: "受眾" },
  ],
  L6: [
    { id: "_summary", label: "摘要" },
    { id: "brand",    label: "品牌" },
    { id: "metrics",  label: "指標" },
    { id: "audit",    label: "對標" },
  ],
};

// ── Layer schemas（不含摘要，摘要永遠自動加在第一位）────────────────────────

const LAYER_TABS: Record<string, BriefTab[]> = {
  L1: [
    { id: "brand", label: "品牌", fields: [
      { id: "brand_name",   label: "品牌名稱",   source: "scope",       type: "text",     icon: faBuilding },
      { id: "brand_story",  label: "品牌故事",   source: "brand_brain", type: "textarea", icon: faBrain,    brainCategory: "positioning" },
      { id: "brand_values", label: "品牌價值主張", source: "brand_brain", type: "textarea", icon: faBullseye, brainCategory: "positioning" },
      { id: "brand_voice",  label: "品牌語調",   source: "brand_brain", type: "textarea", icon: faHashtag,  brainCategory: "voice" },
    ]},
    { id: "competitors", label: "競品", fields: [
      { id: "competitors",         label: "主要競爭者",   source: "web_search", type: "list",     icon: faTrophy,    searchQuery: "{brand_name} 競爭者 competitor brands" },
      { id: "competitor_position", label: "競品定位分析", source: "web_search", type: "textarea", icon: faChartLine, searchQuery: "{brand_name} competitor positioning analysis" },
    ]},
    { id: "audience", label: "受眾", fields: [
      { id: "target_audience", label: "目標族群", source: "brand_brain", type: "textarea", icon: faUsers,    brainCategory: "audience" },
      { id: "pain_points",     label: "核心痛點", source: "brand_brain", type: "list",     icon: faBullseye, brainCategory: "audience" },
    ]},
  ],
  L2: [
    { id: "brand", label: "品牌", fields: [
      { id: "brand_name",  label: "品牌名稱", source: "scope",       type: "text",     icon: faBuilding },
      { id: "brand_story", label: "品牌故事", source: "brand_brain", type: "textarea", icon: faBrain,   brainCategory: "positioning" },
    ]},
    { id: "product", label: "產品", fields: [
      { id: "product_name", label: "產品名稱", source: "scope",      type: "text",     icon: faBoxOpen },
      { id: "product_url",  label: "產品網址", source: "web_search", type: "url",      icon: faLink,   searchQuery: "{product_name} {brand_name} 官網" },
      { id: "product_desc", label: "產品描述", source: "brand_brain",type: "textarea", icon: faTag,    brainCategory: "positioning" },
    ]},
    { id: "pricing", label: "定價", fields: [
      { id: "own_price",         label: "售價",     source: "brand_brain", type: "text", icon: faTag,    brainCategory: "positioning" },
      { id: "competitor_prices", label: "競品定價", source: "web_search",  type: "list", icon: faTrophy, searchQuery: "{product_name} 競品 定價 price comparison" },
    ]},
    { id: "competitors", label: "競品", fields: [
      { id: "competitors",    label: "競爭者",   source: "web_search", type: "list",     icon: faTrophy,    searchQuery: "{brand_name} {product_name} 競爭者" },
      { id: "comp_features",  label: "競品特色", source: "web_search", type: "textarea", icon: faChartLine, searchQuery: "{brand_name} vs competitors features" },
    ]},
  ],
  L3: [
    { id: "brand", label: "品牌", fields: [
      { id: "brand_name", label: "品牌名稱", source: "scope",       type: "text",     icon: faBuilding },
      { id: "brand_pos",  label: "品牌定位", source: "brand_brain", type: "textarea", icon: faBrain,   brainCategory: "positioning" },
    ]},
    { id: "audience", label: "受眾", fields: [
      { id: "target_audience", label: "目標族群",   source: "brand_brain", type: "textarea", icon: faUsers,    brainCategory: "audience" },
      { id: "demographics",    label: "人口統計",   source: "brand_brain", type: "text",     icon: faUsers,    brainCategory: "audience" },
      { id: "pain_points",     label: "核心痛點",   source: "brand_brain", type: "list",     icon: faBullseye, brainCategory: "audience" },
      { id: "buying_trigger",  label: "購買觸發點", source: "web_search",  type: "textarea", icon: faChartLine, searchQuery: "{brand_name} customer buying trigger" },
    ]},
    { id: "persona", label: "Persona", fields: [
      { id: "persona_name",    label: "Persona 名稱", source: "brand_brain", type: "text",     icon: faUsers, brainCategory: "audience" },
      { id: "persona_profile", label: "Persona 描述", source: "brand_brain", type: "textarea", icon: faUsers, brainCategory: "audience" },
    ]},
  ],
  L4: [
    { id: "brand", label: "品牌", fields: [
      { id: "brand_name",  label: "品牌名稱", source: "scope",       type: "text",     icon: faBuilding },
      { id: "brand_voice", label: "品牌語調", source: "brand_brain", type: "textarea", icon: faHashtag, brainCategory: "voice" },
    ]},
    { id: "channel", label: "頻道", fields: [
      { id: "channel_url",    label: "頻道網址", source: "web_search", type: "url",  icon: faLink,    searchQuery: "{brand_name} official social media page URL" },
      { id: "channel_follow", label: "粉絲數",   source: "web_search", type: "text", icon: faUsers,   searchQuery: "{brand_name} social media followers" },
      { id: "post_frequency", label: "發文頻率", source: "web_search", type: "text", icon: faCalendar, searchQuery: "{brand_name} posting frequency" },
    ]},
    { id: "content", label: "素材", fields: [
      { id: "top_posts",  label: "爆款貼文",  source: "web_search",  type: "textarea", icon: faImage,   searchQuery: "{brand_name} top performing posts viral" },
      { id: "brand_img",  label: "品牌素材",  source: "user_input",  type: "url",      icon: faImage,   placeholder: "貼上圖片連結或稍後上傳" },
    ]},
  ],
  L5: [
    { id: "brand", label: "品牌", fields: [
      { id: "brand_name", label: "品牌名稱", source: "scope",       type: "text",     icon: faBuilding },
      { id: "brand_pos",  label: "品牌定位", source: "brand_brain", type: "textarea", icon: faBrain,   brainCategory: "positioning" },
    ]},
    { id: "campaign", label: "活動", fields: [
      { id: "campaign_name",   label: "活動名稱", source: "scope",      type: "text",     icon: faCalendar },
      { id: "campaign_goal",   label: "活動目標", source: "user_input", type: "textarea", icon: faBullseye, placeholder: "例：提升 Q3 銷售 30%，觸及 20-35 歲女性" },
      { id: "campaign_budget", label: "活動預算", source: "user_input", type: "text",     icon: faTag,     placeholder: "例：NT$ 500,000" },
      { id: "campaign_kpi",    label: "KPI 指標", source: "user_input", type: "list",     icon: faChartLine, placeholder: "例：ROAS > 3, CTR > 2%" },
    ]},
    { id: "audience", label: "受眾", fields: [
      { id: "target_audience", label: "目標族群", source: "brand_brain", type: "textarea", icon: faUsers, brainCategory: "audience" },
    ]},
  ],
  L6: [
    { id: "brand", label: "品牌", fields: [
      { id: "brand_name", label: "品牌名稱", source: "scope", type: "text", icon: faBuilding },
    ]},
    { id: "metrics", label: "指標", fields: [
      { id: "kpis",       label: "KPI 指標",   source: "user_input", type: "list", icon: faChartLine, placeholder: "例：ROAS, CTR, CAC, LTV" },
      { id: "benchmarks", label: "行業基準值", source: "web_search", type: "list", icon: faTrophy,    searchQuery: "{brand_name} industry benchmark KPI average" },
    ]},
    { id: "audit", label: "對標", fields: [
      { id: "competitors",     label: "競爭者",   source: "web_search", type: "list",     icon: faTrophy,    searchQuery: "{brand_name} competitors performance" },
      { id: "market_position", label: "市場定位", source: "web_search", type: "textarea", icon: faChartLine, searchQuery: "{brand_name} market position" },
    ]},
  ],
};

// ── zh → en label map (for tab labels, field labels, placeholders) ──────────
const ZH_EN: Record<string, string> = {
  // Tab labels
  "摘要": "Summary", "品牌": "Brand", "競品": "Competitors", "受眾": "Audience",
  "產品": "Product", "定價": "Pricing", "頻道": "Channel", "素材": "Content",
  "活動": "Campaign", "指標": "Metrics", "對標": "Benchmark", "其他補充": "Other notes",
  // Field labels
  "品牌名稱": "Brand name", "品牌故事": "Brand story", "品牌價值主張": "Value proposition",
  "品牌語調": "Brand voice", "主要競爭者": "Main competitors", "競品定位分析": "Competitor positioning",
  "目標族群": "Target audience", "核心痛點": "Pain points", "產品名稱": "Product name",
  "產品網址": "Product URL", "產品描述": "Product description", "售價": "Price",
  "競品定價": "Competitor pricing", "競爭者": "Competitors", "競品特色": "Competitor features",
  "品牌定位": "Brand positioning", "人口統計": "Demographics", "購買觸發點": "Buying trigger",
  "Persona 名稱": "Persona name", "Persona 描述": "Persona profile",
  "頻道網址": "Channel URL", "粉絲數": "Followers", "發文頻率": "Posting frequency",
  "爆款貼文": "Top posts", "品牌素材": "Brand assets",
  "活動名稱": "Campaign name", "活動目標": "Campaign goal", "活動預算": "Budget",
  "KPI 指標": "KPIs", "行業基準值": "Industry benchmarks", "市場定位": "Market position",
  "想告訴 Agent 的話": "Anything to tell the Agent",
  // Placeholders
  "貼上圖片連結或稍後上傳": "Paste image link or upload later",
  "例：提升 Q3 銷售 30%，觸及 20-35 歲女性": "e.g. Lift Q3 sales 30%, reach women 20-35",
  "例：NT$ 500,000": "e.g. NT$ 500,000",
  "例：ROAS > 3, CTR > 2%": "e.g. ROAS > 3, CTR > 2%",
  "例：ROAS, CTR, CAC, LTV": "e.g. ROAS, CTR, CAC, LTV",
  "例：這次強調夏季新品、語調輕鬆活潑、目標是 25-35 歲女性、不要提到競品名稱…": "e.g. Push summer launch, breezy tone, target women 25-35, don't name competitors…",
};

function tr(s: string | undefined, lang: string): string {
  if (!s) return s ?? "";
  if (lang !== "en") return s;
  return ZH_EN[s] ?? s;
}

// ── Source meta ───────────────────────────────────────────────────────────────

const SOURCE_META: Record<FieldSource, { icon: any; label: string; color: string }> = {
  scope:       { icon: faLink,   label: "Scope",       color: "#6366F1" },
  brand_brain: { icon: faBrain,  label: "Brand Brain", color: "#7C3AED" },
  web_search:  { icon: faGlobe,  label: "Web",         color: "#0891B2" },
  user_input:  { icon: faPen,    label: "手動",         color: "#D97706" },
};

// ── Layer color ───────────────────────────────────────────────────────────────

const LAYER_COLOR: Record<string, string> = {
  L1: "#4F46E5", L2: "#E11D48", L3: "#D97706",
  L4: "#7C3AED", L5: "#16A34A", L6: "#57534E",
};

// ── Typewriter hook ───────────────────────────────────────────────────────────

function useTypewriter(text: string, active: boolean, speed = 12) {
  const [displayed, setDisplayed] = useState(active ? "" : text);
  const [done, setDone] = useState(!active || !text);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const idx = useRef(0);

  useEffect(() => {
    if (!active || !text) { setDisplayed(text); setDone(true); return; }
    setDisplayed(""); setDone(false); idx.current = 0;
    ref.current = setInterval(() => {
      idx.current += 1;
      setDisplayed(text.slice(0, idx.current));
      if (idx.current >= text.length) { clearInterval(ref.current!); setDone(true); }
    }, speed);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [text, active]);
  return { displayed, done };
}

// ── FieldCard ─────────────────────────────────────────────────────────────────

function FieldCard({ field, state, typing, onEdit, onRefetch, onChange }: {
  field: BriefField; state: FieldState; typing: boolean;
  onEdit: () => void; onRefetch: () => void; onChange: (v: string) => void;
}) {
  const { lang } = useLang();
  const src = SOURCE_META[field.source];
  const srcLabel = lang === "en"
    ? (field.source === "user_input" ? "Manual"
        : field.source === "scope" ? "Scope"
        : field.source === "brand_brain" ? "Brand Brain"
        : "Web")
    : src.label;
  const { displayed, done } = useTypewriter(state.value, typing && state.status === "filled", 12);
  const showValue = state.status === "filled" && !typing ? state.value : displayed;
  const isEditing = state.status === "editing";
  const isLoading = state.status === "loading";
  const isIdle    = state.status === "idle";
  const isUserInput = field.source === "user_input";

  return (
    <div style={{
      background: isEditing ? "#FAFAF9" : "white",
      border: `1px solid ${isEditing ? "#7C3AED" : "#E4E3E1"}`,
      borderRadius: 10, padding: "10px 12px",
      transition: "border-color 0.15s",
    }}>
      {/* Label row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {field.icon && <FontAwesomeIcon icon={field.icon} style={{ fontSize: 12, color: "#A8A29E" }} />}
          <span style={{ fontSize: 12, fontWeight: 600, color: "#78716C", letterSpacing: "0.03em" }}>{tr(field.label, lang)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {(state.status === "filled" || isLoading) && (
            <span style={{ fontSize: 12, color: src.color, background: `${src.color}14`, padding: "1px 6px", borderRadius: 8, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
              <FontAwesomeIcon icon={src.icon} style={{ fontSize: 8 }} />{srcLabel}
            </span>
          )}
          {state.status === "filled" && !isEditing && (
            <>
              <button onClick={onEdit} title={lang === "en" ? "Edit" : "編輯"}
                style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid #E4E3E1", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#C4C0BB", fontSize: 12 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#7C3AED"; e.currentTarget.style.color = "#7C3AED"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#E4E3E1"; e.currentTarget.style.color = "#C4C0BB"; }}
              ><FontAwesomeIcon icon={faPen} /></button>
              {field.source !== "scope" && (
                <button onClick={onRefetch} title={lang === "en" ? "Refetch" : "重新抓取"}
                  style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid #E4E3E1", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#C4C0BB", fontSize: 12 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#0891B2"; e.currentTarget.style.color = "#0891B2"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#E4E3E1"; e.currentTarget.style.color = "#C4C0BB"; }}
                ><FontAwesomeIcon icon={faRotateRight} /></button>
              )}
            </>
          )}
          {isEditing && (
            <button onClick={() => onChange(state.editDraft ?? state.value)}
              style={{ width: 20, height: 20, borderRadius: 5, border: "none", background: "#7C3AED", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12 }}
            ><FontAwesomeIcon icon={faCheck} /></button>
          )}
        </div>
      </div>

      {/* Value */}
      {isLoading && (
        <div style={{ color: "#A8A29E", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <FontAwesomeIcon icon={faSpinner} spin style={{ fontSize: 12 }} />{lang === "en" ? "Filling in…" : "自動填入中…"}
        </div>
      )}
      {isIdle && !isUserInput && (
        <div style={{ color: "#D1D0CE", fontSize: 12, fontStyle: "italic" }}>{tr(field.placeholder, lang) || (lang === "en" ? "Waiting…" : "等待填入…")}</div>
      )}
      {isEditing && (
        <textarea autoFocus value={state.editDraft ?? state.value}
          onChange={e => { /* update draft only */ }}
          onInput={e => {
            const v = (e.target as HTMLTextAreaElement).value;
            // update editDraft without committing
            onChange(v);
          }}
          rows={field.type === "textarea" ? 3 : 1}
          style={{ width: "100%", border: "none", outline: "none", fontSize: 13, color: "#1A1A18", lineHeight: 1.6, resize: "vertical", background: "transparent", fontFamily: "inherit", boxSizing: "border-box" }}
        />
      )}
      {state.status === "filled" && !isEditing && (
        <div style={{ fontSize: 13, color: "#1A1A18", lineHeight: 1.6, whiteSpace: "pre-wrap", minHeight: 18 }}>
          {showValue}{typing && !done && <span style={{ opacity: 0.35 }}>▌</span>}
        </div>
      )}
      {isUserInput && (isIdle || state.status === "filled") && !isEditing && (
        <textarea value={state.editDraft ?? state.value}
          onChange={e => onChange(e.target.value)}
          placeholder={tr(field.placeholder, lang) || (lang === "en" ? "Type here…" : "請填寫…")}
          rows={field.type === "textarea" ? 3 : 1}
          style={{ width: "100%", border: "none", outline: "none", fontSize: 13, color: "#57534E", lineHeight: 1.6, resize: "none", background: "transparent", fontFamily: "inherit", boxSizing: "border-box" }}
        />
      )}
    </div>
  );
}

// ── Summary tab content ───────────────────────────────────────────────────────
// Shows ALL fields (grouped by tab section) as editable FieldCards.
// This is the single place the user can see & edit everything at once.

interface SummaryTabProps {
  contentTabs: BriefTab[];
  fieldStates: Record<string, FieldState>;
  typingFieldId: string | null;
  onEdit: (id: string) => void;
  onRefetch: (field: BriefField) => void;
  onChange: (id: string, value: string) => void;
  activeFieldId?: string | null; // highlights the currently-filling field
}

function SummaryTab({ contentTabs, fieldStates, typingFieldId, onEdit, onRefetch, onChange, activeFieldId }: SummaryTabProps) {
  const { lang } = useLang();
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll to active field when auto-fill moves to it
  useEffect(() => {
    if (activeFieldId && fieldRefs.current[activeFieldId]) {
      fieldRefs.current[activeFieldId]!.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeFieldId]);

  const hasAnyField = contentTabs.some(tab => tab.fields.length > 0);
  if (!hasAnyField) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {contentTabs.map((tab, ti) => (
        <div key={tab.id}>
          {/* Section header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#A8A29E", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
              {tr(tab.label, lang)}
            </p>
            <div style={{ flex: 1, height: 1, background: "#F0F0EE" }} />
          </div>
          {/* Fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tab.fields.map(field => (
              <div
                key={field.id}
                ref={el => { fieldRefs.current[field.id] = el; }}
                style={{
                  outline: activeFieldId === field.id ? "2px solid #7C3AED" : "none",
                  borderRadius: 10,
                  transition: "outline 0.2s",
                }}
              >
                <FieldCard
                  field={field}
                  state={fieldStates[field.id] ?? { status: "idle", value: "" }}
                  typing={typingFieldId === field.id}
                  onEdit={() => onEdit(field.id)}
                  onRefetch={() => onRefetch(field)}
                  onChange={v => onChange(field.id, v)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main BriefPanel ───────────────────────────────────────────────────────────

export interface BriefPanelProps {
  layer: string;
  squadSlug?: string | null;
  squadName?: string;
  brandId?: number | null;
  brandName?: string | null;
  productName?: string | null;
  eventName?: string | null;
  onLaunch: (briefValues: Record<string, string>) => void;
  onBack?: () => void;
  /** Controlled tab (driven by external icon rail). When provided, hides internal tab strip. */
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
}

export function BriefPanel({
  layer, squadSlug, squadName, brandId, brandName, productName, eventName,
  onLaunch, onBack, activeTabId: externalActiveTabId, onTabChange,
}: BriefPanelProps) {
  const { t, lang } = useLang();
  const layerKey = String(layer ?? "L1").slice(0, 2).toUpperCase();

  // Layer-specific tabs + always-on "其他補充" free-text section at the end
  const contentTabs: BriefTab[] = useMemo(() => [
    ...(LAYER_TABS[layerKey] ?? LAYER_TABS.L1),
    {
      id: "_notes",
      label: "其他補充",
      fields: [{
        id: "user_notes",
        label: "想告訴 Agent 的話",
        source: "user_input" as FieldSource,
        type: "textarea" as FieldType,
        icon: faAlignLeft,
        placeholder: "例：這次強調夏季新品、語調輕鬆活潑、目標是 25-35 歲女性、不要提到競品名稱…",
      }],
    },
  ], [layerKey]);

  // Full tab list: 摘要 always first (used only in non-controlled / internal tab strip)
  const allTabs = useMemo(() => [
    { id: "_summary", label: "摘要" } as BriefTab & { fields: BriefField[] },
    ...contentTabs,
  ], [contentTabs]);

  const allFields = useMemo(() => contentTabs.flatMap(t => t.fields), [contentTabs]);
  const layerColor = LAYER_COLOR[layerKey] ?? "#7C3AED";

  const isControlled = !!onTabChange;
  const [_internalActiveTab, _setInternalActiveTab] = useState("_summary");
  const activeTab = isControlled ? (externalActiveTabId ?? "_summary") : _internalActiveTab;
  const setActiveTab = useCallback((id: string) => {
    _setInternalActiveTab(id);
    onTabChange?.(id);
  }, [onTabChange]);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [typingFieldId, setTypingFieldId] = useState<string | null>(null);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null); // for scroll highlight in summary

  // ── Field states ──────────────────────────────────────────────────────
  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>(() => {
    const init: Record<string, FieldState> = {};
    for (const f of allFields) init[f.id] = { status: "idle", value: "" };
    return init;
  });

  const setField = useCallback((id: string, patch: Partial<FieldState>) => {
    setFieldStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  // ── Brand Brain data ──────────────────────────────────────────────────
  const brainQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false },
      )
    : { data: null };
  const brainEntries = (brainQuery.data as any)?.entries ?? {};

  // Web search via Perplexity — tRPC key is "squad" (squadTemplateRouter registered as squad)
  const briefSearchMut = (trpc as any).squad?.briefSearch?.useMutation
    ? (trpc as any).squad.briefSearch.useMutation()
    : null;
  const briefSearchRef = useRef<typeof briefSearchMut>(briefSearchMut);
  useEffect(() => { briefSearchRef.current = briefSearchMut; }, [briefSearchMut]);

  const getBrainText = (cat: string): string => {
    const items: any[] = brainEntries[cat] ?? [];
    return items.map((i: any) => i.content ?? i.title ?? "").filter(Boolean).slice(0, 2).join("\n\n");
  };

  // ── Auto-fill a single field (returns fill duration ms) ───────────────
  const fillField = useCallback(async (field: BriefField): Promise<void> => {
    if (field.source === "user_input") return; // skip user-input fields in auto mode

    setField(field.id, { status: "loading" });
    setTypingFieldId(field.id);
    setActiveFieldId(field.id);

    let value = "";

    if (field.source === "scope") {
      value = field.id === "brand_name"   ? (brandName ?? "")
            : field.id === "product_name" ? (productName ?? "")
            : field.id === "campaign_name"? (eventName ?? "")
            : "";
      await new Promise(r => setTimeout(r, 200));
    } else if (field.source === "brand_brain") {
      await new Promise(r => setTimeout(r, 500));
      value = getBrainText(field.brainCategory ?? "positioning");
      if (!value) value = lang === "en" ? `(No ${tr(field.label, lang)} data yet — please fill manually)` : `（尚未有 ${field.label} 資料，請手動填寫）`;
    } else if (field.source === "web_search") {
      const q = (field.searchQuery ?? "")
        .replace("{brand_name}",   brandName   ?? "")
        .replace("{product_name}", productName ?? "");
      try {
        const mut = briefSearchRef.current;
        if (mut?.mutateAsync) {
          const res = await mut.mutateAsync({ query: q, brandName: brandName ?? undefined, productName: productName ?? undefined });
          value = res?.result ?? "";
        } else {
          value = ""; // mutation not available — leave blank
        }
      } catch {
        // Web search failed — reset field to idle so user can fill manually
        setField(field.id, { status: "idle", value: "" });
        setTypingFieldId(null);
        setActiveFieldId(null);
        return;
      }
      // If we got empty result, also keep idle
      if (!value.trim()) {
        setField(field.id, { status: "idle", value: "" });
        setTypingFieldId(null);
        return;
      }
    }

    setField(field.id, { status: "filled", value, source: field.source });

    // Typewriter duration estimate: ~12ms per char, min 400ms
    const typeDuration = Math.max(400, value.length * 12);
    await new Promise(r => setTimeout(r, typeDuration));
    setTypingFieldId(null);
  }, [brandName, productName, eventName, brainEntries]);

  // ── Auto-run: stay on 摘要 tab, fill all fields in place with scroll ──
  const runAuto = useCallback(async () => {
    if (isAutoRunning) return;
    setIsAutoRunning(true);
    setActiveTab("_summary"); // stay on summary the whole time

    for (const tab of contentTabs) {
      for (const field of tab.fields) {
        await fillField(field); // fillField sets activeFieldId → scroll highlight
      }
    }

    setActiveFieldId(null);
    setIsAutoRunning(false);
  }, [isAutoRunning, contentTabs, fillField]);

  // ── Pre-fill scope fields on mount ───────────────────────────────────
  useEffect(() => {
    if (brandName)   setField("brand_name",    { status: "filled", value: brandName,   source: "scope" });
    if (productName) setField("product_name",  { status: "filled", value: productName, source: "scope" });
    if (eventName)   setField("campaign_name", { status: "filled", value: eventName,   source: "scope" });
  }, [brandName, productName, eventName]);

  // ── Edit / change handlers ────────────────────────────────────────────
  const handleEdit = (fieldId: string) => {
    setFieldStates(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], status: "editing", editDraft: prev[fieldId].value },
    }));
  };
  const handleChange = (fieldId: string, value: string) => {
    setFieldStates(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], status: "filled", value, editDraft: value, source: "user_input" },
    }));
  };
  const handleRefetch = useCallback(async (field: BriefField) => {
    await fillField(field);
  }, [fillField]);

  // ── Launch readiness ──────────────────────────────────────────────────
  const filledCount = Object.values(fieldStates).filter(s => s.status === "filled").length;
  const totalFields = allFields.length;
  const canLaunch   = filledCount > 0 && !isAutoRunning;

  const handleLaunch = () => {
    const vals: Record<string, string> = {};
    for (const f of allFields) vals[f.id] = fieldStates[f.id]?.value ?? "";
    onLaunch(vals);
  };

  // ── Active tab fields ─────────────────────────────────────────────────
  const activeTabDef = contentTabs.find(t => t.id === activeTab);
  const isSummary = activeTab === "_summary";

  // progress
  const pct = totalFields > 0 ? Math.round((filledCount / totalFields) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAFAF9" }}>

      {/* ── Header ── */}
      <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid #F0F0EE" }}>
        {onBack && (
          <button onClick={onBack}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", color: "#A8A29E", fontSize: 12, padding: 0, marginBottom: 6 }}
            onMouseEnter={e => e.currentTarget.style.color = "#57534E"}
            onMouseLeave={e => e.currentTarget.style.color = "#A8A29E"}
          >
            <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: 12 }} /> {lang === "en" ? "All methodologies" : "所有方法論"}
          </button>
        )}
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A18", lineHeight: 1.3 }}>
          {squadName ?? (lang === "en" ? "Methodology Squad" : "方法論小組")}
        </div>
        <div style={{ marginTop: 3, display: "flex", gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: layerColor, background: `${layerColor}14`, padding: "2px 7px", borderRadius: 8 }}>{layerKey}</span>
          {brandName && <span style={{ fontSize: 12, color: "#A8A29E" }}>{brandName}</span>}
        </div>
      </div>

      {/* ── Brand Brain status + auto-run button ── */}
      <div style={{ padding: "8px 14px", background: "white", borderBottom: "1px solid #F0F0EE" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: brandId ? "#16A34A" : "#D1D0CE" }} />
          <span style={{ fontSize: 12, color: "#57534E", fontWeight: 600, flex: 1 }}>
            Brand Brain {brandId ? (lang === "en" ? "connected" : "已連接") : (lang === "en" ? "not connected" : "未連接")}
          </span>
          <button onClick={runAuto} disabled={isAutoRunning}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 20, border: "none", cursor: isAutoRunning ? "default" : "pointer",
              background: isAutoRunning ? "#F0F0EE" : layerColor, color: isAutoRunning ? "#A8A29E" : "white",
              fontSize: 12, fontWeight: 600, transition: "all 0.15s",
            }}
          >
            <FontAwesomeIcon icon={isAutoRunning ? faPause : faWandSparkles} style={{ fontSize: 12 }} />
            {isAutoRunning ? (lang === "en" ? "Filling…" : "填寫中…") : (lang === "en" ? "Autofill" : "自動填寫")}
          </button>
        </div>
        {/* Progress bar */}
        <div style={{ height: 3, background: "#F0F0EE", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: layerColor, borderRadius: 10, transition: "width 0.4s ease" }} />
        </div>
        <div style={{ fontSize: 12, color: "#A8A29E", marginTop: 3 }}>{filledCount}/{totalFields} {lang === "en" ? "fields filled" : "欄位已填"}</div>
      </div>

      {/* ── Tabs (hidden in controlled/rail mode) ── */}
      {!isControlled && (
        <div style={{ display: "flex", background: "white", borderBottom: "1px solid #F0F0EE", overflowX: "auto" }}>
          {allTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              disabled={isAutoRunning}
              style={{
                flexShrink: 0, padding: "7px 12px", border: "none", background: "none",
                cursor: isAutoRunning ? "default" : "pointer",
                fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? layerColor : "#A8A29E",
                borderBottom: `2px solid ${activeTab === tab.id ? layerColor : "transparent"}`,
                transition: "all 0.15s",
              }}
            >
              {tab.id === "_summary" ? (lang === "en" ? "Summary" : "摘要") : tr(tab.label, lang)}
            </button>
          ))}
        </div>
      )}

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {isSummary ? (
          <SummaryTab
            contentTabs={contentTabs}
            fieldStates={fieldStates}
            typingFieldId={typingFieldId}
            onEdit={handleEdit}
            onRefetch={handleRefetch}
            onChange={handleChange}
            activeFieldId={activeFieldId}
          />
        ) : (
          (activeTabDef?.fields ?? []).map(field => (
            <FieldCard
              key={field.id}
              field={field}
              state={fieldStates[field.id] ?? { status: "idle", value: "" }}
              typing={typingFieldId === field.id}
              onEdit={() => handleEdit(field.id)}
              onRefetch={() => handleRefetch(field)}
              onChange={v => handleChange(field.id, v)}
            />
          ))
        )}
      </div>

      {/* ── Launch CTA ── */}
      <div style={{ padding: "10px 14px 14px", borderTop: "1px solid #F0F0EE", background: "white" }}>
        <button onClick={handleLaunch} disabled={!canLaunch}
          style={{
            width: "100%", padding: "11px", borderRadius: 10, border: "none",
            background: canLaunch ? layerColor : "#E4E3E1",
            color: canLaunch ? "white" : "#A8A29E",
            fontSize: 14, fontWeight: 700, cursor: canLaunch ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "all 0.2s",
            boxShadow: canLaunch ? `0 3px 12px ${layerColor}40` : "none",
          }}
          onMouseEnter={e => { if (canLaunch) e.currentTarget.style.opacity = "0.9"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
        >
          <FontAwesomeIcon icon={faRocket} />
          {isAutoRunning
            ? (lang === "en" ? `Filling in (${filledCount}/${totalFields})` : `自動填寫中（${filledCount}/${totalFields}）`)
            : canLaunch
              ? (lang === "en" ? "Start" : "開始執行")
              : (lang === "en" ? "Please fill the brief first" : "請先填寫簡報")}
        </button>
      </div>

      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1}50%{opacity:0.4} }
      `}</style>
    </div>
  );
}
