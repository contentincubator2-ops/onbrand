/**
 * StrategyCardDetail — opens as a right-side drawer covering ~72% of viewport.
 *
 * Front (default): methodology info + config fields the user fills in +
 *                  status controls (啟用 / 封存 / 刪除).
 * Back (toggle):   mini chat drawer — user can ask the AI to help tune fields.
 *
 * A "Flip" button swaps the two views. This is the hybrid C design:
 *   "card-primary button UI + conversational assistance on demand".
 */
import React, { useEffect, useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";
import { synthesizeStrategy } from "./strategySynth";
import { useLang } from "../../lib/i18n";

const C = {
  overlay:    "rgba(18,18,16,0.45)",
  panel:      "#FFFFFF",
  bg:         "#F9F9F8",
  border:     "#E4E3E1",
  borderSoft: "#EDECEA",
  text:       "#1A1A18",
  textMuted:  "#6B6A64",
  textDim:    "#9B9990",
  accent:     "#E8631A",
  accentSoft: "#FDEFE3",
  active:     "#2B8A3E",
  warn:       "#C59A2E",
  danger:     "#C43F3F",
};

export function StrategyCardDetail({
  strategyId,
  onClose,
}: {
  strategyId: number;
  onClose: () => void;
}) {
  const { lang } = useLang();
  const strategyQuery = trpc.strategyDeck.get.useQuery(
    { id: strategyId },
    { refetchOnWindowFocus: false }
  );
  const methodologySlug = (strategyQuery.data as any)?.methodologySlug;
  const methodologyQuery = trpc.strategyDeck.getMethodology.useQuery(
    { slug: methodologySlug ?? "" },
    { enabled: !!methodologySlug, refetchOnWindowFocus: false }
  );

  const updateMutation = trpc.strategyDeck.update.useMutation();
  const activateMutation = trpc.strategyDeck.activate.useMutation();
  const archiveMutation = trpc.strategyDeck.archive.useMutation();
  const removeMutation = trpc.strategyDeck.remove.useMutation();
  const autoFillMutation = trpc.strategyDeck.autoFill.useMutation();

  const [flipped, setFlipped] = useState(false);
  const [name, setName] = useState("");
  const [config, setConfig] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const strategy = strategyQuery.data as any;
  const methodology = methodologyQuery.data as any;

  useEffect(() => {
    if (!strategy) return;
    setName(strategy.name ?? "");
    const cfg = typeof strategy.config === "string"
      ? (() => { try { return JSON.parse(strategy.config); } catch { return {}; } })()
      : (strategy.config ?? {});
    setConfig(cfg || {});
    setDirty(false);
  }, [strategy?.id, strategy?.updatedAt]);

  async function save() {
    if (!dirty) return;
    setSaving(true);
    try {
      await updateMutation.mutateAsync({ id: strategyId, name, config } as any);
      setDirty(false);
      await strategyQuery.refetch();
    } finally {
      setSaving(false);
    }
  }

  async function activate() {
    await save();
    if (!confirm(lang === "en" ? "Activate this strategy card? Once active, execution, intel, and optimization will reference it for 90 days." : "啟用這張策略卡？啟用後 90 天內執行、情報、優化都會引用它。")) return;
    await activateMutation.mutateAsync({ id: strategyId } as any);
    await strategyQuery.refetch();
  }

  async function archive() {
    if (!confirm(lang === "en" ? "Archive this card? It won't be referenced going forward, but history stays." : "封存這張策略卡？後續執行不會再引用，但歷史會保留。")) return;
    await archiveMutation.mutateAsync({ id: strategyId } as any);
    await strategyQuery.refetch();
  }

  const [autoFilling, setAutoFilling] = useState(false);
  async function autoFill(overwrite: boolean) {
    if (autoFilling) return;
    // If there are unsaved changes, save them first so the server sees current state
    if (dirty) {
      try { await updateMutation.mutateAsync({ id: strategyId, name, config } as any); } catch {}
    }
    setAutoFilling(true);
    try {
      const res = await autoFillMutation.mutateAsync({
        strategyId,
        overwriteFilled: overwrite,
      });
      if ((res as any)?.skipped === "already-complete") {
        alert(lang === "en" ? "Every field is filled in — tap \"Overwrite all\" if you want a fresh pass." : "所有欄位都已填好 — 如果想重新產生，請點「全部覆蓋重寫」。");
        return;
      }
      // Merge the server's merged config into local state
      const newConfig = (res as any)?.config ?? {};
      setConfig(newConfig);
      setDirty(false);
      await strategyQuery.refetch();
    } catch (err: any) {
      alert(err?.message ?? (lang === "en" ? "AI generation failed — try again in a moment" : "AI 產生失敗，請稍後再試"));
    } finally {
      setAutoFilling(false);
    }
  }

  async function remove() {
    if (!confirm(lang === "en" ? "Delete for good? This can't be undone." : "確定刪除？此動作無法復原。")) return;
    try {
      await removeMutation.mutateAsync({ id: strategyId } as any);
      onClose();
    } catch (err: any) {
      alert(err?.message ?? (lang === "en" ? "Delete failed" : "刪除失敗"));
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: C.overlay,
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 90,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 92vw)",
          height: "100vh",
          background: C.panel,
          boxShadow: "-10px 0 40px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 22px",
            borderBottom: `1px solid ${C.borderSoft}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onClose} style={iconBtn}>✕</button>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {strategyQuery.isLoading ? (lang === "en" ? "Loading…" : "載入中…") : strategy?.name}
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                {strategy?.methodologyName}
                {strategy?.methodologyAuthor && ` · ${strategy.methodologyAuthor}`}
              </div>
            </div>
          </div>
          <button
            onClick={() => setFlipped((v) => !v)}
            style={{
              ...iconBtn,
              background: flipped ? C.accentSoft : "#fff",
              color: flipped ? C.accent : C.textMuted,
              border: `1px solid ${flipped ? C.accent : C.border}`,
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {flipped ? (lang === "en" ? "← Back to front" : "← 回到正面") : (lang === "en" ? "Ask AI 💬" : "問 AI 一下 💬")}
          </button>
        </div>

        {/* Body */}
        {flipped ? (
          <MiniChatDrawer strategyId={strategyId} />
        ) : (
          <FrontFace
            strategy={strategy}
            methodology={methodology}
            name={name}
            setName={(v) => { setName(v); setDirty(true); }}
            config={config}
            setConfig={(v) => { setConfig(v); setDirty(true); }}
            onAutoFill={autoFill}
            autoFilling={autoFilling}
          />
        )}

        {/* Footer */}
        {!flipped && (
          <div
            style={{
              padding: "12px 22px",
              borderTop: `1px solid ${C.borderSoft}`,
              background: "#FBFBFA",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: C.textDim }}>
              {strategy?.status === "active" && strategy?.expiresAt && (
                <span>{lang === "en" ? `Expires ${new Date(strategy.expiresAt).toLocaleDateString("en-US")}` : `到期 ${new Date(strategy.expiresAt).toLocaleDateString("zh-TW")}`}</span>
              )}
              {dirty && <span style={{ color: C.warn }}>{lang === "en" ? "Unsaved changes" : "有未儲存變更"}</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {strategy?.status !== "archived" && (
                <button onClick={archive} style={secondaryBtn}>{lang === "en" ? "Archive" : "封存"}</button>
              )}
              {strategy?.status === "draft" && (
                <button onClick={remove} style={{ ...secondaryBtn, color: C.danger }}>{lang === "en" ? "Delete" : "刪除"}</button>
              )}
              <button
                onClick={save}
                disabled={!dirty || saving}
                style={dirty && !saving ? secondaryBtn : disabledBtn}
              >
                {saving ? (lang === "en" ? "Saving…" : "儲存中…") : (lang === "en" ? "Save" : "儲存")}
              </button>
              {strategy?.status !== "active" && (
                <button onClick={activate} style={primaryBtn}>
                  {strategy?.status === "archived" ? (lang === "en" ? "Reactivate" : "重新啟用") : (lang === "en" ? "Activate → 90 days" : "啟用 → 90 天")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Front face (fields + status info) ──────────────────────────────────────
function FrontFace({
  strategy,
  methodology,
  name,
  setName,
  config,
  setConfig,
  onAutoFill,
  autoFilling,
}: {
  strategy: any;
  methodology: any;
  name: string;
  setName: (v: string) => void;
  config: Record<string, any>;
  setConfig: (v: Record<string, any>) => void;
  onAutoFill: (overwrite: boolean) => Promise<void>;
  autoFilling: boolean;
}) {
  const { lang } = useLang();
  if (!strategy) {
    return <div style={{ padding: 32, color: C.textDim }}>{lang === "en" ? "Loading…" : "載入中…"}</div>;
  }

  const fields = (methodology?.fields ?? []) as any[];
  const synth = useMemo(
    () => synthesizeStrategy(strategy?.methodologySlug, config),
    [strategy?.methodologySlug, config]
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
      {/* Methodology summary */}
      {methodology && (
        <div
          style={{
            padding: 14,
            background: C.bg,
            borderRadius: 8,
            marginBottom: 20,
            borderLeft: `3px solid ${C.accent}`,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            {methodology.name}
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
            {methodology.summary}
          </div>
        </div>
      )}

      {/* Strategy name */}
      <Field label={lang === "en" ? "Card name" : "策略卡名稱"}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={textInput}
        />
      </Field>

      {/* Methodology-specific fields */}
      {fields.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              margin: "14px 0 10px",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.6,
                color: C.textDim,
                textTransform: "uppercase",
              }}
            >
              {lang === "en" ? "Framework fields" : "方法論欄位"}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => onAutoFill(false)}
                disabled={autoFilling}
                title={lang === "en" ? "AI reads your brand + framework and fills empty fields — you can tweak after" : "AI 會讀取品牌資料＋方法論，把空白欄位填起來，你可以再調整"}
                style={{
                  ...aiBtn,
                  opacity: autoFilling ? 0.55 : 1,
                  cursor: autoFilling ? "wait" : "pointer",
                }}
              >
                {autoFilling ? (lang === "en" ? "Generating…" : "產生中…") : (lang === "en" ? "🤖 AI fill empty fields" : "🤖 AI 產生空白欄位")}
              </button>
              <button
                onClick={() => {
                  if (confirm(lang === "en" ? "Regenerating will overwrite every field (including ones you edited). Continue?" : "重新產生會覆蓋所有已填的欄位（包含你手動改過的）。確定？")) {
                    onAutoFill(true);
                  }
                }}
                disabled={autoFilling}
                title={lang === "en" ? "Overwrite every field" : "覆蓋所有欄位重新產生"}
                style={{
                  ...aiBtnGhost,
                  opacity: autoFilling ? 0.55 : 1,
                  cursor: autoFilling ? "wait" : "pointer",
                }}
              >
                {lang === "en" ? "🔄 Overwrite all" : "🔄 全部覆蓋"}
              </button>
            </div>
          </div>
          <div
            style={{
              fontSize: 11,
              color: C.textDim,
              marginBottom: 10,
              lineHeight: 1.55,
            }}
          >
            {lang === "en" ? "Tap AI fill to let it generate from your brand + this framework, or just type in your own answers." : "想省事就按「AI 產生」，它會依你品牌資料 + 這套方法論自動填。想自己寫也可以直接打字。"}
          </div>
          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === "textarea" ? (
                <textarea
                  value={config[f.key] ?? ""}
                  onChange={(e) =>
                    setConfig({ ...config, [f.key]: e.target.value })
                  }
                  rows={3}
                  style={{ ...textInput, resize: "vertical", fontFamily: "inherit" }}
                />
              ) : f.type === "list" ? (
                <textarea
                  value={
                    Array.isArray(config[f.key])
                      ? config[f.key].join("\n")
                      : (config[f.key] ?? "")
                  }
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      [f.key]: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                  rows={3}
                  placeholder={lang === "en" ? "One item per line" : "一行一個項目"}
                  style={{ ...textInput, resize: "vertical", fontFamily: "inherit" }}
                />
              ) : (
                <input
                  value={config[f.key] ?? ""}
                  onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
                  style={textInput}
                />
              )}
            </Field>
          ))}
        </div>
      )}

      {/* Synthesis — shows what the filled config means as a strategy */}
      {synth && (
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              margin: "14px 0 10px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.6,
                color: C.textDim,
                textTransform: "uppercase",
              }}
            >
              {lang === "en" ? "Strategy readout" : "策略解讀"}
            </div>
            <div style={{ fontSize: 11, color: C.textDim }}>
              {lang === "en" ? `${Math.round(synth.completeness * 100)}% complete` : `完成度 ${Math.round(synth.completeness * 100)}%`}
            </div>
          </div>

          {/* Completeness bar */}
          <div
            style={{
              height: 4,
              background: "#EDECEA",
              borderRadius: 2,
              overflow: "hidden",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                width: `${Math.round(synth.completeness * 100)}%`,
                height: "100%",
                background:
                  synth.completeness >= 0.7
                    ? C.active
                    : synth.completeness >= 0.4
                    ? C.warn
                    : C.danger,
                transition: "width 0.3s",
              }}
            />
          </div>

          {/* Headline */}
          <div
            style={{
              padding: "12px 14px",
              background: C.accentSoft,
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.6,
              color: C.text,
              marginBottom: 12,
              fontWeight: 500,
            }}
          >
            {synth.headline}
          </div>

          {/* Blocks */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {synth.blocks.map((b, i) => (
              <div
                key={i}
                style={{
                  padding: 12,
                  border: `1px solid ${C.borderSoft}`,
                  borderRadius: 8,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.text,
                    marginBottom: 6,
                  }}
                >
                  {b.title}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: C.textMuted,
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {b.body}
                </div>
              </div>
            ))}
          </div>

          {synth.gaps.length > 0 && (
            <div
              style={{
                marginTop: 12,
                padding: "8px 12px",
                background: "#FFF7E6",
                border: "1px solid #F5D9A0",
                borderRadius: 6,
                fontSize: 11.5,
                color: "#7A5A1E",
                lineHeight: 1.55,
              }}
            >
              {lang === "en" ? `${synth.gaps.length} fields still empty — fill them so this strategy is complete and AI can reference it during execution.` : `還有 ${synth.gaps.length} 個欄位沒填 — 填完會讓這個策略更完整、執行時 AI 才能正確引用。`}
            </div>
          )}
        </div>
      )}

      {/* Status info */}
      <div
        style={{
          marginTop: 24,
          padding: 14,
          background: "#FBFBFA",
          borderRadius: 8,
          fontSize: 12,
          color: C.textMuted,
          lineHeight: 1.6,
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6, color: C.text }}>
          {lang === "en" ? "How it works" : "使用方式"}
        </div>
        {lang === "en"
          ? "Fill in the framework fields, then tap Activate. For the next 90 days, every other zone (Make / Optimize / Detect) will treat this card as your brand's current positioning. We'll prompt you to revalidate after 90 days."
          : "填完方法論欄位後按「啟用」。啟用後 90 天內，其他區（製作/優化/情報）都會把這張卡當作品牌當下的定位依據。90 天後會提醒你重新驗證。"}
      </div>
    </div>
  );
}

// ─── Mini chat drawer (card back) ───────────────────────────────────────────
function MiniChatDrawer({ strategyId }: { strategyId: number }) {
  const { lang } = useLang();
  const messagesQuery = trpc.strategyDeck.listMessages.useQuery(
    { strategyId },
    { refetchOnWindowFocus: false }
  );
  const sendMutation = trpc.strategyDeck.sendMessage.useMutation();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messages = (messagesQuery.data ?? []) as any[];

  async function send() {
    const content = input.trim();
    if (!content || sending) return;
    setInput("");
    setSending(true);
    try {
      await sendMutation.mutateAsync({ strategyId, content });
      await messagesQuery.refetch();
    } catch (err: any) {
      alert(err?.message ?? (lang === "en" ? "Send failed" : "送出失敗"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        style={{
          padding: "10px 22px",
          fontSize: 11,
          color: C.textDim,
          background: C.bg,
          borderBottom: `1px solid ${C.borderSoft}`,
        }}
      >
        {lang === "en" ? "💡 Ask AI to help fine-tune this card. The chat is scoped to this card — it won't leak into other brands or tasks." : "💡 問 AI 協助微調這張策略卡。對話只跟這張卡綁定，不影響其他品牌或任務。"}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
        {messages.length === 0 && (
          <div style={{ color: C.textDim, fontSize: 13, textAlign: "center", marginTop: 40 }}>
            {lang === "en" ? "No chat yet. Try asking:" : "還沒對話過。試試問："}
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                marginTop: 16,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {(lang === "en"
                ? [
                    "Is this primary archetype right for us? What else could fit?",
                    "What should our shadow side say?",
                    "Help me make the why more compelling",
                  ]
                : [
                    "這個主原型適合我們嗎？還有什麼選項？",
                    "我們的陰影面應該寫什麼？",
                    "幫我把 why 寫得更有感染力",
                  ]).map((q) => (
                <li key={q}>
                  <button
                    onClick={() => setInput(q)}
                    style={{
                      background: "#fff",
                      border: `1px solid ${C.border}`,
                      borderRadius: 14,
                      padding: "6px 12px",
                      fontSize: 12,
                      color: C.textMuted,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m) => (
          <ChatBubble key={m.id} role={m.role} content={m.content} />
        ))}
        {sending && <ChatBubble role="assistant" content={lang === "en" ? "Thinking…" : "思考中…"} />}
      </div>

      <div
        style={{
          padding: "12px 22px",
          borderTop: `1px solid ${C.borderSoft}`,
          display: "flex",
          gap: 8,
          background: "#FBFBFA",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={lang === "en" ? "Ask anything…" : "問點什麼…"}
          style={{
            flex: 1,
            padding: "10px 12px",
            fontSize: 13,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          style={input.trim() && !sending ? primaryBtn : disabledBtn}
        >
          {sending ? "…" : (lang === "en" ? "Send" : "送出")}
        </button>
      </div>
    </div>
  );
}

function ChatBubble({ role, content }: { role: string; content: string }) {
  const isUser = role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 10,
      }}
    >
      <div
        style={{
          maxWidth: "78%",
          padding: "9px 13px",
          borderRadius: 10,
          background: isUser ? C.accent : "#F0EFEC",
          color: isUser ? "#fff" : C.text,
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content}
      </div>
    </div>
  );
}

// ─── shared bits ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: C.textMuted,
          marginBottom: 5,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

const textInput: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 13,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  boxSizing: "border-box",
  fontFamily: "inherit",
  color: C.text,
  background: "#fff",
};
const primaryBtn: React.CSSProperties = {
  background: C.accent,
  color: "#fff",
  border: "none",
  padding: "8px 14px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};
const disabledBtn: React.CSSProperties = {
  ...primaryBtn,
  background: "#D9D7D2",
  cursor: "not-allowed",
};
const secondaryBtn: React.CSSProperties = {
  background: "#fff",
  color: C.textMuted,
  border: `1px solid ${C.border}`,
  padding: "8px 14px",
  borderRadius: 6,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};
const aiBtn: React.CSSProperties = {
  background: C.accent,
  color: "#fff",
  border: "none",
  padding: "6px 11px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};
const aiBtnGhost: React.CSSProperties = {
  background: "#fff",
  color: "#6B6A64",
  border: `1px solid #E4E3E1`,
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
};
const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: C.textMuted,
  fontSize: 16,
  cursor: "pointer",
  padding: "6px 10px",
  borderRadius: 6,
  fontFamily: "inherit",
};
