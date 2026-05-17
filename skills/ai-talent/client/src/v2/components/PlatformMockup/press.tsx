/**
 * Press Release / 公關稿 mockup.
 * Also covers: Deck / Presentation slide.
 *
 * Variants:
 *   press     — AP-style press release
 *   deck      — presentation slide deck
 */
import React from "react";
import { Avatar, Button, Chip, Divider, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faNewspaper, faCalendarDays, faBuilding, faEnvelope, faPhone,
  faChalkboard, faChevronLeft, faChevronRight, faImages,
  faCircle, faExpand,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, dicebear, MarkdownText, titleEchoesCaption } from "./shared";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/* ─────────────── Press Release ───────────────
 *
 * 2026-05-07 redesign — modeled on the "minimalist standard press release"
 * reference (cream paper, black serif-feeling sans, single rule lines).
 *
 * Field map (1:1 with MockupFields):
 *   brandName            → COMPANY NAME eyebrow
 *   (fixed)              → "PRESS RELEASE" headline bar
 *   today                → date stamp under top rule
 *   liveTitle ?? title   → bold body headline
 *   liveDescription OR
 *     first line of body → subhead (one line, lighter weight)
 *   liveCaption (paras)  → body paragraphs (split on \n\n)
 *   brandName            → COMPANY contact column (left)
 *   (derived from brand) → MEDIA CONTACT column (right)
 */


/**
 * 2026-05-17 (CJ「headline 的 mockup 比較像 newspaper mockup 的感覺」):
 * Redesigned from the cream-paper press-release letter into a newspaper
 * FRONT PAGE — nameplate / masthead, heavy rules, big bold black serif
 * headline, italic deck, justified greeked columns. The generated
 * headline (which arrives in liveCaption for the 新聞稿標題 task — no
 * separate liveTitle is passed) now renders as the giant front-page
 * headline; body tasks still read first-block-as-headline + rest body.
 */
const SERIF = "'Times New Roman', 'Noto Serif TC', 'Songti TC', serif";

