/**
 * BoardroomMessageRenderer.tsx
 *
 * 董事會級訊息渲染器 — 解析 agent 輸出的 Boardroom 契約標記，
 * 渲染為方法論標頭 + 信心徽章 + 引用錨點 + Sources 區塊。
 *
 * 契約（對應 server/_core/agentPromptBuilder.ts buildBoardroomContract）：
 *   (1) > **Methodology**: <名稱> — <作者>（年份）    → MethodologyAnchor
 *   (2) > **Confidence**: HIGH/MEDIUM/LOW/... — <理由> → ConfidenceBadge
 *   (3) [N] inline                                      → CitationAnchor（點擊滾動到 Sources）
 *   (4) [ASSUMPTION] inline                             → AssumptionTag
 *   (5) ## Sources\n[1] ...\n[2] ...                    → SourcesPanel
 *
 * 未覆蓋的部分（一般 markdown 標題、表格、列表、code block）由內層
 * MarkdownRenderer 渲染，確保既有對話流程 100% 向後相容。
 */

import React, { useMemo, useRef } from "react";
import { MarkdownRenderer } from "./MarkdownRenderer";

// ─── Parsed Structure ────────────────────────────────────────────────────────
interface ParsedBoardroom {
  methodology: string | null;        // "mind-positioning — Al Ries & Jack Trout（1981）"
  confidence: {
    level: "HIGH" | "MEDIUM" | "LOW" | "UNSUPPORTED";
    reason: string;
  } | null;
  body: string;                      // markdown without the anchor/confidence/sources blocks
  sources: { n: number; text: string }[];
}

// ─── Parser ──────────────────────────────────────────────────────────────────
function parseBoardroom(raw: string): ParsedBoardroom {
  const lines = raw.split("\n");
  let methodology: string | null = null;
  let confidence: ParsedBoardroom["confidence"] = null;
  const bodyLines: string[] = [];
  const sources: ParsedBoardroom["sources"] = [];

  let inSources = false;

  for (const line of lines) {
    // Detect "## Sources" section start (variations: "Sources", "Sources：", "Sources:")
    if (/^##\s+Sources\s*[:：]?\s*$/i.test(line.trim())) {
      inSources = true;
      continue;
    }
    // While in sources, collect [N] entries
    if (inSources) {
      const m = line.match(/^\s*\[(\d+)\]\s*(.+)$/);
      if (m) {
        sources.push({ n: parseInt(m[1], 10), text: m[2].trim() });
        continue;
      }
      // Any other ## heading after Sources ends the sources block
      if (/^##\s+/.test(line.trim())) {
        inSources = false;
        bodyLines.push(line);
        continue;
      }
      // Blank lines allowed inside sources — skip
      if (line.trim() === "") continue;
      // Free text inside Sources (descriptive note) — keep as-is but don't parse
      continue;
    }

    // Methodology anchor: "> **Methodology**: ..." (stop at first occurrence)
    if (!methodology) {
      const mm = line.match(/^>\s*\*\*Methodology\*\*\s*[:：]\s*(.+)$/i);
      if (mm) {
        methodology = mm[1].trim();
        continue;
      }
    }

    // Confidence line: "> **Confidence**: LEVEL — reason"
    if (!confidence) {
      const cm = line.match(
        /^>\s*\*\*Confidence\*\*\s*[:：]\s*(HIGH|MEDIUM|LOW|UNSUPPORTED)\s*(?:—|-|–)?\s*(.*)$/i,
      );
      if (cm) {
        confidence = {
          level: cm[1].toUpperCase() as ParsedBoardroom["confidence"] extends infer T
            ? T extends { level: infer L } ? L : never : never,
          reason: (cm[2] ?? "").trim(),
        };
        continue;
      }
    }

    bodyLines.push(line);
  }

  return {
    methodology,
    confidence,
    body: bodyLines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    sources,
  };
}

// ─── MethodologyAnchor ───────────────────────────────────────────────────────
function MethodologyAnchor({ text }: { text: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "8px 12px", marginBottom: 8,
      background: "#FAF8F3", border: "1px solid #E8E1D1",
      borderLeft: "3px solid #B8935C", borderRadius: 6,
      fontSize: 12, color: "#5B4A2E", fontWeight: 500,
      letterSpacing: 0.1,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 1,
        textTransform: "uppercase", color: "#8B6F3F",
      }}>
        Methodology
      </span>
      <span style={{ color: "#D4C7A8" }}>•</span>
      <span>{text}</span>
    </div>
  );
}

// ─── ConfidenceBadge ─────────────────────────────────────────────────────────
const CONFIDENCE_STYLES: Record<string, { bg: string; border: string; fg: string; label: string }> = {
  HIGH:        { bg: "#F0FDF4", border: "#BBF7D0", fg: "#166534", label: "HIGH" },
  MEDIUM:      { bg: "#FEFCE8", border: "#FEF08A", fg: "#854D0E", label: "MEDIUM" },
  LOW:         { bg: "#FEF2F2", border: "#FECACA", fg: "#991B1B", label: "LOW" },
  UNSUPPORTED: { bg: "#F5F5F4", border: "#D6D3D1", fg: "#57534E", label: "UNSUPPORTED" },
};

