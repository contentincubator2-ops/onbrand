/**
 * 總管理的功能卡片牆。
 *
 * 2026-09-22 (CJ「我想要都用 content 的卡片式呈現方式，呈現我們每一個功能，
 * 先從總管理開始」)，而且要對著**高科技產業老闆**想看的點寫。
 *
 * ── 卡面為什麼長這樣 ────────────────────────────────────────────────
 * 沿用內容層任務卡的骨架（同樣的圓角、同樣 130px 的頭部色塊、同樣的角落徽章）。
 * 差別只在頭部放的東西：任務卡放 agent 頭像，因為卡是「誰寫的」；功能卡放一個
 * **活的數字**，因為功能是「回答了什麼」。
 *
 * ── 第二行是「怎麼算的」，不是「為什麼重要」 ────────────────────────
 * 2026-09-22 CJ 回饋：「brand exposure 底下應該是說明怎麼衡量，而非目前的
 * 解釋方式，目前像是告訴他為什麼要放這個資訊」。
 *
 * 原本那行寫的是老闆會問的修辭問句（「那一篇出事的誰擋？」）—— 那是推銷詞。
 * 面對一個數字敏感的科技業決策者，他看到 93 的第一個念頭是「93 是怎麼數出來
 * 的」，不是「這很重要對吧」。所以第二行改成口徑定義：母體、判定條件、時間窗。
 * 每一句都必須對得回 hubStats.getOverview 的實際查詢，寫錯比不寫更糟。
 *
 * ── 卡片順序 ────────────────────────────────────────────────────────
 * CJ 定的：成效 → 啟用 → 可信度 → 風險，其餘接在後面。
 *
 * ── 數字一律來自 hub.admin.overview ─────────────────────────────────
 * 沒有任何一張卡的數字是湊出來的。想不到真實數字支撐的功能（例如「上市速度」
 * 需要 approval→first post 的時間差，目前沒有這個欄位）就不做成卡，寧可少一張。
 */
import { Link } from "react-router-dom";
import {
  Activity,
  BadgeCheck,
  ClipboardList,
  FileClock,
  MousePointerClick,
  ShieldAlert,
  Smartphone,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useT } from "../lang";
import CardShell, { CARD_GRID } from "./card-shell";
import { fmt } from "../ui";
import { DailyBars } from "../charts";
import { BarList } from "./ov-BarList";

type Overview = {
  windowDays: number;
  series: Array<{ date: string; posts: number; clicks: number; impressions: number }>;
  reps: { total: number; consented: number; lineBound: number; activeThisWeek: number };
  posts: { total: number; shared: number; live: number };
  compliance: { clean: number; autoFixed: number; needsReview: number; issuesCaught: number; caughtByRule: Record<string, number> };
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
  /** 這個數字的口徑：母體、判定條件、時間窗。不是「為什麼重要」。 */
  measure: (o: Overview) => [en: string, zh: string];
  hero: (o: Overview) => { value: string; label: [en: string, zh: string] };
  detail: (o: Overview) => [en: string, zh: string];
}

const leadsOf = (o: Overview) =>
  Object.values(o.growth.byGrade).reduce((n, g) => n + Number(g.leads ?? 0), 0);

