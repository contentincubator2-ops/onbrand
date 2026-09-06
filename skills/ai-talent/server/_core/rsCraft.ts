/**
 * Research & Strategy craft layer — 2026-05-17.
 * Faithful mirror of igCraft.ts / edmCraft.ts: brand-AGNOSTIC craft
 * discipline (the HOW) for the RS family only. Injected only for
 * rs-family body tasks so other platforms are completely unaffected.
 *
 * Research outputs must be actionable, not just descriptive. The
 * rubric encodes persona, interview, JTBD, journey map, synthesis,
 * competitive research craft plus zh-TW Taiwan consumer context.
 */

import type { FBTaskTemplate } from "./quickTaskFB";

/**
 * Is this a Research & Strategy task?
 * Covers rs-* templates exclusively.
 */
export function isResearchTask(template: FBTaskTemplate): boolean {
  const id = String(template.id ?? "");
  return id.startsWith("rs-");
}

/** All RS tasks are full-body outputs — even rs-30-consent-form and
 *  rs-30-screener benefit from methodology references. */
export function isResearchBodyTask(template: FBTaskTemplate): boolean {
  return isResearchTask(template);
}

/** The award-grade Research & Strategy rubric. */
export const RS_CRAFT_RUBRIC = `
# 研究與策略得獎級工藝準則（嚴格遵守）
研究產出必須可執行，不只是描述性——洞察（insight）＝觀察（what happened）＋意涵（implication for action）：
【Persona craft】
- 行為基礎，非人口統計基礎：persona 的核心是「在什麼情境下做什麼決策」，不是年齡/性別/收入。
- 一個主要 persona 解決一個核心問題；不要創造 10 個 persona（決策時全部失效）。
- 引言/語錄：真實訪談語句（或接近真實的綜合）比任何敘述都有力。
- Anti-persona：說清楚誰不是你的用戶，與主要 persona 同等重要。
【訪談指南 craft】
- 開放式問題：「告訴我上次你...」而非「你有沒有...」。
- 無引導性：不能在問題裡暗示答案；去掉所有「你是不是覺得...」。
- 時間線探索：問具體事件和時間點，不問態度（「上次發生是什麼時候？發生了什麼？」）。
- 沉默是工具：指南需預留 5-10 秒沉默探測，讓受訪者補充。
【JTBD craft（Jobs To Be Done）】
- 聚焦在「工作」不在解決方案：「當我...（情境）我想要...（動機），這樣我就能...（期望結果）」。
- 功能性工作＋情感性工作＋社會性工作三層都要探索。
- Switch interview：問受訪者上一次「解雇」舊產品「雇用」新產品的完整故事。
- Forces diagram：推力（為什麼轉換）＋拉力（新解決方案的吸引）＋習慣阻力＋焦慮摩擦。
【旅程地圖 craft】
- 以顧客階段為軸（非公司內部流程為軸）；顧客視角的步驟，不是部門視角的步驟。
- 每個觸點：行動＋情緒＋思考＋痛點＋機會五欄。
- 情緒曲線可視化：讓利害關係人一眼看出哪個階段是最大痛點。
【綜合 craft（How Might We）】
- 觀察→洞察→HMW（How Might We）：每個 HMW 句子格式：「我們可以如何...讓...從而...？」
- 洞察需有行動意涵：只描述現象不算洞察；必須指向一個可執行方向。
- 10-15 個 HMW 是可工作的數量（太少不夠發散，太多無法聚焦）。
【競爭研究 craft】
- 競爭訪談：Win/Loss 分析需問「你最後選擇了什麼，為什麼」，不問「你為什麼沒選我們」。
- 競爭地圖：軸線必須是顧客真正在乎的取捨，非公司認為重要的功能。
【zh-TW 在地化｜最高優先】
- 台灣消費者行為：LINE 是主要溝通工具（影響顧客旅程的每個觸點）；實體店面仍是信任建立主要渠道。
- 傳統中文研究術語；persona 和訪談用台灣慣用的研究術語，不直譯美式學術用詞。
- 繁體中文、台灣口語語境；訪談引言保留台灣口語特色。
`.trim();

/**
 * Per-task award reference — methodology + market research references.
 */