function ConfidenceBadge({ level, reason }: { level: string; reason: string }) {
  const s = CONFIDENCE_STYLES[level] ?? CONFIDENCE_STYLES.UNSUPPORTED;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "6px 12px", marginBottom: 12,
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 6, fontSize: 12,
    }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
        padding: "2px 7px", borderRadius: 4,
        background: s.fg, color: "#fff",
      }}>
        {s.label}
      </span>
      {reason && (
        <span style={{ color: s.fg, fontWeight: 500 }}>{reason}</span>
      )}
    </div>
  );
}

// ─── CitationAnchor (inline [N]) ─────────────────────────────────────────────
function CitationAnchor({
  n,
  onClick,
}: {
  n: number;
  onClick: (n: number) => void;
}) {
  return (
    <sup
      onClick={(e) => { e.preventDefault(); onClick(n); }}
      style={{
        display: "inline-block", marginLeft: 2, marginRight: 1,
        padding: "0 5px", borderRadius: 3,
        background: "#E8F1FF", color: "#0A6EFA",
        fontSize: 10, fontWeight: 700, cursor: "pointer",
        lineHeight: 1.5, verticalAlign: "super",
        border: "1px solid #BFD7FF",
      }}
      title={`跳到來源 [${n}]`}
    >
      [{n}]
    </sup>
  );
}

// ─── AssumptionTag (inline [ASSUMPTION]) ─────────────────────────────────────
function AssumptionTag() {
  return (
    <span style={{
      display: "inline-block", marginLeft: 3, marginRight: 2,
      padding: "0 6px", borderRadius: 3,
      background: "#FEF3C7", color: "#92400E",
      fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
      lineHeight: 1.6, verticalAlign: "middle",
      border: "1px solid #FDE68A",
    }}>
      ASSUMPTION
    </span>
  );
}

// ─── SourcesPanel ────────────────────────────────────────────────────────────
const SourcesPanel = React.forwardRef<HTMLDivElement, { sources: ParsedBoardroom["sources"] }>(
  function SourcesPanel({ sources }, ref) {
    if (sources.length === 0) return null;
    return (
      <div
        ref={ref}
        style={{
          marginTop: 16, padding: "12px 14px",
          background: "#FAFAF9", border: "1px solid #E4E3E1",
          borderRadius: 8, fontSize: 12, color: "#4B4B48",
        }}
      >
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1,
          textTransform: "uppercase", color: "#6B6A66", marginBottom: 8,
        }}>
          Sources ({sources.length})
        </div>
        {sources.map((s) => (
          <div
            key={s.n}
            id={`src-${s.n}`}
            style={{
              display: "flex", gap: 8, padding: "4px 0",
              lineHeight: 1.6,
            }}
          >
            <span style={{
              flexShrink: 0, width: 24,
              color: "#0A6EFA", fontWeight: 700,
            }}>
              [{s.n}]
            </span>
            <span>{s.text}</span>
          </div>
        ))}
      </div>
    );
  },
);

// ─── Inline transform: replace [N] and [ASSUMPTION] with React nodes ────────
/**
 * Walk a string, splitting it at [N] / [ASSUMPTION] tokens and returning
 * an array of (string | ReactNode). Used to inject anchors into markdown
 * AT THE STRING LEVEL, so react-markdown still handles bold/tables/etc.
 *
 * react-markdown's `components.text` renderer receives already-rendered
 * text nodes, so we intercept at the line level before markdown parsing.
 *
 * Strategy: pre-transform the markdown string to replace [N] with a
 * HTML span that react-markdown will pass through (via `remarkGfm`
 * can't handle custom HTML in default mode). Cleaner: use rehype raw,
 * but that adds a dep. Instead we post-process by custom `p` renderer.
 *
 * Simpler: use react-markdown's `components.p` / `components.li` to
 * receive children then transform text children at render time.
 */
function transformInlineTextChildren(
  children: React.ReactNode,
  onCite: (n: number) => void,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const walk = (node: React.ReactNode, key: string) => {
    if (typeof node === "string") {
      // Match [N] and [ASSUMPTION] in the text
      const regex = /\[(\d+)\]|\[ASSUMPTION\]/g;
      let lastIdx = 0;
      let m: RegExpExecArray | null;
      let idx = 0;
      while ((m = regex.exec(node)) !== null) {
        if (m.index > lastIdx) out.push(node.slice(lastIdx, m.index));
        if (m[1]) {
          const n = parseInt(m[1], 10);
          out.push(<CitationAnchor key={`${key}-c-${idx++}`} n={n} onClick={onCite} />);
        } else {
          out.push(<AssumptionTag key={`${key}-a-${idx++}`} />);
        }
        lastIdx = m.index + m[0].length;
      }
      if (lastIdx < node.length) out.push(node.slice(lastIdx));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((c, i) => walk(c, `${key}-${i}`));
      return;
    }
    out.push(node);
  };
  walk(children, "root");
  return out;
}

