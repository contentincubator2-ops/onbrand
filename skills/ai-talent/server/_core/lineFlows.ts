/**
 * lineFlows — LINE OA 的引導流程定義與推進邏輯。
 *
 * 2026-09-18 (CJ「每個部分按下去，都要引導用戶使用」).
 *
 * ── 為什麼從「無狀態」改成「有狀態」────────────────────────────────────────
 * 第一版是無狀態的：rich menu 用 postback + fillInText 把「FB文案：」預填進
 * 輸入框，使用者接著打主題，一則訊息就講完。省掉一張表。
 *
 * 改掉的原因是 hermes-candidate-linebot-starter 的架構慣例：
 *   "The Rich Menu is a start surface, not a side-effect button bank.
 *    Use `message` actions for initial visible flows unless postback
 *    handling has been fully tested."
 * 而且他們的上線順序是「文字回覆先通 → rich menu 最後上」。message 動作送出
 * 的是固定文字（「FB文案」），機器人回一句引導，使用者接著貼的內容就沒有前綴
 * 了 —— 要知道那段文字屬於哪個流程，就得記住她走到哪。他們自己的資料邊界
 * 清單裡也列著 state.db，證實那些 bot 是有狀態的。
 *
 * 更重要的是：預填一個前綴稱不上「引導」。引導是機器人開口問。
 *
 * ── 這個檔的邊界 ──────────────────────────────────────────────────────────
 * 這裡全部是純函式，不碰資料庫也不碰網路，所以流程邏輯可以離線測完
 * （他們的 workflow：「Add offline tests before implementation」）。
 * 狀態的讀寫在 lineSessions.ts，實際送訊息與跑任務在 lineWebhookRoute.ts。
 */

/** quick reply 的規格：標籤 ≤ 20 字，送出的必須是「完整的下一步觸發語」。 */
export const QUICK_REPLY_LABEL_MAX = 20;

export interface FlowChoice {
  /** 按鈕上的字，≤ 20 字 */
  label: string;
  /** 按下去實際送出的訊息 —— 必須是完整觸發語，不能是片段 */
  send: string;
}

export interface FlowStep {
  id: string;
  /** 機器人問的話。這就是「引導」本身，要具體到她知道該貼什麼。 */
  prompt: string;
  /** 固定選項；有的話就渲染成 quick reply */
  choices?: FlowChoice[];
  /** 收到的回覆存進 data 的哪個 key */
  collect: string;
  /**
   * 最短字數。低於這個就重問，不拿去跑任務 ——
   * 「好」「ok」這種回覆餵進去，模型會自己編一個主題，
   * 產出看起來完整但跟她想講的無關。
   */
  minChars?: number;
}

export interface Flow {
  id: string;
  /** rich menu 的 message 動作送出的文字；使用者自己打這幾個字也會觸發 */
  trigger: string;
  /** 完成後跑哪張任務卡 */
  taskId: string;
  tier: "30s" | "60s";
  steps: FlowStep[];
  /** 收集完的 data → orchestra 的 inputs */
  toInputs: (data: Record<string, string>) => Record<string, string>;
}

/**
 * 目前上線的流程。
 *
 * 刻意只有兩個：hermes 的 launch gate 是「文字回覆先通，rich menu 最後上，
 * 而且每一格都要用真帳號點過」。一次全開六格，等於六格都沒被真的驗過。
 * 蹭熱點 / 活動宣傳 / LINE推播 / 故事推廣文 會在這條路走順之後接上。
 */
export const FLOWS: Flow[] = [
  {
    id: "fb-copy",
    trigger: "FB文案",
    taskId: "fb-30-caption-short",
    tier: "30s",
    steps: [
      {
        id: "material",
        collect: "topic",
        minChars: 8,
        prompt:
          "好，我來幫你調整成 FB 貼文。\n\n" +
          "把你現在想寫的內容或想法貼上來就好 —— 草稿、幾句重點、甚至只是一個念頭都可以，" +
          "我會照媽爹的語氣整理成完整貼文。",
      },
    ],
    toInputs: (d) => ({ topic: d.topic ?? "" }),
  },
  {
    id: "ig-copy",
    trigger: "IG文案",
    taskId: "ig-30-caption-short",
    tier: "30s",
    steps: [
      {
        id: "material",
        collect: "topic",
        minChars: 8,
        prompt:
          "好，我來幫你調整成 IG 貼文。\n\n" +
          "把你想講的內容貼上來，我會寫成 IG 的寫法（短句、斷行、hashtag），" +
          "並附上一段配圖建議。",
      },
    ],
    toInputs: (d) => ({ topic: d.topic ?? "" }),
  },
];

