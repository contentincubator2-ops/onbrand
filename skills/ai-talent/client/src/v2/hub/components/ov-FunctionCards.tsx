/**
 * 總管理的功能卡片牆。
 *
 * 2026-09-22 (CJ「我想要都用 content 的卡片式呈現方式，呈現我們每一個功能，
 * 先從總管理開始」)，而且要對著**高科技產業老闆**想看的點寫。
 *
 * ── 卡面為什麼長這樣 ────────────────────────────────────────────────
 * 沿用內容層任務卡的骨架（同樣的圓角、同樣 130px 的頭部色塊、同樣的角落徽章、
 * 同樣 2→4 欄）。差別只在頭部放的東西：任務卡放 agent 頭像，因為卡是「誰寫的」；
 * 功能卡放一個**活的數字**，因為功能是「回答了什麼」。
 *
 * ── 問句是卡片的主體，不是裝飾 ──────────────────────────────────────
 * 每張卡的第二行是那位老闆真正會問的話（董事會簡報能不能放、法務問三月說了
 * 什麼、我買的席次有人用嗎）。功能名稱只是答案的標題。科技業的決策者是數字
 * 敏感的懷疑論者，所以「四個數據等級」本身就要當成一個功能來賣，而不是藏在
 * 成效頁的註腳裡。
 *
 * ── 數字一律來自 hub.admin.overview ─────────────────────────────────
 * 沒有任何一張卡的數字是湊出來的。想不到真實數字支撐的功能（例如「上市速度」
 * 需要 approval→first post 的時間差，目前沒有這個欄位）就不做成卡，寧可少一張。
 */
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  MousePointerClick,
  ShieldAlert,
  Smartphone,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT } from "../lang";
import { fmt } from "../ui";

type Overview = {
  reps: { total: number; consented: number; lineBound: number; activeThisWeek: number };
  posts: { total: number; shared: number; live: number };
  compliance: { clean: number; autoFixed: number; needsReview: number; issuesCaught: number };
  growth: { clicks: number; liveClicks: number; byGrade: Record<string, { impressions: number; engagements: number; leads: number }> };
};

interface FunctionCard {
  key: string;
  to: string;
  icon: LucideIcon;
  /** 角落徽章的顏色。功能性用色，不是裝飾 —— 風險是紅的，成效是綠的。 */
  accent: string;
  tag: [en: string, zh: string];
  name: [en: string, zh: string];
  /** 老闆真正會問的那句話。 */
  question: [en: string, zh: string];
  hero: (o: Overview) => { value: string; label: [en: string, zh: string] };
  detail: (o: Overview) => [en: string, zh: string];
}

const leadsOf = (o: Overview) =>
  Object.values(o.growth.byGrade).reduce((n, g) => n + Number(g.leads ?? 0), 0);

