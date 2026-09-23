/**
 * 展場示範用的產品 profile 內容。
 *
 * 2026-09-23 (CJ「DEMO 頁面請都先幫我寫好」)。
 *
 * ── 每一格都標了它的出身 ─────────────────────────────────────────────
 *   listing = 從該產品在 ExpertHub 的實際頁面整理出來的（簡介、特色、價格都是
 *             真的，所以由它們推得出來的規格、應用場景、授權模式也是真的）
 *   demo    = 示範內容。交期、認證、藍圖、ROI 這幾類公開頁面上沒有，而**替一家
 *             真實的供應商編造「已取得 ISO 27001」是在捏造技術與法遵宣稱**，
 *             所以這些格子寫的是「這一欄該長什麼樣」，並在畫面上標示出來。
 *
 * 這跟客戶白名單那次是同一個判斷：示範可以填滿，但不能讓人把示範當成事實。
 * 填滿的價值在於讓人看見欄位的形狀；標示的價值在於沒有人會拿它去跟客戶講。
 */
import type { SolutionProfile } from "./solutionProfile";

const L = (en: string, zh: string): { en: string; zh: string; source: "listing" } => ({ en, zh, source: "listing" });
const D = (en: string, zh: string): { en: string; zh: string; source: "demo" } => ({ en, zh, source: "demo" });

/** 幾乎每個 SaaS 方案都共用的示範內容，避免十二份各寫一次同樣的話。 */
const SAAS_COMMON = {
  leadTime: D(
    "Cloud tenant provisioned within 3 working days of the order; data migration scoped separately.",
    "下單後 3 個工作天內開通雲端租戶；資料搬遷另行評估。",
  ),
  sla: D(
    "5x8 support with a 4-hour first-response target. 7x24 available as a paid upgrade. Remote by default; on-site by arrangement.",
    "5x8 服務，首次回應目標 4 小時。7x24 為付費升級。預設遠端，到場另約。",
  ),
  certifications: D(
    "Illustrative only — ask the vendor for current certificates and their issue dates before quoting any of this.",
    "示範內容——引用之前請向供應商索取現行證書與取得日期。",
  ),
  ipIndemnity: D(
    "Standard reseller terms; indemnity scope is set in the master agreement, not here.",
    "一般經銷條款；保障範圍以主約為準，不在這裡認定。",
  ),
};

