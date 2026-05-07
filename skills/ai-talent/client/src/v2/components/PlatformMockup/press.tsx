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
import { type MockupFields, MockupHeader, dicebear, MarkdownText } from "./shared";
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

/** Split caption into [subhead, ...bodyParagraphs]. If liveDescription is
 *  provided we use it as the subhead and treat all caption paragraphs as body. */
function splitCaption(caption: string, hasExplicitSubhead: boolean): {
  subhead: string | null;
  paragraphs: string[];
} {
  const blocks = caption.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return { subhead: null, paragraphs: [] };
  if (hasExplicitSubhead) return { subhead: null, paragraphs: blocks };
  // No explicit subhead → first block becomes subhead, rest become body
  return { subhead: blocks[0] ?? null, paragraphs: blocks.slice(1) };
}

export function PressRelease({ title, brandName, variantLabel, liveTitle, liveCaption, liveDescription }: MockupFields) {
  const brand = brandName ?? "Your Brand";
  const dateStr = (() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  })();
  const headline = liveTitle ?? title;
  const { subhead, paragraphs } = liveCaption
    ? splitCaption(liveCaption, !!liveDescription)
    : { subhead: null as string | null, paragraphs: [] as string[] };
  const finalSubhead = liveDescription ?? subhead;

  // Minimal contact derivation — uses brand slug for an obvious example.
  // Real teams replace this block in the published draft.
  const slug = brand.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const contactEmail = `press@${slug || "brand"}.com`;

  return (
    <div className="w-full max-w-[720px] mx-auto">
      <MockupHeader icon={faNewspaper} label="新聞稿" variantLabel={variantLabel} />

      {/* Cream paper sheet with soft drop shadow */}
      <div
        className="rounded-sm overflow-hidden"
        style={{
          background: "#EBE7D7",
          boxShadow: "0 24px 48px -16px rgba(0,0,0,0.18), 0 8px 16px -8px rgba(0,0,0,0.10)",
          fontFamily: "'Inter', 'Noto Sans TC', system-ui, sans-serif",
          color: "#111",
        }}
      >
        <div className="px-10 md:px-14 py-10 md:py-14">
          {/* COMPANY NAME eyebrow */}
          <p
            className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2"
            style={{ color: "#111" }}
          >
            {brand.toUpperCase()}
          </p>

          {/* PRESS RELEASE — the fixed bold title bar */}
          <h1
            className="font-black leading-none mb-5"
            style={{
              fontSize: "clamp(28px, 5vw, 44px)",
              letterSpacing: "0.01em",
              color: "#111",
            }}
          >
            PRESS RELEASE
          </h1>

          {/* Top rule */}
          <div className="border-t border-black/80 mb-7" />

          {/* Date stamp */}
          <p className="text-[11px] tabular-nums mb-7" style={{ color: "#111" }}>
            {dateStr}
          </p>

          {/* Headline */}
          {headline ? (
            <h2
              className="font-bold leading-snug mb-2"
              style={{ fontSize: "clamp(17px, 2.2vw, 22px)", color: "#111" }}
            >
              {headline}
            </h2>
          ) : (
            <Skeleton className="h-5 w-[80%] rounded mb-2" />
          )}

          {/* Subheadline (lighter weight, slightly smaller) */}
          {finalSubhead ? (
            <p
              className="leading-snug mb-7"
              style={{ fontSize: "15px", color: "#111", fontWeight: 500 }}
            >
              {finalSubhead}
            </p>
          ) : (
            <Skeleton className="h-4 w-[60%] rounded mb-7" />
          )}

          {/* Body paragraphs */}
          {paragraphs.length > 0 ? (
            <div className="space-y-4">
              {paragraphs.map((p, i) => (
                <p
                  key={i}
                  className="leading-relaxed"
                  style={{ fontSize: "12.5px", color: "#222" }}
                >
                  {p}
                </p>
              ))}
            </div>
          ) : !liveCaption ? (
            <div className="space-y-5">
              {[1, 2, 3, 4].map((p) => (
                <div key={p} className="space-y-1.5">
                  <Skeleton className="h-2.5 w-full rounded" />
                  <Skeleton className="h-2.5 w-[97%] rounded" />
                  <Skeleton className="h-2.5 w-[88%] rounded" />
                  {p === 1 && <Skeleton className="h-2.5 w-[72%] rounded" />}
                </div>
              ))}
            </div>
          ) : null}

          {/* Bottom rule */}
          <div className="border-t border-black/80 mt-10 mb-6" />

          {/* Two-column contacts (COMPANY · MEDIA CONTACT) */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-[11px] font-bold tracking-[0.12em] mb-2" style={{ color: "#111" }}>
                COMPANY
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: "#333" }}>
                {brand}<br />
                {contactEmail}<br />
                +886 2 0000 0000
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold tracking-[0.12em] mb-2" style={{ color: "#111" }}>
                MEDIA CONTACT
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: "#333" }}>
                公關聯絡人<br />
                {contactEmail}<br />
                +886 2 0000 0000
              </p>
            </div>
          </div>
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
