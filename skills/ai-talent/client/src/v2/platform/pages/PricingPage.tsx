/**
 * Pricing page — 照 2026-09-06 定案的《OnBrand 方案與報價》（Word）排版。
 *
 * 數字是合約，不是文案：2026-09-29 起前台只列爆款結構＋品牌自建兩類卡、七個通路，
 * 對外只講爆款結構卡張數與通路數（一律引用 catalogFigures，
 * 由 server/platform/core/catalogFigures.test.ts 對真實目錄鎖住）、基礎 NT$2,250／專業
 * NT$9,000、策略顧問導入 NT$80,000、電商營運報告 NT$48,000 ＋ 25,000／月。
 * 2026-09-07 用 buildTaskCatalogIndex() 數過與 Word 一致；之後動目錄要
 * 同步改這裡（沒有測試擋著）。
 *
 * Word 只有月費，所以頁面不再有年繳切換；stripe.createCheckout 的 annual
 * 參數保留未動。美金價（非 TW 帳單國）維持既有換算路徑。
 */
import { CATALOG } from "../lib/catalogFigures";
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { showToastGlobal } from "../../../components/ui/Toast";
import { useLang } from "../../../lib/i18n";
import AddonRequestModal from "../components/AddonRequestModal";

type Layer = { label: string; items: string[]; muted?: boolean };