const RS_TASK_REF: Record<string, string> = {
  "rs-30-persona-draft":        "Alan Cooper「The Inmates Are Running the Asylum」（HCI/UX 業界 persona 方法論標準）：persona 驅動 Apple、Google、IDEO 產品決策；行為基礎勝過人口統計基礎。",
  "rs-30-interview-guide":      "IDEO Design Thinking 訪談方法論（IDEO 是 design thinking 起源機構）：開放式問題＋時間線探索＋沉默作為工具；業界最被引用的訪談指南框架。",
  "rs-30-jtbd-guide":           "Clayton Christensen「Jobs To Be Done」框架（Harvard Business School）：Intercom 以 JTBD 建立產品策略；聚焦在「工作」不在解決方案——人們為什麼「雇用」一個產品。",
  "rs-30-journey-map":          "Nielsen Norman Group 旅程地圖標準（NNG 是全球 UX 研究權威）：旅程地圖格式被 90% UX 文獻引用；以顧客階段為軸，五欄結構：行動/情緒/思考/痛點/機會。",
  "rs-30-survey":               "SurveyMonkey「好奇心基礎研究」方法論（AMA Marketing Research Award 引用）：B2C 問卷設計業界標準；問題順序影響作答框架，選項設計影響資料品質。",
  "rs-30-synthesis-template":   "IBM Design Thinking「Observe-Reflect-Make」循環（IBM Enterprise Design Thinking；超過 300,000 名從業者認證；IBM 在全球規模導入 HMW 綜合框架的最大企業案例）：觀察→洞察→HMW；每個 HMW 必須指向可執行的設計方向；綜合產出是決策輸入，不只是資料報告。",
  "rs-30-competitive-interview": "Win/Loss 分析方法論（Gartner Award Best Sales Enablement Tool）：競爭訪談產出可執行定位洞察；問「最後選了什麼」不問「為什麼沒選我們」。",
  "rs-30-screener":             "UserTesting 研究篩選問卷設計標準（UserTesting 是全球最大遠端用戶研究平台；其 screener 設計指南被數千個 UX 團隊引用）：篩選問卷以行為問題取代人口統計問題（「你上個月有沒有做 X」而非「你幾歲」）；screener 品質決定樣本效度；最佳 screener 讓不符合條件者自動放棄。",
  "rs-30-usability-script":     "Steve Krug「Don't Make Me Think」易用性測試協議（業界標準；5 人規則）：5 個受訪者找出 85% 的問題；腳本設計讓受訪者完成任務，不詢問意見。",
  "rs-30-consent-form":         "IRB（Institutional Review Board）知情同意書標準（Google UX Research 和 IDEO 使用）：倫理研究標準；同意書需說明資料用途、匿名化程度、退出權利。",
  "rs-60-interview-guide":      "Intercom 產品研究深度訪談指南（Intercom Research Blog；SaaS 業界最廣流傳的 60 分鐘訪談結構）：暖場（10 分鐘，建立信任）→ JTBD 核心探索（40 分鐘，時間線重建＋Forces diagram）→ 綜合確認（10 分鐘，受訪者自己說出洞察）；不引導答案；沉默是主持人最強工具。",
  "rs-60-jtbd-suite":           "Bob Moesta「Demand-Side Sales」JTBD 套組（Bob Moesta 是 JTBD 與 Clayton Christensen 的共同創建者）：套組＝Forces diagram＋時間線訪談＋Switch interview 三件完整組合。",
  "rs-60-persona-suite":        "Mailchimp UX Research 多 Persona 套組方法論（Mailchimp Research Blog；以 Anti-persona 定義受眾邊界的完整套組方法被 Design System 社群廣泛引用）：完整套組 = 主要 persona（核心行為模式）＋次要 persona（邊緣但重要的用例）＋Anti-persona（誰不是我們的用戶）＋JTBD 對齊；Anti-persona 是最被低估的工具——定義邊界比定義核心更能驅動決策。",
  "rs-99-discovery-sprint":     "Google Ventures Design Sprint（Jake Knapp《Sprint》書；Slack/Airbnb 等使用）：5 天快速發現 sprint 業界標準；每天有明確 deliverable 和決策門檻。",
  "rs-99-competitor-mapping":   "Porter's Five Forces＋Blue Ocean Strategy 競爭地圖（Michael Porter Harvard Business School；W. Chan Kim & Renée Mauborgne INSEAD）：競爭地圖軸線＝顧客真正在乎的價值取捨，非公司認為重要的功能。",
  "rs-99-competitor-ads":       "Pathmatics / Semrush 競爭廣告分析方法論（SpyFu Award Best Competitive Intelligence Tool）：競爭廣告分析＝投放策略（媒體組合/時間節點/創意演進）＋訊息策略（定位主張/受眾假設）。",
};

