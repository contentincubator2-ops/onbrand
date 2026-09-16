/**
 * The rep's 6-button LINE rich menu, as rendered in the booth phone simulator.
 * Order and labels mirror RICH_MENU_AREAS in server/platform/core/hub/lineBot.ts
 * and the committed image (server/platform/assets/hub-richmenu.jpg).
 */
import React from "react";
import {
  ChartNoAxesColumnIncreasing,
  MessageSquareMore,
  PenLine,
  Search,
  Send,
  Star,
  type LucideIcon,
} from "lucide-react";
import { cx } from "../ui";

export type MenuAction = "write" | "featured" | "lookup" | "share" | "stats" | "ask";

export interface MenuItem {
  action: MenuAction;
  zh: string;
  en: string;
  icon: LucideIcon;
  /** One line for the "What each button does" card. */
  description: string;
}

export const MENU_ITEMS: MenuItem[] = [
  { action: "write", zh: "寫一篇", en: "Write a post", icon: PenLine, description: "Pick a solution & channel → one post, checked against policy, with your tracked link." },
  { action: "featured", zh: "本週主推", en: "This week's focus", icon: Star, description: "Solutions marketing is pushing." },
  { action: "lookup", zh: "產品快查", en: "Product lookup", icon: Search, description: "Approved features & prices only." },
  { action: "share", zh: "發布回報", en: "Share & report", icon: Send, description: "Copy, share to LINE friends, open LinkedIn/Facebook, report the URL." },
  { action: "stats", zh: "我的成效", en: "My results", icon: ChartNoAxesColumnIncreasing, description: "Your posts, clicks, verified impressions, rank." },
  { action: "ask", zh: "問 AI 助理", en: "Ask AI", icon: MessageSquareMore, description: "Your assistant (Hermes Agent) for hooks, objections, subsidy talking points." },
];

export default function RichMenu({
  onTap,
  disabled = false,
}: {
  onTap: (item: MenuItem) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 bg-[#18181b] p-1" role="group" aria-label="Rich menu">
      {MENU_ITEMS.map((item) => (
        <button
          key={item.action}
          type="button"
          onClick={() => onTap(item)}
          disabled={disabled}
          aria-label={`${item.zh} ${item.en}`}
          className={cx(
            "flex h-[78px] flex-col items-center justify-center gap-0.5 rounded-lg bg-[#27272a] px-1 text-center transition",
            disabled ? "cursor-wait opacity-60" : "hover:bg-[#3f3f46] active:bg-[#52525b]",
          )}
        >
          <item.icon className="mb-0.5 h-5 w-5 text-[#8de055]" strokeWidth={2.25} aria-hidden />
          <span className="text-[13px] font-semibold leading-tight text-stone-50">{item.zh}</span>
          <span className="text-[10px] leading-tight text-stone-400">{item.en}</span>
        </button>
      ))}
    </div>
  );
}
