/**
 * SaveToBrainButton.tsx
 * 讓用戶把 Agent 的回答存入品牌大腦
 *
 * 功能：
 * - 每個已完成的 squad step 下方顯示此按鈕
 * - 點擊後 POST /api/brand-brain/:brandId
 * - 狀態：idle → saving → saved（顯示 ✓）
 * - 可讓用戶選擇存入哪個類別（定位/受眾/聲音/競品/其他）
 */

import { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBrain, faCheck, faChevronDown } from "@fortawesome/free-solid-svg-icons";
const Brain = ({ size = 16, style, className }: any) =>
  <FontAwesomeIcon icon={faBrain} style={{ fontSize: size, ...style }} className={className} />;
const Check = ({ size = 16, style, className }: any) =>
  <FontAwesomeIcon icon={faCheck} style={{ fontSize: size, ...style }} className={className} />;
const ChevronDown = ({ size = 16, style, className }: any) =>
  <FontAwesomeIcon icon={faChevronDown} style={{ fontSize: size, ...style }} className={className} />;
import { useToast } from "../ui/Toast";
import { useLang } from "../../lib/i18n";

const CATEGORY_VALUES = ["positioning", "audience", "voice", "competitors", "custom"] as const;
const CATEGORY_ICONS: Record<(typeof CATEGORY_VALUES)[number], string> = {
  positioning: "📍",
  audience:    "👥",
  voice:       "🗣️",
  competitors: "⚔️",
  custom:      "📝",
};
const CATEGORY_KEYS: Record<(typeof CATEGORY_VALUES)[number], string> = {
  positioning: "bb_category_positioning",
  audience:    "bb_category_audience",
  voice:       "bb_category_voice",
  competitors: "bb_category_competitor",
  custom:      "bb_category_other",
};

type Category = typeof CATEGORY_VALUES[number];

interface SaveToBrainButtonProps {
  brandId: number;
  content: string;
  title: string;
  defaultCategory?: Category;
  missionId?: number;
  onSaved?: () => void;
}

export function SaveToBrainButton({
  brandId,
  content,
  title,
  defaultCategory = "custom",
  missionId,
  onSaved,
}: SaveToBrainButtonProps) {
  const [status, setStatus] = useState<"idle" | "picking" | "saving" | "saved">("idle");
  const [selectedCat, setSelectedCat] = useState<Category>(defaultCategory);
  const abortRef = useRef<AbortController | null>(null);
  const { showToast } = useToast();
  const { t } = useLang();
  const categoryLabel = (v: Category) => `${CATEGORY_ICONS[v]} ${t(CATEGORY_KEYS[v] as any)}`;

  // Cleanup in-flight request on unmount
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleSave = async (cat: Category) => {
    setSelectedCat(cat);
    setStatus("saving");
    abortRef.current = new AbortController();
    try {
      const token = localStorage.getItem("authToken");
      const resp = await fetch(`/api/brand-brain/${brandId}`, {
        method: "POST",
        signal: abortRef.current.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          category: cat,
          title: title.slice(0, 100),
          content: content.slice(0, 2000),
          sourceMissionId: missionId,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setStatus("saved");
      showToast(`✓ ${t("saved_to_brain")}`, "success");
      // Notify right panel to float "品牌大腦" section to top
      window.dispatchEvent(new CustomEvent("section-priority", { detail: { key: "brandbrain" } }));
      onSaved?.();
    } catch (e: any) {
      if (e?.name === "AbortError") return; // unmounted, ignore
      console.error("[SaveToBrain]", e);
      setStatus("idle"); // 失敗回到 idle 讓用戶重試
    }
  };

  if (status === "saved") {
    return (
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 11, color: "#22C55E", marginTop: 8,
        padding: "3px 8px", borderRadius: 6,
        background: "#F0FDF4", border: "1px solid #BBF7D0",
      }}>
        <Check size={12} />
        {t("saved_to_brain")} · {categoryLabel(selectedCat)}
      </div>
    );
  }

  if (status === "picking") {
    return (
      <div style={{
        display: "inline-flex", flexDirection: "column", gap: 4,
        marginTop: 8, padding: "6px 8px",
        background: "#FAFAF9", border: "1px solid #E4E3E1",
        borderRadius: 8,
      }}>
        <span style={{ fontSize: 11, color: "#6B6A66", marginBottom: 2 }}>
          {t("save_to_brain_choose")}
        </span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {CATEGORY_VALUES.map(cat => (
            <button
              key={cat}
              onClick={() => handleSave(cat)}
              style={{
                fontSize: 11, padding: "3px 9px", borderRadius: 6,
                border: "1px solid #E4E3E1", background: "#fff",
                cursor: "pointer", color: "#1A1A18",
                fontFamily: "inherit",
              }}
            >
              {categoryLabel(cat)}
            </button>
          ))}
          <button
            onClick={() => setStatus("idle")}
            style={{
              fontSize: 11, padding: "3px 9px", borderRadius: 6,
              border: "1px solid #E4E3E1", background: "transparent",
              cursor: "pointer", color: "#9CA3AF", fontFamily: "inherit",
            }}
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      disabled={status === "saving"}
      onClick={() => setStatus("picking")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 11, color: status === "saving" ? "#9CA3AF" : "#6B6A66",
        marginTop: 8, padding: "3px 9px", borderRadius: 6,
        border: "1px solid #E4E3E1",
        background: "#FAFAF9",
        cursor: status === "saving" ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
      }}
      onMouseEnter={e => {
        if (status !== "saving") {
          (e.target as HTMLElement).style.borderColor = "#1A1A18";
          (e.target as HTMLElement).style.color = "#1A1A18";
        }
      }}
      onMouseLeave={e => {
        (e.target as HTMLElement).style.borderColor = "#E4E3E1";
        (e.target as HTMLElement).style.color = "#6B6A66";
      }}
    >
      <Brain size={12} />
      {status === "saving" ? t("saving") : t("save_to_brain")}
      <ChevronDown size={11} />
    </button>
  );
}
