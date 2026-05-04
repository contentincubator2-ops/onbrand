/**
 * BriefPanel — 智慧型 Brief 面板
 *
 * 取代 PickerWorkspace 左欄的 chat 介面。
 * 結構：Brand Brain 狀態列 → Layer tabs → 各欄位卡（自動填入 + ✏️ + 🔄）→ 啟動按鈕
 *
 * 三個資料來源（依序觸發）：
 *   1. scope   — 立即（品牌名、產品名、活動名）
 *   2. brand_brain — 快速（定位、受眾、語調、競品）
 *   3. web_search  — 慢（競爭者定價、頻道網址、市占）
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "../../lib/trpc";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBrain, faGlobe, faLink, faRotateRight, faPen, faCheck,
  faSpinner, faRocket, faArrowLeft, faChevronRight,
  faBuilding, faBoxOpen, faUsers, faTrophy, faTag, faCalendar,
  faChartLine, faBullseye, faHashtag, faImage,
} from "@fortawesome/free-solid-svg-icons";

// ── Types ────────────────────────────────────────────────────────────────────

type FieldSource = "scope" | "brand_brain" | "web_search" | "user_input";
type FieldType   = "text" | "textarea" | "url" | "list" | "number";
type FieldStatus = "idle" | "loading" | "filled" | "editing" | "error";

interface BriefField {
  id: string;
  label: string;
  source: FieldSource;
  type: FieldType;
  icon?: any;
  placeholder?: string;
  /** template string for web search, e.g. "{brand_name} 競爭者 site:tw" */
  searchQuery?: string;
  /** which brand_brain category to pull from */
  brainCategory?: "positioning" | "audience" | "voice" | "competitors" | "custom";
  /** which brand_brain entry title to match */
  brainKey?: string;
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

// ── Layer brief schemas ───────────────────────────────────────────────────────

