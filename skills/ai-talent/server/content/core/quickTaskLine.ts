/**
 * quickTaskLine — LINE 官方帳號（ln-）任務卡目錄。
 *
 * 2026-09-29 CJ「要為了台灣市場加入 LINE 和 Threads」。在這之前 LINE 只有品牌自建卡；
 * 這一批是第一批全域卡，全部是爆款結構：2026-08～09 公開報導、附成效數字的 LINE 官方
 * 帳號做法（source.url 對照過原文，弱點寫在 source.caveat）。
 *
 * LINE 是私訊通路，沒有「分享數」這種傳播數字——這裡的證據是開封率、點擊率、好友成長、
 * 導購這類成效數字。前台只列近 3 個月的爆款卡，月份滑出去就自動下架。
 *
 * outputDefaults.platform = "line"：mockup 走 line:broadcast（RunPage 由 ln- 前綴決定）。
 */
import type { FBTaskTemplate, OrchestraConfig } from "./quickTaskFB";

/** 所有 ln- 卡共用的平台底線。 */
const LN_RULES = `

【LINE 官方帳號鐵則】
- 通知欄只看得到第一行：第一句就要讓人想點開，不要「親愛的會員您好」。
- 一則訊息只給一個行動（一個按鈕／一個連結）。
- 群發要考慮封鎖率：不要每天發、不要全是促銷。
- 語言、語氣與在地用語一律依照品牌設定的市場與輸出語言。
- 沒有給定的優惠、數字不要編；需要品牌補的資訊用【待補：xxx】標記。`;