export const HQ_FUNCTIONS: FunctionCard[] = [
  {
    key: "exposure",
    to: "/hub/content/policies",
    icon: ShieldAlert,
    accent: "#DC2626",
    tag: ["Risk", "風險"],
    name: ["Brand exposure", "品牌風險"],
    question: [
      "A hundred people post about my company from personal accounts. What stops the one bad post?",
      "一百個人用個人帳號談我的公司。那一篇出事的，誰擋？",
    ],
    hero: (o) => ({ value: fmt(o.compliance.issuesCaught), label: ["caught before posting", "在發出去之前攔下"] }),
    detail: (o) => [
      `${fmt(o.compliance.autoFixed)} auto-fixed · ${fmt(o.compliance.needsReview)} held for a human`,
      `${fmt(o.compliance.autoFixed)} 篇自動修正 · ${fmt(o.compliance.needsReview)} 篇留給人看`,
    ],
  },
  {
    key: "rollout",
    to: "/hub/reps",
    icon: UserCheck,
    accent: "#EA580C",
    tag: ["Adoption", "啟用"],
    name: ["Seat rollout", "席次啟用"],
    question: [
      "I paid per seat. How many reps actually opened it this week?",
      "我是按席次付費的。這週真的有幾個業務打開過？",
    ],
    hero: (o) => ({
      value: `${fmt(o.reps.activeThisWeek)}/${fmt(o.reps.total)}`,
      label: ["reps posted this week", "位業務這週發過文"],
    }),
    detail: (o) => [
      `${fmt(o.reps.consented)} consented · ${fmt(o.reps.lineBound)} bound to LINE`,
      `${fmt(o.reps.consented)} 位已同意 · ${fmt(o.reps.lineBound)} 位已綁定 LINE`,
    ],
  },
  {
    key: "outcomes",
    to: "/hub/performance",
    icon: MousePointerClick,
    accent: "#15803D",
    tag: ["Pipeline", "成效"],
    name: ["Tracked outcomes", "可歸屬成效"],
    question: [
      "Impressions don't fund anything. What did this actually move, and who moved it?",
      "曝光不能報帳。這到底帶來了什麼，又是誰帶來的？",
    ],
    hero: (o) => ({ value: fmt(o.growth.clicks), label: ["tracked clicks", "次可歸屬點擊"] }),
    detail: (o) => [
      `${fmt(leadsOf(o))} leads · every link belongs to one rep`,
      `${fmt(leadsOf(o))} 筆名單 · 每條連結都屬於某一位業務`,
    ],
  },
  {
    key: "grades",
    to: "/hub/performance/posts",
    icon: BadgeCheck,
    accent: "#0369A1",
    tag: ["Trust", "可信度"],
    name: ["Four data grades", "四個數據等級"],
    question: [
      "Which of these numbers can I put in a board deck without a footnote?",
      "這些數字裡，哪幾個能直接放進董事會簡報，不用加註腳？",
    ],
    hero: (o) => ({
      value: fmt(o.growth.byGrade.verified?.impressions),
      label: ["platform-verified impressions", "次平台驗證曝光"],
    }),
    detail: () => [
      "Verified · tracked · self-reported · estimated, never blended",
      "平台驗證／追蹤連結／業務自報／推估，四種分開算，不混在一起",
    ],
  },
  {
    key: "consistency",
    to: "/hub/strategy/products",
    icon: ClipboardList,
    accent: "#7C3AED",
    tag: ["Control", "一致性"],
    name: ["One source of truth", "同一套說法"],
    question: [
      "When a product ships, does the whole field describe it the same way?",
      "新產品上市，整個業務團隊講的是同一套嗎？",
    ],
    hero: (o) => ({ value: fmt(o.posts.total), label: ["posts written", "篇貼文產出"] }),
    detail: () => [
      "Every one written from the approved catalogue and price list",
      "每一篇都只從核准的產品目錄與價目表寫出來",
    ],
  },
  {
    key: "audit",
    to: "/hub/performance/posts",
    icon: ClipboardList,
    accent: "#57534E",
    tag: ["Governance", "稽核"],
    name: ["Audit trail", "稽核軌跡"],
    question: [
      "If legal asks what we said in March, can I show them within the hour?",
      "法務問三月到底說了什麼，一小時內拿得出來嗎？",
    ],
    hero: (o) => ({ value: fmt(o.posts.total), label: ["posts on file", "篇有完整紀錄"] }),
    detail: () => [
      "First draft, final text and the rule that changed it — kept per post",
      "初稿、定稿、以及依哪一條規則改的，每篇都留著",
    ],
  },
  {
    key: "field",
    to: "/hub/rep-view",
    icon: Smartphone,
    accent: "#06C755",
    tag: ["Field", "業務端"],
    name: ["What reps actually touch", "業務端長什麼樣"],
    question: [
      "My sales team will not learn another internal system. What do they see?",
      "我的業務不會再學一套內部系統。他們看到的是什麼？",
    ],
    hero: (o) => ({ value: fmt(o.reps.lineBound), label: ["reps on the chat bot", "位業務在聊天機器人上"] }),
    detail: () => [
      "Six buttons in a chat app — no login, no training deck",
      "聊天室裡六個按鈕——不用登入，不用教育訓練",
    ],
  },
];

export default function FunctionCards({ overview }: { overview: Overview }) {
  const t = useT();

  return (
    <section aria-label="What HQ can see">
      <div className="mb-3 text-[12px] font-medium uppercase tracking-wide text-stone-500">
        {t("What this answers for you", "這套系統替你回答什麼")}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {HQ_FUNCTIONS.map((f) => {
          const hero = f.hero(overview);
          const detail = f.detail(overview);
          const Icon = f.icon;
          return (
            <Link
              key={f.key}
              to={f.to}
              className="group flex flex-col overflow-hidden rounded-2xl text-left transition hover:scale-[1.02] hover:shadow-lg"
              style={{ border: "1px solid rgba(0,0,0,0.07)", background: "white" }}
            >
              <div
                className="relative flex flex-col items-center justify-center px-3"
                style={{ height: 130, background: "#F5F4F2", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
              >
                <div className="text-[30px] font-bold leading-none tabular-nums text-stone-900">{hero.value}</div>
                <div className="mt-1.5 line-clamp-2 text-center text-[11px] leading-tight text-stone-500">
                  {t(hero.label[0], hero.label[1])}
                </div>
                <div
                  className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ background: f.accent }}
                >
                  <Icon className="h-3 w-3 text-white" aria-hidden />
                </div>
                <span
                  className="absolute right-2 top-2 rounded-full px-2 py-0.5 font-bold text-white shadow-sm"
                  style={{ background: f.accent, fontSize: 11, letterSpacing: "0.06em" }}
                >
                  {t(f.tag[0], f.tag[1])}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <div className="text-small font-semibold text-neutral-900">{t(f.name[0], f.name[1])}</div>
                <p className="line-clamp-3 text-tiny leading-relaxed text-default-500">
                  {t(f.question[0], f.question[1])}
                </p>
                <div>
                  <span className="inline-flex rounded-lg border px-2 py-1 text-[12px] leading-relaxed text-neutral-600">
                    {t(detail[0], detail[1])}
                  </span>
                </div>
                <div className="mt-auto flex items-center gap-2 border-t border-neutral-100 pt-2">
                  <span className="truncate text-[12px] text-neutral-600">{t("Open", "打開")}</span>
                  <ArrowRight
                    className="ml-auto h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
