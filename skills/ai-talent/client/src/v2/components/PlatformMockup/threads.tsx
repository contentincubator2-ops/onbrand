/**
 * Threads mockups.
 *
 * Variants:
 *   post   — single post (dark + light phone chrome)
 *   thread — multi-reply thread chain
 */
import React from "react";
import { Avatar, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHeart, faComment, faRepeat, faPaperPlane,
  faEllipsis, faImage,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, handleOf, MarkdownText } from "./shared";

const TH_BLACK = "#000000";
const TH_GRAY  = "#666666";
const TH_LIGHT = "#F5F5F5";
const TH_BORDER = "#DBDBDB";

const threadAvatar = (name: string) =>
  `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(name || "threads")}&backgroundColor=000000&backgroundType=solid`;

/* ─── Shared: single post bubble ─── */
interface PostProps {
  brand: string;
  handle: string;
  body?: string;
  imageDesc?: string;
  dark?: boolean;
  isReply?: boolean;
  showConnector?: boolean;
}

function ThreadPost({ brand, handle, body, imageDesc, dark = false, isReply = false, showConnector = false }: PostProps) {
  const bg   = dark ? "#101010" : "#FFFFFF";
  const text = dark ? "#F1F1F1" : TH_BLACK;
  const sub  = dark ? "#999999" : TH_GRAY;
  const bdr  = dark ? "#2A2A2A" : TH_BORDER;

  return (
    <div className="flex gap-3 px-4 py-3" style={{ backgroundColor: bg }}>
      {/* Avatar column */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className="w-9 h-9 rounded-full overflow-hidden border-2"
          style={{ borderColor: isReply ? bdr : "transparent" }}
        >
          <Avatar src={threadAvatar(brand)} size="sm" className="w-full h-full" />
        </div>
        {showConnector && (
          <div className="w-0.5 flex-1 mt-1" style={{ backgroundColor: bdr, minHeight: 24 }} />
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-bold truncate max-w-[140px]" style={{ color: text }}>
              {brand}
            </span>
            {!isReply && (
              <span className="text-[12px]" style={{ color: sub }}>· 剛剛</span>
            )}
          </div>
          <FontAwesomeIcon icon={faEllipsis} className="text-[15px]" style={{ color: sub }} />
        </div>

        {/* Handle (reply only) */}
        {isReply && (
          <p className="text-[12px] mb-1" style={{ color: sub }}>@{handle}</p>
        )}

        {/* Body text */}
        {body ? (
          <div style={{ color: text }}>
            <MarkdownText content={body} className="text-[14px] leading-relaxed mb-2" />
          </div>
        ) : (
          <div className="space-y-1.5 mb-2">
            <Skeleton className="h-3.5 w-full rounded" style={{ opacity: dark ? 0.15 : 1 }} />
            <Skeleton className="h-3.5 w-[88%] rounded" style={{ opacity: dark ? 0.15 : 1 }} />
            <Skeleton className="h-3.5 w-[70%] rounded" style={{ opacity: dark ? 0.15 : 1 }} />
          </div>
        )}

        {/* Optional image */}
        {imageDesc && (
          <div
            className="rounded-xl overflow-hidden mb-2 border flex items-center justify-center"
            style={{ aspectRatio: "1.91/1", borderColor: bdr, backgroundColor: dark ? "#1E1E1E" : TH_LIGHT }}
          >
            <div className="text-center p-4">
              <FontAwesomeIcon icon={faImage} className="text-2xl mb-1" style={{ color: sub }} />
              <p className="text-[11px]" style={{ color: sub }}>{imageDesc}</p>
            </div>
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center gap-5 mt-1">
          {[
            { icon: faHeart,      label: "讚" },
            { icon: faComment,    label: "留言" },
            { icon: faRepeat,     label: "轉發" },
            { icon: faPaperPlane, label: "分享" },
          ].map((a, i) => (
            <button key={i} className="flex items-center gap-1">
              <FontAwesomeIcon icon={a.icon} className="text-[18px]" style={{ color: sub }} />
            </button>
          ))}
        </div>

        {/* Likes count */}
        <p className="text-[12px] mt-1.5" style={{ color: sub }}>
          {isReply ? "234 個讚" : "1,204 個讚"}
        </p>
      </div>
    </div>
  );
}

/* ─── Phone chrome wrapper ─── */
function PhoneChrome({ dark, children }: { dark: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-[#1A1A1A] rounded-[36px] p-3 shadow-2xl">
      <div className="rounded-[28px] overflow-hidden" style={{ backgroundColor: dark ? "#101010" : "#FFFFFF" }}>
        {/* Status bar */}
        <div className="px-6 pt-3 pb-1 flex items-center justify-between"
          style={{ backgroundColor: dark ? "#101010" : "#FFFFFF" }}>
          <span className="text-[11px] font-semibold" style={{ color: dark ? "#F1F1F1" : TH_BLACK }}>9:41</span>
          <div className="flex gap-1 items-center">
            <div className="w-4 h-2 border rounded-sm" style={{ borderColor: dark ? "#F1F1F1" : TH_BLACK }}>
              <div className="h-full w-3/4 rounded-sm" style={{ backgroundColor: dark ? "#F1F1F1" : TH_BLACK }} />
            </div>
          </div>
        </div>

        {/* Threads nav bar */}
        <div className="px-4 py-2.5 flex items-center justify-between border-b"
          style={{ backgroundColor: dark ? "#101010" : "#FFFFFF", borderColor: dark ? "#2A2A2A" : TH_BORDER }}>
          {/* Threads wordmark (simplified) */}
          <div
            className="text-[22px] font-black tracking-tighter"
            style={{ color: dark ? "#F1F1F1" : TH_BLACK, fontFamily: "Georgia, serif" }}
          >
            @
          </div>
          <div className="flex gap-4">
            {["首頁", "搜索", "發文", "通知", "我"].map((item, i) => (
              <button key={i} className="text-[11px]" style={{ color: i === 0 ? (dark ? "#F1F1F1" : TH_BLACK) : TH_GRAY }}>
                {item}
              </button>
            ))}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   THREADS POST (single post, dark mode default)
───────────────────────────────────────────────────── */
export function ThreadsPost({
  title, brandName, variantLabel,
  liveTitle, liveCaption, liveImageDesc,
}: MockupFields) {
  const brand  = brandName ?? "品牌帳號";
  const handle = handleOf(brandName);
  const body   = liveCaption ?? liveTitle ?? title;

  return (
    <div className="w-full max-w-[375px] mx-auto">
      <MockupHeader icon={faHeart} label="Threads · 貼文" variantLabel={variantLabel} />
      <PhoneChrome dark>
        <ThreadPost
          brand={brand}
          handle={handle}
          body={body}
          imageDesc={liveImageDesc}
          dark
          showConnector={false}
        />
        <div className="px-4 py-2 border-t" style={{ borderColor: "#2A2A2A" }}>
          <p className="text-[13px]" style={{ color: "#999" }}>回覆 @{handle} ...</p>
        </div>
      </PhoneChrome>
    </div>
  );
}

/* ─────────────────────────────────────────────────────
   THREADS THREAD (multi-reply chain, light mode)
───────────────────────────────────────────────────── */
export function ThreadsThread({
  title, brandName, variantLabel,
  liveTitle, liveCaption, liveDescription, liveImageDesc,
}: MockupFields) {
  const brand  = brandName ?? "品牌帳號";
  const handle = handleOf(brandName);

  const replies = [
    liveDescription ?? "延伸補充：具體說明這則 Threads 的後續內容，提供更多細節或互動問題。",
    "感謝大家的支持！歡迎留言分享你的想法 ❤️",
  ];

  return (
    <div className="w-full max-w-[375px] mx-auto">
      <MockupHeader icon={faComment} label="Threads · 串文" variantLabel={variantLabel} />
      <PhoneChrome dark={false}>
        {/* Root post */}
        <ThreadPost
          brand={brand}
          handle={handle}
          body={liveCaption ?? liveTitle ?? title}
          imageDesc={liveImageDesc}
          dark={false}
          showConnector
        />

        {/* Reply 1 */}
        <div className="border-t" style={{ borderColor: TH_BORDER }}>
          <ThreadPost
            brand={brand}
            handle={handle}
            body={replies[0]}
            dark={false}
            isReply
            showConnector
          />
        </div>

        {/* Reply 2 */}
        <div className="border-t" style={{ borderColor: TH_BORDER }}>
          <ThreadPost
            brand={brand}
            handle={handle}
            body={replies[1]}
            dark={false}
            isReply
            showConnector={false}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t" style={{ borderColor: TH_BORDER }}>
          <p className="text-[13px]" style={{ color: TH_GRAY }}>回覆 @{handle} ...</p>
        </div>
      </PhoneChrome>
    </div>
  );
}
