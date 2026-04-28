/**
 * LinkedIn mockups.
 * PR2.1: feed, article (rest fall back to feed)
 * References (MIT):
 *   - feed: saddamarbaa/LinkedIn-clone-app-react-typescript src/components/Feeds/Post.tsx
 *   - article: Flowbite Blocks publisher/article (themesberg/flowbite)
 */
import React from "react";
import { Avatar, Divider, Skeleton, User } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLinkedin } from "@fortawesome/free-brands-svg-icons";
import {
  faImages, faThumbsUp, faComment, faShareNodes, faPaperPlane,
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
        {/* Cover image */}
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
