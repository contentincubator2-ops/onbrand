/**
 * ToolCredDrawer — Phase 2A Ext Batch 2-1.
 *
 * Lets the brand owner connect third-party marketing tools (Ahrefs, Similarweb,
 * SEMrush, YouTube, Reddit, Opview, Meltwater, GWI, …). Payload is sent to
 * toolCred.upsert which encrypts it at rest via AES-GCM.
 *
 * Three tiers shown as sections:
 *   🔓 Free / public — enable with one click (no credential)
 *   🔑 API key — user pastes their own key/token
 *   🖥️ Virtual browser — username + password + ToS disclaimer
 *
 * We NEVER render the decrypted secret. Existing credentials show a masked
 * readout (e.g. "ab****yz") and user can "重新輸入" to replace.
 */
import React, { useMemo, useState } from "react";
import { trpc } from "../../lib/trpc";

const C = {
  panelBg:    "#FFFFFF",
  bg:         "#F9F9F8",
  border:     "#E4E3E1",
  borderSoft: "#EDECEA",
  text:       "#1A1A18",
  textMuted:  "#6B6A64",
  textDim:    "#9B9990",
  accent:     "#E8631A",
  accentSoft: "#FDEFE3",
  danger:     "#C43F3F",
  warn:       "#B8860B",
  warnBg:     "#FCF6DE",
  ok:         "#2B8A3E",
  okBg:       "#E7F5EB",
};

const TIER_META: Record<string, { label: string; emoji: string; hint: string }> = {
  free_public:   { label: "免費公開資料", emoji: "🔓", hint: "無需帳號、無風險，直接啟用。" },
  user_api_key:  { label: "自備 API 金鑰",   emoji: "🔑", hint: "貼上你在該平台的 API key / token。合法合規。" },
  user_browser:  { label: "虛擬瀏覽器代操", emoji: "🖥️", hint: "我們開虛擬瀏覽器用你的帳密登入並抓取。⚠️ 可能違反 ToS，有帳號被鎖風險，需勾選免責。" },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "待測試", color: C.warn,   bg: C.warnBg },
  ok:      { label: "正常",   color: C.ok,     bg: C.okBg },
  error:   { label: "錯誤",   color: C.danger, bg: "#FCE8E8" },
  expired: { label: "已過期", color: C.danger, bg: "#FCE8E8" },
};

