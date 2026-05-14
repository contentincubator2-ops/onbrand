/**
 * Website / Landing Page mockups.
 *
 * Variants:
 *   landing   — hero + features + CTA landing page
 *   blog      — blog article post
 *   product   — e-commerce product page
 */
import React from "react";
import { Button, Chip, Divider, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGlobe, faImages, faArrowRight, faCheck, faStar,
  faMagnifyingGlass, faBarsStaggered, faCirclePlay,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, handleOf } from "./shared";

/* ─────────────── Landing Page ─────────────── */

export function WebLanding({ title, brandName, variantLabel, liveTitle, liveDescription, liveCaption, liveCta, liveImageDesc }: MockupFields) {
  const brand = brandName ?? "Your Brand";
  const domain = `${handleOf(brandName)}.com`;
  const features = ["快速上手", "專業支援", "安全可靠", "彈性方案"];

  return (
    <div className="w-full max-w-[680px] mx-auto">
      <MockupHeader icon={faGlobe} label="官方網站" variantLabel={variantLabel} />

      {/* Browser chrome */}
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-xl">
        <div className="bg-default-100 border-b border-divider px-4 py-2.5 flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-danger-300" />
            <span className="w-3 h-3 rounded-full bg-warning-300" />
            <span className="w-3 h-3 rounded-full bg-success-300" />
          </div>
          <div className="flex-1 bg-content1 border border-divider rounded-md px-3 py-1 text-tiny text-default-400 flex items-center gap-1.5">
            <FontAwesomeIcon icon={faGlobe} className="text-[10px] text-success" />
            {domain}
          </div>
        </div>

        {/* Nav */}
        <div className="bg-content1 border-b border-divider px-6 py-3 flex items-center justify-between">
          <p className="font-bold text-small text-foreground">{brand}</p>
          <div className="flex items-center gap-5 text-tiny text-default-600">
            <span className="cursor-pointer hover:text-foreground">產品</span>
            <span className="cursor-pointer hover:text-foreground">方案</span>
            <span className="cursor-pointer hover:text-foreground">關於</span>
            <span className="cursor-pointer hover:text-foreground">部落格</span>
          </div>
          <Button size="sm" color="primary" radius="md" className="text-tiny">
            {liveCta ?? "免費試用"}
          </Button>
        </div>

        {/* Hero section */}
        <div className="px-10 py-12 text-center bg-gradient-to-b from-primary-50/30 to-content1">
          <Chip size="sm" variant="flat" color="primary" className="mb-4">
            🚀 全新上線
          </Chip>
          <h1 className="text-3xl font-bold tracking-tight leading-tight mb-4">
            {liveTitle ?? title ?? <Skeleton className="h-8 w-[70%] mx-auto rounded" />}
          </h1>
          {liveDescription ? (
            <p className="text-default-600 text-small max-w-[440px] mx-auto leading-relaxed">
              {liveDescription}
            </p>
          ) : (
            <div className="space-y-2 max-w-[400px] mx-auto">
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-[85%] mx-auto rounded" />
            </div>
          )}
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button color="primary" size="md" radius="lg" endContent={<FontAwesomeIcon icon={faArrowRight} />}>
              {liveCta ?? "立即開始"}
            </Button>
            <Button variant="bordered" size="md" radius="lg" startContent={<FontAwesomeIcon icon={faCirclePlay} />}>
              觀看示範
            </Button>
          </div>
        </div>

        {/* Hero image */}
        <div className="mx-6 aspect-[16/7] bg-default-100 rounded-xl flex items-center justify-center relative overflow-hidden mb-8">
          <Skeleton className="absolute inset-0 rounded-none" />
          <div className="relative z-10 text-center p-4">
            <FontAwesomeIcon icon={faImages} className="text-3xl text-default-300 mb-2" />
            <p className="text-tiny text-default-400">{liveImageDesc ?? "Hero 圖 · 等待 AI 圖像"}</p>
          </div>
        </div>

        {/* Features grid */}
        <div className="px-6 pb-8">
          <p className="text-center text-tiny font-semibold uppercase tracking-widest text-default-400 mb-5">核心功能</p>
          <div className="grid grid-cols-2 gap-4">
            {features.map((f, i) => (
              <div key={i} className="border border-divider rounded-xl p-4 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center">
                  <FontAwesomeIcon icon={faCheck} className="text-primary text-sm" />
                </div>
                <p className="text-small font-semibold">{f}</p>
                <Skeleton className="h-2.5 w-full rounded opacity-50" />
                <Skeleton className="h-2.5 w-[80%] rounded opacity-50" />
              </div>
            ))}
          </div>
        </div>

        {/* CTA band */}
        <div className="bg-primary px-6 py-8 text-center text-white">
          <h2 className="text-xl font-bold mb-2">{liveCaption ? liveCaption.slice(0, 50) : "準備好了嗎？"}</h2>
          <p className="text-primary-200 text-small mb-4">免費試用 14 天 · 無需信用卡</p>
          <Button size="md" radius="lg" className="bg-white text-primary font-semibold">
            {liveCta ?? "立即免費試用"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Blog Post ─────────────── */

export function WebBlog({ title, brandName, variantLabel, liveTitle, liveCaption, liveImageDesc }: MockupFields) {
  const brand = brandName ?? "Your Brand";

  return (
    <div className="w-full max-w-[660px] mx-auto">
      <MockupHeader icon={faGlobe} label="部落格文章" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-xl">
        <div className="bg-default-100 border-b border-divider px-4 py-2 flex items-center gap-3">
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-danger-300" />
            <span className="w-2.5 h-2.5 rounded-full bg-warning-300" />
            <span className="w-2.5 h-2.5 rounded-full bg-success-300" />
          </div>
          <div className="flex-1 flex items-center gap-2 text-tiny text-default-400 bg-content1 rounded px-2 py-0.5">
            <FontAwesomeIcon icon={faGlobe} className="text-[10px]" />
            {handleOf(brandName)}.com/blog
          </div>
        </div>
        {/* Article */}
        <div className="px-10 py-10">
          <div className="flex items-center gap-2 mb-4">
            <Chip size="sm" variant="flat" color="secondary">行銷策略</Chip>
            <span className="text-tiny text-default-400">· 5 分鐘閱讀</span>
          </div>
          <h1 className="text-[28px] font-bold leading-snug tracking-tight mb-3">
            {liveTitle ?? title}
          </h1>
          <div className="flex items-center gap-2 mb-5 text-tiny text-default-500">
            <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-primary font-bold text-[10px]">
              {(brand)[0]?.toUpperCase()}
            </div>
            <span>{brand} 行銷團隊</span>
            <span>·</span>
            <span>{new Date().toLocaleDateString("zh-TW")}</span>
          </div>
          <div className="aspect-[16/7] bg-default-100 rounded-xl mb-6 flex items-center justify-center relative overflow-hidden">
            <Skeleton className="absolute inset-0 rounded-none" />
            <div className="relative z-10 text-center">
              <FontAwesomeIcon icon={faImages} className="text-2xl text-default-300" />
              <p className="text-tiny text-default-400 mt-1">{liveImageDesc ?? "封面圖"}</p>
            </div>
          </div>
          {liveCaption ? (
            <div className="prose prose-sm max-w-none text-foreground">
              <p className="leading-relaxed whitespace-pre-wrap">{liveCaption}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {[100, 96, 92, 88, 70].map((w, i) => (
                <Skeleton key={i} className={`h-3 w-[${w}%] rounded`} />
              ))}
              <div className="h-2" />
              {[95, 90, 85, 60].map((w, i) => (
                <Skeleton key={i} className={`h-3 w-[${w}%] rounded`} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Product Page ─────────────── */

export function WebProduct({ title, brandName, variantLabel, liveTitle, liveDescription, liveCta, liveImageDesc }: MockupFields) {
  const brand = brandName ?? "Your Brand";

  return (
    <div className="w-full max-w-[660px] mx-auto">
      <MockupHeader icon={faGlobe} label="產品頁面" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-xl">
        <div className="bg-default-100 border-b border-divider px-4 py-2 flex items-center gap-3">
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-danger-300" />
            <span className="w-2.5 h-2.5 rounded-full bg-warning-300" />
            <span className="w-2.5 h-2.5 rounded-full bg-success-300" />
          </div>
          <div className="flex-1 flex items-center gap-2 text-tiny text-default-400 bg-content1 rounded px-2 py-0.5">
            <FontAwesomeIcon icon={faGlobe} className="text-[10px]" />
            {handleOf(brandName)}.com/product
          </div>
        </div>
        <div className="p-6 grid grid-cols-2 gap-6">
          {/* Product image */}
          <div className="aspect-square bg-default-100 rounded-xl flex items-center justify-center relative overflow-hidden">
            <Skeleton className="absolute inset-0 rounded-none" />
            <div className="relative z-10 text-center">
              <FontAwesomeIcon icon={faImages} className="text-3xl text-default-300" />
              <p className="text-tiny text-default-400 mt-1">{liveImageDesc ?? "產品圖"}</p>
            </div>
          </div>
          {/* Product info */}
          <div className="space-y-3">
            <p className="text-tiny text-default-400 uppercase tracking-widest">{brand}</p>
            <h1 className="text-xl font-bold leading-snug">{liveTitle ?? title}</h1>
            <div className="flex items-center gap-1 text-warning">
              {[1,2,3,4,5].map(i => <FontAwesomeIcon key={i} icon={faStar} className="text-sm" />)}
              <span className="text-tiny text-default-400 ml-1">(128)</span>
            </div>
            <div className="text-2xl font-bold">NT$ 1,980</div>
            {liveDescription ? (
              <p className="text-small text-default-600 leading-relaxed">{liveDescription}</p>
            ) : (
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-[88%] rounded" />
                <Skeleton className="h-3 w-[72%] rounded" />
              </div>
            )}
            <Button color="primary" size="md" radius="lg" className="w-full font-semibold">
              {liveCta ?? "立即購買"}
            </Button>
            <Button variant="bordered" size="md" radius="lg" className="w-full">
              加入購物車
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