export const HQ_FUNCTIONS: FunctionCard[] = [
  {
    key: "outcomes",
    to: "/hub/performance",
    icon: MousePointerClick,
    accent: "#15803D",
    tag: ["Pipeline", "成效"],
    name: ["Tracked outcomes", "可歸屬成效"],
    measure: (o) => [
      `One redirect through a rep's own short link = one click. Counted over ${o.windowDays} days; the visitor is stored as a one-way hash of IP + browser + day, never the raw IP.`,
      `一次經過業務專屬短連結的轉址＝一次點擊。統計近 ${o.windowDays} 天；訪客只存 IP＋瀏覽器＋日期的單向雜湊，不存原始 IP。`,
    ],
    hero: (o) => ({ value: fmt(o.growth.clicks), label: ["tracked clicks", "次可歸屬點擊"] }),
    detail: (o) => [
      `${fmt(leadsOf(o))} leads · every link belongs to exactly one rep`,
      `${fmt(leadsOf(o))} 筆名單 · 每條連結只屬於一位業務`,
    ],
  },
  {
    key: "rollout",
    to: "/hub/reps",
    icon: UserCheck,
    accent: "#EA580C",
    tag: ["Adoption", "啟用"],
    name: ["Seat rollout", "席次啟用"],
    measure: () => [
      "A rep counts as active if they produced at least one post in the last 7 days. Denominator is everyone on the roster, not just the activated ones.",
      "近 7 天內產出過至少一篇，就算這位業務有在用。分母是名冊上的全部人，不是只算已啟用的。",
    ],
    hero: (o) => ({
      value: `${fmt(o.reps.activeThisWeek)}/${fmt(o.reps.total)}`,
      label: ["reps posted this week", "位業務這週產出過"],
    }),
    detail: (o) => [
      `${fmt(o.reps.consented)} consented · ${fmt(o.reps.lineBound)} bound to LINE`,
      `${fmt(o.reps.consented)} 位已同意 · ${fmt(o.reps.lineBound)} 位已綁定 LINE`,
    ],
  },
  {
    key: "grades",
    to: "/hub/performance/posts",
    icon: BadgeCheck,
    accent: "#0369A1",
    tag: ["Trust", "可信度"],
    name: ["Four data grades", "四個數據等級"],
    measure: () => [
      "Verified comes from the platform's own API. Tracked is our short link. Self-reported is what the rep typed in. Estimated is network size × a typical rate. Each grade is summed on its own and never added to another.",
      "「平台驗證」來自平台自己的 API；「追蹤」是我們的短連結；「業務自報」是業務自己填的；「推估」是人脈數×常見比率。四種各自加總，絕不互相相加。",
    ],
    hero: (o) => ({
      value: fmt(o.growth.byGrade.verified?.impressions),
      label: ["platform-verified impressions", "次平台驗證曝光"],
    }),
    detail: () => [
      "Facebook personal profiles have no API — those stay self-reported",
      "Facebook 個人帳號沒有 API，那一段永遠只會是業務自報",
    ],
  },
  {
    key: "exposure",
    to: "/hub/content/policies",
    icon: ShieldAlert,
    accent: "#DC2626",
    tag: ["Risk", "風險"],
    name: ["Brand exposure", "品牌風險"],
    measure: () => [
      "Every first draft runs through the market's policy pack — six rules: employee disclosure, approved price, absolute claims, sourced statistics, competitor comparison, tracked link. Every problem found in a first draft counts once, so two unapproved prices in one post count as two.",
      "每一篇初稿都跑過該市場的政策包——六條規則：身分揭露、核准價格、絕對用語、數據出處、競品比較、追蹤連結。初稿裡每找到一個問題算一次，所以同一篇出現兩個未核准價格就算兩次。",
    ],
    hero: (o) => ({ value: fmt(o.compliance.issuesCaught), label: ["caught before posting", "在發出去之前攔下"] }),
    detail: (o) => [
      `${fmt(o.compliance.autoFixed)} cleared by the rewrite · ${fmt(o.compliance.needsReview)} still flagged, held for a human`,
      `${fmt(o.compliance.autoFixed)} 篇改寫後通過 · ${fmt(o.compliance.needsReview)} 篇仍被標記，留給人看`,
    ],
  },
  {
    key: "consistency",
    to: "/hub/strategy/products",
    icon: ClipboardList,
    accent: "#7C3AED",
    tag: ["Control", "一致性"],
    name: ["One source of truth", "同一套說法"],
    measure: (o) => [
      `Posts created in the last ${o.windowDays} days. Each is written only from the approved solution catalogue and price list — a price that isn't on the list is removed before the post exists.`,
      `近 ${o.windowDays} 天產出的貼文。每一篇都只從核准的方案目錄與價目表寫出來——不在表上的價格，在貼文成形之前就被拿掉了。`,
    ],
    hero: (o) => ({ value: fmt(o.posts.total), label: ["posts written", "篇貼文產出"] }),
    detail: (o) => [
      `${fmt(o.posts.shared)} of them reported as shared by the rep`,
      `其中 ${fmt(o.posts.shared)} 篇業務回報已分享`,
    ],
  },
  {
    key: "audit",
    to: "/hub/performance/posts",
    icon: FileClock,
    accent: "#57534E",
    tag: ["Governance", "稽核"],
    name: ["Audit trail", "稽核軌跡"],
    measure: () => [
      "Each post keeps four things on its own row: the first draft, the final text, the verdict, and the result of every rule. Nothing is overwritten, so any post can be reconstructed later.",
      "每篇貼文自己那一列留四樣東西：初稿、定稿、判定結果、以及每一條規則的檢查結果。不覆寫，所以任何一篇事後都還原得回來。",
    ],
    hero: (o) => ({ value: fmt(o.posts.total), label: ["posts on file", "篇有完整紀錄"] }),
    detail: (o) => [
      `${fmt(o.compliance.clean)} clean on the first draft · the rest show what changed`,
      `${fmt(o.compliance.clean)} 篇初稿就乾淨 · 其餘看得到改了什麼`,
    ],
  },
  {
    key: "field",
    to: "/hub/rep-view",
    icon: Smartphone,
    accent: "#06C755",
    tag: ["Field", "業務端"],
    name: ["What reps actually touch", "業務端長什麼樣"],
    measure: (o) => [
      `A rep is counted once they've sent their binding code to the bot and their chat account is linked. ${fmt(o.reps.total - o.reps.lineBound)} on the roster haven't bound yet.`,
      `業務把綁定碼傳給機器人、聊天帳號接上了才算一位。名冊上還有 ${fmt(o.reps.total - o.reps.lineBound)} 位還沒綁。`,
    ],
    hero: (o) => ({ value: fmt(o.reps.lineBound), label: ["reps on the chat bot", "位業務在聊天機器人上"] }),
    detail: () => [
      "Six buttons in a chat app — no login, no training deck",
      "聊天室裡六個按鈕——不用登入，不用教育訓練",
    ],
  },
];

