/**
 * agentApiTasks — 外部 agent（Hermes）看得到的任務清單。
 *
 * 2026-09-18。Hermes 的 skill 需要知道「我能叫 OnBrand 做哪些事」。
 *
 * 為什麼不直接回全站 200+ 張卡：那份目錄是給人在網站上瀏覽用的，對一個
 * 對話機器人來說太雜 —— 它得自己猜哪張卡對應使用者說的話，猜錯就是產出完全
 * 不對的東西。這裡回的是「這個品牌的 agent 被設計來做的那幾件事」，一格一件。
 *
 * ready:false 的項目照樣列出來，因為 Hermes 那邊要能跟使用者說「這個還沒開，
 * 在做的是什麼」，而不是假裝那顆按鈕不存在。這跟 hermes 的規矩一致：
 * a source failure is reported, never filled with made-up content。
 */

export interface AgentApiTask {
  /** Hermes 呼叫 POST /run 時要帶的 taskId；ready:false 時為 null */
  taskId: string | null;
  /** 選單上的名字 —— 與 rich menu 圖上的文字逐字相同 */
  key: string;
  /** 一句話說明這格在做什麼，Hermes 可以直接講給使用者聽 */
  description: string;
  tier: "30s" | "60s" | "99s";
  ready: boolean;
  /** 跑這個任務要帶哪些 inputs key */
  inputKeys: string[];
}

/**
 * 媽爹講故事的六格。key 與 rich menu 圖、與 lineFlows 的 trigger 一致。
 *
 * 之後要開給第二個品牌時，這裡會變成 per-brand 查表（或接上 brandPacks）。
 * 現在只有一個客戶，多做一層抽象只是把簡單的事變複雜。
 */
const MOMDAD_BRAND_ID = 2964;

const MOMDAD_TASKS: AgentApiTask[] = [
  {
    key: "蹭熱點", taskId: null, tier: "99s", ready: false, inputKeys: ["topic"],
    description: "每天自動抓當日話題，挑出媽爹接得上的三條讓使用者選，再改寫成貼文",
  },
  {
    key: "FB文案", taskId: "fb-30-caption-short", tier: "30s", ready: true, inputKeys: ["topic"],
    description: "使用者貼上想法或草稿，整理成完整的 FB 貼文",
  },
  {
    key: "IG文案", taskId: "ig-30-caption-short", tier: "30s", ready: true, inputKeys: ["topic"],
    description: "使用者貼上想法，寫成 IG 貼文並附配圖建議",
  },
  {
    key: "活動宣傳", taskId: null, tier: "60s", ready: false, inputKeys: ["topic"],
    description: "貼上活動資訊，先寫報名導引文，再選要轉寫到哪些平台",
  },
  {
    key: "LINE推播", taskId: null, tier: "30s", ready: false, inputKeys: ["topic"],
    description: "寫成可以直接轉發的 LINE 推播訊息（第一行就是重點、短、一個行動）",
  },
  {
    key: "故事推廣", taskId: null, tier: "30s", ready: false, inputKeys: ["topic"],
    description: "挑一檔故事，寫成導去 APP 收聽的推廣文",
  },
];

/**
 * 回傳時順便確認 ready 的任務卡「真的還在」。
 *
 * 任務卡被改名或下架時，這裡如果照舊回報 ready，Hermes 會拿著一個不存在的
 * taskId 去呼叫，使用者要走完整段對話才會收到失敗。寧可在清單這一層就降級。
 */
export async function listAgentApiTasks(brandId: number): Promise<AgentApiTask[]> {
  const base = brandId === MOMDAD_BRAND_ID ? MOMDAD_TASKS : [];
  const { resolveTaskForRun } = await import("../routers/quickTaskRouter");
  const out: AgentApiTask[] = [];
  for (const t of base) {
    if (!t.ready || !t.taskId) { out.push(t); continue; }
    try {
      await resolveTaskForRun(t.taskId);
      out.push(t);
    } catch {
      out.push({ ...t, ready: false, description: `${t.description}（任務卡暫時無法使用）` });
    }
  }
  return out;
}