export function ToolCredDrawer({
  brandId,
  onClose,
}: {
  brandId: number;
  onClose: () => void;
}) {
  const catalogQuery = trpc.toolCred.catalog.useQuery(undefined, { refetchOnWindowFocus: false });
  const listQuery = trpc.toolCred.listByBrand.useQuery(
    { brandId },
    { refetchOnWindowFocus: false }
  );
  const [editingTool, setEditingTool] = useState<string | null>(null);

  const catalog = (catalogQuery.data ?? []) as any[];
  const creds = (listQuery.data ?? []) as any[];
  const credByTool = useMemo(() => {
    const m: Record<string, any> = {};
    for (const c of creds) m[c.tool] = c;
    return m;
  }, [creds]);

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = { free_public: [], user_api_key: [], user_browser: [] };
    for (const t of catalog) (g[t.tier] ?? (g[t.tier] = [])).push(t);
    return g;
  }, [catalog]);

  async function refetchAll() {
    await Promise.all([listQuery.refetch(), catalogQuery.refetch()]);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)",
        zIndex: 200, display: "flex", justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(640px, 100%)",
          height: "100%",
          background: C.panelBg,
          boxShadow: "-8px 0 24px rgba(0,0,0,0.12)",
          display: "flex", flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>🔌 工具連線</div>
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
              連接外部行銷工具，讓自動情報更完整。憑證加密後存放。
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <BrowserPingButton />
            <button style={btnMini} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 20 }}>
          {(["user_api_key", "user_browser", "free_public"] as const).map((tier) => {
            const tools = grouped[tier] ?? [];
            if (!tools.length) return null;
            const tm = TIER_META[tier];
            return (
              <section key={tier} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                    {tm.emoji} {tm.label}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>
                    {tm.hint}
                  </div>
                </div>
                {tools.map((t) => (
                  <ToolRow
                    key={t.slug}
                    brandId={brandId}
                    tool={t}
                    cred={credByTool[t.slug]}
                    onEdit={() => setEditingTool(t.slug)}
                    onChanged={refetchAll}
                  />
                ))}
              </section>
            );
          })}
        </div>

        {editingTool && (
          <EditCredModal
            brandId={brandId}
            tool={catalog.find((t: any) => t.slug === editingTool)}
            existing={credByTool[editingTool]}
            onClose={() => setEditingTool(null)}
            onSaved={async () => {
              setEditingTool(null);
              await refetchAll();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── ToolRow ──────────────────────────────────────────────────────────────
function ToolRow({
  brandId,
  tool,
  cred,
  onEdit,
  onChanged,
}: {
  brandId: number;
  tool: any;
  cred: any;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"remove" | null>(null);
  const removeMut = trpc.toolCred.remove.useMutation();

  const hasCred = !!cred;
  const status = hasCred ? (cred.status ?? "pending") : null;
  const sm = status ? STATUS_META[status] : null;

  async function doRemove() {
    if (!confirm(`確定移除 ${tool.label} 的連線？`)) return;
    setBusy("remove");
    try {
      await removeMut.mutateAsync({ brandId, tool: tool.slug });
    } catch (e: any) {
      alert("移除失敗：" + (e?.message ?? "未知錯誤"));
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  return (
    <div
      style={{
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 10,
        padding: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{tool.label}</span>
          {sm && (
            <span style={{
              fontSize: 10.5, fontWeight: 600, color: sm.color, background: sm.bg,
              padding: "2px 6px", borderRadius: 4,
            }}>
              {sm.label}
            </span>
          )}
          {tool.docsUrl && (
            <a
              href={tool.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 10.5, color: C.textDim, marginLeft: 4 }}
            >
              ↗ docs
            </a>
          )}
        </div>
        {tool.notes && (
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4, lineHeight: 1.45 }}>
            {tool.notes}
          </div>
        )}
        {hasCred && Object.keys(cred.maskedFields ?? {}).length > 0 && (
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, fontFamily: "monospace" }}>
            {Object.entries(cred.maskedFields).map(([k, v]) => (
              <span key={k} style={{ marginRight: 10 }}>{k}: {String(v)}</span>
            ))}
          </div>
        )}
        {hasCred && cred.lastError && (
          <div style={{ fontSize: 11, color: C.danger, marginTop: 4 }}>
            ⚠️ {cred.lastError}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {hasCred && (
          <>
            <CredTestButton brandId={brandId} tool={tool.slug} onDone={onChanged} />
            <button style={btnMiniDanger} onClick={doRemove} disabled={busy === "remove"}>
              {busy === "remove" ? "…" : "移除"}
            </button>
          </>
        )}
        <button style={btnPrimary} onClick={onEdit}>
          {hasCred ? "重新輸入" : "連接"}
        </button>
      </div>
    </div>
  );
}

// Tests the shared browser runtime (Batch 2-2a). Not tied to any specific
// tool — verifies Browserbase / local Chromium pipeline works at all.
function BrowserPingButton() {
  const [busy, setBusy] = useState(false);
  const pingMut = trpc.toolCred.browserPing.useMutation();
  async function run() {
    setBusy(true);
    try {
      const r = (await pingMut.mutateAsync({ url: "https://example.com" })) as any;
      const lines = [
        `✅ Browser runtime OK`,
        `Provider: ${r.provider}`,
        `Session: ${r.sessionId}`,
        `URL: ${r.finalUrl}`,
        `Title: ${r.title}`,
        r.h1 ? `H1: ${r.h1}` : "",
        `Elapsed: ${r.elapsedMs} ms`,
        r.debugUrl ? `Live view: ${r.debugUrl}` : "",
      ].filter(Boolean).join("\n");
      alert(lines);
    } catch (e: any) {
      alert("❌ Browser runtime test 失敗：\n" + (e?.message ?? "未知錯誤"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      style={{ ...btnMini, background: busy ? "#F5F5F4" : C.accentSoft, color: C.accent, borderColor: C.accentSoft }}
      onClick={run}
      disabled={busy}
      title="測試虛擬瀏覽器管線是否正常"
    >
      {busy ? "測試中…" : "🧪 Browser ping"}
    </button>
  );
}

function CredTestButton({ brandId, tool, onDone }: { brandId: number; tool: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const testMut = trpc.toolCred.test.useMutation();
  async function run() {
    setBusy(true);
    try {
      const r = (await testMut.mutateAsync({ brandId, tool })) as any;
      if (!r?.ok) alert(`測試失敗：${r?.message ?? "未知錯誤"}`);
    } catch (e: any) {
      alert("測試失敗：" + (e?.message ?? "未知錯誤"));
    } finally {
      setBusy(false);
      onDone();
    }
  }
  return (
    <button style={btnMini} onClick={run} disabled={busy}>
      {busy ? "測試中…" : "測試"}
    </button>
  );
}

// ─── EditCredModal ─────────────────────────────────────────────────────────
function EditCredModal({
  brandId,
  tool,
  existing,
  onClose,
  onSaved,
}: {
  brandId: number;
  tool: any;
  existing: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [payload, setPayload] = useState<Record<string, string>>({});
  const [acceptTerms, setAcceptTerms] = useState(existing?.termsAcceptedAt ? true : false);
  const [busy, setBusy] = useState(false);

  const upsertMut = trpc.toolCred.upsert.useMutation();

  async function handleSave() {
    if (tool.requiresTerms && !acceptTerms) {
      alert("請勾選免責條款後再儲存");
      return;
    }
    setBusy(true);
    try {
      await upsertMut.mutateAsync({
        brandId,
        tool: tool.slug,
        payload,
        acceptTerms,
      });
      onSaved();
    } catch (e: any) {
      alert("儲存失敗：" + (e?.message ?? "未知錯誤"));
    } finally {
      setBusy(false);
    }
  }

  const isFreeTool = tool.tier === "free_public";

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.42)",
        zIndex: 220, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(520px, 100%)", background: C.panelBg, borderRadius: 14,
          padding: 20, display: "flex", flexDirection: "column", gap: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
            {existing ? `重新輸入 ${tool.label} 憑證` : `連接 ${tool.label}`}
          </div>
          {tool.notes && (
            <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 6, lineHeight: 1.55 }}>
              {tool.notes}
            </div>
          )}
          {tool.docsUrl && (
            <a
              href={tool.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11.5, color: C.accent, marginTop: 4, display: "inline-block" }}
            >
              📖 官方文件與申請方式
            </a>
          )}
        </div>

        {isFreeTool ? (
          <div
            style={{
              padding: 12, borderRadius: 8, background: C.accentSoft, color: C.accent,
              fontSize: 12.5, lineHeight: 1.55,
            }}
          >
            此工具免費公開、不需憑證，點下方按鈕即可啟用。
          </div>
        ) : (
          (tool.fields as any[]).map((f: any) => (
            <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted }}>
                {f.label}{f.required ? " *" : ""}
              </div>
              <input
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                style={inputStyle}
                value={payload[f.key] ?? ""}
                onChange={(e) => setPayload((p) => ({ ...p, [f.key]: e.target.value }))}
                placeholder={existing?.maskedFields?.[f.key] ? `目前：${existing.maskedFields[f.key]}（留空不變）` : ""}
              />
            </div>
          ))
        )}

        {tool.requiresTerms && (
          <label
            style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: 12, borderRadius: 8,
              background: C.warnBg, border: `1px solid ${C.warn}`,
              fontSize: 11.5, color: C.text, lineHeight: 1.55, cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              <b style={{ color: C.warn }}>⚠️ ToS 風險免責</b>
              <br />
              我理解 {tool.label} 的使用條款通常禁止自動化存取，SoWork 透過虛擬瀏覽器代操可能導致我的帳號被封鎖、服務中斷，並可能違反我與該平台的合約。我自願承擔以上風險，並授權 SoWork 代我登入與抓取資料。
            </span>
          </label>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={btnGhost} onClick={onClose} disabled={busy}>取消</button>
          <button style={btnPrimary} onClick={handleSave} disabled={busy}>
            {busy ? "儲存中…" : existing ? "更新" : "啟用"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const btnPrimary: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, border: "none",
  background: C.accent, color: "#FFFFFF", fontSize: 12, fontWeight: 600, cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`,
  background: "#FFFFFF", color: C.text, fontSize: 12, cursor: "pointer",
};
const btnMini: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
  background: "#FFFFFF", color: C.text, fontSize: 11, cursor: "pointer",
};
const btnMiniDanger: React.CSSProperties = {
  ...btnMini, color: C.danger, borderColor: "#F5D1D1",
};
const inputStyle: React.CSSProperties = {
  padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`,
  fontSize: 13, color: C.text, background: "#FFFFFF", outline: "none",
  fontFamily: "inherit",
};
