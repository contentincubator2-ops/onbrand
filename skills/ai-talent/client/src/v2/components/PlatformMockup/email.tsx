/**
 * Email / EDM mockups.
 * Based on Figma: EDM-Template--Community- (MptQE79Z7i58WDLIvGMOmU)
 *
 * Variants:
 *   edm      — full HTML email (header + hero + body + CTA + footer)
 *   newsletter — simpler single-column editorial
 */
import React from "react";
import { Button, Chip, Divider, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faImages, faArrowRight, faAt, faInbox } from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, handleOf, MarkdownText } from "./shared";

/* ─────────────── EDM / Full Email ─────────────── */

export function EDMMockup({ title, brandName, variantLabel, liveCaption, liveTitle, liveDescription, liveCta }: MockupFields) {
  const brand = brandName ?? "Your Brand";
  const handle = handleOf(brandName);

  return (
    <div className="w-full max-w-[600px] mx-auto">
      <MockupHeader icon={faEnvelope} label="EDM" variantLabel={variantLabel} />

      {/* Email client chrome */}
      <div className="bg-default-100 rounded-t-xl border border-divider px-4 py-2.5 flex items-center gap-3">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-danger-300" />
          <span className="w-3 h-3 rounded-full bg-warning-300" />
          <span className="w-3 h-3 rounded-full bg-success-300" />
        </div>
        <div className="flex-1 bg-content1 rounded-md px-3 py-1 text-tiny text-default-400 flex items-center gap-2">
          <FontAwesomeIcon icon={faInbox} className="text-tiny" />
          {liveTitle ? liveTitle.slice(0, 60) : "主旨行 · 等待 AI 撰寫 填入"}
        </div>
      </div>

      {/* Email body */}
      <div className="bg-content1 border-x border-b border-divider rounded-b-xl overflow-hidden shadow-lg">

        {/* Email meta bar */}
        <div className="px-5 py-3 border-b border-divider flex items-center gap-2 text-tiny text-default-500">
          <FontAwesomeIcon icon={faAt} />
          <span>來自：<strong>{brand}</strong> &lt;hello@{handle}.com&gt;</span>
          <span className="ml-auto">剛剛</span>
        </div>

        {/* Header banner */}
        <div className="bg-default-900 px-6 py-5 flex items-center justify-between">
          <p className="text-white font-bold text-[15px] tracking-tight">{brand}</p>
          <div className="flex items-center gap-3 text-default-400 text-tiny">
            <span className="hover:text-white cursor-pointer">產品</span>
            <span className="hover:text-white cursor-pointer">關於我們</span>
            <span className="hover:text-white cursor-pointer">聯絡</span>
          </div>
        </div>

        {/* Hero image */}
        <div className="aspect-[600/280] bg-gradient-to-br from-default-200 to-default-100 flex items-center justify-center relative">
          <Skeleton className="absolute inset-0 rounded-none" />
          <div className="relative z-10 text-center text-default-400 p-4">
            <FontAwesomeIcon icon={faImages} className="text-3xl mb-2" />
            <p className="text-tiny">{liveDescription ? liveDescription.slice(0, 80) : "Hero 圖 · 等待 AI 圖像"}</p>
          </div>
        </div>

        {/* Body section — text left, image right */}
        <div className="px-8 py-8">
          <h1 className="text-[22px] font-bold leading-snug tracking-tight text-foreground mb-3">
            {liveTitle ?? title ?? <Skeleton className="h-6 w-[70%] rounded" />}
          </h1>
          {liveCaption ? (
            <MarkdownText content={liveCaption} className="text-small text-default-600 leading-relaxed" />
          ) : (
            <div className="space-y-2 mt-2">
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-[94%] rounded" />
              <Skeleton className="h-3 w-[88%] rounded" />
              <Skeleton className="h-3 w-[72%] rounded" />
            </div>
          )}

          {/* CTA button */}
          <div className="mt-6">
            <Button
              size="md" radius="md"
              className="bg-foreground text-background font-semibold px-8"
              endContent={<FontAwesomeIcon icon={faArrowRight} />}
            >
              {liveCta ?? "立即了解"}
            </Button>
          </div>
        </div>

        <Divider />

        {/* Two-column feature blocks */}
        <div className="px-8 py-6 grid grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[4/3] bg-default-100 rounded-lg flex items-center justify-center">
                <FontAwesomeIcon icon={faImages} className="text-default-300 text-2xl" />
              </div>
              <Skeleton className="h-3 w-[80%] rounded" />
              <Skeleton className="h-2.5 w-full rounded opacity-60" />
              <Skeleton className="h-2.5 w-[85%] rounded opacity-60" />
            </div>
          ))}
        </div>

        <Divider />

        {/* Footer */}
        <div className="bg-default-50 px-8 py-5 text-center space-y-2">
          <p className="text-tiny text-default-500 font-semibold">{brand}</p>
          <p className="text-tiny text-default-400">
            你收到這封信是因為訂閱了 {brand} 的電子報。
          </p>
          <div className="flex items-center justify-center gap-3 text-tiny text-primary mt-2">
            <span className="cursor-pointer hover:underline">取消訂閱</span>
            <span className="text-default-300">·</span>
            <span className="cursor-pointer hover:underline">隱私政策</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Email Newsletter (simpler) ─────────────── */

export function EmailNewsletterMockup({ title, brandName, variantLabel, liveCaption, liveTitle }: MockupFields) {
  const brand = brandName ?? "Your Brand";
  return (
    <div className="w-full max-w-[560px] mx-auto">
      <MockupHeader icon={faEnvelope} label="電子報" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-6 py-4 border-b border-divider flex items-center justify-between">
          <Chip size="sm" variant="flat" color="secondary"
            startContent={<FontAwesomeIcon icon={faEnvelope} className="ml-1 text-tiny" />}>
            電子報 Issue
          </Chip>
          <span className="text-tiny text-default-400">{brand}</span>
        </div>
        <div className="px-8 py-8 space-y-4">
          <p className="text-tiny text-default-400 uppercase tracking-widest font-semibold">本期重點</p>
          <h2 className="text-2xl font-bold leading-snug">{liveTitle ?? title}</h2>
          {liveCaption ? (
            <MarkdownText content={liveCaption} className="text-small text-default-600 leading-relaxed" />
          ) : (
            <div className="space-y-2">
              {[100, 95, 88, 70].map((w, i) => (
                <Skeleton key={i} className={`h-3 w-[${w}%] rounded`} />
              ))}
            </div>
          )}
          <Button size="sm" radius="md" color="primary" variant="flat"
            endContent={<FontAwesomeIcon icon={faArrowRight} />}>
            閱讀全文
          </Button>
        </div>
        <div className="px-8 py-4 border-t border-divider bg-default-50 text-center">
          <p className="text-tiny text-default-400">{brand} · 取消訂閱</p>
        </div>
      </div>
    </div>
  );
}