export const SOLUTION_PROFILES: Record<string, SolutionProfile> = {
  gogoform: {
    specs: L(
      "Online forms with routed approvals: leave, procurement, expense and internal review. Every submission, approval, return and completion is queryable.",
      "線上表單與簽核路由：請假、採購、費用申請、內部審核。送出、簽核、退回、完成的每一筆都查得到。",
    ),
    compatibility: L(
      "Browser-based; approvals work on mobile so a manager can sign off away from the office.",
      "瀏覽器操作；行動簽核可用，主管不在辦公室也能核。",
    ),
    useCases: L(
      "Companies where paper forms go missing, approval status is opaque, and cross-department flows stall.",
      "紙本表單容易遺失、簽核進度不透明、跨部門流程卡關的公司。",
    ),
    licensing: L(
      "Monthly subscription in three tiers by team size and usage volume: NT$1,000 / NT$1,600 / NT$5,500.",
      "月訂閱制三檔，依團隊規模與使用量分：NT$1,000／NT$1,600／NT$5,500。",
    ),
    roadmap: D("Illustrative — ask the vendor for the current release plan.", "示範內容——實際版本計畫請向供應商索取。"),
    usp: D(
      "Against a generic form builder: routed approvals by department and grade, and a complete audit record.",
      "相對於通用表單工具：依部門與職級跑簽核路由，而且留下完整稽核紀錄。",
    ),
    roi: D(
      "Illustrative — measure it against the hours your team currently spends chasing approvals.",
      "示範內容——請對照貴公司目前追表單、問進度花掉的工時來估。",
    ),
    ...SAAS_COMMON,
  },

  "lightning-order": {
    specs: L(
      "Omnichannel order intake for small restaurants. Runs on a phone app plus a networked receipt printer — no POS terminal.",
      "中小餐飲的全通路接單。一支手機 App 加一台連網出單印表機就能跑，不需要 POS 機。",
    ),
    compatibility: L(
      "Aggregates dine-in QR self-ordering, takeaway, delivery and in-store channels into one queue.",
      "內用 QR 自助點餐、外帶、外送、店內訂單集中在同一條隊列。",
    ),
    useCases: L(
      "A small restaurant juggling several delivery platforms and losing orders between them.",
      "同時接好幾個外送平台、訂單在平台之間漏掉的小型餐飲店。",
    ),
    licensing: L(
      "Store Basic NT$799/month, Omnichannel PRO NT$999/month, plus a one-time NT$5,500 networked printer.",
      "開店基礎版 NT$799／月、全通路 PRO 版 NT$999／月，另加一次性 NT$5,500 連網印表機。",
    ),
    roadmap: D("Illustrative.", "示範內容。"),
    usp: D(
      "Against a full POS rollout: no terminal to buy, and a store can be live the day the printer arrives.",
      "相對於導入整套 POS：不用買機器，印表機到店當天就能開賣。",
    ),
    roi: D("Illustrative — compare against POS hardware plus per-platform tablet rentals.", "示範內容——請對照 POS 硬體加上各平台平板租金來估。"),
    leadTime: D("Printer ships in 3-5 working days; the app is live immediately.", "印表機 3-5 個工作天出貨；App 即時可用。"),
    sla: SAAS_COMMON.sla,
    certifications: SAAS_COMMON.certifications,
    ipIndemnity: SAAS_COMMON.ipIndemnity,
  },

  "powerarena-hop": {
    specs: L(
      "24/7 station video capture with AI analysis of operator motion: cycle time per station, line-balance and SOP conformance.",
      "24/7 擷取工站影像，以 AI 分析人員動作：各站週期時間、線平衡、SOP 遵守度。",
    ),
    compatibility: L(
      "On-premise AI available in the Enterprise tier, with multi-site deployment and custom integration.",
      "企業版提供完整地端 AI，支援多廠區與客製化整合。",
    ),
    useCases: L(
      "Labour-intensive assembly lines where the bottleneck station is known by feel rather than by data.",
      "勞力密集的組裝線——瓶頸工序目前靠手感判斷，沒有數據。",
    ),
    licensing: L(
      "Three tiers, each including one-time hardware and setup: Starter NT$30,000, Professional NT$120,000, Enterprise NT$170,000.",
      "三個版本，都含一次性硬體與系統設定：入門 NT$30,000、專業 NT$120,000、企業 NT$170,000。",
    ),
    roadmap: D("Illustrative.", "示範內容。"),
    usp: D(
      "Against manual time studies: continuous rather than sampled, and the footage is there to replay.",
      "相對於人工碼錶量測：是連續的不是抽樣的，而且影像回得去。",
    ),
    roi: D("Illustrative — model it on your current line-balance loss.", "示範內容——請用貴廠目前的線平衡損失來估。"),
    leadTime: D("Hardware install and commissioning typically 4-6 weeks from order.", "硬體安裝與試車通常自下單起 4-6 週。"),
    sla: D("On-site support during commissioning; remote thereafter.", "試車期間到場支援，之後轉遠端。"),
    certifications: SAAS_COMMON.certifications,
    ipIndemnity: SAAS_COMMON.ipIndemnity,
  },

  "altabots-ai-agent": {
    specs: L(
      "Text2SQL over the company's own databases: a natural-language question becomes a query, runs, and returns statistics and charts. RAG keeps each figure traceable.",
      "對公司自己的資料庫做 Text2SQL：自然語言問句轉成查詢、執行，回傳統計與圖表。以 RAG 讓每個數字可追溯。",
    ),
    compatibility: L(
      "SaaS, private cloud or on-premise. RBAC permissions and PII anonymisation; the company holds ISO 27001.",
      "SaaS、私有雲或地端部署。具 RBAC 權限管理與個資匿名化；公司通過 ISO 27001。",
    ),
    useCases: L(
      "Monthly reporting that queues behind IT, and managers who can't spot an anomaly in a dense table.",
      "月報要排隊等 IT 拉報表，主管在密集表格裡看不出異常。",
    ),
    licensing: L(
      "SaaS Starter from NT$330,000/year (single database); SaaS Business from NT$540,000/year (multi-source). Private-cloud and on-premise are quoted per case.",
      "SaaS 啟動版 NT$330,000 起／年（單一資料庫）；商業版 NT$540,000 起／年（多資料源）。私有化與地端部署另行報價。",
    ),
    certifications: L(
      "ISO 27001 certified at company level. RBAC and PII anonymisation are product features.",
      "公司層級通過 ISO 27001。RBAC 與個資匿名化為產品功能。",
    ),
    roadmap: D("Illustrative.", "示範內容。"),
    usp: D(
      "Against a BI dashboard: no pre-built report needed — the question itself is the interface.",
      "相對於 BI 儀表板：不必先做好報表，問句本身就是介面。",
    ),
    roi: D(
      "The published case cites a brand's monthly report going from 3 days to 1 minute — confirm the scope before repeating it.",
      "公開案例提到某品牌月報從 3 天縮到 1 分鐘——引用前請先確認適用範圍。",
    ),
    leadTime: D("Consultant-led scoping first; tenant provisioning follows in days.", "先由顧問盤點範圍，之後幾天內開通。"),
    sla: SAAS_COMMON.sla,
    ipIndemnity: SAAS_COMMON.ipIndemnity,
  },

  "carbon-footprint-14067": {
    specs: L(
      "Product-level lifecycle carbon analysis to ISO 14067: raw material, manufacturing, distribution, use and disposal, with the hotspot at each stage.",
      "依 ISO 14067 做產品級生命週期碳排分析：原物料、製造、配送、使用、廢棄，各階段碳排熱點都拆得出來。",
    ),
    compatibility: L(
      "Connects to existing ISO 14064 site inventory data without re-entry; supports PCR-based inventory lists.",
      "無縫對接既有 ISO 14064 廠區盤查數據，免重複輸入；支援依 PCR 建立盤查清單。",
    ),
    useCases: L(
      "A supplier whose European customer wants one product's footprint, not the company total.",
      "歐洲客戶要的是單一產品的碳足跡，不是公司總碳排的供應商。",
    ),
    licensing: L(
      "System subscription from NT$300,000/year, with no cap on the number of products or accounts.",
      "系統訂閱 NT$300,000 起／年，不限碳足跡產品數與帳號數。",
    ),
    certifications: L(
      "Built to the ISO 14067 methodology; connects to ISO 14064 site data.",
      "依 ISO 14067 方法學建置，並對接 ISO 14064 廠區數據。",
    ),
    roadmap: D("Illustrative.", "示範內容。"),
    usp: D(
      "Against a consultancy project: the inventory is yours and reusable, rather than a one-off report.",
      "相對於顧問專案：盤查資料是自己的、可重複使用，不是一份一次性報告。",
    ),
    roi: D("Illustrative — weigh it against the order value at risk if you can't answer the customer.", "示範內容——請對照「答不出來會丟掉多少訂單」來估。"),
    leadTime: D("Onboarding runs alongside your existing 14064 inventory cycle.", "導入與既有 14064 盤查週期併行。"),
    sla: SAAS_COMMON.sla,
    ipIndemnity: SAAS_COMMON.ipIndemnity,
  },

  "premier-support": {
    specs: L(
      "A points pool drawn down against architecture work, troubleshooting and security incidents across cloud, on-premise and security domains.",
      "點數制支援，可用於雲端、地端與資安領域的架構調整、故障排除與資安事件處理。",
    ),
    compatibility: L(
      "Covers cloud, on-premise, security and advisory work — not tied to one vendor's stack.",
      "涵蓋雲端、地端、資安與顧問服務，不綁單一廠商的技術堆疊。",
    ),
    useCases: L(
      "A company without the in-house breadth to cover every domain it occasionally needs.",
      "沒有足夠人力涵蓋所有偶爾才需要的技術領域的公司。",
    ),
    licensing: L(
      "Buy-out point packs: 180 points for NT$306,000; a 60-point top-up for NT$102,000 requires the standard pack first.",
      "點數買斷：標準包 180 點 NT$306,000；加購包 60 點 NT$102,000，須先購買標準包。",
    ),
    sla: L(
      "5x8 and 7x24 service levels are both available; the level is chosen per business need.",
      "支援 5x8 與 7x24 兩種服務等級，依業務需求選擇。",
    ),
    roadmap: D("Illustrative.", "示範內容。"),
    usp: D(
      "Against hiring: capacity without headcount, and no idle cost in a quiet month.",
      "相對於增聘人力：有產能但不增加人頭，沒事的月份也不會閒置成本。",
    ),
    roi: D("Illustrative — compare against the loaded cost of the specialists you'd otherwise hire.", "示範內容——請對照本來要聘的專業人力總成本。"),
    leadTime: D("Points are usable as soon as the pack is activated.", "點數包啟用後即可動用。"),
    certifications: SAAS_COMMON.certifications,
    ipIndemnity: SAAS_COMMON.ipIndemnity,
  },
};

/** 剩下的方案用這個形狀，讓每一張卡都看得出欄位長什麼樣。 */
export function fallbackProfile(nameEn: string, nameZh: string): SolutionProfile {
  return {
    specs: D(
      `Not filled in yet — this is where ${nameEn}'s performance figures belong.`,
      `尚未填寫——${nameZh} 的效能指標放在這一欄。`,
    ),
    useCases: D(
      "Not filled in yet — the situations this removes a problem from.",
      "尚未填寫——這個方案在哪些場景替客戶解決了什麼。",
    ),
    ...SAAS_COMMON,
  };
}
