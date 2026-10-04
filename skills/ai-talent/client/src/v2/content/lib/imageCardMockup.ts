/**
 * 圖片任務卡 → 圖文預覽要套哪一種貼文外框（2026-10-04 CJ「產出圖片後，想要有圖文搭配
 * 預覽，並且一起排程」）。
 *
 * 圖片卡頁的預覽與排程後的成品頁（RunPage）都用這一份——兩邊各寫一份對照表，
 * 同一張圖在兩個地方就會套到不同版型。只挑「真的會把圖顯示出來」的外框。
 */
import type { MockupVariant } from "./inferMockup";

const v = (p: string, f: string): MockupVariant => ({ platform: p as any, format: f as any, label: `${p}:${f}` });

export function imageCardMockup(cardId: string, channel: string, imageCount = 1): MockupVariant {
  const id = cardId.toLowerCase();
  const multi = imageCount > 1;
  switch (channel) {
    case "facebook":
      if (id.includes("story")) return v("facebook", "story");
      if (id.includes("reels")) return v("facebook", "reel");
      return v("facebook", multi ? "carousel" : "feed");
    case "instagram":
      if (id.includes("story")) return v("instagram", "story");
      if (id.includes("reels")) return v("instagram", "reel");
      return v("instagram", multi ? "carousel" : "feed");
    case "threads":
      return v("threads", "post");
    case "line":
      return v("line", "broadcast");
    case "tiktok":
      return v("tiktok", multi ? "carousel" : "foryou");
    case "email":
      return v("email", "edm");
    case "website":
      return v("web", "blog");
    default:
      return v("generic", "generic");
  }
}
