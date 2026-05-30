/**
 * KnowledgeEditor — NotebookLM-style 知識 tab.
 *
 * User uploads their own successful FB posts / external reference texts.
 * Up to 50 items × 8K chars each. Items get injected into Theater +
 * 30s/60s/100s prompts as additional context.
 */
import { useState } from "react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { Input, Textarea } from "@heroui/react";
import { Plus, Trash2, BookOpen, ExternalLink } from "lucide-react";

interface Item {
  id: number;
  kind: string;
  title: string;
  body: string;
  sourceUrl: string | null;
  tags: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export default function KnowledgeEditor({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  if (!brandId) {
    return <div className="p-8 text-center text-default-500">{en ? "Pick a brand first" : "請先選擇品牌"}</div>;
  }

  const utils = trpc.useUtils();
  const list = (trpc as any).brandKnowledge?.list?.useQuery?.({ brandId }, { enabled: !!brandId });
  const items: Item[] = (list?.data as Item[] | undefined) ?? [];

  const createMut = (trpc as any).brandKnowledge?.create?.useMutation?.({
    onSuccess: () => utils.brandKnowledge?.list?.invalidate?.({ brandId }),
  });
  const deleteMut = (trpc as any).brandKnowledge?.delete?.useMutation?.({
    onSuccess: () => utils.brandKnowledge?.list?.invalidate?.({ brandId }),
  });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!title.trim()) return;
    setErr(null);
    try {
      const r = await createMut?.mutateAsync?.({
        brandId,
        kind: "reference",
        title: title.trim(),
        body: body.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        tags: [],
      });
      if (r?.ok === false) { setErr(r.error || (en ? "Failed to add" : "新增失敗")); return; }
      setTitle(""); setBody(""); setSourceUrl(""); setAdding(false);
    } catch (e: any) { setErr(String(e?.message ?? e)); }
  };

  const totalChars = items.reduce((s, it) => s + (it.body?.length ?? 0), 0);
  const charPct = Math.min(100, Math.round((totalChars / 400_000) * 100));