/**
 * rich menu 上已經有、但流程還沒做的格子。
 *
 * 2026-09-18：CJ 的選單圖六格都做好了，但只有 FB文案 / IG文案 兩條流程上線
 * （hermes 的 launch gate：文字回覆先通，每一格都要用真帳號點過才算數）。
 * 沒有這張表的話，按下「蹭熱點」會落到「認不得的訊息」，回一份只列兩格的選單
 * —— 使用者看到的是「這個按鈕壞了」。誠實說「還沒開」比給錯的引導好。
 *
 * 字串必須與選單圖上的文字逐字相同 —— message 動作送出的就是那幾個字。
 */
export const PENDING_TRIGGERS: Array<{ trigger: string; note: string }> = [
  { trigger: "蹭熱點",   note: "每天自動抓當日話題，挑出媽爹接得上的三條讓你選" },
  { trigger: "活動宣傳", note: "貼上活動資訊，先寫報名導引文，再選要轉到哪些平台" },
  { trigger: "LINE推播", note: "寫成可以直接轉發的推播訊息" },
  { trigger: "故事推廣", note: "挑一檔故事，寫成導去 APP 收聽的推廣文" },
];

export function findPendingTrigger(text: string): { trigger: string; note: string } | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  return PENDING_TRIGGERS.find((p) => p.trigger === t) ?? null;
}

export function findFlowByTrigger(text: string): Flow | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  return FLOWS.find((f) => f.trigger === t) ?? null;
}

export function findFlowById(id: string): Flow | null {
  return FLOWS.find((f) => f.id === id) ?? null;
}

export function stepOf(flow: Flow, stepId: string): FlowStep | null {
  return flow.steps.find((s) => s.id === stepId) ?? null;
}

/** 選單文字：使用者打了認不得的話時回這個。 */
export function menuText(): string {
  return [
    "你可以從下面挑一個，或直接打這幾個字：",
    "",
    ...FLOWS.map((f) => `・${f.trigger}`),
  ].join("\n");
}

/** 認不得的訊息也給 quick reply，讓她用點的而不是照著打。 */
export function menuChoices(): FlowChoice[] {
  return FLOWS.map((f) => ({ label: f.trigger, send: f.trigger }));
}

/* ── 推進 ─────────────────────────────────────────────────────────────────── */

export type Advance =
  /** 回一句引導（可能帶選項），並把 session 停在 nextStep */
  | { kind: "ask"; prompt: string; choices?: FlowChoice[]; nextStep: string }
  /** 收齊了，去跑任務 */
  | { kind: "run"; taskId: string; tier: "30s" | "60s"; inputs: Record<string, string> }
  /** 回覆不合格，同一步重問 */
  | { kind: "retry"; prompt: string; choices?: FlowChoice[]; step: string };

/** 流程起點：使用者按了 rich menu 或打了觸發語。 */
export function startFlow(flow: Flow): Advance {
  const first = flow.steps[0]!;
  return {
    kind: "ask",
    prompt: first.prompt,
    choices: first.choices,
    nextStep: first.id,
  };
}

/**
 * 使用者在 flow 的某一步回了話。
 *
 * 回 retry 而不是硬跑，是因為空白或敷衍的回覆餵進 orchestra 後，模型會自己
 * 補一個主題出來 —— 產出看起來完整，但跟她想講的完全無關，而且她不會察覺。
 */
export function advanceFlow(
  flow: Flow,
  currentStepId: string,
  reply: string,
  collected: Record<string, string>,
): Advance {
  const step = stepOf(flow, currentStepId);
  if (!step) {
    // session 指向一個不存在的步驟（改版後的舊 session）→ 重新開始，
    // 不要卡在一個永遠推不動的狀態裡。
    return startFlow(flow);
  }

  const value = (reply ?? "").trim();
  const min = step.minChars ?? 1;
  if (value.length < min) {
    return {
      kind: "retry",
      step: step.id,
      choices: step.choices,
      prompt:
        value.length === 0
          ? step.prompt
          : `這樣我還寫不出來 —— 再多給我一點（至少 ${min} 個字）。\n\n${step.prompt}`,
    };
  }

  const data = { ...collected, [step.collect]: value };
  const idx = flow.steps.findIndex((s) => s.id === step.id);
  const next = flow.steps[idx + 1];
  if (next) {
    return { kind: "ask", prompt: next.prompt, choices: next.choices, nextStep: next.id };
  }
  return { kind: "run", taskId: flow.taskId, tier: flow.tier, inputs: flow.toInputs(data) };
}