const SCHEMAS: Record<string, BriefTab[]> = {
  L1: [
    { id: "brand", label: "品牌", fields: [
      { id: "brand_name",   label: "品牌名稱",   source: "scope",       type: "text",     icon: faBuilding },
      { id: "brand_story",  label: "品牌故事",   source: "brand_brain", type: "textarea",  icon: faBrain,    brainCategory: "positioning", brainKey: "brand_story" },
      { id: "brand_values", label: "品牌價值主張", source: "brand_brain", type: "textarea", icon: faBullseye, brainCategory: "positioning" },
      { id: "brand_voice",  label: "品牌語調",   source: "brand_brain", type: "textarea",  icon: faHashtag,  brainCategory: "voice" },
    ]},
    { id: "competitors", label: "競品", fields: [
      { id: "competitors",         label: "主要競爭者",   source: "web_search", type: "list",     icon: faTrophy,   searchQuery: "{brand_name} 競爭者 competitor brands" },
      { id: "competitor_position", label: "競品定位分析", source: "web_search", type: "textarea", icon: faChartLine, searchQuery: "{brand_name} competitor positioning analysis" },
    ]},
    { id: "audience", label: "受眾", fields: [
      { id: "target_audience", label: "目標族群",   source: "brand_brain", type: "textarea", icon: faUsers,   brainCategory: "audience" },
      { id: "pain_points",     label: "核心痛點",   source: "brand_brain", type: "list",     icon: faBullseye, brainCategory: "audience", brainKey: "pain_points" },
    ]},
  ],
  L2: [
    { id: "brand", label: "品牌", fields: [
      { id: "brand_name",  label: "品牌名稱", source: "scope",       type: "text",     icon: faBuilding },
      { id: "brand_story", label: "品牌故事", source: "brand_brain", type: "textarea", icon: faBrain,   brainCategory: "positioning" },
    ]},
    { id: "product", label: "產品", fields: [
      { id: "product_name", label: "產品名稱", source: "scope",       type: "text",     icon: faBoxOpen },
      { id: "product_url",  label: "產品網址", source: "web_search",  type: "url",      icon: faLink,    searchQuery: "{product_name} {brand_name} 官網 site" },
      { id: "product_desc", label: "產品描述", source: "brand_brain", type: "textarea", icon: faTag,     brainCategory: "positioning", brainKey: "product" },
    ]},
    { id: "pricing", label: "定價", fields: [
      { id: "own_price",         label: "售價",     source: "brand_brain", type: "text", icon: faTag,    brainCategory: "positioning", brainKey: "pricing" },
      { id: "competitor_prices", label: "競品定價", source: "web_search",  type: "list", icon: faTrophy, searchQuery: "{product_name} 競品 定價 price comparison" },
    ]},
    { id: "competitors", label: "競品", fields: [
      { id: "competitors",     label: "競爭者",   source: "web_search", type: "list",     icon: faTrophy,    searchQuery: "{brand_name} {product_name} 競爭者" },
      { id: "comp_features",  label: "競品特色", source: "web_search", type: "textarea", icon: faChartLine, searchQuery: "{brand_name} vs competitors features" },
    ]},
  ],
  L3: [
    { id: "brand", label: "品牌", fields: [
      { id: "brand_name", label: "品牌名稱", source: "scope",       type: "text",     icon: faBuilding },
      { id: "brand_pos",  label: "品牌定位", source: "brand_brain", type: "textarea", icon: faBrain,   brainCategory: "positioning" },
    ]},
    { id: "audience", label: "受眾", fields: [
      { id: "target_audience", label: "目標族群",   source: "brand_brain", type: "textarea", icon: faUsers,   brainCategory: "audience" },
      { id: "demographics",    label: "人口統計",   source: "brand_brain", type: "text",     icon: faUsers,   brainCategory: "audience", brainKey: "demographics" },
      { id: "pain_points",     label: "核心痛點",   source: "brand_brain", type: "list",     icon: faBullseye, brainCategory: "audience", brainKey: "pain_points" },
      { id: "buying_trigger",  label: "購買觸發點", source: "web_search",  type: "textarea", icon: faChartLine, searchQuery: "{brand_name} customer buying trigger motivation" },
    ]},
    { id: "persona", label: "Persona", fields: [
      { id: "persona_name",    label: "Persona 名稱", source: "brand_brain", type: "text",     icon: faUsers,   brainCategory: "audience", brainKey: "persona" },
      { id: "persona_profile", label: "Persona 描述", source: "brand_brain", type: "textarea", icon: faUsers,   brainCategory: "audience" },
    ]},
  ],
  L4: [
    { id: "brand", label: "品牌", fields: [
      { id: "brand_name", label: "品牌名稱", source: "scope", type: "text", icon: faBuilding },
    ]},
    { id: "channel", label: "頻道", fields: [
      { id: "channel_url",     label: "頻道網址",   source: "web_search", type: "url",  icon: faLink,    searchQuery: "{brand_name} official Facebook Instagram page URL" },
      { id: "channel_follow",  label: "粉絲數",     source: "web_search", type: "text", icon: faUsers,   searchQuery: "{brand_name} social media followers count" },
      { id: "post_frequency",  label: "發文頻率",   source: "web_search", type: "text", icon: faCalendar, searchQuery: "{brand_name} posting frequency social media" },
    ]},
    { id: "content", label: "素材", fields: [
      { id: "top_posts",   label: "爆款貼文",   source: "web_search", type: "textarea", icon: faImage,  searchQuery: "{brand_name} top performing posts viral content" },
      { id: "brand_voice", label: "品牌語調",   source: "brand_brain", type: "textarea", icon: faHashtag, brainCategory: "voice" },
    ]},
  ],
  L5: [
    { id: "brand", label: "品牌", fields: [
      { id: "brand_name", label: "品牌名稱", source: "scope",       type: "text",     icon: faBuilding },
      { id: "brand_pos",  label: "品牌定位", source: "brand_brain", type: "textarea", icon: faBrain,   brainCategory: "positioning" },
    ]},
    { id: "campaign", label: "活動", fields: [
      { id: "campaign_name",   label: "活動名稱", source: "scope",      type: "text",     icon: faCalendar },
      { id: "campaign_goal",   label: "活動目標", source: "user_input", type: "textarea", icon: faBullseye, placeholder: "例如：提升 Q3 銷售 30%，觸及 20-35 歲女性" },
      { id: "campaign_budget", label: "活動預算", source: "user_input", type: "text",     icon: faTag,     placeholder: "例如：NT$ 500,000" },
      { id: "campaign_kpi",    label: "KPI 指標", source: "user_input", type: "list",     icon: faChartLine, placeholder: "例如：ROAS > 3, CTR > 2%" },
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
      { id: "kpis",       label: "KPI 指標",   source: "user_input", type: "list", icon: faChartLine, placeholder: "例如：ROAS, CTR, CAC, LTV" },
      { id: "benchmarks", label: "行業基準值", source: "web_search", type: "list", icon: faTrophy,   searchQuery: "{brand_name} industry benchmark KPI average" },
    ]},
    { id: "audit", label: "對標", fields: [
      { id: "competitors",     label: "競爭者",   source: "web_search", type: "list",     icon: faTrophy,   searchQuery: "{brand_name} competitors performance" },
      { id: "market_position", label: "市場定位", source: "web_search", type: "textarea", icon: faChartLine, searchQuery: "{brand_name} market position share" },
    ]},
  ],
};