  return (
    <div className="max-w-[1100px] mx-auto px-6 pb-10">
      {/* 2026-05-11 (CJ「文字和知識的設計風格，也改得跟定位一樣」):
          editorial 4A discipline — no emerald color blocks, no rounded
          pill buttons. Section divider mirrors PositioningGrid; cards
          use white + 1px border + black filled-bar accent. */}

      {/* Top rail — eyebrow + counter + 新增 button */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <span style={{
          fontSize: 10, fontWeight: 600, color: "#525252",
          letterSpacing: "0.22em", textTransform: "uppercase",
        }}>
          {en ? "BRAND KNOWLEDGE" : "品牌知識庫"}
        </span>
        <div style={{ flex: 1, height: 1, background: "#D4D4D4" }} />
        <span style={{
          fontSize: 10, fontWeight: 500, color: "#525252",
          letterSpacing: "0.15em", fontVariantNumeric: "tabular-nums",
        }}>
          {items.length} / 50 · {totalChars.toLocaleString()} / 400,000
        </span>
        <button
          onClick={() => setAdding(true)}
          disabled={items.length >= 50}
          style={{
            padding: "6px 12px", fontSize: 12, fontWeight: 600,
            letterSpacing: "0.04em", borderRadius: 6, cursor: items.length >= 50 ? "not-allowed" : "pointer",
            border: "1px solid #171717",
            background: items.length >= 50 ? "#D4D4D4" : "#171717",
            color: items.length >= 50 ? "#525252" : "#FFFFFF",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          <Plus size={12} /> {en ? "Add entry" : "新增條目"}
        </button>
      </div>

      {/* Rationale line — why this exists */}
      <p style={{
        fontSize: 13, lineHeight: 1.7, color: "#525252",
        fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
        fontStyle: "italic", maxWidth: 720, marginBottom: 18,
      }}>
        {en
          ? "Upload your past hits, reference articles, and competitor case studies — when 30s / 60s / 99s / 7-Day Publisher run, they pull from this library first. Closer to your real voice than letting AI start from scratch."
          : "上傳你過去成功的貼文、外部參考文章、競品案例 — 任務跑 30s / 60s / 99s / 七日發布台 時，會優先從這份知識庫取材，比起讓 AI 從零生成，輸出會更貼近你的真實調性。"}
      </p>

      {/* Capacity meter */}
      <div style={{
        marginBottom: 22, padding: "10px 14px",
        background: "#FAFAF9", border: "1px solid #D4D4D4", borderRadius: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 10.5, color: "#525252", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {en ? `Capacity · ${charPct}%` : `容量使用率 · ${charPct}%`}
          </span>
          <span style={{ fontSize: 10, color: "#525252" }}>{en ? "Cap: 50 entries × 8,000 chars each" : "上限：50 條 × 每條 8,000 字"}</span>
        </div>
        <div style={{ height: 3, background: "#D4D4D4", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            background: charPct > 90 ? "#B91C1C" : "#171717",
            width: `${charPct}%`,
            transition: "width 0.2s",
          }} />
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{
          marginBottom: 22, padding: 18,
          background: "#FFFFFF", border: "1px solid #171717", borderRadius: 10,
        }}>
          <p style={{
            fontSize: 10, fontWeight: 600, color: "#525252",
            letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 12,
          }}>
            {en ? "New Entry" : "新條目"}
          </p>
          <Input
            label={en ? "Title" : "標題"}
            placeholder={en ? "e.g. Highest-reach post from last Dragon Boat" : "例：去年端午節最高觸及貼文"}
            value={title}
            onValueChange={setTitle}
            isRequired
            variant="flat"
            classNames={{ inputWrapper: "bg-default-50" }}
          />
          <div style={{ height: 10 }} />
          <Input
            label={en ? "Source link (optional)" : "來源連結（可選）"}
            placeholder="https://..."
            value={sourceUrl}
            onValueChange={setSourceUrl}
            variant="flat"
            classNames={{ inputWrapper: "bg-default-50" }}
          />
          <div style={{ height: 10 }} />
          <Textarea
            label={en ? "Content (max 8,000 chars)" : "內容（最多 8,000 字）"}
            placeholder={en ? "Paste the original / summary / takeaways…" : "貼上原文 / 摘要 / 觀察..."}
            value={body}
            onValueChange={setBody}
            minRows={6}
            maxLength={8000}
            description={en ? `${body.length} / 8,000 chars` : `${body.length} / 8,000 字`}
            variant="flat"
            classNames={{ inputWrapper: "bg-default-50" }}
          />
          {err && <div style={{ fontSize: 13, color: "#B91C1C", marginTop: 8 }}>{err}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button
              onClick={() => { setAdding(false); setTitle(""); setBody(""); setSourceUrl(""); setErr(null); }}
              style={{
                padding: "6px 14px", fontSize: 12, fontWeight: 600,
                borderRadius: 6, cursor: "pointer",
                border: "1px solid #D4D4D4", background: "#FFFFFF", color: "#525252",
              }}
            >
              {en ? "Cancel" : "取消"}
            </button>
            <button
              onClick={handleAdd}
              disabled={!title.trim() || createMut?.isPending}
              style={{
                padding: "6px 14px", fontSize: 12, fontWeight: 600,
                borderRadius: 6, cursor: "pointer",
                border: "1px solid #171717",
                background: !title.trim() ? "#D4D4D4" : "#171717",
                color: !title.trim() ? "#525252" : "#FFFFFF",
              }}
            >
              {createMut?.isPending
                ? (en ? "Saving…" : "儲存中…")
                : (en ? "Save" : "儲存")}
            </button>
          </div>
        </div>
      )}

      {/* Items grid */}
      {items.length === 0 && !adding ? (
        <div style={{
          padding: "80px 24px", textAlign: "center",
          color: "#525252",
          border: "1px dashed #D4D4D4", borderRadius: 12,
        }}>
          <BookOpen size={36} strokeWidth={1.3} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
          <p style={{ fontSize: 13, color: "#525252", marginBottom: 6, fontWeight: 500 }}>
            {en ? "No knowledge entries yet" : "還沒有知識條目"}
          </p>
          <p style={{
            fontSize: 12, color: "#525252",
            fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
            fontStyle: "italic", maxWidth: 320, margin: "0 auto",
          }}>
            {en
              ? "Start by uploading your best-performing post — the AI will fold its voice and structure into every future task."
              : "從你最成功的一篇貼文開始上傳 — AI 會把它的語氣 / 結構納入後續任務的取材池。"}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
          {items.map((it) => {
            const filled = (it.body ?? "").trim().length > 0;
            return (
              <div
                key={it.id}
                style={{
                  position: "relative",
                  background: "#FFFFFF",
                  border: "1px solid #D4D4D4",
                  borderRadius: 8,
                  padding: "14px 16px 12px",
                  transition: "border-color 0.15s",
                  minHeight: 140,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#171717"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#D4D4D4"; }}
              >
                {filled && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute", left: 0, top: 12, bottom: 12, width: 2,
                      background: "#171717", borderRadius: 2,
                    }}
                  />
                )}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                    <BookOpen size={12} strokeWidth={1.7} style={{ color: filled ? "#171717" : "#525252", flexShrink: 0 }} />
                    <h3 style={{
                      fontSize: 13.5, fontWeight: 600, color: "#171717",
                      lineHeight: 1.35, margin: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {it.title}
                    </h3>
                  </div>
                  <button
                    onClick={() => { if (confirm(en ? `Delete "${it.title}"?` : `刪除「${it.title}」？`)) deleteMut?.mutate?.({ id: it.id }); }}
                    title={en ? "Delete" : "刪除"}
                    style={{
                      background: "transparent", border: "none", cursor: "pointer",
                      color: "#525252", padding: 2, display: "flex", flexShrink: 0,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#B91C1C"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#525252"; }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {it.body && (
                  <p style={{
                    fontSize: 12, lineHeight: 1.6, color: "#525252",
                    fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
                    whiteSpace: "pre-wrap",
                    overflow: "hidden",
                    maxHeight: 78,
                    marginBottom: 10,
                  }}>
                    {it.body.length > 200 ? it.body.slice(0, 200) + "…" : it.body}
                  </p>
                )}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  fontSize: 9.5, color: "#525252",
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  borderTop: "1px solid #D4D4D4", paddingTop: 8,
                }}>
                  <span>{(it.body ?? "").length.toLocaleString()} {en ? "chars" : "字"}</span>
                  {it.sourceUrl && (
                    <a
                      href={it.sourceUrl} target="_blank" rel="noreferrer"
                      style={{ display: "flex", alignItems: "center", gap: 3, color: "#525252", textDecoration: "none" }}
                    >
                      <ExternalLink size={10} /> {en ? "Source" : "來源"}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
