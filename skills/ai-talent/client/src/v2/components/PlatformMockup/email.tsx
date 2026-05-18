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
import { faEnvelope, faArrowRight, faAt, faInbox } from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, handleOf, MarkdownText } from "./shared";

/* ─────────────── EDM / Full Email ─────────────── */

export function EDMMockup({ title, brandName, variantLabel, liveCaption, liveTitle, liveCta, liveImageUrl, liveImageStatus }: MockupFields) {
  const brand = brandName ?? "Your Brand";
  const handle = handleOf(brandName);
  const hasHeroImg = !!liveImageUrl && liveImageStatus !== "failed";
  // 2026-05-18 (CJ 驗收 P0「主旨行全空白」): the launch-sequence prompt
  // now emits "主旨：…\n預覽：…\n\n<body>". Parse it so the EDM mockup
  // shows the real subject + preview text and a clean body.
  const _cap = liveCaption ?? "";
  const _subjM = _cap.match(/^\s*主旨[：:]\s*(.+)$/m);
  const _prevM = _cap.match(/^\s*預覽(?:文字)?[：:]\s*(.+)$/m);
  const subject = (liveTitle ?? _subjM?.[1]?.trim() ?? title ?? "").trim();
  const previewText = _prevM?.[1]?.trim() ?? "";
  const bodyText = _cap
    .replace(/^\s*主旨[：:].*$/m, "")
    .replace(/^\s*預覽(?:文字)?[：:].*$/m, "")
    .replace(/^\s+/, "")
    .trim();

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
          {subject ? subject.slice(0, 60) : "主旨行 · 等待 AI 撰寫 填入"}
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

        {/* Hero image — 2026-05-17 (CJ「圖片產出後放進 mockup 對應
            欄位；不需要圖片的任務不要顯示圖片欄」): email tasks never
            auto-generate a hero (runImageGen=false); it only exists if
            the user generated one via 改配圖. So render the hero ONLY
            when an actual image exists — no misleading「等待 AI 圖像」
            placeholder for text-only email tasks. */}
        {hasHeroImg && (
          <div className="aspect-[600/280] relative overflow-hidden">
            <img src={liveImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          </div>
        )}

        {/* Body section — text left, image right */}
        <div className="px-8 py-8">
          <h1 className="text-[22px] font-bold leading-snug tracking-tight text-foreground mb-1">
            {subject || <Skeleton className="h-6 w-[70%] rounded" />}
          </h1>
          {previewText && (
            <p className="text-tiny text-default-400 mb-3 italic">{previewText}</p>
          )}
          {bodyText ? (
            <MarkdownText content={bodyText} className="text-small text-default-600 leading-relaxed" />
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

        {/* 2026-05-17 (CJ): removed the two decorative feature-image
            blocks — they had no data source and rendered as permanent
            empty skeletons, cluttering every EDM preview. */}

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

/* ─────────────── KOL / 1:1 Outreach Email ───────────────
 *
 * 2026-05-16 (CJ「KOL類別…我想要用的是email的mockup，就是有收件人，
 * 寄件人，有主旨標題，而內文也應該更文情並茂」):
 * A personal outreach letter — NOT a marketing EDM. No hero image,
 * no feature grid, no unsubscribe footer. Clean 寄件人 / 收件人 / 主旨
 * header + a generously-spaced letter body so the copy reads as a
 * heartfelt 1:1 invitation.
 */
export function KOLEmailMockup({
  title, brandName, variantLabel, liveCaption, liveTitle, slotMap,
}: MockupFields) {
  const brand = brandName ?? "你的品牌";
  const handle = handleOf(brandName);
  const slotCap = slotMap?.caption;
  const captionLoading = slotCap?.status === "loading";
  const body =
    (typeof slotCap?.value === "string" ? slotCap.value : undefined) ??
    liveCaption ??
    "";
  const subject = (liveTitle ?? title ?? "").trim();

  return (
    <div className="w-full max-w-[600px] mx-auto">
      <MockupHeader icon={faEnvelope} label="Email" variantLabel={variantLabel} />

      {/* Email client chrome */}
      <div className="bg-default-100 rounded-t-xl border border-divider px-4 py-2.5 flex items-center gap-3">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-danger-300" />
          <span className="w-3 h-3 rounded-full bg-warning-300" />
          <span className="w-3 h-3 rounded-full bg-success-300" />
        </div>
        <div className="flex-1 bg-content1 rounded-md px-3 py-1 text-tiny text-default-400 flex items-center gap-2">
          <FontAwesomeIcon icon={faInbox} className="text-tiny" />
          {subject ? subject.slice(0, 60) : "主旨 · 等待 AI 撰寫"}
        </div>
      </div>

      <div className="bg-content1 border-x border-b border-divider rounded-b-xl overflow-hidden shadow-lg">
        {/* Header meta — 寄件人 / 收件人 / 主旨 */}
        <div className="px-6 py-4 border-b border-divider space-y-1.5 text-small">
          <div className="flex gap-2">
            <span className="text-default-400 w-12 shrink-0">寄件人</span>
            <span className="text-foreground">
              <strong>{brand}</strong>
              <span className="text-default-400"> &lt;hello@{handle}.com&gt;</span>
            </span>
          </div>
          <div className="flex gap-2">
            <span className="text-default-400 w-12 shrink-0">收件人</span>
            <span className="text-foreground">合作 KOL／創作者 &lt;creator@example.com&gt;</span>
          </div>
          <div className="flex gap-2">
            <span className="text-default-400 w-12 shrink-0">主旨</span>
            <span className="text-foreground font-semibold">
              {subject || <span className="text-default-300 font-normal">（等待 AI 撰寫主旨）</span>}
            </span>
          </div>
        </div>

        {/* Letter body */}
        <div className="px-8 py-7">
          {body.trim() ? (
            <MarkdownText
              content={body}
              className="text-[15px] text-default-700 leading-loose whitespace-pre-wrap"
            />
          ) : captionLoading ? (
            <div className="space-y-2.5">
              {[100, 96, 90, 100, 84, 70].map((w, i) => (
                <Skeleton key={i} className="h-3 rounded" style={{ width: `${w}%` }} />
              ))}
              <div className="flex items-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
                <span className="text-[10px] text-primary/70">Agent 撰寫中…</span>
              </div>
            </div>
          ) : (
            <p className="text-small text-default-400">尚無內容</p>
          )}

          {body.trim() && (
            <p className="mt-7 text-small text-default-500">
              誠摯期待你的回覆，<br />
              <strong className="text-foreground">{brand}</strong> 敬上
            </p>
          )}
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