// ── Source badge ──────────────────────────────────────────────────────────────

const SOURCE_META: Record<FieldSource, { icon: any; label: string; color: string }> = {
  scope:       { icon: faLink,   label: "Scope",       color: "#6366F1" },
  brand_brain: { icon: faBrain,  label: "Brand Brain", color: "#7C3AED" },
  web_search:  { icon: faGlobe,  label: "Web",         color: "#0891B2" },
  user_input:  { icon: faPen,    label: "手動填寫",     color: "#D97706" },
};

// ── Typewriter hook ───────────────────────────────────────────────────────────

function useTypewriter(text: string, enabled: boolean, speed = 18) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const idxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled || !text) { setDisplayed(text); setDone(true); return; }
    setDisplayed(""); setDone(false); idxRef.current = 0;
    timerRef.current = setInterval(() => {
      idxRef.current += 1;
      setDisplayed(text.slice(0, idxRef.current));
      if (idxRef.current >= text.length) {
        clearInterval(timerRef.current!);
        setDone(true);
      }
    }, speed);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [text, enabled]);

  return { displayed, done };
}

// ── Field card ────────────────────────────────────────────────────────────────

function FieldCard({
  field, state, onEdit, onRefetch, onChange,
}: {
  field: BriefField;
  state: FieldState;
  onEdit: () => void;
  onRefetch: () => void;
  onChange: (v: string) => void;
}) {
  const src = SOURCE_META[field.source];
  const isLoading = state.status === "loading";
  const isEditing = state.status === "editing";
  const isFilled  = state.status === "filled";
  const isError   = state.status === "error";
  const isIdle    = state.status === "idle";

  const { displayed, done } = useTypewriter(
    state.value,
    isFilled && !!state.value,
    14,
  );

  const displayText = isFilled ? displayed : state.value;

  return (
    <div style={{
      background: isEditing ? "#FAFAF9" : "white",
      border: `1px solid ${isEditing ? "#7C3AED" : "#E4E3E1"}`,
      borderRadius: 10, padding: "10px 12px", transition: "border-color 0.15s",
    }}>
      {/* Label row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {field.icon && (
            <FontAwesomeIcon icon={field.icon} style={{ fontSize: 11, color: "#A8A29E" }} />
          )}
          <span style={{ fontSize: 11, fontWeight: 600, color: "#78716C", letterSpacing: "0.04em" }}>
            {field.label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* Source badge */}
          {(isFilled || isLoading) && (
            <span style={{
              display: "flex", alignItems: "center", gap: 3,
              fontSize: 10, color: src.color, background: `${src.color}14`,
              padding: "2px 6px", borderRadius: 10, fontWeight: 500,
            }}>
              <FontAwesomeIcon icon={src.icon} style={{ fontSize: 9 }} />
              {src.label}
            </span>
          )}
          {/* Action buttons */}
          {!isEditing && isFilled && (
            <>
              <button onClick={onEdit}
                title="編輯"
                style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid #E4E3E1", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#A8A29E", fontSize: 10, transition: "all 0.12s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#7C3AED"; e.currentTarget.style.color = "#7C3AED"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#E4E3E1"; e.currentTarget.style.color = "#A8A29E"; }}
              >
                <FontAwesomeIcon icon={faPen} />
              </button>
              {field.source !== "scope" && (
                <button onClick={onRefetch}
                  title="重新抓取"
                  style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid #E4E3E1", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#A8A29E", fontSize: 10, transition: "all 0.12s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#0891B2"; e.currentTarget.style.color = "#0891B2"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#E4E3E1"; e.currentTarget.style.color = "#A8A29E"; }}
                >
                  <FontAwesomeIcon icon={faRotateRight} />
                </button>
              )}
            </>
          )}
          {isEditing && (
            <button onClick={() => onChange(state.editDraft ?? state.value)}
              style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "#7C3AED", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 10 }}
            >
              <FontAwesomeIcon icon={faCheck} />
            </button>
          )}
        </div>
      </div>

      {/* Value area */}
      {isLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#A8A29E", fontSize: 12, padding: "4px 0" }}>
          <FontAwesomeIcon icon={faSpinner} spin style={{ fontSize: 11 }} />
          <span>自動填入中…</span>
        </div>
      )}

      {isIdle && (
        <div style={{ color: "#D1D0CE", fontSize: 12, padding: "4px 0", fontStyle: "italic" }}>
          {field.placeholder ?? "等待填入…"}
        </div>
      )}

      {isError && (
        <div style={{ color: "#EF4444", fontSize: 12, padding: "4px 0" }}>
          抓取失敗，請手動填寫
        </div>
      )}

      {isEditing && (
        <textarea
          autoFocus
          value={state.editDraft ?? state.value}
          onChange={e => onChange(e.target.value)}
          rows={field.type === "textarea" ? 3 : 1}
          style={{ width: "100%", border: "none", outline: "none", fontSize: 13, color: "#1A1A18", lineHeight: 1.6, resize: "vertical", background: "transparent", fontFamily: "inherit", boxSizing: "border-box" }}
        />
      )}

      {(isFilled) && !isEditing && (
        <div style={{ fontSize: 13, color: "#1A1A18", lineHeight: 1.6, whiteSpace: "pre-wrap", minHeight: 20 }}>
          {displayText}
          {!done && <span style={{ opacity: 0.4 }}>▌</span>}
        </div>
      )}

      {(field.source === "user_input" && !isFilled && !isLoading) && (
        <textarea
          value={state.editDraft ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder ?? "請填寫…"}
          rows={field.type === "textarea" ? 3 : 1}
          onBlur={() => { if (state.editDraft) onChange(state.editDraft); }}
          style={{ width: "100%", border: "none", outline: "none", fontSize: 13, color: "#1A1A18", lineHeight: 1.6, resize: "none", background: "transparent", fontFamily: "inherit", boxSizing: "border-box", color: "#57534E" }}
        />
      )}
    </div>
  );
}