/**
 * 原本這兩塊是頁面下方的兩張 Card（每日長條圖 + 規則排行）。
 * 2026-09-22 CJ：「連底下的 post activity、caught before posting 都變成卡片式」。
 *
 * 跟上面七張只差一件事：頭部色塊放的是圖不是一個數字，所以高 150 而不是 130。
 * 外框、徽章、口徑行、footer 全部同一份 CardShell —— 兩種卡不會各自漂移。
 *
 * 規則卡只放前四條，其餘留給政策包頁。卡片是摘要、細節在目的地，這也是內容層
 * 任務卡的規矩。
 */
function WideCards({ overview, ruleLabels }: { overview: Overview; ruleLabels: Record<string, [string, string]> }) {
  const t = useT();
  const rules = Object.entries(overview.compliance.caughtByRule)
    .map(([id, n]) => ({ key: id, label: t(ruleLabels[id]?.[0] ?? id, ruleLabels[id]?.[1] ?? id), value: Number(n) }))
    .sort((a, b) => b.value - a.value);
  const shown = rules.slice(0, 4);

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <CardShell
        to="/hub/performance"
        accent="#2a78d6"
        icon={Activity}
        bandHeight={200}
        tag={t("Trend", "趨勢")}
        name={t("Daily activity", "每日活動")}
        measure={t(
          `Posts are counted on the day they were created, clicks on the day the link was followed. Every day in the ${overview.windowDays}-day window is drawn — a flat stretch means nobody posted, not missing data.`,
          `貼文算在產出那一天，點擊算在連結被點開那一天。${overview.windowDays} 天的每一天都會畫出來——平的那一段是真的沒人發文，不是資料缺漏。`,
        )}
        detail={t(
          `${fmt(overview.posts.total)} posts · ${fmt(overview.growth.clicks)} clicks over ${overview.windowDays} days`,
          `${overview.windowDays} 天內 ${fmt(overview.posts.total)} 篇貼文 · ${fmt(overview.growth.clicks)} 次點擊`,
        )}
      >
        <div className="grid w-full grid-cols-2 gap-3 px-1">
          <DailyBars
            label={t("Posts per day", "每日貼文")}
            color="#2a78d6"
            height={120}
            data={overview.series.map((d) => ({ date: d.date, value: d.posts }))}
          />
          <DailyBars
            label={t("Clicks per day", "每日點擊")}
            color="#52514e"
            height={120}
            data={overview.series.map((d) => ({ date: d.date, value: d.clicks }))}
          />
        </div>
      </CardShell>

      <CardShell
        to="/hub/content/policies"
        accent="#DC2626"
        icon={ShieldAlert}
        bandHeight={200}
        tag={t("Risk", "風險")}
        name={t("Which rule caught it", "是哪一條攔下的")}
        measure={t(
          "One count per post per rule, taken from the first draft. A post that trips two rules appears under both, so these add up to more than the number of posts.",
          "以初稿為準，一篇貼文在一條規則底下算一次。一篇踩到兩條就會在兩條底下各出現一次，所以加起來會比貼文數多。",
        )}
        detail={t(
          `Top ${shown.length} of ${rules.length} rules · the rest are on the policy pack page`,
          `${rules.length} 條裡的前 ${shown.length} 條 · 其餘在政策包頁`,
        )}
      >
        <div className="w-full px-1">
          {shown.length ? (
            <BarList items={shown} unit={t("catches", "次")} />
          ) : (
            <div className="text-[12px] text-stone-500">{t("Nothing caught yet.", "目前沒有攔下任何一篇。")}</div>
          )}
        </div>
      </CardShell>
    </div>
  );
}

export default function FunctionCards({
  overview,
  ruleLabels,
}: {
  overview: Overview;
  ruleLabels: Record<string, [string, string]>;
}) {
  const t = useT();

  return (
    <section aria-label="What HQ can see">
      <div className="mb-3 text-[12px] font-medium uppercase tracking-wide text-stone-500">
        {t("What this answers, and how it's counted", "這套系統回答什麼，以及怎麼算的")}
      </div>
      <div className={CARD_GRID}>
        {HQ_FUNCTIONS.map((f) => {
          const hero = f.hero(overview);
          const measure = f.measure(overview);
          const detail = f.detail(overview);
          return (
            <CardShell
              key={f.key}
              to={f.to}
              accent={f.accent}
              icon={f.icon}
              tag={t(f.tag[0], f.tag[1])}
              name={t(f.name[0], f.name[1])}
              measure={t(measure[0], measure[1])}
              detail={t(detail[0], detail[1])}
            >
              <div className="text-[30px] font-bold leading-none tabular-nums text-stone-900">{hero.value}</div>
              <div className="mt-1.5 line-clamp-2 text-center text-[11px] leading-tight text-stone-500">
                {t(hero.label[0], hero.label[1])}
              </div>
            </CardShell>
          );
        })}
      </div>

      <WideCards overview={overview} ruleLabels={ruleLabels} />
    </section>
  );
}