export const LN_30S_TASKS: FBTaskTemplate[] = [
  {
    id: "ln-30-survey-segment-menu",
    tier: "30s",
    postType: "broadcast",
    label: { en: "LINE: Welcome Survey → Segments → Monthly Menu", zh: "LINE：加好友問卷分眾＋每月參與型選單" },
    description: { en: "One question on add, segmented sends, a rich menu that changes as people join in", zh: "加好友就問一題、依答案分眾、圖文選單每月跟著參與度變化" },
    agent_id: 60012, // 沿用 email-crm 現役 agent（CRM 分眾）
    skill_slug: "email-crm",
    source: {
      type: "viral",
      short: "Calbee LINE 官方帳號內製化",
      metric: "訊息開封率約 1.8 倍、點擊率 2 倍；參與型內容後每日問卷回覆約 2.8 倍",
      asOf: "2026-08",
      caveat: "日本案例；只有倍數沒有基準值，也沒寫比較期間",
      url: "https://techtarget.itmedia.co.jp/tt/article/2608/24/226082407/",
      takeaway:
        "開封率靠「通知欄那一行＋訊息開頭」決定，互動靠「每月可參與、會變化的圖文選單」：加好友當下問一題、依答案分眾，通知欄文案持續 A/B 測。",
    },
    primary_question: "你想用哪一題問卷把好友分群？每個月可以辦什麼參與活動？",
    primary_input: { key: "topic", placeholder: "例：你最常什麼時候吃零食？（上班／追劇／運動後）/ 每月投票選下個月的限定口味", type: "textarea" },
    inputs: [
      { key: "topic", label: "分群問卷題目 + 每月參與活動", type: "textarea", required: true },
    ],
    systemPrompt: `你要規劃一套 LINE 官方帳號「加好友問卷分眾＋每月參與型圖文選單」。

產出：
1. 加好友歡迎訊息（60 字內）＋1 題問卷（3–4 個選項），每個選項對應一個分眾標籤。
2. 三個分眾各一則群發（每則 80 字內），各自只給一個行動；並為每則寫 2 個「通知欄第一行」候選做 A/B 測。
3. 每月參與型圖文選單：活動規則（回覆數達多少，選單角色或獎勵就變化）、6 格選單的內容、月中公布進度的訊息。

硬規則：
- 問卷只問一題，不要一次問很多。
- 獎勵只能用用戶給的，沒給就寫【待補】。${LN_RULES}`,
    preferredModel: "qwen",
    maxTokens: 900,
    outputDefaults: { platform: "line", post_type: "broadcast" },
  },
  {
    id: "ln-30-segmented-single-action",
    tier: "30s",
    postType: "broadcast",
    label: { en: "LINE: Same Offer, Rewritten per Segment", zh: "LINE：分眾訊息，一群一個行動" },
    description: { en: "Split friends into 3–4 groups; each gets its own opening and one action", zh: "好友分 3–4 群，每群自己的開頭、只給一個行動" },
    agent_id: 60012,
    skill_slug: "email-crm",
    source: {
      type: "viral",
      short: "幣託 BitoPro 分眾訊息",
      metric: "分眾訊息開封率突破 50%（成長約 6 成）、點擊率 2 倍、好友年成長 35%",
      asOf: "2026-09",
      caveat: "LINE 數轉年會公布的整年彙總，沒說明怎麼切分眾",
      url: "https://www.newspie.com.tw/line-for-business-20260918/",
      takeaway:
        "同一個活動不要全體群發一則，依行為把好友切成幾群、每群改寫自己的開頭與行動，開封率可以從平均拉到五成以上。",
    },
    primary_question: "這次要推什麼？你的好友大概可以分成哪幾群？",
    primary_input: { key: "topic", placeholder: "例：週年慶 / 新加入的、半年沒互動的、常客", type: "textarea" },
    inputs: [
      { key: "topic", label: "這次要推的事 + 好友大概的分群", type: "textarea", required: true },
    ],
    systemPrompt: `你要把同一個活動改寫成 LINE 分眾訊息。

產出：
1. 分群建議：3–4 群，每群一句話定義（依行為，不依個資）。
2. 每群一則訊息（每則 80 字內）：
   - 通知欄第一行：跟這一群最有關的一句話。
   - 內文：這一群為什麼該在意這個活動。
   - 只有一個行動按鈕的文字（8 字內）。
3. 成效比較表：要看的 2 個數字（開封、點擊），以及低效的那一群下一次要改什麼。

硬規則：
- 不同群的優惠內容可以不同，但只能用用戶給的，沒給就寫【待補】。${LN_RULES}`,
    preferredModel: "qwen",
    maxTokens: 800,
    outputDefaults: { platform: "line", post_type: "broadcast" },
  },
  {
    id: "ln-30-rich-menu-order-entry",
    tier: "30s",
    postType: "richmenu",
    label: { en: "LINE: Rich Menu as the Always-On Order Door", zh: "LINE：圖文選單當常駐點餐入口＋群發帶單" },
    description: { en: "Six fixed tiles for ordering; broadcasts push one daily special", zh: "6 格固定放點餐／菜單／優惠／位置，群發只推一個當日主打" },
    agent_id: 180163, // Helen Sung — Social Media Community Builder
    skill_slug: "customer-service-copy",
    source: {
      type: "viral",
      short: "月眉鴨肉焿 LINE 官方帳號",
      metric: "圖文選單年度點擊率約 55%；新客約 20%–40% 由 LINE 導入",
      asOf: "2026-09",
      caveat: "LINE 數轉年會公布的年度數字，沒有單次活動細節",
      url: "https://www.newspie.com.tw/line-for-business-20260918/",
      takeaway:
        "在地餐飲把圖文選單當成常駐的「點餐／訂位」入口，比一次次群發更穩；群發只推一個當日主打，直接連到訂單。",
    },
    primary_question: "客人最常透過 LINE 做的是哪幾件事？今天想推哪一道主打？",
    primary_input: { key: "topic", placeholder: "例：訂位、外帶、看菜單、問營業時間 / 今日主打：鴨肉焿加麵", type: "textarea" },
    inputs: [
      { key: "topic", label: "客人常做的事 + 今天的主打", type: "textarea", required: true },
    ],
    systemPrompt: `你要幫在地店家設計 LINE 官方帳號的「常駐點餐入口」圖文選單，以及一則當日群發。

產出：
1. 圖文選單 6 格：每格的標題（6 字內）、點下去連到哪裡、排列順序（最常用的放左上）。
2. 選單主視覺的一句話描述（每季換一次的主題）。
3. 當日群發（60 字內）：通知欄第一行＋只推一個主打＋直連訂單的按鈕文字。
4. 追蹤：每天看哪個數字對應訂單。

硬規則：
- 選單不要放「關於我們」這種沒人點的格子。
- 價格、營業時間沒給就寫【待補】。${LN_RULES}`,
    preferredModel: "qwen",
    maxTokens: 700,
    outputDefaults: { platform: "line", post_type: "richmenu" },
  },
  {
    id: "ln-30-triggered-moment-messages",
    tier: "30s",
    postType: "broadcast",
    label: { en: "LINE: Messages Triggered by Personal Moments", zh: "LINE：情境自動訊息（到期／補貨／升等）" },
    description: { en: "Replace mass sends with messages timed to each person", zh: "用跟這個人有關的時間點觸發訊息，取代全體群發" },
    agent_id: 60012,
    skill_slug: "email-crm",
    source: {
      type: "viral",
      short: "TENTIAL LINE ID 連携情境訊息",
      metric: "ID 連携用戶 LTV 1.2 倍；新施策 3 個月 ROAS 500%",
      asOf: "2026-08",
      caveat: "日本案例；工具商自家新聞稿，非第三方報導",
      url: "https://timetechnologies.ltd/archives/1020",
      takeaway:
        "先引導會員把 LINE 跟會員帳號綁定，再用「優惠券快到期」「你看過的商品補貨了」「你升等了」這類跟個人有關的時間點觸發訊息。",
    },
    primary_question: "你們有哪些跟顧客個人有關的時間點？（到期、補貨、升等、生日…）",
    primary_input: { key: "topic", placeholder: "例：點數月底到期 / 缺貨商品補貨 / 消費滿 5 次升 VIP", type: "textarea" },
    inputs: [
      { key: "topic", label: "可以觸發訊息的個人時間點", type: "textarea", required: true },
    ],
    systemPrompt: `你要規劃 LINE 官方帳號的「情境自動訊息」。

產出：
1. 綁定引導訊息（60 字內）：為什麼要把 LINE 跟會員綁定，對顧客有什麼好處。
2. 3 個觸發情境，每個寫：
   - 觸發條件（什麼時候發）
   - 訊息（60 字內，通知欄第一行要點出「跟你有關」）
   - 一個行動按鈕文字（8 字內）
3. 成效比較：綁定與未綁定會員要比哪 2 個數字。

硬規則：
- 同一個人一週內最多收 2 則情境訊息。
- 不寫沒有給定的優惠或數字。${LN_RULES}`,
    preferredModel: "qwen",
    maxTokens: 800,
    outputDefaults: { platform: "line", post_type: "broadcast" },
  },
];

const cfg = (labels: string[], min: number, max: number): OrchestraConfig => ({
  variants: 3, images: 0, runImageGen: false, imageDirectorId: null,
  aspectRatio: null, variantLabels: labels, captionMinChars: min, captionMaxChars: max,
});

export const LN_30S_ORCHESTRA: Record<string, OrchestraConfig> = {
  "ln-30-survey-segment-menu":       cfg(["興趣分眾", "時段分眾", "頻率分眾"], 60, 400),
  "ln-30-segmented-single-action":   cfg(["行為分群", "新舊分群", "價值分群"], 60, 400),
  "ln-30-rich-menu-order-entry":     cfg(["點餐優先", "訂位優先", "優惠優先"], 40, 300),
  "ln-30-triggered-moment-messages": cfg(["到期提醒", "補貨通知", "升等恭喜"], 60, 400),
};

export function getLineOrchestraConfig(taskId: string): OrchestraConfig | null {
  return LN_30S_ORCHESTRA[taskId] ?? null;
}