// ─── Main Component ──────────────────────────────────────────────────────────
interface BoardroomMessageRendererProps {
  content: string;
  isStreaming?: boolean;
}

export function BoardroomMessageRenderer({
  content,
  isStreaming,
}: BoardroomMessageRendererProps) {
  const parsed = useMemo(() => parseBoardroom(content), [content]);
  const sourcesRef = useRef<HTMLDivElement>(null);

  const onCite = (n: number) => {
    const el = document.getElementById(`src-${n}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // brief highlight flash
      const prev = el.style.background;
      el.style.background = "#FFF4CC";
      setTimeout(() => { el.style.background = prev; }, 1000);
    } else if (sourcesRef.current) {
      sourcesRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // If this message has no boardroom markers, fall back cleanly to plain markdown
  const hasAnyMarkers =
    parsed.methodology || parsed.confidence || parsed.sources.length > 0;

  return (
    <div>
      {parsed.methodology && <MethodologyAnchor text={parsed.methodology} />}
      {parsed.confidence && (
        <ConfidenceBadge
          level={parsed.confidence.level}
          reason={parsed.confidence.reason}
        />
      )}
      <BoardroomBody
        body={parsed.body}
        onCite={onCite}
        isStreaming={isStreaming && !hasAnyMarkers}
      />
      <SourcesPanel ref={sourcesRef} sources={parsed.sources} />
      {isStreaming && hasAnyMarkers && (
        <span style={{
          display: "inline-block", width: 2, height: 14,
          background: "#1A1A18", marginLeft: 2,
          animation: "blink 1s step-end infinite",
          verticalAlign: "text-bottom",
        }} />
      )}
    </div>
  );
}

// Inner body renderer — wraps MarkdownRenderer with citation transform
function BoardroomBody({
  body,
  onCite,
  isStreaming,
}: {
  body: string;
  onCite: (n: number) => void;
  isStreaming?: boolean;
}) {
  // We can't easily post-process react-markdown's output AST here without
  // adding rehype-react. Simpler approach: pre-replace [N] with a unique
  // placeholder token that we then substitute in custom p/li/td renderers.
  //
  // But react-markdown lets us override text rendering via the children
  // of block elements — those arrive as string or React nodes. We wrap
  // the base MarkdownRenderer and post-transform the rendered tree via
  // a React context alternative: augment MarkdownRenderer to accept
  // inline transformers. To keep diff small, we fall back to a simpler
  // regex-based DOM approach: render markdown as-is (MarkdownRenderer
  // passes [N] through as text), then in a useLayoutEffect we walk the
  // container and replace text occurrences with spans.

  const containerRef = useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    // Find all text nodes and replace [N] + [ASSUMPTION]
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const toReplace: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const t = node as Text;
      if (/\[\d+\]|\[ASSUMPTION\]/.test(t.data)) toReplace.push(t);
    }
    for (const t of toReplace) {
      const frag = document.createDocumentFragment();
      const parts = t.data.split(/(\[\d+\]|\[ASSUMPTION\])/g);
      for (const p of parts) {
        if (/^\[\d+\]$/.test(p)) {
          const n = parseInt(p.slice(1, -1), 10);
          const sup = document.createElement("sup");
          sup.textContent = `[${n}]`;
          Object.assign(sup.style, {
            marginLeft: "2px", marginRight: "1px",
            padding: "0 5px", borderRadius: "3px",
            background: "#E8F1FF", color: "#0A6EFA",
            fontSize: "10px", fontWeight: "700", cursor: "pointer",
            lineHeight: "1.5", verticalAlign: "super",
            border: "1px solid #BFD7FF",
            display: "inline-block",
          } as CSSStyleDeclaration);
          sup.title = `跳到來源 [${n}]`;
          sup.addEventListener("click", (e) => { e.preventDefault(); onCite(n); });
          frag.appendChild(sup);
        } else if (p === "[ASSUMPTION]") {
          const tag = document.createElement("span");
          tag.textContent = "ASSUMPTION";
          Object.assign(tag.style, {
            marginLeft: "3px", marginRight: "2px",
            padding: "0 6px", borderRadius: "3px",
            background: "#FEF3C7", color: "#92400E",
            fontSize: "10px", fontWeight: "700", letterSpacing: "0.4px",
            lineHeight: "1.6", verticalAlign: "middle",
            border: "1px solid #FDE68A",
            display: "inline-block",
          } as CSSStyleDeclaration);
          frag.appendChild(tag);
        } else if (p) {
          frag.appendChild(document.createTextNode(p));
        }
      }
      t.parentNode?.replaceChild(frag, t);
    }
  }, [body]);

  return (
    <div ref={containerRef}>
      <MarkdownRenderer content={body} isStreaming={isStreaming} />
    </div>
  );
}
