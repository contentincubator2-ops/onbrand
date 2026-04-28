/**
 * LinkedIn mockups.
 * PR2.2: feed, article, newsletter, poll, document
 *        (native-video / ad / event still fall to feed/article)
 * References (MIT):
 *   - feed:       saddamarbaa/LinkedIn-clone-app-react-typescript Feeds/Post.tsx
 *   - article:    Flowbite Blocks publisher/article
 *   - newsletter: Flowbite Blocks marketing/newsletter
 *   - poll:       Flowbite radio + animated progress bars
 *   - document:   Flowbite Carousel of PDF page thumbnails
 */
import React from "react";
import { Avatar, Button, Divider, Skeleton, User } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLinkedin } from "@fortawesome/free-brands-svg-icons";
import {
  faImages, faThumbsUp, faComment, faShareNodes, faPaperPlane,
  faFileLines, faNewspaper, faChartSimple, faCircle, faCircleDot,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, dicebear } from "./shared";

/* ─────────────── LI Feed ─────────────── */

export function LIFeed({ title, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[540px] mx-auto">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 flex items-center justify-between">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={
              <span className="block">
                <span className="text-tiny text-default-500">追蹤者 1,234 · 1 小時前 · 🌐</span>
              </span>
            }
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
          <span className="text-default-400 text-medium">⋯</span>
        </div>
        <div className="px-4 pb-3 space-y-2">
          <p className="text-small">{title}</p>
          <Skeleton className="h-2.5 w-[92%] rounded" />
          <Skeleton className="h-2.5 w-[85%] rounded" />
          <Skeleton className="h-2.5 w-[60%] rounded" />
          <p className="text-tiny text-primary mt-1">#hashtag #等寫手</p>
        </div>
        <div className="aspect-[16/9] bg-default-100 flex items-center justify-center text-default-400 relative">
          <Skeleton className="absolute inset-0" />
          <div className="text-center relative z-10">
            <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
            <p className="text-tiny">圖 / 文件 / 影片 · 等待 craft agent</p>
          </div>
        </div>
        <div className="px-4 py-2 flex items-center justify-between text-tiny text-default-500">
          <span>👍❤️💡 1,234</span>
          <span>87 則留言 · 23 次轉發</span>
        </div>
        <Divider />
        <div className="px-2 py-1 flex items-center justify-around text-default-700 text-small">
          {[
            { icon: faThumbsUp, label: "讚" },
            { icon: faComment, label: "留言" },
            { icon: faShareNodes, label: "轉發" },
            { icon: faPaperPlane, label: "傳送" },
          ].map((b, i) => (
            <button key={i} className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
              <FontAwesomeIcon icon={b.icon} /> {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LI Article ─────────────── */

export function LIArticle({ title, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[640px] mx-auto">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="aspect-[3/1] bg-default-100 flex items-center justify-center relative">
          <Skeleton className="absolute inset-0" />
          <div className="relative z-10 text-center text-default-400">
            <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
            <p className="text-tiny">封面圖 · 等待 craft agent</p>
          </div>
        </div>
        <div className="px-8 py-6 space-y-3">
          <h2 className="text-2xl font-semibold leading-tight tracking-tight">{title}</h2>
          <div className="flex items-center gap-3 pt-1">
            <Avatar src={dicebear(brandName ?? "brand")} size="md" isBordered color="primary" />
            <div>
              <p className="text-small font-semibold">{brandName ?? "Your Brand"}</p>
              <p className="text-tiny text-default-500">3,456 位追蹤者 · 5 分鐘閱讀</p>
            </div>
          </div>
          <Divider />
          <div className="space-y-2.5">
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-[96%] rounded" />
            <Skeleton className="h-3 w-[92%] rounded" />
          </div>
          <div className="pt-2">
            <p className="text-medium font-semibold mb-1.5">章節一</p>
            <div className="space-y-2">
              <Skeleton className="h-3 w-[90%] rounded" />
              <Skeleton className="h-3 w-[85%] rounded" />
            </div>
          </div>
          <div className="pt-2">
            <p className="text-medium font-semibold mb-1.5">章節二</p>
            <div className="space-y-2">
              <Skeleton className="h-3 w-[88%] rounded" />
              <Skeleton className="h-3 w-[80%] rounded" />
            </div>
          </div>
        </div>
        <div className="px-8 py-3 border-t border-divider flex items-center gap-4 text-default-500 text-tiny">
          <span>👍 喜歡</span>
          <span>💬 留言</span>
          <span>↗ 轉發</span>
          <span className="ml-auto">1.2K 次閱讀</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LI Newsletter (article + subscribe CTA) ─────────────── */

export function LINewsletter({ title, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[640px] mx-auto">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-6 py-4 flex items-center gap-3 border-b border-divider bg-primary-50">
          <span className="w-12 h-12 rounded-medium bg-primary text-white flex items-center justify-center">
            <FontAwesomeIcon icon={faNewspaper} className="text-2xl" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-small font-bold text-primary uppercase tracking-wider">電子報 · NEWSLETTER</p>
            <p className="text-medium font-semibold truncate">{brandName ?? "Your Brand"} Insights</p>
            <p className="text-tiny text-default-500">每週四 · 1,234 位訂閱者</p>
          </div>
          <Button color="primary" size="sm" radius="full">訂閱</Button>
        </div>
        <div className="aspect-[3/1] bg-default-100 flex items-center justify-center relative">
          <Skeleton className="absolute inset-0" />
          <div className="relative z-10 text-center text-default-400">
            <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
            <p className="text-tiny">本期封面 · 等待 craft agent</p>
          </div>
        </div>
        <div className="px-8 py-6 space-y-3">
          <p className="text-tiny text-default-500 uppercase tracking-wider">第 042 期 · 5 月 15 日</p>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight">{title}</h2>
          <Divider />
          <div className="space-y-2.5">
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-[96%] rounded" />
            <Skeleton className="h-3 w-[88%] rounded" />
            <Skeleton className="h-3 w-[72%] rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LI Poll ─────────────── */

export function LIPoll({ title, brandName, variantLabel }: MockupFields) {
  const options = [
    { text: "選項 A", pct: 42, leading: true },
    { text: "選項 B", pct: 28, leading: false },
    { text: "選項 C", pct: 18, leading: false },
    { text: "選項 D", pct: 12, leading: false },
  ];
  return (
    <div className="w-full max-w-[540px] mx-auto">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 flex items-center justify-between">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={<span className="text-tiny text-default-500">追蹤者 1,234 · 投票 · 結束於 6 天後</span>}
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
          <FontAwesomeIcon icon={faChartSimple} className="text-default-400" />
        </div>
        <div className="px-4 pb-3 space-y-3">
          <p className="text-medium font-medium">{title}</p>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <button
                key={i}
                className="w-full relative overflow-hidden rounded-full border border-divider hover:border-primary transition px-4 py-2 text-left"
              >
                <span
                  className="absolute inset-y-0 left-0 bg-primary-100"
                  style={{ width: `${opt.pct}%` }}
                />
                <span className="relative flex items-center justify-between gap-2 text-small">
                  <span className="flex items-center gap-2">
                    <FontAwesomeIcon icon={opt.leading ? faCircleDot : faCircle} className={opt.leading ? "text-primary" : "text-default-300"} />
                    <span className={opt.leading ? "font-semibold" : ""}>{opt.text}</span>
                  </span>
                  <span className={`tabular-nums ${opt.leading ? "font-bold text-primary" : "text-default-500"}`}>{opt.pct}%</span>
                </span>
              </button>
            ))}
          </div>
          <p className="text-tiny text-default-500">567 票 · 您的選擇會公開顯示</p>
        </div>
        <Divider />
        <div className="px-2 py-1 flex items-center justify-around text-default-700 text-small">
          {[
            { icon: faThumbsUp, label: "讚" },
            { icon: faComment, label: "留言" },
            { icon: faShareNodes, label: "轉發" },
            { icon: faPaperPlane, label: "傳送" },
          ].map((b, i) => (
            <button key={i} className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
              <FontAwesomeIcon icon={b.icon} /> {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── LI Document (PDF carousel) ─────────────── */

export function LIDocument({ title, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[540px] mx-auto">
      <MockupHeader icon={faLinkedin} label="LinkedIn" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={<span className="text-tiny text-default-500">追蹤者 1,234 · 1 小時前</span>}
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
        </div>
        <div className="px-4 pb-3">
          <p className="text-small">{title}</p>
        </div>
        {/* Document viewer */}
        <div className="relative aspect-[4/5] bg-default-100 mx-4 rounded-medium overflow-hidden border border-divider">
          {/* Stacked page effect */}
          <div className="absolute inset-3 bg-content1 border border-divider rounded-medium shadow-sm">
            <div className="absolute inset-0 flex items-center justify-center text-default-400">
              <div className="text-center">
                <FontAwesomeIcon icon={faFileLines} className="text-5xl mb-3" />
                <p className="text-small font-medium">第 1 / 12 頁</p>
                <p className="text-tiny mt-1">PDF 文件 · 等待 craft agent</p>
              </div>
            </div>
          </div>
          {/* Page counter */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-tiny px-3 py-1 rounded-full backdrop-blur-sm">
            1 / 12
          </div>
          {/* Side nav arrows */}
          <button className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-content1 border border-divider shadow flex items-center justify-center text-default-500">‹</button>
          <button className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-content1 border border-divider shadow flex items-center justify-center text-default-500">›</button>
        </div>
        <div className="px-4 py-2 mt-2 flex items-center justify-between text-tiny text-default-500">
          <span>👍❤️💡 1,234</span>
          <span>87 則留言 · 23 次轉發 · 156 次下載</span>
        </div>
        <Divider />
        <div className="px-2 py-1 flex items-center justify-around text-default-700 text-small">
          {[
            { icon: faThumbsUp, label: "讚" },
            { icon: faComment, label: "留言" },
            { icon: faShareNodes, label: "轉發" },
            { icon: faPaperPlane, label: "傳送" },
          ].map((b, i) => (
            <button key={i} className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
              <FontAwesomeIcon icon={b.icon} /> {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
