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

  // Headline resolution: explicit liveTitle wins; else the FIRST block of
  // liveCaption (the 新聞稿標題 task emits a single line → that's the
  // headline); else the run title. Remaining blocks become body.
  const blocks = (liveCaption ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const headline = (liveTitle ?? blocks[0] ?? title ?? "").trim();
  const deck = liveDescription ?? (blocks.length > 1 ? blocks[1]! : null);
  const bodyParas = blocks.slice(liveTitle ? 0 : (deck && !liveDescription ? 2 : 1));

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

          {/* ── Lead headline ── */}
          {headline ? (
            <h2
              className="text-center font-black mb-3"
              style={{ fontSize: "clamp(22px, 3.6vw, 38px)", lineHeight: 1.18, letterSpacing: "0.005em" }}
            >
              {headline}
            </h2>
          ) : (
            <div className="flex flex-col items-center gap-2 mb-3">
              <Skeleton className="h-7 w-[85%] rounded" />
              <Skeleton className="h-7 w-[60%] rounded" />
            </div>
          )}

          {/* Deck / subhead — italic, centered, between hairlines */}
          {deck ? (
            <>
              <div className="border-t border-black/60 w-1/3 mx-auto mb-2" />
              <p className="text-center italic mb-5" style={{ fontSize: "14px", color: "#333" }}>
                {deck}
              </p>
            </>
          ) : (
            <p className="text-center text-[11px] tracking-[0.18em] uppercase mb-5" style={{ color: "#777" }}>
              ——  特訊  ——
            </p>
          )}

          {/* Byline rule */}
          <div className="flex items-center justify-between text-[10px] mb-3 pb-1 border-b border-black/40" style={{ color: "#555" }}>
            <span>本報訊　{brand} 提供</span>
            <span>{dateStr}</span>
          </div>

          {/* ── Body: two justified columns. Real body if present, else
              tasteful greeked filler so the front page reads like a
              printed mockup (the 標題 task has no body). ── */}
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