// ── Main BriefPanel ───────────────────────────────────────────────────────────

interface BriefPanelProps {
  /** Strategy layer: L1–L6 */
  layer: string;
  /** Squad slug (for context) */
  squadSlug?: string | null;
  squadName?: string;
  /** Current scope from PickerWorkspace */
  brandId?: number | null;
  brandName?: string | null;
  productName?: string | null;
  eventName?: string | null;
  /** Called when user clicks 開始執行 */
  onLaunch: (briefValues: Record<string, string>) => void;
  /** Called when user clicks ← 返回 */
  onBack?: () => void;
}

export function BriefPanel({
  layer, squadSlug, squadName, brandId, brandName, productName, eventName, onLaunch, onBack,
}: BriefPanelProps) {
  const layerKey = String(layer ?? "L1").slice(0, 2).toUpperCase();
  const schema: BriefTab[] = SCHEMAS[layerKey] ?? SCHEMAS.L1;
  const [activeTab, setActiveTab] = useState(schema[0]?.id ?? "brand");

  // ── Field state map: fieldId → FieldState ────────────────────────────
  const allFields = useMemo(() => schema.flatMap(t => t.fields), [schema]);

  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>(() => {
    const init: Record<string, FieldState> = {};
    for (const f of allFields) {
      init[f.id] = {
        status: f.source === "user_input" ? "idle" : "idle",
        value: "",
      };
    }
    return init;
  });

  const setField = useCallback((id: string, patch: Partial<FieldState>) => {
    setFieldStates(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  // ── Brand Brain data ─────────────────────────────────────────────────
  const brainQuery = (trpc as any).brandBrain?.list?.useQuery
    ? (trpc as any).brandBrain.list.useQuery(
        { brandId: brandId ?? 0 },
        { enabled: !!brandId, refetchOnWindowFocus: false },
      )
    : { data: null };

  const brainEntries = (brainQuery.data as any)?.entries ?? {};

  // ── Step 1: Fill scope fields immediately ────────────────────────────
  useEffect(() => {
    setField("brand_name",  { status: "filled", value: brandName   ?? "", source: "scope" });
    setField("product_name",{ status: "filled", value: productName ?? "", source: "scope" });
    setField("campaign_name",{ status: "filled", value: eventName  ?? "", source: "scope" });
  }, [brandName, productName, eventName]);

  // ── Step 2: Fill brand_brain fields once data arrives ────────────────
  useEffect(() => {
    if (!brainEntries || Object.keys(brainEntries).length === 0) return;

    const getCategoryText = (cat: string): string => {
      const items: any[] = brainEntries[cat] ?? [];
      return items.map((i: any) => i.content ?? i.title ?? "").filter(Boolean).join("\n\n");
    };

    // Delay each field slightly for a "progressive" feel
    let delay = 200;
    for (const f of allFields) {
      if (f.source !== "brand_brain") continue;
      const cat = f.brainCategory ?? "positioning";
      const text = getCategoryText(cat);
      if (!text) continue;
      const fieldId = f.id;
      const captured = text;
      setTimeout(() => {
        setField(fieldId, { status: "loading", source: "brand_brain" });
        setTimeout(() => {
          setField(fieldId, { status: "filled", value: captured, source: "brand_brain" });
        }, 400);
      }, delay);
      delay += 300;
    }
  }, [brainEntries]);

  // ── Step 3: Web search fields — call LLM search via briefSearch ──────
  // (calls trpc.briefPanel.searchField if available, else simulates)
  const webSearchMutation = (trpc as any).briefPanel?.searchField?.useMutation
    ? (trpc as any).briefPanel.searchField.useMutation()
    : null;

  const triggerWebSearch = useCallback(async (field: BriefField, contextVals: Record<string, string>) => {
    if (!field.searchQuery) return;
    setField(field.id, { status: "loading", source: "web_search" });

    // Build query: replace {brand_name}, {product_name} etc.
    const q = field.searchQuery
      .replace("{brand_name}",   contextVals.brand_name   ?? brandName   ?? "")
      .replace("{product_name}", contextVals.product_name ?? productName ?? "");

    try {
      if (webSearchMutation) {
        const result = await webSearchMutation.mutateAsync({ query: q, fieldId: field.id });
        setField(field.id, { status: "filled", value: result.answer ?? "", source: "web_search" });
      } else {
        // Simulation fallback (remove when router is live)
        await new Promise(r => setTimeout(r, 1800));
        setField(field.id, {
          status: "filled",
          value: `（${q} — Web 結果待接入）`,
          source: "web_search",
        });
      }
    } catch {
      setField(field.id, { status: "error" });
    }
  }, [brandName, productName, webSearchMutation]);

  // Trigger all web_search fields after brain fields are done
  useEffect(() => {
    const webFields = allFields.filter(f => f.source === "web_search");
    const contextVals: Record<string, string> = {
      brand_name:   brandName   ?? "",
      product_name: productName ?? "",
    };
    let delay = 1800;
    for (const f of webFields) {
      const captured = f;
      setTimeout(() => { triggerWebSearch(captured, contextVals); }, delay);
      delay += 600;
    }
  }, [brandId, brandName, productName]);

  // ── Refetch handler ──────────────────────────────────────────────────
  const handleRefetch = useCallback((field: BriefField) => {
    const contextVals: Record<string, string> = {
      brand_name:   brandName   ?? "",
      product_name: productName ?? "",
    };
    if (field.source === "web_search") {
      triggerWebSearch(field, contextVals);
    } else if (field.source === "brand_brain") {
      // Re-trigger brand brain fill for this field
      setField(field.id, { status: "loading" });
      setTimeout(() => {
        const cat = field.brainCategory ?? "positioning";
        const items: any[] = brainEntries[cat] ?? [];
        const text = items.map((i: any) => i.content ?? "").join("\n\n");
        setField(field.id, { status: text ? "filled" : "error", value: text, source: "brand_brain" });
      }, 600);
    }
  }, [brandName, productName, brainEntries, triggerWebSearch]);

  // ── Edit handlers ────────────────────────────────────────────────────
  const handleEdit = useCallback((fieldId: string) => {
    setFieldStates(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], status: "editing", editDraft: prev[fieldId].value },
    }));
  }, []);

  const handleChange = useCallback((fieldId: string, value: string) => {
    setFieldStates(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], status: "filled", value, editDraft: value, source: "user_input" },
    }));
  }, []);

  // ── Launch readiness ─────────────────────────────────────────────────
  const filledCount  = Object.values(fieldStates).filter(s => s.status === "filled").length;
  const totalFields  = allFields.length;
  const userRequired = allFields.filter(f => f.source === "user_input");
  const userDone     = userRequired.every(f => (fieldStates[f.id]?.value ?? "").trim().length > 0);
  const canLaunch    = filledCount > 0 && userDone;

  const handleLaunch = () => {
    const vals: Record<string, string> = {};
    for (const f of allFields) vals[f.id] = fieldStates[f.id]?.value ?? "";
    onLaunch(vals);
  };

  // ── Active tab fields ────────────────────────────────────────────────
  const activeTabDef = schema.find(t => t.id === activeTab) ?? schema[0];

  // Layer color
  const LAYER_COLOR: Record<string, string> = {
    L1: "#4F46E5", L2: "#E11D48", L3: "#D97706",
    L4: "#7C3AED", L5: "#16A34A", L6: "#57534E",
  };
  const layerColor = LAYER_COLOR[layerKey] ?? "#7C3AED";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAFAF9" }}>

      {/* ── Header: back + squad name ── */}
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #F0F0EE" }}>
        {onBack && (
          <button onClick={onBack}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#A8A29E", fontSize: 12, padding: 0, marginBottom: 8, fontWeight: 500 }}
            onMouseEnter={e => e.currentTarget.style.color = "#57534E"}
            onMouseLeave={e => e.currentTarget.style.color = "#A8A29E"}
          >
            <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: 10 }} />
            所有方法論
          </button>
        )}
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A18", lineHeight: 1.3 }}>
          {squadName ?? "方法論小組"}
        </div>
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: layerColor, background: `${layerColor}14`, padding: "2px 7px", borderRadius: 10 }}>
            {layerKey}
          </span>
          {brandName && (
            <span style={{ fontSize: 11, color: "#A8A29E" }}>{brandName}</span>
          )}
        </div>
      </div>

      {/* ── Brand Brain status bar ── */}
      <div style={{ padding: "8px 16px", background: "white", borderBottom: "1px solid #F0F0EE", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: brandId ? "#16A34A" : "#D1D0CE", animation: brandId ? "pulse-dot 2s infinite" : "none" }} />
        <span style={{ fontSize: 11, color: brandId ? "#16A34A" : "#A8A29E", fontWeight: 600 }}>
          Brand Brain {brandId ? `已連接 · ${filledCount}/${totalFields} 欄位已填` : "未連接"}
        </span>
        <div style={{ marginLeft: "auto", height: 3, width: 60, background: "#F0F0EE", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.round((filledCount / Math.max(totalFields, 1)) * 100)}%`, background: layerColor, borderRadius: 10, transition: "width 0.4s ease" }} />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #F0F0EE", background: "white" }}>
        {schema.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: "8px 4px", border: "none", background: "none", cursor: "pointer",
              fontSize: 11, fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? layerColor : "#A8A29E",
              borderBottom: `2px solid ${activeTab === tab.id ? layerColor : "transparent"}`,
              transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Field list ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {(activeTabDef?.fields ?? []).map(field => (
          <FieldCard
            key={field.id}
            field={field}
            state={fieldStates[field.id] ?? { status: "idle", value: "" }}
            onEdit={() => handleEdit(field.id)}
            onRefetch={() => handleRefetch(field)}
            onChange={v => handleChange(field.id, v)}
          />
        ))}
      </div>

      {/* ── Launch CTA ── */}
      <div style={{ padding: "12px 14px 16px", borderTop: "1px solid #F0F0EE", background: "white" }}>
        <button onClick={handleLaunch} disabled={!canLaunch}
          style={{
            width: "100%", padding: "12px", borderRadius: 10, border: "none",
            background: canLaunch ? layerColor : "#E4E3E1",
            color: canLaunch ? "white" : "#A8A29E",
            fontSize: 14, fontWeight: 700, cursor: canLaunch ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "background 0.2s, opacity 0.2s",
            boxShadow: canLaunch ? `0 3px 12px ${layerColor}40` : "none",
          }}
          onMouseEnter={e => { if (canLaunch) e.currentTarget.style.opacity = "0.9"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
        >
          <FontAwesomeIcon icon={faRocket} />
          {canLaunch ? "開始執行" : `填寫 Brief 中（${filledCount}/${totalFields}）`}
        </button>
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