function Tbl({ head, rows, labelCol, hiCol, className }: {
  head?: string[]; rows: string[][]; labelCol?: boolean; hiCol?: number; className?: string;
}) {
  return (
    <div className={`overflow-x-auto ${className ?? ""}`}>
      <table className="w-full text-sm border border-neutral-200">
        {head && (
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i} className="text-left font-semibold text-[12px] tracking-[0.06em] bg-neutral-900 text-white px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-neutral-200 align-top">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`px-3 py-2 whitespace-pre-line leading-relaxed ${
                    labelCol && ci === 0 ? "bg-neutral-50 font-medium text-neutral-900 w-[26%]" : ""
                  } ${hiCol === ci ? "font-semibold text-neutral-900" : "text-neutral-700"}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold text-neutral-900 mt-16 mb-4 pb-2 border-b border-neutral-900">{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-neutral-900 mt-8 mb-3">{children}</h3>;
}
function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-neutral-500 italic mt-2 leading-relaxed">{children}</p>;
}

export default function PricingPage() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const statusQuery = (trpc as any).billing?.getStatus?.useQuery
    ? (trpc as any).billing.getStatus.useQuery()
    // Treat a missing tRPC hook (e.g. deploy misconfiguration) as "still loading"
    // so a logged-in user is never misrouted to /auth/register.
    : { data: null, isLoading: true };
  const status = statusQuery?.data;
  const statusLoading = statusQuery?.isLoading ?? false;

  const isEn = lang === "en";
  const [addonOpen, setAddonOpen] = React.useState(false);

  const checkoutMut = (trpc as any).stripe?.createCheckout?.useMutation
    ? (trpc as any).stripe.createCheckout.useMutation({
        onSuccess: (data: any) => {
          if (data?.url) window.location.assign(data.url);
        },
        onError: (e: any) =>
          showToastGlobal((isEn ? "Checkout failed: " : "結帳失敗：") + (e?.message ?? e)),
      })
    : null;

  const currency: "TWD" | "USD" = (status as any)?.currency ?? "TWD";
  const sym = currency === "USD" ? "US$" : "NT$";
  // Word 是台幣未稅價；美金價維持既有換算（基礎 US$75、專業 US$300）。
  const price = currency === "USD" ? { starter: 75, pro: 300 } : { starter: 2250, pro: 9000 };

  const TIERS: {
    code: string; name: string; seats: string; sub: string; monthly: number;
    layers: Layer[]; cta: string; highlight: boolean; highlightLabel?: string;
  }[] = [
    {
      code: "drop_starter",
      name: isEn ? "OnBrand Basic" : "OnBrand 基礎",
      seats: isEn ? "2 seats" : "2 席",
      sub: isEn ? `1 brand · pick 2 of ${CATALOG.channels} channels (swap monthly)` : `1 個品牌 · ${CATALOG.channels} 個通路選 2（每月可更換）`,
      monthly: price.starter,
      layers: [
        { label: isEn ? "Strategy" : "策略層", items: isEn
          ? ["Brand positioning", "3 own task cards (saved to your Brand Task Library)"]
          : ["品牌定位", "自建任務卡 3 張（存入品牌任務庫）"] },
        { label: isEn ? "Content" : "內容層", items: isEn
          ? ["Task cards: the ones you build for your brand (viral-structure cards are Professional)", "Scheduling, calendar and direct publishing to FB / IG"]
          : ["任務卡：你替品牌自建的卡（爆款結構卡屬於專業方案）", "排程、日曆與 FB／IG 直接發布"] },
        { label: isEn ? "Performance" : "成效層", items: isEn
          ? ["Early preview on simulated data — real connections are our top investment focus; Professional gets priority access"]
          : ["早期預覽：用模擬數據先看見成效層的樣子", "真實串接是我們目前最重點的投資方向，專業方案優先加購"], muted: true },
        { label: isEn ? "Also" : "其他", items: isEn
          ? ["Unlimited runs", "Campaign tasks included"]
          : ["執行次數不限", "企劃任務開放"] },
      ],
      cta: isEn ? "Start 7-day trial" : "開始 7 天試用",
      highlight: false,
    },
    {
      code: "drop_pro",
      name: isEn ? "OnBrand Professional" : "OnBrand 專業",
      seats: isEn ? "5 seats" : "5 席",
      sub: isEn ? `1 brand · pick 5 of ${CATALOG.channels} channels (swap monthly)` : `1 個品牌 · ${CATALOG.channels} 個通路選 5（每月可更換）`,
      monthly: price.pro,
      layers: [
        { label: isEn ? "Strategy" : "策略層", items: isEn
          ? ["Brand positioning + 10 product positionings + 1 campaign positioning per month", "10 own task cards (saved to your Brand Task Library)", "Strategy workbench (three anchors → content angles)", "Strategy monitoring: alerts when your brand, products or competitors shift"]
          : ["品牌定位 ＋ 產品定位 10 個 ＋ 活動定位每月 1 次", "自建任務卡 10 張（存入品牌任務庫）", "策略工作台（三錨點推導內容角度）", "策略監測：品牌、產品與競爭者有變化時提醒調整"] },
        { label: isEn ? "Content" : "內容層", items: isEn
          ? [`${CATALOG.viral} viral-structure cards + your own cards`, "Viral-structure cards refreshed monthly", "Scheduling, calendar and direct publishing to FB / IG"]
          : [`爆款結構卡 ${CATALOG.viral} 張 ＋ 品牌自建卡`, "爆款結構卡每月更新", "排程、日曆與 FB／IG 直接發布"] },
        { label: isEn ? "Performance" : "成效層", items: [isEn ? "Early preview + priority access to real connections (see below)" : "早期預覽 ＋ 優先加購真實串接（見下方加購）"] },
        { label: isEn ? "Also" : "其他", items: isEn
          ? ["Unlimited runs", "Campaign tasks included", "Review workflow"]
          : ["執行次數不限", "企劃任務開放", "審核工作流"] },
      ],
      cta: isEn ? "Start 7-day trial" : "開始 7 天試用",
      highlight: true,
      highlightLabel: isEn ? "5 SEATS · REVIEW WORKFLOW" : "5 席 · 審核工作流",
    },
  ];

  const faq: [string, string][] = isEn ? [
    ["What is the difference between Basic and Professional?", `Capability, not volume. Both tiers have unlimited runs and campaign tasks. The difference is channels (2 vs 5), the ${CATALOG.viral} viral-structure cards (Professional only), product and campaign positioning, own task cards (3 vs 10) and seats (2 vs 5).`],
    ["Why does Professional come with 5 seats?", "Because of the review workflow. The person producing and the person approving must be different people, otherwise review is a formality: marketer, ads specialist, performance analyst, mid-level manager (approves), owner (dashboard)."],
    ["Can I change my channels?", `Yes, once a month. You pick from ${CATALOG.channels} channels: Facebook, Instagram, Threads, LINE, TikTok, Email and Website (Basic 2, Professional 5).`],
    ["What is an own task card?", "Paste the output you actually want (say, 10 of your best promo posts); the AI reverse-engineers it into a SKILL, you approve a test write, and it goes into your Brand Task Library. Length, rhythm, opening and CTA placement are measured from your samples and later used as acceptance criteria."],
    ["Do add-ons require the Professional plan?", "Yes. Both the strategy-consultant onboarding and the e-commerce operations report require an active OnBrand Professional (NT$9,000 / month) subscription."],
    ["Why are viral-structure cards refreshed monthly?", "Viral structures expire: only 27% of TikTok trends survive two weeks. Every viral card carries its spread metric and the month it was measured, and the set is refreshed monthly."],
    ["What happens when my trial ends?", "Trial stops when EITHER the 7 days OR your 1,000 trial points run out — whichever comes first. You keep read access to your history but cannot generate new content."],
    ["Can I cancel anytime?", "Yes. Cancel in Account settings whenever you want. You keep access until the current period ends, then no more charges."],
    ["Who owns the output?", "You do. We claim zero rights. Use it commercially, remix it, resell it."],
    ["Can I get a company invoice?", "Yes. Add your tax ID and company name in Account settings → Invoice info; the next charge auto-issues a B2B e-invoice."],
    ["Single vs Pack vs Campaign tasks?", "Single = one fast output (1 variant). Pack = 5 caption variants + 5 images in parallel. Campaign = a research-first flow that produces a whole set of content."],
  ] : [
    ["基礎和專業差在哪？", `差在能力，不在用量。執行次數兩級都不限、企劃任務兩級都開放；差別是通路數（2 vs 5）、爆款結構卡（${CATALOG.viral} 張，專業才有）、產品與活動定位、自建卡張數（3 vs 10）、席次（2 vs 5）。`],
    ["為什麼專業方案是 5 席？", "因為有審核工作流。產出的人與放行的人必須分開，否則審核只是形式：行銷人員、廣告人員、成效人員、中階主管（審核放行）、負責人（看整體看板）。"],
    ["通路選了可以換嗎？", `可以，每月可更換一次，從 ${CATALOG.channels} 個通路（Facebook、Instagram、Threads、LINE、TikTok、電子報、官網）裡選：基礎 2 個、專業 5 個。`],
    ["自建任務卡是什麼？", "把你自己理想中的成品（例如 10 篇促購文）貼上來，AI 反推成 SKILL，試寫確認後上架，存入品牌任務庫。字數上下限、節奏、開場方式、CTA 位置全部從你貼的成品量出來，之後回頭當驗收標準。"],
    ["加購一定要搭配專業方案嗎？", "是。策略顧問導入與電商營運報告都必須搭配 OnBrand 專業（NT$9,000／月）訂閱。"],
    ["爆款結構卡為什麼要每月更新？", "爆款結構會過期：TikTok 只有 27% 的趨勢活過兩週。所以每張爆款卡都印著傳播數字與量測年月，並每月更新。"],
    ["試用期過了會怎樣？", "試用在「7 天到期」或「1,000 試用點數用完」時停止，先到先停。到期後仍可查看歷史紀錄，但不能再產出。"],
    ["可以中途取消嗎？", "可以，隨時於「帳號設定」取消。當期到期前仍能正常使用，到期後不再扣款。"],
    ["產出的內容版權歸誰？", "全部歸您。我們不主張任何權利，可商用、二次創作、轉售。"],
    ["能開公司發票嗎？", "可以。在「帳號設定 → 發票資訊」填統編 + 公司名，下次扣款自動開立 B2B 三聯式電子發票。"],
    ["單篇／套組／企劃任務有什麼差別？", "單篇 = 單一快速輸出（1 個變體）。套組 = 5 個文案變體 + 5 張圖並行產出。企劃 = 先做研究再產出整套內容的深度流程。"],
  ];

  const startCheckout = (code: string) => {
    // Wait for billing status to load before deciding route — don't misroute a
    // logged-in user to register during the first-response window.
    if (!status && !statusLoading) { navigate("/auth/register"); return; }
    if (!status) return;
    if (!checkoutMut) { window.location.href = "mailto:sowork@sowork.ai?subject=OnBrand Upgrade"; return; }
    const wsId = (status as any)?.workspaceId ?? (status as any)?.defaultWorkspaceId;
    if (!wsId) {
      showToastGlobal(isEn ? "Couldn't find your workspace — please reload and try again." : "找不到 workspace，請重新整理頁面再試一次。");
      return;
    }
    checkoutMut.mutate({ planCode: code as any, workspaceId: Number(wsId), annual: false });
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-6 pt-14 pb-12">
        {/* Header — Word 封面 */}
        <div className="text-center mb-10">
          <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-neutral-600 mb-3">
            {isEn ? "PLANS & PRICING" : "方案與報價"}
          </p>
          <h1 className="font-semibold tracking-tight leading-tight mb-3 text-neutral-900" style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)" }}>
            {isEn ? "A content production system with sources" : "有出處的內容生產系統"}
          </h1>
          <p
            className="mx-auto text-neutral-700"
            style={{ fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif', fontStyle: "italic", fontSize: 15, lineHeight: 1.7, maxWidth: 640 }}
          >
            {isEn
              ? "ChatGPT can name a source — but it makes it up. OnBrand cannot: the code blocks it."
              : "ChatGPT 說得出出處，但它是編的。OnBrand 編不出來——程式擋著。"}
          </p>
        </div>

        {/* 封面四格 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-neutral-200 border border-neutral-200 mb-12">
          {[
            [isEn ? "Task cards" : "任務卡", isEn ? `${CATALOG.viral} viral-structure cards + your own` : `爆款結構卡 ${CATALOG.viral} 張 ＋ 品牌自建卡`],
            [isEn ? "Channels" : "支援通路", isEn ? `${CATALOG.channels}` : `${CATALOG.channels} 個`],
            [isEn ? "Self-serve plans" : "自助方案", `${sym}${price.starter.toLocaleString()} ／ ${sym}${price.pro.toLocaleString()} ${isEn ? "per month" : "每月"}`],
            [isEn ? "Consultant onboarding" : "顧問導入", isEn ? "from NT$80,000 (one-time)" : "NT$80,000 起（一次性）"],
          ].map(([k, v]) => (
            <div key={k} className="bg-white px-4 py-3">
              <div className="text-[12px] text-neutral-500">{k}</div>
              <div className="text-sm font-medium text-neutral-900 mt-0.5">{v}</div>
            </div>
          ))}
        </div>

        {/* 三 · 自助訂閱 */}
        <div className="grid gap-5 md:grid-cols-2 max-w-3xl mx-auto">
          {TIERS.map((tier) => (
            <div
              key={tier.code}
              className="bg-white rounded-2xl p-6 flex flex-col relative"
              style={{
                border: tier.highlight ? "2px solid #171717" : "1px solid #D4D4D4",
                boxShadow: tier.highlight ? "0 8px 32px -8px rgba(0,0,0,0.12)" : undefined,
              }}
            >
              {tier.highlightLabel && (
                <span className="absolute -top-3 left-6 text-[12px] font-bold tracking-[0.18em] px-2 py-0.5 rounded-md bg-neutral-900 text-white">
                  {tier.highlightLabel}
                </span>
              )}
              <div className="flex items-baseline justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-neutral-600">{tier.name}</p>
                <p className="text-[12px] font-semibold text-neutral-900">{tier.seats}</p>
              </div>
              <p className="text-xs text-neutral-700 mt-0.5">{tier.sub}</p>

              <div className="flex items-baseline gap-1.5 mt-3">
                <span className="text-3xl font-bold text-neutral-900 tabular-nums">{tier.monthly.toLocaleString()}</span>
                <span className="text-sm text-neutral-700">{sym} {isEn ? "/ month" : "／月"}</span>
              </div>
              <p className="text-[12px] text-neutral-500 mt-1">
                {currency === "TWD"
                  ? (isEn ? "NTD, before tax · cancel anytime" : "台幣未稅 · 隨時取消")
                  : (isEn ? "Billed in USD · cancel anytime" : "以美金計費 · 隨時取消")}
              </p>

              <dl className="mt-4 mb-6 flex-1 divide-y divide-neutral-200 border-t border-neutral-200">
                {tier.layers.map((L) => (
                  <div key={L.label} className="grid grid-cols-[4.5rem_1fr] gap-3 py-2.5">
                    <dt className="text-[12px] font-medium text-neutral-500 pt-0.5">{L.label}</dt>
                    <dd className={`text-sm leading-relaxed ${L.muted ? "text-neutral-400" : "text-neutral-800"}`}>
                      {L.items.map((it) => <div key={it}>{it}</div>)}
                    </dd>
                  </div>
                ))}
              </dl>

              <button
                onClick={() => startCheckout(tier.code)}
                disabled={checkoutMut?.isPending}
                className="w-full py-2.5 rounded-lg font-semibold text-sm transition"
                style={{
                  background: tier.highlight ? "#171717" : "white",
                  color: tier.highlight ? "white" : "#171717",
                  border: tier.highlight ? "none" : "1px solid #171717",
                }}
              >
                {tier.cta}
              </button>
            </div>
          ))}
        </div>

        <p className="text-sm text-neutral-800 mt-6 max-w-3xl mx-auto leading-relaxed">
          {isEn
            ? "The two tiers differ in capability, not volume: runs are unlimited on both and campaign tasks are open on both. The difference is channels, viral-structure cards, product and campaign positioning, own task cards, and seats."
            : "兩級的差別在能力，不在用量：執行次數兩級都不限，企劃任務兩級都開放。差別是通路數、爆款結構卡、產品與活動定位、自建卡張數、席次。"}
        </p>
        <p className="text-sm text-neutral-800 mt-3 max-w-3xl mx-auto leading-relaxed">
          {isEn
            ? "Both tiers see the performance layer as an early preview on simulated data — what you would see once real data is connected. Real-data connections are our top product investment right now; Professional gets priority access as we build it out."
            : "成效層兩級都看得到早期預覽：用模擬數據把「接上真資料之後你會看到什麼」先擺在眼前。真實串接是我們目前最重點的產品投資方向，專業方案可以優先加購搶先體驗。"}
        </p>
        <p className="text-center text-xs text-neutral-500 mt-3 max-w-3xl mx-auto">
          {isEn
            ? "Both plans include: project history, festival reminders, in-app support (Mia), 7-day free trial · No credit card to start · Cancel anytime"
            : "兩級皆含：專案歷史、節慶提醒、站內客服 Mia、7 天免費試用 · 開始不需信用卡 · 隨時取消"}
        </p>

        {/* 5 席 */}
        <div className="max-w-3xl mx-auto">
          <H3>{isEn ? "Why 5 seats" : "為什麼是 5 席"}</H3>
          <p className="text-sm text-neutral-700 mb-3 leading-relaxed">
            {isEn
              ? "Because of the review workflow. The person producing and the person approving must be different people, otherwise review is a formality:"
              : "5 席是因為有審核工作流。產出的人與放行的人必須分開，否則審核只是形式："}
          </p>
          <Tbl
            head={isEn ? ["Seat", "Role", "In the system"] : ["席次", "角色", "在系統裡做什麼"]}
            rows={isEn ? [
              ["1", "Marketer", "Picks cards, produces posts and images"],
              ["2", "Ads specialist", "Produces ad copy and creative"],
              ["3", "Performance analyst", "Reads the data, reports which cards work"],
              ["4", "Mid-level manager", "Reviews and approves"],
              ["5", "Owner", "Watches the overall dashboard"],
            ] : [
              ["1", "行銷人員", "選卡、產出貼文與圖"],
              ["2", "廣告人員", "產出廣告文案與素材"],
              ["3", "成效人員", "看數據、回報哪些卡有效"],
              ["4", "中階主管", "審核放行"],
              ["5", "負責人", "看整體看板"],
            ]}
          />
        </div>

        {/* 四 · 加購 */}
        <div className="max-w-3xl mx-auto">
          <H2>{isEn ? "Add-ons" : "加購"}</H2>
          <p className="text-sm font-semibold text-neutral-900 mb-6">
            {isEn
              ? "Both add-ons require an active OnBrand Professional (NT$9,000 / month) subscription."
              : "以下兩項都必須搭配 OnBrand 專業（NT$9,000／月）訂閱。"}
          </p>

          <div className="border border-neutral-200 rounded-xl p-6 mb-5">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h3 className="text-base font-semibold text-neutral-900">{isEn ? "Strategy-consultant onboarding" : "策略顧問導入"}</h3>
              <span className="text-sm font-semibold text-neutral-900 tabular-nums">NT$80,000 <span className="font-normal text-neutral-500">{isEn ? "one-time" : "（一次性）"}</span></span>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-neutral-800">
              {(isEn ? [
                "Inventory and consolidation of your internal AI-writing SKILLs",
                "8 custom task cards — built from your own methodology, not generic templates",
                "Brand brain setup",
                "Product strategy setup",
              ] : [
                "內部 AI 寫文 SKILL 盤點與整理",
                "客製任務卡建置 8 張——來源是你自己的方法論，不是通用模板",
                "品牌大腦建置",
                "產品策略建置",
              ]).map((x) => <li key={x} className="flex gap-2"><span className="text-neutral-400">—</span><span>{x}</span></li>)}
            </ul>
            <p className="text-sm text-neutral-700 mt-3">{isEn ? "From the 9th card: NT$25,000 per card." : "第 9 張起加購 NT$25,000／張。"}</p>
            <p className="text-sm font-semibold text-neutral-900 mt-1">
              {isEn
                ? "These 8 cards are a permanent asset, not consultant hours. When onboarding ends, the way of writing stays in your Brand Task Library."
                : "這 8 張是永久資產，不是顧問時數。導入結束後，那套寫法留在你的品牌任務庫裡。"}
            </p>
          </div>

          <div className="border border-neutral-200 rounded-xl p-6">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h3 className="text-base font-semibold text-neutral-900">{isEn ? "E-commerce operations report" : "電商營運報告"}</h3>
              <span className="text-sm font-semibold text-neutral-900 tabular-nums">
                NT$48,000 <span className="font-normal text-neutral-500">{isEn ? "setup" : "（建置）"}</span> ＋ NT$25,000 <span className="font-normal text-neutral-500">{isEn ? "/ month" : "／月（維運）"}</span>
              </span>
            </div>
            <p className="text-sm text-neutral-700 mt-2">
              {isEn ? "Setup scope: 1 brand / 1 market / up to 20 SKUs, using your existing e-commerce back-office data." : "建置範圍：1 品牌／1 市場／20 品項內，使用既有電商後台資料。"}
            </p>
            <Tbl
              className="mt-4"
              labelCol
              rows={isEn ? [
                ["Setup", "Metric definitions aligned (order / paid / cancelled / refund / AOV)\nBack-office data connection with Taiwan-timezone daily close\nProduct data normalisation and alias mapping\nDaily SKU sales database\nMonth-end cross-check mechanism\nMonthly operations report decision framework\nAuto-refresh, exception alerts and first-month calibration"],
                ["Monthly", "Daily e-commerce data operations and anomaly monitoring\nMonth-end reconciliation and 1 operations decision report (incl. 1 text revision)\nCustom Data Agent upkeep (incl. 1 logic or format change)\nLINE chat entry point and scheduled daily push\nRoutine maintenance"],
              ] : [
                ["建置", "營運數據口徑盤點（成交／付款／取消／退款／客單價定義統一）\n後台資料串接與台灣時區日結規則\n商品資料標準化與別名對應\n每日品項銷售數據庫\n月結交叉核對機制\n月營運報告決策架構\n自動更新、例外通知與首月校準"],
                ["每月維運", "每日電商資料營運與異常監測\n月結核對與營運決策報告 1 份（含 1 次文字修訂）\n客製 Data Agent 維運（含 1 次邏輯或格式調整）\nLINE 對話入口維運與固定日報推播\n系統例行維護"],
              ]}
            />
            <p className="text-sm text-neutral-700 mt-3">
              {isEn ? "Monthly scope cap: 1 store / 1 market / up to 20 SKUs / 1 Data Agent / 1 LINE official account." : "維運方案上限：1 商店／1 市場／20 品項內／1 個 Data Agent／1 個 LINE 官方帳號。"}
            </p>
            <Note>
              {isEn
                ? "Not included: consumer customer service, order / refund / change handling, new stores, new markets, real-time crisis watch, new feature development and extra report lines."
                : "不含：消費者客服、接單／退款／改單、新商店、新市場、即時危機值守、全新功能開發與額外報告線。"}
            </Note>
            <p className="text-sm font-semibold text-neutral-900 mt-4 mb-2">{isEn ? "SKU tiers" : "品項級距加購"}</p>
            <Tbl
              labelCol
              head={isEn ? ["Total SKUs", "One-time setup", "Monthly"] : ["品項總數", "一次建置加購", "月費加購"]}
              rows={[
                ["1–20", isEn ? "included in NT$48,000" : "含在 NT$48,000", isEn ? "included in NT$25,000" : "含在 NT$25,000"],
                ["21–50", "＋NT$8,000", "＋NT$5,000"],
                ["51–100", "＋NT$12,000", "＋NT$10,000"],
                ["101–200", "＋NT$18,000", "＋NT$15,000"],
                [isEn ? "200+ / multi-store" : "200 以上／多商店", isEn ? "quoted per project" : "專案報價", isEn ? "quoted per project" : "專案報價"],
              ]}
            />
            {/* 2026-09-21（CJ「把『可加購成效層』接上真正的購買路徑」）：這張卡原本
                只有說明、沒有任何入口。範圍要先確認資料權限與工作說明書，所以是
                「申請」不是「結帳」——見 AddonRequestModal。 */}
            <div className="mt-5 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => {
                  if (!status && !statusLoading) { navigate("/auth/register"); return; }
                  setAddonOpen(true);
                }}
                className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium"
              >
                {isEn ? "Request this add-on →" : "申請加購 →"}
              </button>
              <span className="text-xs text-neutral-500">
                {isEn ? "Sales confirms scope and a statement of work with you before anything is billed." : "業務會先跟你確認範圍與工作說明書，簽約後才開始計費。"}
              </span>
            </div>
          </div>
        </div>

        {/* 二 · 內容層出處 */}
        <div className="max-w-3xl mx-auto">
          <H2>{isEn ? "Two kinds of task cards" : "兩種任務卡"}</H2>
          <Tbl
            hiCol={1}
            head={isEn ? ["Why this card is written this way", "Cards"] : ["這張卡憑什麼這樣寫", "張數"]}
            rows={isEn ? [
              ["Viral structure — deconstructed from real viral content; each card carries the spread metric and the month measured", `${CATALOG.viral} (Professional)`],
              ["Brand-built — reverse-engineered from the posts you paste; length, rhythm and CTA are measured from your samples", "3 / 10 (by plan)"],
            ] : [
              ["爆款結構——拆自真實爆紅內容，每張附傳播數字與量測年月", `${CATALOG.viral}（專業方案）`],
              ["品牌自建——從你貼的成品反推，字數、節奏、CTA 位置都從範例量出來", "3／10（依方案）"],
            ]}
          />
          <Note>{isEn ? "Viral-structure card example: Chipotle #GuacDance — 250k submissions and 430M views in 6 days (measured 2019-07)." : "爆款結構卡範例：Chipotle「#GuacDance」6 天 25 萬支投稿、4.3 億次播放（2019-07 量測）。"}</Note>
          <Note>{isEn ? "Viral structures expire: only 27% of TikTok trends survive two weeks, so every viral card carries its measurement month and the set is refreshed monthly." : "爆款結構會過期：TikTok 只有 27% 的趨勢活過兩週，所以每張爆款卡都印著量測年月，並每月更新。"}</Note>
          <p className="text-sm text-neutral-800 mt-4 leading-relaxed">
            {isEn
              ? "Our publishing check is hard: a card labelled “from a viral post” that cannot produce a spread metric and a measurement month does not ship — the automated tests fail. Brand-built cards are held to the numbers measured from your own samples."
              : "我們的上架檢核是硬性的：一張卡若標示「拆自爆款」，卻交不出傳播數字與量測年月，這張卡上不了架，自動化測試會直接失敗。品牌自建卡則用從你範例量出來的數字當驗收標準。"}
          </p>
        </div>

        {/* 一 · 為什麼不是 ChatGPT */}
        <div className="max-w-3xl mx-auto">
          <H2>{isEn ? "Why not ChatGPT" : "為什麼不是 ChatGPT"}</H2>
          <Tbl
            labelCol
            hiCol={3}
            head={isEn ? ["", "ChatGPT · Jasper", "Swipe files\nForeplay · Motion · Atria", "OnBrand"] : ["", "ChatGPT · Jasper", "素材庫\nForeplay · Motion · Atria", "OnBrand"]}
            rows={isEn ? [
              ["Writes it for you", "Yes", "No", "Yes"],
              ["Can say where the structure comes from", "Gives you an answer\nbut changes it when asked twice", "Gives examples\nnot structures", `All ${CATALOG.viral} viral-structure cards`],
              ["Writes the way your best posts are written", "Drifts", "No", "Brand-built cards, measured from your samples"],
              ["When the source was measured", "None", "None", "Every viral card carries the month"],
              ["Knows what your brand must not say", "No", "No", "Fact whitelist + banned words"],
              ["What you have after three years", "Nothing", "Nothing", "A Brand Task Library"],
            ] : [
              ["直接幫你寫出來", "可以", "不寫", "可以"],
              ["說得出結構出自哪裡", "會給你一個答案\n但問第二次會改口", "給素材\n不給結構", `爆款結構卡 ${CATALOG.viral} 張全部說得出`],
              ["照你最好的那幾篇的寫法寫", "會漂移", "不會", "品牌自建卡，從你的範例量出來"],
              ["出處什麼時候量的", "沒有", "沒有", "每張爆款卡印著年月"],
              ["知道你的品牌不能講什麼", "不知道", "不知道", "事實白名單＋禁用詞"],
              ["用三年之後累積了什麼", "零", "零", "一座品牌任務庫"],
            ]}
          />
          <H3>{isEn ? "Verify it yourself in 30 seconds" : "客戶自己 30 秒就能驗證"}</H3>
          <div className="border-l-4 border-neutral-900 pl-4 space-y-2 text-sm text-neutral-800 leading-relaxed">
            <p>{isEn ? "Ask any AI: “Write me a Facebook post and tell me which viral post this structure comes from, and what that post's numbers were.”" : "問任何一個 AI：「幫我寫一則 FB 貼文，並告訴我這個結構出自哪一則爆紅內容、那則內容的數據是多少。」"}</p>
            <p className="font-semibold">{isEn ? "It will give you a case name and a set of numbers. Ask “how do you know that number” — it changes its answer." : "它會給你案例名和一組數字。再問一次「你怎麼知道那個數字」——它會改口。"}</p>
            <p>{isEn ? "Ask OnBrand the same question and the answer is the same every time, because it is written on the card and a test forbids leaving it blank." : "同一題問 OnBrand，答案每次都一樣。因為那寫死在卡片上，而且有測試擋著不准留白。"}</p>
          </div>
        </div>

        {/* 五 · 常見組合 */}
        <div className="max-w-3xl mx-auto">
          <H2>{isEn ? "Common bundles" : "常見組合"}</H2>
          <Tbl
            labelCol
            hiCol={3}
            head={isEn ? ["Bundle", "One-time", "Monthly", "First-year total"] : ["組合", "一次性", "每月", "第一年合計"]}
            rows={isEn ? [
              ["Basic", "—", "NT$2,250", "NT$27,000"],
              ["Professional", "—", "NT$9,000", "NT$108,000"],
              ["Professional + consultant onboarding", "NT$80,000", "NT$9,000", "NT$188,000"],
              ["Professional + e-commerce report", "NT$48,000", "NT$34,000", "NT$456,000"],
              ["Full (Professional + both add-ons)", "NT$128,000", "NT$34,000", "NT$536,000"],
            ] : [
              ["基礎", "—", "NT$2,250", "NT$27,000"],
              ["專業", "—", "NT$9,000", "NT$108,000"],
              ["專業 ＋ 策略顧問導入", "NT$80,000", "NT$9,000", "NT$188,000"],
              ["專業 ＋ 電商營運報告", "NT$48,000", "NT$34,000", "NT$456,000"],
              ["全配（專業＋兩項加購）", "NT$128,000", "NT$34,000", "NT$536,000"],
            ]}
          />
          <p className="text-sm text-neutral-700 mt-3">{isEn ? "From the second year, the full bundle's recurring annual cost is NT$408,000." : "全配自第二年起，年度經常性費用為 NT$408,000。"}</p>
          <Note>{isEn ? "All figures are before tax; quotes are valid for 30 days. The actual onboarding scope follows the statement of work confirmed at signing." : "本表數字為未稅價；報價有效期 30 日。實際導入範圍以簽約時確認之工作說明書為準。"}</Note>
        </div>

        {/* 企業客製版 */}
        <div className="bg-neutral-50 rounded-xl p-6 flex items-center justify-between flex-wrap gap-3 max-w-3xl mx-auto mt-12">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-neutral-600 mb-1">ENTERPRISE · CUSTOM</p>
            <p className="text-base font-semibold text-neutral-900">{isEn ? "Enterprise" : "企業客製版"}</p>
            <p className="text-sm text-neutral-700 mt-1 max-w-xl">
              {isEn
                ? "Multiple brands or markets, your internal SKILLs turned into cards, performance layer and e-commerce reporting — setup fee + monthly, quoted per company."
                : "多品牌或多市場、把貴公司內部 SKILL 做成卡、成效層與電商營運報告 — 建置費 + 月費，依公司報價。"}
            </p>
          </div>
          <a
            href={isEn ? "mailto:sowork@sowork.ai?subject=Enterprise inquiry" : "mailto:sowork@sowork.ai?subject=企業客製版洽詢"}
            className="px-4 py-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium"
          >
            {isEn ? "Talk to sales →" : "聯繫業務 →"}
          </a>
        </div>

        {/* FAQ */}
        <div className="mt-16 text-left max-w-2xl mx-auto space-y-3">
          <h2 className="text-2xl font-bold text-neutral-900 text-center mb-8">{isEn ? "FAQ" : "常見問題"}</h2>
          {faq.map(([q, a]) => (
            <details key={q} className="border border-neutral-200 rounded-lg p-4">
              <summary className="cursor-pointer font-medium text-neutral-900">{q}</summary>
              <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>

        <AddonRequestModal isOpen={addonOpen} onClose={() => setAddonOpen(false)} />

        {/* Footer */}
        <div className="mt-20 pt-8 border-t border-neutral-200 text-xs text-neutral-500 space-x-4">
          <Link to="/terms" className="hover:text-neutral-900">{t("footer_terms")}</Link>
          <Link to="/privacy" className="hover:text-neutral-900">{t("footer_privacy")}</Link>
          <Link to="/refund" className="hover:text-neutral-900">{t("footer_refund")}</Link>
          <a href="mailto:sowork@sowork.ai" className="hover:text-neutral-900">sowork@sowork.ai</a>
        </div>
      </div>
    </div>
  );
}
