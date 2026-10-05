/**
 * The rep's 6 menu actions, shown in the booth phone simulator as a
 * WhatsApp list message (tap "Menu" → a sheet slides up — WhatsApp has no
 * persistent on-screen button grid the way LINE does). Order and labels
 * mirror RICH_MENU_AREAS in server/platform/core/hub/lineBot.ts; the same
 * six actions drive the real LINE bot today (see sim-Architecture.tsx).
 */
import {
  ChartNoAxesColumnIncreasing,
  MessageSquareMore,
  PenLine,
  Search,
  Send,
  Star,
  type LucideIcon,
} from "lucide-react";

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
  { action: "share", zh: "發布回報", en: "Share & report", icon: Send, description: "Copy, share to your contacts, open LinkedIn/Facebook, report the URL." },
  { action: "stats", zh: "我的成效", en: "My results", icon: ChartNoAxesColumnIncreasing, description: "Your posts, clicks, verified impressions, rank." },
  { action: "ask", zh: "問 AI 助理", en: "Ask AI", icon: MessageSquareMore, description: "Your assistant (Hermes Agent) for hooks, objections, subsidy talking points." },
];
