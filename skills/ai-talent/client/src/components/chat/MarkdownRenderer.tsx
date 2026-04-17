/**
 * MarkdownRenderer.tsx — renders markdown with tables, code, bold, headers
 * Uses react-markdown + remark-gfm
 */
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

export function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  return (
    <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.7, color: "#1A1A18" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headers
          h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 700, margin: "16px 0 8px", color: "#0A0A09", lineHeight: 1.3 }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 700, margin: "14px 0 6px", color: "#0A0A09" }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, margin: "12px 0 4px", color: "#1A1A18" }}>{children}</h3>,
          // Paragraph
          p: ({ children }) => <p style={{ margin: "6px 0", lineHeight: 1.7 }}>{children}</p>,
          // Bold
          strong: ({ children }) => <strong style={{ fontWeight: 700, color: "#0A0A09" }}>{children}</strong>,
          // Italic
          em: ({ children }) => <em style={{ fontStyle: "italic", color: "#2D2D2A" }}>{children}</em>,
          // Lists
          ul: ({ children }) => <ul style={{ paddingLeft: 20, margin: "6px 0", listStyleType: "disc" }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "6px 0" }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: "3px 0", lineHeight: 1.6 }}>{children}</li>,
          // Code block
          code: ({ inline, className, children, ...props }: any) => {
            const code = String(children).replace(/\n$/, "");
            if (inline) {
              return (
                <code style={{
                  background: "#F4F3F1", border: "1px solid #E4E3E1",
                  borderRadius: 4, padding: "1px 5px",
                  fontSize: 12.5, fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  color: "#C02020",
                }}>{code}</code>
              );
            }
            return (
              <div style={{ position: "relative", margin: "10px 0" }}>
                <pre style={{
                  background: "#1E1E1E", color: "#D4D4D4",
                  borderRadius: 8, padding: "14px 16px",
                  overflow: "auto", fontSize: 12.5,
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                  lineHeight: 1.6, margin: 0,
                }}>
                  <code>{code}</code>
                </pre>
                <button
                  onClick={() => navigator.clipboard.writeText(code)}
                  style={{
                    position: "absolute", top: 8, right: 8,
                    background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 4, color: "#9CA3AF", cursor: "pointer",
                    fontSize: 10, padding: "2px 7px", fontFamily: "inherit",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.2)"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"; (e.currentTarget as HTMLButtonElement).style.color = "#9CA3AF"; }}
                >
                  複製
                </button>
              </div>
            );
          },
          // Tables
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "12px 0" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead style={{ background: "#F4F3F1" }}>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr style={{ borderBottom: "1px solid #E4E3E1" }}>{children}</tr>,
          th: ({ children }) => <th style={{ padding: "8px 12px", fontWeight: 600, textAlign: "left", color: "#0A0A09", fontSize: 12, borderBottom: "2px solid #D4D3D0", whiteSpace: "nowrap" }}>{children}</th>,
          td: ({ children }) => <td style={{ padding: "8px 12px", color: "#1A1A18", fontSize: 13, verticalAlign: "top" }}>{children}</td>,
          // Blockquote
          blockquote: ({ children }) => (
            <blockquote style={{
              borderLeft: "3px solid #E4E3E1", paddingLeft: 14, margin: "10px 0",
              color: "#6B7280", fontStyle: "italic",
            }}>
              {children}
            </blockquote>
          ),
          // Horizontal rule
          hr: () => <hr style={{ border: "none", borderTop: "1px solid #E4E3E1", margin: "16px 0" }} />,
          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#0A6EFA", textDecoration: "none", borderBottom: "1px solid rgba(10,110,250,0.3)",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderBottomColor = "#0A6EFA"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderBottomColor = "rgba(10,110,250,0.3)"; }}
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && (
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