/** Per-use-case playbook — keyed by taskId pattern. */
export function rsPlaybookFor(taskId: string): string {
  const id = String(taskId ?? "");
  const ref = RS_TASK_REF[id];
  // 2026-09-06 (CJ): fallback exemplar per branch. Until now `ref` existed
  // only on an exact task-id hit, and a brand pack's custom ids are never in
  // RS_TASK_REF — so those cards got the structure and no case. Each fallback is
  // resolved from the SAME regex that selected the branch, against this
  // module's own case pool: no second lookup table to drift, no new claim.
  const P = (s: string, fallbackKey?: keyof typeof RS_TASK_REF) => {
    const use = ref ?? (fallbackKey ? RS_TASK_REF[fallbackKey] : undefined);
    return `# 本任務 playbook（研究策略得獎模式）\n${s}` +
      (use ? `\n# 得獎參考（學此可遷移工藝，非抄作品）\n${use}` : "");
  };

  if (/persona/.test(id) && !(/suite/.test(id)))
    return P("Persona 三必要：行為基礎（非人口統計）＋真實引言（訪談語句）＋Anti-persona；一個主要 persona 解決一個核心問題。", "rs-30-persona-draft");
  if (/persona-suite/.test(id))
    return P("Persona 套組四件：主要 persona＋次要 persona＋Anti-persona＋JTBD 對齊；四件完整才能支撐產品/行銷決策。", "rs-60-persona-suite");
  if (/interview/.test(id) && !(/competitive/.test(id)))
    return P("訪談指南：開放式問題（Tell me about...）＋無引導性＋時間線探索（具體事件不問態度）＋沉默探測預留。", "rs-30-persona-draft");
  if (/jtbd/.test(id) && !(/suite/.test(id)))
    return P("JTBD 指南：聚焦「工作」不在解決方案；三層探索（功能/情感/社會）；Switch interview 完整故事；Forces diagram 四象限。", "rs-30-persona-draft");
  if (/jtbd-suite/.test(id))
    return P("JTBD 套組三件：Forces diagram＋時間線訪談腳本＋Switch interview 指南；三件合用才能重建完整購買故事。", "rs-60-jtbd-suite");
  if (/journey-map/.test(id))
    return P("旅程地圖：以顧客階段為軸（非公司流程）；五欄（行動/情緒/思考/痛點/機會）；情緒曲線可視化讓利害關係人一眼看到最大痛點。", "rs-30-journey-map");
  if (/survey/.test(id))
    return P("問卷設計：問題順序影響框架（從廣到窄）＋選項設計避免錨定（隨機化/中性選項）＋跳題邏輯減少疲勞。", "rs-30-survey");
  if (/synthesis/.test(id))
    return P("綜合三步：觀察（what happened）→洞察（why it matters）→HMW（可執行機會）；每個 HMW 必須指向具體設計方向。", "rs-30-synthesis-template");
  if (/competitive-interview/.test(id))
    return P("競爭訪談：問「最後選了什麼，為什麼」；時間線重建決策過程；產出可執行的定位洞察，不只是功能比較。", "rs-30-competitive-interview");
  if (/screener/.test(id))
    return P("Screener 設計：行為篩選勝過人口統計篩選；用具體行為問題排除不符合者；樣本品質決定研究效度。", "rs-30-screener");
  if (/usability/.test(id))
    return P("易用性測試腳本：讓受訪者完成任務，不詢問意見（「你認為這個介面怎麼樣？」一律刪除）；5 人找出 85% 問題。", "rs-30-usability-script");
  if (/consent/.test(id))
    return P("知情同意書：說明研究目的＋資料用途＋匿名化程度＋退出權利；語言平易近人（非法律文件語氣）。", "rs-30-consent-form");
  if (/discovery-sprint/.test(id))
    return P("Discovery Sprint 五天：Day1 理解問題→Day2 草繪解決方案→Day3 決策→Day4 原型→Day5 測試；每天有明確 deliverable 和決策門檻。", "rs-99-discovery-sprint");
  if (/competitor-mapping/.test(id))
    return P("競爭地圖：Porter Five Forces 結構分析＋Blue Ocean 價值創新軸線；軸線必須是顧客真正在乎的取捨，非公司認為重要的功能。", "rs-99-competitor-mapping");
  if (/competitor-ads/.test(id))
    return P("競爭廣告分析：投放策略（媒體組合/時間節點/創意演進週期）＋訊息策略（定位主張/受眾假設/情緒觸發）雙軌分析。", "rs-99-competitor-ads");

  return P("研究策略通用：產出必須可執行、洞察必須有行動意涵、行為基礎勝過人口統計基礎、開放式問題不引導答案。", "rs-30-persona-draft");
}
