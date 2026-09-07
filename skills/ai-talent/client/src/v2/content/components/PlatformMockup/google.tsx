/**
 * Google Ads mockups.
 * Based on Figma: Google-Ads-UI-Kits (hfPip6MjwtO9QLFc9q49I4)
 *
 * Variants:
 *   search   — text-based search result ad (headline + URL + description)
 *   display  — banner / display ad (image + headline + CTA)
 *   pmax     — Performance Max card (multiple assets)
 */
import { Button, Chip, Divider, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { faImages, faMagnifyingGlass, faArrowUpRightFromSquare, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader } from "./shared";

/* ─────────────── Google Search Ad ─────────────── */

export function GoogleSearchAd({ title, brandName, variantLabel, liveTitle, liveDescription, liveCta }: MockupFields) {
  const displayUrl = `www.${(brandName ?? "yourbrand").toLowerCase().replace(/\s+/g, "")}.com`;

  return (
    <div className="w-full max-w-[600px] mx-auto">
      <MockupHeader icon={faGoogle} label="Google 搜尋廣告" variantLabel={variantLabel} />

      {/* Google SERP chrome */}
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        {/* Search bar simulation */}
        <div className="px-4 py-3 border-b border-divider flex items-center gap-3 bg-default-50">
          <FontAwesomeIcon icon={faGoogle} className="text-xl" />
          <div className="flex-1 bg-content1 border border-divider rounded-full px-4 py-2 text-small text-default-500 flex items-center gap-2">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="text-tiny" />
            {liveTitle ? liveTitle.slice(0, 40) + "…" : "搜尋關鍵字"}
          </div>
        </div>

        {/* Ads label */}
        <div className="px-4 pt-4 pb-1">
          <span className="text-tiny border border-default-400 text-default-500 rounded px-1 py-0.5 mr-1">廣告</span>
          <span className="text-tiny text-default-400">贊助商</span>
        </div>

        {/* Ad result card */}
        <div className="px-4 pb-5">
          {/* Advertiser */}
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
              <span className="text-white text-tiny font-bold">
                {(brandName ?? "B")[0]?.toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-tiny text-foreground font-medium">{brandName ?? "Your Brand"}</p>
              <p className="text-tiny text-default-400">{displayUrl} ▾</p>
            </div>
          </div>

          {/* Headline — up to 3 parts */}
          {liveTitle ? (
            <a className="text-[18px] font-normal text-primary hover:underline leading-snug block mb-1">
              {liveTitle}
            </a>
          ) : (
            <div className="space-y-1 mb-2">
              <Skeleton className="h-5 w-[60%] rounded" />
            </div>
          )}

          {/* Description */}
          {liveDescription ? (
            <p className="text-small text-default-700 leading-normal">{liveDescription}</p>
          ) : (
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-[85%] rounded" />
            </div>
          )}

          {/* Sitelinks */}
          <div className="mt-3 flex flex-wrap gap-3">
            {["了解更多", "立即購買", "聯絡我們", "查看方案"].map((sl) => (
              <a key={sl} className="text-tiny text-primary hover:underline flex items-center gap-1 cursor-pointer">
                {sl} <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-[9px]" />
              </a>
            ))}
          </div>
        </div>

        <Divider />

        {/* Second organic-looking result (grey out) */}
        <div className="px-4 py-4 opacity-30">
          <Skeleton className="h-3 w-[30%] rounded mb-2" />
          <Skeleton className="h-4 w-[55%] rounded mb-2" />
          <Skeleton className="h-3 w-[90%] rounded" />
          <Skeleton className="h-3 w-[70%] rounded mt-1" />
        </div>
        <div className="px-4 pb-4 opacity-20">
          <Skeleton className="h-3 w-[28%] rounded mb-2" />
          <Skeleton className="h-4 w-[50%] rounded mb-2" />
          <Skeleton className="h-3 w-[88%] rounded" />
        </div>
      </div>

      {/* Quality score hint */}
      <div className="mt-2 flex items-center gap-1.5 text-tiny text-default-400 px-1">
        <FontAwesomeIcon icon={faCircleInfo} />
        <span>Headline × 3 + Description × 2 → Google 自動組合展示</span>
      </div>
    </div>
  );
}

/* ─────────────── Google Display Ad ─────────────── */

export function GoogleDisplayAd({ title, brandName, variantLabel, liveTitle, liveDescription, liveImageDesc, liveCta }: MockupFields) {
  const brand = brandName ?? "Your Brand";

  return (
    <div className="w-full max-w-[540px] mx-auto">
      <MockupHeader icon={faGoogle} label="Google 多媒體廣告" variantLabel={variantLabel} />

      {/* Website context simulation */}
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        {/* Fake webpage chrome */}
        <div className="bg-default-50 border-b border-divider px-4 py-2 flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-default-300" />
            <span className="w-2.5 h-2.5 rounded-full bg-default-300" />
            <span className="w-2.5 h-2.5 rounded-full bg-default-300" />
          </div>
          <div className="flex-1 bg-content1 rounded px-2 py-0.5 text-tiny text-default-400">
            example-website.com/article
          </div>
        </div>

        <div className="p-4 flex gap-4">
          {/* Fake article content */}
          <div className="flex-1 space-y-2 opacity-30">
            <Skeleton className="h-4 w-[70%] rounded" />
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-[92%] rounded" />
            <Skeleton className="h-3 w-[85%] rounded" />
            <div className="h-2" />
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-[78%] rounded" />
          </div>

          {/* Display ad unit — 300×250 Medium Rectangle */}
          <div className="w-[220px] shrink-0">
            <div className="border border-default-200 rounded-lg overflow-hidden">
              <div className="text-right px-1 pt-0.5">
                <span className="text-[9px] text-default-400">廣告</span>
              </div>

              {/* Ad image */}
              <div className="aspect-[4/3] bg-gradient-to-br from-primary-100 to-secondary-100 flex items-center justify-center relative">
                <Skeleton className="absolute inset-0 rounded-none" />
                <div className="relative z-10 text-center p-2">
                  <FontAwesomeIcon icon={faImages} className="text-2xl text-default-400 mb-1" />
                  <p className="text-[10px] text-default-500 line-clamp-2">
                    {liveImageDesc ?? "廣告圖 · 等待 AI 圖像"}
                  </p>
                </div>
              </div>

              {/* Ad body */}
              <div className="bg-content1 px-3 py-2.5">
                <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
                  {liveTitle ?? title}
                </p>
                {liveDescription ? (
                  <p className="text-[11px] text-default-500 mt-1 line-clamp-2">{liveDescription}</p>
                ) : (
                  <div className="space-y-1 mt-1">
                    <Skeleton className="h-2.5 w-full rounded" />
                    <Skeleton className="h-2.5 w-[80%] rounded" />
                  </div>
                )}
                <div className="mt-2">
                  <span className="text-[11px] text-default-400">{(brand).toLowerCase().replace(/\s+/g, "")}.com</span>
                </div>
                <Button size="sm" color="primary" radius="md" className="w-full mt-2 text-[11px] h-7">
                  {liveCta ?? "了解更多"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-tiny text-default-400 px-1">
        <FontAwesomeIcon icon={faCircleInfo} />
        <span>300×250 Medium Rectangle — 最高曝光量的展示廣告格式</span>
      </div>
    </div>
  );
}

/* ─────────────── Google PMax ─────────────── */

export function GooglePMax({ title, brandName, variantLabel, liveTitle, liveDescription, liveImageDesc, liveCta }: MockupFields) {
  return (
    <div className="w-full max-w-[560px] mx-auto">
      <MockupHeader icon={faGoogle} label="Google PMax" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faGoogle} className="text-xl" />
          <div>
            <p className="text-small font-semibold">{brandName ?? "Your Brand"}</p>
            <p className="text-tiny text-default-400">Performance Max Campaign</p>
          </div>
          <Chip size="sm" color="success" variant="flat" className="ml-auto">啟用中</Chip>
        </div>
        <Divider />
        <div className="grid grid-cols-3 gap-3">
          {["Headline 1", "Headline 2", "Headline 3"].map((h, i) => (
            <div key={i} className="border border-dashed border-default-300 rounded-lg p-2 text-center">
              <p className="text-tiny text-default-400 mb-1">{h}</p>
              {liveTitle && i === 0 ? (
                <p className="text-tiny font-medium line-clamp-2">{liveTitle.slice(0, 30)}</p>
              ) : (
                <Skeleton className="h-3 w-full rounded" />
              )}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {["Description 1", "Description 2"].map((d, i) => (
            <div key={i} className="border border-dashed border-default-300 rounded-lg p-2">
              <p className="text-tiny text-default-400 mb-1">{d}</p>
              {liveDescription && i === 0 ? (
                <p className="text-tiny line-clamp-3">{liveDescription.slice(0, 60)}</p>
              ) : (
                <div className="space-y-1">
                  <Skeleton className="h-2.5 w-full rounded" />
                  <Skeleton className="h-2.5 w-[80%] rounded" />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="aspect-[16/5] bg-default-100 rounded-xl flex items-center justify-center relative">
          <Skeleton className="absolute inset-0 rounded-xl" />
          <div className="relative z-10 text-center">
            <FontAwesomeIcon icon={faImages} className="text-2xl text-default-400 mb-1" />
            <p className="text-tiny text-default-400">{liveImageDesc ?? "素材圖片 (多格式) · 等待 AI 圖像"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
