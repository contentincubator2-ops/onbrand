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

/* ─────────────── Press Release ─────────────── */

export function PressRelease({ title, brandName, variantLabel, liveTitle, liveCaption, liveDescription }: MockupFields) {
  const brand = brandName ?? "Your Brand";
  const today = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="w-full max-w-[680px] mx-auto">
      <MockupHeader icon={faNewspaper} label="新聞稿" variantLabel={variantLabel} />

      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-xl">
        {/* PR header band */}
        <div className="bg-foreground px-8 py-4 flex items-center justify-between">
          <p className="text-background font-bold text-[15px] tracking-tight">{brand}</p>
          <Chip size="sm" variant="flat" className="bg-background/20 text-background border-background/30">
            新聞稿 · 即時發佈
          </Chip>
        </div>

        {/* Document body */}
        <div className="px-10 py-8">
          {/* FOR IMMEDIATE RELEASE */}
          <p className="text-tiny font-bold text-default-500 uppercase tracking-widest mb-4">
            FOR IMMEDIATE RELEASE / 即時新聞
          </p>

          {/* Headline */}
          <h1 className="text-[26px] font-bold leading-snug tracking-tight mb-2">
            {liveTitle ?? title}
          </h1>

          {/* Subheadline / lede */}
          {liveDescription ? (
            <MarkdownText content={liveDescription} className="text-[15px] text-default-600 leading-relaxed italic mb-4" />
          ) : (
            <div className="space-y-1.5 mb-4">
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-[88%] rounded" />
            </div>
          )}

          {/* Dateline */}
          <div className="flex items-center gap-2 text-tiny text-default-500 mb-6">
            <FontAwesomeIcon icon={faCalendarDays} />
            <span>{today}</span>
            <span>–</span>
            <FontAwesomeIcon icon={faBuilding} />
            <span>台北</span>
          </div>

          <Divider className="mb-6" />

          {/* Body */}
          {liveCaption ? (
            <article className="prose prose-sm max-w-none text-foreground prose-p:leading-relaxed prose-p:text-foreground prose-headings:font-semibold">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{liveCaption}</ReactMarkdown>
            </article>
          ) : (
            <div className="space-y-6">
              {[1, 2, 3].map((p) => (
                <div key={p} className="space-y-2">
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-[97%] rounded" />
                  <Skeleton className="h-3 w-[92%] rounded" />
                  {p === 1 && <Skeleton className="h-3 w-[78%] rounded" />}
                </div>
              ))}
              {/* Quote block skeleton */}
              <div className="border-l-4 border-primary pl-4 space-y-2">
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-[85%] rounded" />
                <Skeleton className="h-3 w-[45%] rounded opacity-50" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-[88%] rounded" />
              </div>
            </div>
          )}

          <Divider className="my-6" />

          {/* Boilerplate */}
          <div className="space-y-2">
            <p className="text-tiny font-bold text-default-500 uppercase tracking-widest">關於 {brand}</p>
            <p className="text-small text-default-600 leading-relaxed">
              {brand} 是一家專注於數位行銷與品牌成長的專業機構，協助品牌在多元平台上建立強大的市場影響力。
            </p>
          </div>

          <Divider className="my-6" />

          {/* Contact */}
          <div className="space-y-2">
            <p className="text-tiny font-bold text-default-500 uppercase tracking-widest">媒體聯絡</p>
            <div className="flex items-center gap-2 text-small text-default-600">
              <FontAwesomeIcon icon={faEnvelope} className="text-default-400" />
              <span>press@{brand.toLowerCase().replace(/\s+/g, "")}.com</span>
            </div>
            <div className="flex items-center gap-2 text-small text-default-600">
              <FontAwesomeIcon icon={faPhone} className="text-default-400" />
              <span>+886-2-XXXX-XXXX</span>
            </div>
          </div>

          <p className="text-center text-tiny text-default-400 mt-8">###</p>
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
