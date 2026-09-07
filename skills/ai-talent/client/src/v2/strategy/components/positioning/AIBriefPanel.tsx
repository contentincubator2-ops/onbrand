/**
 * AIBriefPanel — 「AI 讀到的品牌簡報」：每張任務卡開跑前塞進模型的那段字，
 * 攤開給用戶看，每一行對回它來自定位的哪一格；缺的格列在下面。
 *
 * 2026-09-08 (CJ「品牌大腦也可以參考任務卡一樣，用戶可以自己上傳自己的文件，
 * 我們顯示出幫他把定位化為 AI 讀懂的文字的過程，不一定要用我們的定位方法論」)
 *
 * 這個面板的主張只有一句：簡報裡有的，模型就照做；沒有的，模型就用猜的。
 * 所以它同時是「你現在的品牌大腦長什麼樣」與「還缺什麼」的同一個畫面。
 */
import { useState } from "react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";

interface Props {
  brandId: number | null;
  /** 跳到「我的定位文件」（上傳→提案→確認）。 */
  onOpenDocs?: () => void;
}

const INK = "#171717";
const MUTED = "#737373";
const LINE = "#E5E5E5";

export default function AIBriefPanel({ brandId, onOpenDocs }: Props) {
  const { lang } = useLang();
  const en = lang === "en";
  const [mode, setMode] = useState<"full" | "core">("full");
  const [showRaw, setShowRaw] = useState(false);

  const briefQ = (trpc as any).brandKnowledge?.aiBrief?.useQuery
    ? (trpc as any).brandKnowledge.aiBrief.useQuery({ brandId: brandId ?? 0 }, { enabled: !!brandId, staleTime: 60_000 })
    : { data: null, isLoading: false };
  const coverageQ = (trpc as any).positioningDocs?.coverage?.useQuery
    ? (trpc as any).positioningDocs.coverage.useQuery({ scope: "brand", scopeId: brandId ?? 0 }, { enabled: !!brandId, staleTime: 60_000 })
    : { data: null };

  const brief = briefQ.data as
    | { full: string; core: string; fullChars: number; coreChars: number; sections: Array<{ title: string; lines: Array<{ label: string | null; text: string; field: string | null }> }>; fields: string[] }
    | null
    | undefined;
  const coverage = coverageQ.data as { filled: Array<{ path: string; label: string }>; missing: Array<{ path: string; label: string; cost: string }>; total: number } | null | undefined;

  if (!brandId) return null;

  const empty = !!brief && !brief.full.trim();
  const fieldLabel = (path: string | null): string | null => {
    if (!path) return null;
    const hit = coverage?.filled?.find((f) => f.path === path) ?? coverage?.missing?.find((f) => f.path === path);
    return hit?.label ?? null;
  };

  return (
    <section style={{ border: `1px solid ${LINE}`, borderRadius: 10, background: "#FFFFFF", padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: INK }}>
            {en ? "The brand brief the AI actually reads" : "AI 讀到的品牌簡報"}
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
            {en
              ? "This exact text is placed in front of the model before every task card runs. What is here, the model follows; what is missing, the model guesses."
              : "每張任務卡開跑前，這段字會原封不動放在模型前面。簡報裡有的，模型照做；沒有的，模型只能猜。"}
          </p>
        </div>
        {brief && !empty && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            {(["full", "core"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  borderRadius: 999, border: `1px solid ${INK}`, padding: "3px 10px", cursor: "pointer",
                  background: mode === m ? INK : "#FFFFFF", color: mode === m ? "#FFFFFF" : INK,
                }}
              >
                {m === "full"
                  ? (en ? `Full · ${brief.fullChars} chars` : `完整版 · ${brief.fullChars} 字`)
                  : (en ? `Lean · ${brief.coreChars} chars` : `精簡版 · ${brief.coreChars} 字`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {briefQ.isLoading && <p style={{ fontSize: 13, color: MUTED, marginTop: 12 }}>{en ? "Loading…" : "讀取中…"}</p>}

      {empty && (
        <p style={{ fontSize: 13, color: INK, marginTop: 12, lineHeight: 1.6 }}>
          {en
            ? "The brief is empty: no positioning field is filled yet. Every card will run on the brand name alone."
            : "簡報目前是空的：定位還沒有任何欄位。現在每張卡只拿得到品牌名稱。"}
        </p>
      )}

      {brief && !empty && mode === "full" && !showRaw && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {brief.sections.map((s, si) => (
            <div key={si}>
              <div style={{ fontSize: 11.5, letterSpacing: "0.04em", color: MUTED, marginBottom: 6 }}>{s.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {s.lines.map((l, li) => {
                  const from = fieldLabel(l.field);
                  return (
                    <div key={li} style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, fontSize: 13, lineHeight: 1.55, padding: "4px 0", borderBottom: `1px solid #F2F2F2` }}>
                      <div style={{ color: l.label ? INK : MUTED, fontWeight: l.label ? 600 : 400, wordBreak: "break-word" }}>
                        {l.label ?? "·"}
                        {from && l.label !== from && (
                          <div style={{ fontSize: 11, color: MUTED, fontWeight: 400 }}>{en ? `from: ${from}` : `來自：${from}`}</div>
                        )}
                      </div>
                      <div style={{ color: INK, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{l.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {brief && !empty && (mode === "core" || showRaw) && (
        <pre style={{ marginTop: 14, whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.6, color: INK, background: "#FAFAFA", border: `1px solid ${LINE}`, borderRadius: 8, padding: 12, fontFamily: "inherit" }}>
          {(mode === "core" ? brief.core : brief.full).trim()}
        </pre>
      )}

      {brief && !empty && mode === "full" && (
        <button onClick={() => setShowRaw((v) => !v)} style={{ marginTop: 8, fontSize: 12, color: MUTED, background: "none", border: 0, padding: 0, cursor: "pointer", textDecoration: "underline" }}>
          {showRaw ? (en ? "Back to the field view" : "回到欄位對照") : (en ? "Show the raw text the model sees" : "看模型看到的原文")}
        </button>
      )}

      {coverage && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: INK, fontWeight: 600 }}>
              {en
                ? `Fields the engine reads: ${coverage.filled.length} of ${coverage.total} filled`
                : `引擎會讀的欄位：${coverage.total} 格，你填了 ${coverage.filled.length} 格`}
            </div>
            {onOpenDocs && (
              <button
                onClick={onOpenDocs}
                style={{ borderRadius: 999, border: `1px solid ${INK}`, background: "#FFFFFF", color: INK, padding: "4px 12px", fontSize: 12.5, cursor: "pointer" }}
              >
                {en ? "Upload your own positioning document →" : "上傳你既有的定位文件 →"}
              </button>
            )}
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
            {en
              ? "You do not have to walk our 14 steps. Upload the document you already have; we extract these fields from it, you confirm, and only then does it enter the brief."
              : "不一定要走我們的 14 步。上傳你手上既有的定位文件，我們從裡面抽出這些欄位，你確認過才進簡報。"}
          </p>
          {coverage.missing.length > 0 && (
            <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {coverage.missing.map((m) => (
                <li key={m.path} style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, fontSize: 12.5, lineHeight: 1.5 }}>
                  <span style={{ color: INK, fontWeight: 600 }}>{m.label}</span>
                  <span style={{ color: MUTED }}>{en ? "Missing. " : "還沒填。"}{m.cost}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
