/**
 * ChangelogPage — public /changelog. Layer 5 of the 4-layer support
 * architecture (closing the loop): users see "the bug I reported was
 * actually fixed", building trust.
 *
 * Reads from a static CHANGELOG.md served at /static/changelog.md so
 * non-engineers can update it without redeploy.
 */
import { useEffect, useState } from "react";
import { useLang } from "../../lib/i18n";

const TAG_STYLES: Record<string, { bg: string; fg: string; label: string }> = {
  NEW:     { bg: "rgba(124,58,237,0.10)", fg: "#5B21B6", label: "新功能" },
  FIX:     { bg: "rgba(239,68,68,0.10)",  fg: "#991B1B", label: "修復" },
  IMPROVE: { bg: "rgba(59,130,246,0.10)", fg: "#1E3A8A", label: "改進" },
  BREAKING:{ bg: "rgba(245,158,11,0.10)", fg: "#92400E", label: "變更" },
};

interface ChangelogEntry {
  date: string;            // 2026-05-13
  items: Array<{ tag: keyof typeof TAG_STYLES | string; text: string }>;
}

function parseChangelog(md: string): ChangelogEntry[] {
  // Format:
  //   ## 2026-05-13
  //   - [FIX] 復華投信定位完成但內容沒顯示
  //   - [NEW] Mia 客服 chat drawer
  const entries: ChangelogEntry[] = [];
  let current: ChangelogEntry | null = null;
  for (const rawLine of md.split("\n")) {
    const line = rawLine.trim();
    const dateMatch = line.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      if (current) entries.push(current);
      current = { date: dateMatch[1]!, items: [] };
      continue;
    }
    const itemMatch = line.match(/^-\s+\[(\w+)\]\s+(.+)$/);
    if (itemMatch && current) {
      current.items.push({ tag: itemMatch[1]!.toUpperCase(), text: itemMatch[2]! });
    }
  }
  if (current) entries.push(current);
  return entries;
}

export default function ChangelogPage() {
  const { lang } = useLang();
  const isEn = lang === "en";
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/static/changelog.md", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((md) => setEntries(parseChangelog(md)))
      .catch((e) => setError(String(e.message ?? e)));
  }, []);

  return (
    <div style={{ minHeight: "calc(100vh - 60px)", background: "#fafafa" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "60px 28px 80px" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <p style={{
            fontSize: 10, fontWeight: 700, color: "#6b7280",
            letterSpacing: "0.25em", textTransform: "uppercase",
            marginBottom: 12,
          }}>
            {isEn ? "Product Updates" : "產品更新日誌"}
          </p>
          <h1 style={{
            fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 700,
            color: "#111827", lineHeight: 1.1, marginBottom: 14,
          }}>
            {isEn ? "Built with you, fixed for you" : "你回報的問題，我們真的會修"}
          </h1>
          <p style={{
            fontSize: 14, color: "#525252", lineHeight: 1.7, fontStyle: "italic",
            fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
            maxWidth: 580, margin: "0 auto",
          }}>
            {isEn
              ? "Every fix below started as a user message to Mia. Transparency = trust."
              : "下面每一條修復，最早都是一則用戶丟給 Mia 的訊息。透明度 = 信任。"}
          </p>
        </div>

        {/* Loading / error */}
        {!entries && !error && (
          <div style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>
            {isEn ? "Loading…" : "讀取中…"}
          </div>
        )}
        {error && (
          <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
            {isEn
              ? `Couldn't load changelog: ${error}`
              : `讀不到 changelog：${error}`}
          </div>
        )}

        {/* Entries */}
        {entries && entries.map((entry) => (
          <section key={entry.date} style={{ marginBottom: 36 }}>
            <h2 style={{
              fontSize: 11, fontWeight: 700, color: "#6b7280",
              letterSpacing: "0.15em", textTransform: "uppercase",
              marginBottom: 14, borderBottom: "1px solid #e5e7eb", paddingBottom: 8,
            }}>
              {entry.date}
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {entry.items.map((item, i) => {
                const style = TAG_STYLES[item.tag] ?? {
                  bg: "#f3f4f6", fg: "#525252", label: item.tag,
                };
                return (
                  <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{
                      flexShrink: 0, padding: "2px 8px", borderRadius: 6,
                      fontSize: 10, fontWeight: 700,
                      background: style.bg, color: style.fg,
                      whiteSpace: "nowrap", minWidth: 50, textAlign: "center",
                      letterSpacing: 0.5,
                    }}>
                      {style.label}
                    </span>
                    <span style={{ fontSize: 14, color: "#1A1A18", lineHeight: 1.6 }}>
                      {item.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {/* CTA */}
        <div style={{ marginTop: 60, padding: 24, background: "white", border: "1px solid #e5e7eb", borderRadius: 12, textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#1A1A18", lineHeight: 1.7, marginBottom: 12 }}>
            {isEn
              ? "Have a feature request or found a bug?"
              : "想到的功能、卡住的地方？"}
          </p>
          <p style={{ fontSize: 12, color: "#6b7280" }}>
            {isEn
              ? "Click the Mia avatar bottom-right of any page to chat — every report is read."
              : "點任何一頁右下角的 Mia 頭像聊 — 我們每則訊息都會看。"}
          </p>
        </div>
      </div>
    </div>
  );
}
