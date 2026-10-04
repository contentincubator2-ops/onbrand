/**
 * ChangelogPage — public /changelog. Layer 5 of the 4-layer support
 * architecture (closing the loop): users see "the bug I reported was
 * actually fixed", building trust.
 *
 * Reads from a static CHANGELOG.md served at /static/changelog.md so
 * non-engineers can update it without redeploy.
 */
import { useEffect, useState } from "react";
import { useLang } from "../../../lib/i18n";

const TAG_STYLES: Record<string, { bg: string; fg: string; label: string; labelEn: string }> = {
  NEW:     { bg: "rgba(24,24,27,0.06)", fg: "#27272a", label: "新功能", labelEn: "New"     },
  FIX:     { bg: "rgba(24,24,27,0.06)",  fg: "#27272a", label: "修復",   labelEn: "Fix"     },
  IMPROVE: { bg: "rgba(24,24,27,0.06)",  fg: "#27272a", label: "改進",   labelEn: "Improve" },
  BREAKING:{ bg: "rgba(245,158,11,0.10)", fg: "#92400E", label: "變更",   labelEn: "Change"  },
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
    const load = (url: string) => fetch(url, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    });
    // 英文介面讀英文版；沒有就退回中文版。
    (isEn ? load("/static/changelog.en.md").catch(() => load("/static/changelog.md")) : load("/static/changelog.md"))
      .then((md) => setEntries(parseChangelog(md)))
      .catch((e) => setError(String(e.message ?? e)));
  }, [isEn]);

  return (
    <div style={{ minHeight: "calc(100vh - 60px)", background: "#fafafa" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "60px 28px 80px" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{
            fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 700,
            color: "#111827", lineHeight: 1.1,
          }}>
            {isEn ? "Product Updates" : "產品更新日誌"}
          </h1>
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
              ? `Could not load release notes: ${error}`
              : `無法載入更新日誌：${error}`}
          </div>
        )}

        {/* Entries */}
        {entries && entries.map((entry) => (
          <section key={entry.date} style={{ marginBottom: 36 }}>
            <h2 style={{
              fontSize: 12, fontWeight: 700, color: "#6b7280",
              letterSpacing: "0.15em", textTransform: "uppercase",
              marginBottom: 14, borderBottom: "1px solid #e5e7eb", paddingBottom: 8,
            }}>
              {entry.date}
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {entry.items.map((item, i) => {
                const style = TAG_STYLES[item.tag] ?? {
                  bg: "#f3f4f6", fg: "#525252", label: item.tag, labelEn: item.tag,
                };
                return (
                  <li key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{
                      flexShrink: 0, padding: "2px 8px", borderRadius: 6,
                      fontSize: 12, fontWeight: 700,
                      background: style.bg, color: style.fg,
                      whiteSpace: "nowrap", minWidth: 50, textAlign: "center",
                      letterSpacing: 0.5,
                    }}>
                      {isEn ? style.labelEn : style.label}
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

      </div>
    </div>
  );
}