export function PressRelease({ title, brandName, variantLabel, liveTitle, liveCaption, liveDescription }: MockupFields) {
  const brand = (brandName ?? "Your Brand").trim();
  const today = new Date();
  const dateStr = today.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
  const weekday = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"][today.getDay()];

  // 2026-05-17 (CJ「副標過長，分不出主標/副標/描述」): clear 3-tier
  // hierarchy that works for EVERY press task, not just 標題:
  //   主標 (headline)  = a SHORT title — liveTitle → run title →
  //                      (first caption block only if it's short).
  //                      The 副標/引言 task's long paragraph must NOT
  //                      land in the giant headline slot.
  //   副標．引言 (deck) = first caption block (the generated subhead/
  //                      lead) — medium italic, clamped, NOT huge.
  //   內文 (body)       = remaining blocks (or greeked filler).
  const blocks = (liveCaption ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const firstCap = blocks[0] ?? "";
  const runTitle = (title ?? "").trim();
  const SHORT = 28; // 中文字 — anything longer isn't a headline
  const headline = (
    (liveTitle && liveTitle.trim()) ||
    runTitle ||
    (firstCap.length <= SHORT ? firstCap : "")
  ).trim();
  // The caption is the deck UNLESS it just echoes the headline (the
  // 標題 task: title ≈ caption → don't print it twice).
  const capIsHeadline = titleEchoesCaption(headline, firstCap) || firstCap === headline;
  const deck = liveDescription
    ?? (!capIsHeadline && firstCap ? firstCap : null);
  // Body = blocks after whichever block became the deck.
  const usedAsDeck = !liveDescription && deck === firstCap;
  const bodyParas = blocks.slice(usedAsDeck ? 1 : 0)
    .filter((b) => b !== headline && b !== deck);
  // Length-aware headline sizing so a longer title still fits ~2 lines
  // instead of ballooning to 8 lines like the 副標 bug.
  const hlLen = headline.length;
  const hlSize = hlLen <= 14 ? "clamp(26px,4.4vw,42px)"
               : hlLen <= 26 ? "clamp(22px,3.4vw,32px)"
               :               "clamp(18px,2.6vw,25px)";

  const Kicker = ({ children }: { children: React.ReactNode }) => (
    <p className="text-center text-[9px] tracking-[0.34em] uppercase mb-1.5 not-italic"
       style={{ color: "#a39c8c" }}>{children}</p>
  );

  return (
    <div className="w-full max-w-[760px] mx-auto">
      <MockupHeader icon={faNewspaper} label="新聞稿 · 報紙版面" variantLabel={variantLabel} />

      {/* Newsprint sheet */}
      <div
        className="rounded-sm overflow-hidden"
        style={{
          background: "#f4f1ea",
          boxShadow: "0 24px 48px -16px rgba(0,0,0,0.22), 0 8px 16px -8px rgba(0,0,0,0.12)",
          fontFamily: SERIF,
          color: "#1a1a1a",
        }}
      >
        <div className="px-8 md:px-12 py-8 md:py-11">
          {/* ── Nameplate / Masthead ── */}
          <div className="flex items-center justify-between text-[10px] tracking-[0.18em] uppercase" style={{ color: "#333" }}>
            <span>{dateStr} · {weekday}</span>
            <span>創刊號 · 第 1 版</span>
          </div>
          <div className="border-t-2 border-black mt-2" />
          <h1
            className="text-center font-black my-1"
            style={{ fontSize: "clamp(30px, 6vw, 56px)", letterSpacing: "0.02em", lineHeight: 1.05 }}
          >
            {brand.toUpperCase()}
          </h1>
          <div className="flex items-center justify-center gap-3 text-[10px] tracking-[0.22em] uppercase pb-2" style={{ color: "#444" }}>
            <span>NEWS</span><span>·</span><span>每日要聞</span><span>·</span><span>NT$ —</span>
          </div>
          <div className="border-t-[3px] border-double border-black mb-5" />

          {/* ── 主標 headline ── */}
          <Kicker>主標 · Headline</Kicker>
          {headline ? (
            <h2
              className="text-center font-black mb-4"
              style={{
                fontSize: hlSize, lineHeight: 1.2, letterSpacing: "0.005em",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {headline}
            </h2>
          ) : (
            <div className="flex flex-col items-center gap-2 mb-4">
              <Skeleton className="h-7 w-[70%] rounded" />
            </div>
          )}

          {/* ── 副標 / 引言 deck — readable medium, clamped, NOT huge ── */}
          {deck ? (
            <div className="mb-5">
              <div className="border-t border-black/50 w-1/4 mx-auto mb-2.5" />
              <Kicker>副標 · 引言</Kicker>
              <p
                className="text-center italic mx-auto"
                style={{
                  fontSize: "15px", lineHeight: 1.55, color: "#3a3a3a", maxWidth: "44ch",
                  display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {deck}
              </p>
            </div>
          ) : (
            <p className="text-center text-[11px] tracking-[0.18em] uppercase mb-5" style={{ color: "#9a958a" }}>
              ——  特訊  ——
            </p>
          )}

          {/* Byline rule */}
          <div className="flex items-center justify-between text-[10px] mb-3 pb-1 border-b border-black/40" style={{ color: "#555" }}>
            <span>本報訊　{brand} 提供</span>
            <span>{dateStr}</span>
          </div>

          {/* ── 內文 body: two justified columns. Real body if present,
              else greeked filler so the page reads like a printed
              mockup (標題 / 副標 tasks have no body of their own). ── */}
          <Kicker>內文 · Body</Kicker>
          <div
            className="md:[column-count:2] md:[column-gap:28px] md:[column-rule:1px_solid_rgba(0,0,0,0.25)]"
            style={{ fontSize: "12px", lineHeight: 1.7, color: "#222", textAlign: "justify" }}
          >
            {bodyParas.length > 0 ? (
              bodyParas.map((p, i) => (
                <p key={i} className="mb-3" style={{ textIndent: "1.4em" }}>
                  {i === 0 && (
                    <span style={{ float: "left", fontSize: "2.6em", lineHeight: 0.82, fontWeight: 900, paddingRight: 8, paddingTop: 2 }}>
                      {p.charAt(0)}
                    </span>
                  )}
                  {i === 0 ? p.slice(1) : p}
                </p>
              ))
            ) : (
              <div aria-hidden style={{ color: "#9a958a" }}>
                {[92, 100, 96, 88, 100, 94, 70, 100, 90, 100, 85, 60].map((w, i) => (
                  <div key={i} className="mb-[7px] rounded-[1px]"
                    style={{ height: 6, width: `${w}%`, background: "rgba(0,0,0,0.13)" }} />
                ))}
                <p className="mt-3 text-[10px] tracking-[0.16em] uppercase not-italic" style={{ color: "#8a857a" }}>
                  — 內文於完整新聞稿中產出 —
                </p>
              </div>
            )}
          </div>

          {/* Bottom plate */}
          <div className="border-t-2 border-black mt-7 pt-3 flex items-center justify-between text-[10px]" style={{ color: "#555" }}>
            <span>媒體聯絡 · {brand}</span>
            <span>press@{(brand.toLowerCase().replace(/[^a-z0-9]+/g, "") || "brand")}.com</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Spokesperson Q&A / FAQ ───────────────
 *
 * 2026-05-17 (CJ「QA 任務應該是 Q&A 卡片形式，不是報紙」):
 * Renders the 發言人 Q&A / FAQ output as paired question/answer cards
 * (social-FAQ banner style — Q bubble + A bubble, numbered), NOT the
 * newspaper press sheet. Parser is forgiving: Q:/A:, 問：/答：, Q1.,
 * 1. ... markers, blank-line separated.
 */
interface QAPair { q: string; a: string }

function parseQA(text: string): QAPair[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const Q = /^\s*(?:[QqＱ問]\s*\d*|問題\s*\d*|Q\d+)\s*[:：.\)、]\s*/;
  const A = /^\s*(?:[AaＡ答]\s*\d*|答案|A\d+)\s*[:：.\)、]\s*/;
  const pairs: QAPair[] = [];
  let cur: QAPair | null = null;
  let mode: "q" | "a" | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (Q.test(line)) {
      if (cur && cur.q) pairs.push(cur);
      cur = { q: line.replace(Q, "").trim(), a: "" };
      mode = "q";
    } else if (A.test(line) && cur) {
      cur.a = line.replace(A, "").trim();
      mode = "a";
    } else if (cur) {
      // continuation of whichever side we're on
      if (mode === "a") cur.a += (cur.a ? " " : "") + line;
      else cur.q += (cur.q ? " " : "") + line;
    }
  }
  if (cur && cur.q) pairs.push(cur);
  return pairs.filter((p) => p.q);
}

export function QAMockup({ title, brandName, variantLabel, liveTitle, liveCaption }: MockupFields) {
  const brand = (brandName ?? "Your Brand").trim();
  const topic = (liveTitle ?? title ?? "媒體採訪準備").trim();
  const pairs = parseQA(liveCaption ?? "");
  const ACCENT = "#7c3aed";

  return (
    <div className="w-full max-w-[640px] mx-auto">
      <MockupHeader icon={faNewspaper} label="發言人 Q&A · 媒體準備" variantLabel={variantLabel} />

      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "#ffffff",
          border: "1px solid #ececf3",
          boxShadow: "0 20px 44px -18px rgba(80,40,160,0.20)",
          fontFamily: "'Inter','Noto Sans TC',system-ui,sans-serif",
        }}
      >
        {/* Header band with soft geometric accent */}
        <div className="relative px-7 pt-7 pb-6 overflow-hidden"
          style={{ background: "linear-gradient(135deg,#f6f3ff 0%,#eef6ff 100%)" }}>
          <div aria-hidden style={{
            position: "absolute", right: -28, top: -28, width: 120, height: 120,
            borderRadius: "50%", background: "rgba(124,58,237,0.10)",
          }} />
          <div aria-hidden style={{
            position: "absolute", right: 44, bottom: -22, width: 60, height: 60,
            borderRadius: 16, background: "rgba(0,180,188,0.12)", transform: "rotate(18deg)",
          }} />
          <p className="text-[10px] font-bold tracking-[0.24em] uppercase mb-2" style={{ color: ACCENT }}>
            {brand} · Media Q&A
          </p>
          <h2 className="font-extrabold leading-snug" style={{ fontSize: "clamp(17px,2.4vw,22px)", color: "#1a1530" }}>
            {topic}
          </h2>
          <p className="text-[11px] mt-1.5" style={{ color: "#6b6480" }}>
            記者預期會問的問題 + 發言人標準答案
          </p>
        </div>

        {/* Q&A list */}
        <div className="px-6 py-6 space-y-4">
          {pairs.length > 0 ? pairs.map((p, i) => (
            <div key={i} className="rounded-xl border" style={{ borderColor: "#eceaf4" }}>
              {/* Question bubble */}
              <div className="flex gap-3 px-4 py-3" style={{ background: "#faf8ff", borderTopLeftRadius: 12, borderTopRightRadius: 12 }}>
                <span className="shrink-0 flex items-center justify-center font-bold text-white"
                  style={{ width: 24, height: 24, borderRadius: 8, background: ACCENT, fontSize: 12 }}>Q</span>
                <p className="font-bold leading-snug" style={{ fontSize: 14, color: "#1a1530" }}>
                  {p.q}
                </p>
              </div>
              {/* Answer bubble */}
              <div className="flex gap-3 px-4 py-3">
                <span className="shrink-0 flex items-center justify-center font-bold"
                  style={{ width: 24, height: 24, borderRadius: 8, background: "#e8f7f8", color: "#0a8a92", fontSize: 12 }}>A</span>
                <p className="leading-relaxed" style={{ fontSize: 13, color: "#3a3450" }}>
                  {p.a || <span style={{ color: "#b5afc4" }}>（答案待補）</span>}
                </p>
              </div>
              <div className="px-4 pb-2 text-right text-[10px]" style={{ color: "#c3bdd4" }}>
                {String(i + 1).padStart(2, "0")} / {String(pairs.length).padStart(2, "0")}
              </div>
            </div>
          )) : liveCaption ? (
            // Couldn't detect Q/A markers — show raw so nothing is lost.
            <div className="rounded-xl border p-4 whitespace-pre-wrap leading-relaxed"
              style={{ borderColor: "#eceaf4", fontSize: 13, color: "#3a3450" }}>
              {liveCaption}
            </div>
          ) : (
            <div className="space-y-4">
              {[1, 2, 3].map((k) => (
                <div key={k} className="rounded-xl border p-4 space-y-2" style={{ borderColor: "#eceaf4" }}>
                  <Skeleton className="h-4 w-[70%] rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-[88%] rounded" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex items-center justify-between text-[10px]"
          style={{ borderColor: "#f0eef7", color: "#9b95ad" }}>
          <span>內部媒體準備 · 非對外發布</span>
          <span>{brand}</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── CEO Speech (致辭講稿) ───────────────
 *
 * 2026-05-17 (CJ「CEO QUOTE → CEO SPEECH，產出像致辭簡報，有主講人 /
 * talking point / 時間地點，可編輯下載」). Slide-style "Message from
 * CEO" layout: header, speaker block, talking-point bullets, occasion
 * footer. Parses the metadata header (【主講人】…) + [重點…] sections.
 */
function parseSpeech(text: string): {
  speaker: string; speakerTitle: string; occasion: string; topic: string;
  points: { title: string; body: string }[];
} {
  const grab = (re: RegExp) => (text.match(re)?.[1] ?? "").trim();
  const speaker      = grab(/【主講人】\s*(.+)/);
  const speakerTitle = grab(/【職稱】\s*(.+)/);
  const occasion     = grab(/【場合】\s*(.+)/);
  const topic        = grab(/【講題】\s*(.+)/);
  // Body after the --- separator (or whole text if absent)
  const body = text.includes("---") ? text.split("---").slice(1).join("---") : text;
  // Split on [開場]/[重點一]/[展望]/[結語] section markers.
  const SECT = /\[([^\]]{1,12})\]/g;
  const points: { title: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  const marks: { tag: string; idx: number }[] = [];
  while ((m = SECT.exec(body))) marks.push({ tag: m[1]!.trim(), idx: m.index });
  if (marks.length) {
    for (let i = 0; i < marks.length; i++) {
      const start = marks[i]!.idx + marks[i]!.tag.length + 2;
      const end = i + 1 < marks.length ? marks[i + 1]!.idx : body.length;
      const seg = body.slice(start, end).trim().replace(/\s*\n\s*/g, " ");
      if (seg) points.push({ title: marks[i]!.tag, body: seg });
    }
  } else {
    // No markers — use paragraphs as points.
    body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).slice(0, 8)
      .forEach((p, i) => points.push({ title: `重點 ${i + 1}`, body: p }));
  }
  return { speaker, speakerTitle, occasion, topic, points };
}

export function SpeechMockup({ title, brandName, variantLabel, liveTitle, liveCaption }: MockupFields) {
  const brand = (brandName ?? "Your Brand").trim();
  const raw = (liveCaption ?? "").trim();
  const s = parseSpeech(raw);
  const speaker = s.speaker || "主講人";
  const heading = s.topic || liveTitle || title || "致辭講稿";
  const NAVY = "#1f2a4d", ACCENT = "#c0392b";

  return (
    <div className="w-full max-w-[760px] mx-auto">
      <MockupHeader icon={faNewspaper} label="CEO 致辭講稿" variantLabel={variantLabel} />

      <div className="rounded-lg overflow-hidden"
        style={{ background: "#fff", border: "1px solid #e6e6ea",
          boxShadow: "0 20px 44px -18px rgba(20,30,70,0.20)",
          fontFamily: "'Inter','Noto Sans TC',system-ui,sans-serif", color: "#222" }}>
        {/* Title bar */}
        <div className="px-8 pt-7 pb-4 border-b" style={{ borderColor: "#eee" }}>
          <h2 className="font-extrabold leading-snug" style={{ fontSize: "clamp(18px,2.6vw,24px)", color: NAVY }}>
            {heading}
          </h2>
          <p className="text-[12px] mt-1" style={{ color: "#7a7f93" }}>
            {brand} · CEO 致辭{s.occasion ? ` · ${s.occasion}` : ""}
          </p>
        </div>

        <div className="px-8 py-7 grid md:grid-cols-[200px_1fr] gap-7">
          {/* Speaker block */}
          <div>
            <div className="relative">
              <div style={{
                width: "100%", aspectRatio: "1/1", background: "#e9ecf3",
                clipPath: "polygon(12% 0,100% 0,100% 88%,88% 100%,0 100%,0 12%)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: "#aab0c4" }}>
                  {speaker.charAt(0)}
                </span>
              </div>
              <div style={{ position: "absolute", left: -6, top: -6, width: 22, height: 22,
                background: ACCENT, transform: "rotate(45deg)" }} />
            </div>
            <p className="mt-4 font-bold" style={{ fontSize: 16, color: ACCENT }}>{speaker}</p>
            <div className="mt-1 px-3 py-2 rounded" style={{ background: NAVY, color: "#fff" }}>
              <p className="text-[12px] font-semibold">{s.speakerTitle || "CEO"}</p>
              <p className="text-[11px] opacity-80">{brand}</p>
            </div>
          </div>

          {/* Talking points */}
          <div>
            <p className="text-[10px] font-bold tracking-[0.22em] uppercase mb-3" style={{ color: "#9aa0b4" }}>
              Talking Points
            </p>
            <div className="space-y-3">
              {s.points.length > 0 ? s.points.map((p, i) => (
                <div key={i} className="flex gap-3">
                  <span className="shrink-0 mt-0.5 flex items-center justify-center"
                    style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${ACCENT}`, color: ACCENT, fontSize: 10, fontWeight: 800 }}>
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-bold leading-snug" style={{ fontSize: 13, color: NAVY }}>{p.title}</p>
                    <p className="leading-relaxed mt-0.5" style={{ fontSize: 12.5, color: "#3c4257",
                      display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {p.body}
                    </p>
                  </div>
                </div>
              )) : raw ? (
                <p className="whitespace-pre-wrap leading-relaxed" style={{ fontSize: 12.5, color: "#3c4257" }}>{raw}</p>
              ) : (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((k) => (
                    <div key={k} className="flex gap-3">
                      <Skeleton className="w-5 h-5 rounded shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-[40%] rounded" />
                        <Skeleton className="h-2.5 w-full rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-8 py-3 border-t flex items-center justify-between text-[10px]"
          style={{ borderColor: "#eee", color: "#9aa0b4" }}>
          <span>{s.occasion || "企業致辭"}</span>
          <span>可編輯 · 下載講稿全文於右側工具列</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Presentation / Deck ─────────────── */

export function DeckMockup({ title, brandName, variantLabel, liveTitle, liveCaption, liveDescription, liveImageDesc }: MockupFields) {
  const brand = brandName ?? "Your Brand";
  const [slide, setSlide] = React.useState(0);

  const slides = [
    { type: "cover",   label: "封面" },
    { type: "agenda",  label: "議程" },
    { type: "content", label: "內容" },
    { type: "data",    label: "數據" },
    { type: "cta",     label: "結論" },
  ];

  const cur = slides[slide]!;

  return (
    <div className="w-full max-w-[680px] mx-auto">
      <MockupHeader icon={faChalkboard} label="簡報 / Deck" variantLabel={variantLabel} />

      {/* Slide stage */}
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-xl">
        {/* Toolbar */}
        <div className="bg-default-100 border-b border-divider px-4 py-2 flex items-center gap-3">
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-danger-300" />
            <span className="w-2.5 h-2.5 rounded-full bg-warning-300" />
            <span className="w-2.5 h-2.5 rounded-full bg-success-300" />
          </div>
          <span className="flex-1 text-tiny text-default-500 text-center">
            {brand} · {liveTitle ?? title}
          </span>
          <FontAwesomeIcon icon={faExpand} className="text-default-400 text-sm cursor-pointer" />
        </div>

        {/* Slide canvas — 16:9 */}
        <div className="aspect-[16/9] bg-gradient-to-br from-primary-600 to-primary-900 relative flex items-center justify-center overflow-hidden">
          {cur.type === "cover" && (
            <div className="text-center text-white px-12">
              <p className="text-tiny uppercase tracking-[0.3em] text-primary-200 mb-3">{brand}</p>
              <h1 className="text-3xl font-bold leading-tight mb-4">
                {liveTitle ?? title}
              </h1>
              {liveDescription ? (
                <MarkdownText content={liveDescription} className="text-primary-200 text-small max-w-[400px] mx-auto" />
              ) : (
                <div className="space-y-1.5 max-w-[360px] mx-auto">
                  <Skeleton className="h-3 w-full rounded bg-primary-400/40" />
                  <Skeleton className="h-3 w-[80%] mx-auto rounded bg-primary-400/40" />
                </div>
              )}
              <div className="mt-8 flex items-center justify-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{brand[0]?.toUpperCase()}</span>
                </div>
                <p className="text-primary-200 text-tiny">{new Date().toLocaleDateString("zh-TW")}</p>
              </div>
            </div>
          )}

          {cur.type === "agenda" && (
            <div className="px-16 py-8 w-full text-white">
              <p className="text-tiny uppercase tracking-widest text-primary-300 mb-3">今日議程</p>
              <h2 className="text-2xl font-bold mb-6">我們將討論</h2>
              <div className="space-y-3">
                {["現況分析", "策略方向", "執行計畫", "KPI 目標"].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-small font-bold shrink-0">
                      {i + 1}
                    </span>
                    <p className="text-small">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cur.type === "content" && (
            <div className="flex w-full h-full">
              <div className="flex-1 px-10 py-8 flex flex-col justify-center text-white">
                <p className="text-tiny uppercase tracking-widest text-primary-300 mb-2">核心洞察</p>
                <h2 className="text-xl font-bold mb-4 leading-snug">
                  {liveTitle ? liveTitle.slice(0, 40) : <Skeleton className="h-6 w-[70%] rounded bg-primary-400/40" />}
                </h2>
                {liveCaption ? (
                  <MarkdownText content={liveCaption} lineClamp={6} className="text-primary-100 text-small leading-relaxed" />
                ) : (
                  <div className="space-y-2">
                    {[100, 92, 85, 70].map((w, i) => (
                      <Skeleton key={i} className={`h-2.5 w-[${w}%] rounded bg-primary-400/40`} />
                    ))}
                  </div>
                )}
              </div>
              <div className="w-[45%] bg-primary-800/50 m-4 rounded-xl flex items-center justify-center">
                <div className="text-center">
                  <FontAwesomeIcon icon={faImages} className="text-primary-300 text-3xl mb-2" />
                  <p className="text-primary-400 text-tiny">{liveImageDesc ?? "示意圖"}</p>
                </div>
              </div>
            </div>
          )}

          {cur.type === "data" && (
            <div className="px-12 py-8 w-full text-white">
              <h2 className="text-xl font-bold mb-6">關鍵數據</h2>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { metric: "+124%", label: "品牌聲量成長" },
                  { metric: "3.2x",  label: "互動率提升" },
                  { metric: "89%",   label: "目標受眾觸及" },
                ].map((d, i) => (
                  <div key={i} className="bg-white/10 rounded-xl p-4 text-center">
                    <p className="text-3xl font-black mb-1">{d.metric}</p>
                    <p className="text-primary-300 text-tiny">{d.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cur.type === "cta" && (
            <div className="text-center text-white px-12">
              <h2 className="text-3xl font-bold mb-4">下一步</h2>
              {liveCaption ? (
                <MarkdownText content={liveCaption.slice(0, 120)} className="text-primary-200 text-small max-w-[400px] mx-auto mb-6" />
              ) : (
                <div className="space-y-1.5 max-w-[360px] mx-auto mb-6">
                  <Skeleton className="h-3 w-full rounded bg-primary-400/40" />
                  <Skeleton className="h-3 w-[75%] mx-auto rounded bg-primary-400/40" />
                </div>
              )}
              <Button size="md" radius="full" className="bg-white text-primary font-bold px-8">
                立即行動
              </Button>
            </div>
          )}

          {/* Slide number */}
          <div className="absolute bottom-3 right-4 text-primary-300 text-tiny">
            {slide + 1} / {slides.length}
          </div>
        </div>

        {/* Slide strip / navigator */}
        <div className="bg-default-100 border-t border-divider px-4 py-2 flex items-center gap-2 overflow-x-auto">
          {slides.map((s, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className={`shrink-0 text-tiny px-2 py-1 rounded transition ${i === slide ? "bg-primary text-white" : "text-default-500 hover:bg-default-200"}`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={() => setSlide(Math.max(0, slide - 1))}
            className="text-default-500 hover:text-foreground">
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button onClick={() => setSlide(Math.min(slides.length - 1, slide + 1))}
            className="text-default-500 hover:text-foreground">
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      </div>
    </div>
  );
}
