/**
 * lineWebhookRoute — 媽爹講故事的 LINE Official Account。
 *
 * 2026-09-18 (CJ「幫媽爹作一個 LINE OFFICIAL 帳號，可以直接在該帳號 access
 * onbrand 的方法論，去產貼文等，也作了 rich menu」).
 *
 * 產出為什麼會「照媽爹的方法論」：這裡不做任何 prompt 工程。runOrchestra 吃
 * brandId，內部就會 buildBrandPrefix(brandId) 把品牌大腦（定位／語氣／禁用詞／
 * 知識庫／人設）注進系統提示。所以只要帶對 brandId，LINE 產的稿子跟網站上產的
 * 是同一條路徑、同一套規範 —— 這是刻意不在這裡另開一條捷徑的原因。
 *
 * ── 為什麼沒有 session 狀態 ────────────────────────────────────────────────
 * 直覺作法是「按 rich menu → 記住他選了哪張卡 → 等他下一則訊息當主題」，那需要
 * 一份 per-user 的待辦狀態（記憶體會在每次部署後蒸發，DB 則要開表）。
 * 改用 LINE 自己的能力：rich menu 的 postback 可以帶 inputOption:"openKeyboard"
 * 與 fillInText，按下去會直接在輸入框填好「FB貼文：」並開鍵盤。使用者接著打主題
 * 送出，我們收到的是一則自帶前綴的文字訊息 —— 任務與主題在同一則裡，伺服器
 * 完全無狀態。少一張表、少一類「跨部署掉單」的 bug。
 *
 * ── 為什麼 reply 完還要 push ───────────────────────────────────────────────
 * LINE 要求 webhook 幾秒內回 200，replyToken 約一分鐘失效；任務要跑 30–130 秒。
 * 所以：立刻 200 → reply「收到，正在寫」→ 背景跑完 → push 結果。
 */
import { Router, type Request, type Response } from "express";
import {
  verifyLineSignature, replyMessage, pushMessage, textMessages, imageMessages,
} from "../_core/lineClient";

export const lineWebhookRouter = Router();
const router = lineWebhookRouter;

/* ── 綁定 ────────────────────────────────────────────────────────────────────
 * 這個 OA 就是媽爹講故事一個品牌在用，所以整條路綁死一組 brand/user，不做
 * 「LINE 帳號 ↔ OnBrand 帳號」的綁定流程（之後要賣給第二個客戶時才需要）。
 * 走 env 而不是寫死數字：dev 與 prod 的 id 不見得一樣，而錯的 brandId 會安靜地
 * 用別人的品牌大腦寫稿 —— 那種錯誤看起來完全正常，最難發現。
 * 沒設就直接不服務，不預設 fallback。 */
function binding(): { brandId: number; userId: number } | null {
  const brandId = Number(process.env.LINE_BIND_BRAND_ID);
  const userId = Number(process.env.LINE_BIND_USER_ID);
  if (!Number.isFinite(brandId) || brandId <= 0) return null;
  if (!Number.isFinite(userId) || userId <= 0) return null;
  return { brandId, userId };
}

/* ── rich menu 六格 ──────────────────────────────────────────────────────────
 * key 就是 fillInText 的前綴，使用者送出的訊息長這樣：
 *   「FB貼文：中元普渡怎麼跟孩子解釋」
 * 前綴比對用全形冒號與半形冒號都收 —— 手機輸入法會自己換。 */
export interface MenuEntry { label: string; taskId: string; tier: "30s" | "60s" }

export const LINE_MENU: MenuEntry[] = [
  { label: "FB貼文",   taskId: "fb-30-caption-short",  tier: "30s" },
  { label: "IG貼文",   taskId: "ig-30-caption-short",  tier: "30s" },
  { label: "IG輪播",   taskId: "ig-60-carousel-7",     tier: "60s" },
  { label: "限時動態", taskId: "ig-30-story-text",     tier: "30s" },
  { label: "節慶文",   taskId: "fb-30-countdown-1day", tier: "30s" },
  { label: "廣告文案", taskId: "fb-30-ad-primary",     tier: "30s" },
];

/** 「FB貼文：主題」→ { entry, topic }。認不出來回 null，由呼叫端給說明。 */
export function parseCommand(text: string): { entry: MenuEntry; topic: string } | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  for (const entry of LINE_MENU) {
    for (const sep of ["：", ":"]) {
      const prefix = `${entry.label}${sep}`;
      if (t.startsWith(prefix)) {
        return { entry, topic: t.slice(prefix.length).trim() };
      }
    }
  }
  return null;
}

function helpText(): string {
  return [
    "請從下方選單挑一種內容，點下去會幫你把開頭填好，再接著打主題就好。",
    "",
    ...LINE_MENU.map((m) => `・${m.label}：（例）中元普渡怎麼跟孩子解釋`),
  ].join("\n");
}

/* ── 跑任務 ──────────────────────────────────────────────────────────────── */

async function runAndPush(lineUserId: string, entry: MenuEntry, topic: string): Promise<void> {
  const bind = binding();
  if (!bind) {
    await pushMessage(lineUserId, textMessages("系統尚未完成品牌綁定，請聯絡我們。"));
    return;
  }
  try {
    // 額度閘門走跟網站同一支 —— 試用到期、餘額不足在這裡就會被擋，
    // 而且訊息是既有那套中文說明，不必另外寫一份。
    const { preflightCostCheck } = await import("../llmWithBilling");
    const guard = await preflightCostCheck(bind.userId);
    if (!guard.ok) {
      await pushMessage(lineUserId, textMessages(guard.reason));
      return;
    }

    const { resolveTaskForRun } = await import("../routers/quickTaskRouter");
    const { template, config } = await resolveTaskForRun(entry.taskId);
    const { runOrchestra } = await import("../_core/quickTaskOrchestra");

    const result = await runOrchestra({
      template,
      config,
      inputs: { topic },
      brandId: bind.brandId,
      userId: bind.userId,
      tier: entry.tier,
    });

    const first = result.variants?.[0];
    if (!first?.caption) {
      await pushMessage(lineUserId, textMessages(
        `這次沒有產出成功${result.errors?.length ? `（${result.errors[0]}）` : ""}，再試一次或換個說法。`,
      ));
      return;
    }

    // 文案 + 圖。多卡任務（輪播）把每張卡的圖都送出去，卡的文字本來就已經
    // 在 caption 裡，不重覆貼一次。LINE 一次最多 5 則，lineClient 會截斷。
    const caption = [first.caption, (first.hashtags ?? []).join(" ")]
      .filter(Boolean).join("\n\n");
    const urls = (first.cards?.length ? first.cards.map((c) => c.image?.url) : [first.image?.url]);
    await pushMessage(lineUserId, [
      ...textMessages(caption),
      ...imageMessages(urls),
    ]);
  } catch (e: any) {
    console.error("[line] run failed:", e?.message ?? e);
    await pushMessage(lineUserId, textMessages("產出時出了點問題，請再試一次。"))
      .catch(() => { /* push 也失敗就只能留在 log 裡 */ });
  }
}

/* ── webhook ─────────────────────────────────────────────────────────────── */

async function handleEvent(ev: any): Promise<void> {
  const lineUserId = ev?.source?.userId;
  if (!lineUserId) return;

  // rich menu 若設成 postback（而不是 fillInText），data 會是 task=<id>。
  // 兩種都接，這樣選單之後改設定不必動程式。
  if (ev.type === "postback") {
    const data = String(ev.postback?.data ?? "");
    const taskId = data.startsWith("task=") ? data.slice(5) : "";
    const entry = LINE_MENU.find((m) => m.taskId === taskId);
    if (entry && ev.replyToken) {
      await replyMessage(ev.replyToken, textMessages(
        `好，${entry.label}。請直接打主題，例如「中元普渡怎麼跟孩子解釋」。`,
      ));
    }
    return;
  }

  if (ev.type === "follow" && ev.replyToken) {
    await replyMessage(ev.replyToken, textMessages(`歡迎！\n\n${helpText()}`));
    return;
  }

  if (ev.type !== "message" || ev.message?.type !== "text") return;

  const parsed = parseCommand(String(ev.message.text ?? ""));
  if (!parsed) {
    if (ev.replyToken) await replyMessage(ev.replyToken, textMessages(helpText()));
    return;
  }
  if (!parsed.topic) {
    if (ev.replyToken) {
      await replyMessage(ev.replyToken, textMessages(
        `「${parsed.entry.label}：」後面接著打主題就可以了，例如「${parsed.entry.label}：中元普渡怎麼跟孩子解釋」。`,
      ));
    }
    return;
  }

  // reply 先回，任務在背景跑 —— 這兩件事不能對調，replyToken 等不到任務跑完。
  if (ev.replyToken) {
    await replyMessage(ev.replyToken, textMessages(
      `收到，正在用媽爹的品牌設定寫「${parsed.topic}」的${parsed.entry.label}，大約一分鐘。`,
    )).catch((e) => console.error("[line] reply failed:", e?.message ?? e));
  }
  await runAndPush(lineUserId, parsed.entry, parsed.topic);
}

router.post("/webhook", async (req: Request, res: Response) => {
  const raw = req.body as Buffer;
  if (!Buffer.isBuffer(raw)) {
    // 掛載順序錯了（express.json() 搶先解析）就會走到這裡。寧可大聲失敗，
    // 也不要退回「不驗簽直接處理」—— 那等於任何人都能冒充 LINE 打進來。
    console.error("[line] webhook body is not a Buffer — check the express.raw mount order");
    res.status(500).json({ error: "misconfigured" });
    return;
  }
  if (!verifyLineSignature(raw, req.header("x-line-signature") ?? undefined)) {
    res.status(401).json({ error: "bad signature" });
    return;
  }

  // LINE 只看 HTTP 狀態碼，而且要快。先回 200 再處理，否則它會重送，
  // 使用者就會收到兩份稿子。
  res.status(200).json({ ok: true });

  let events: any[] = [];
  try { events = JSON.parse(raw.toString("utf8"))?.events ?? []; } catch { return; }
  for (const ev of events) {
    handleEvent(ev).catch((e) => console.error("[line] event failed:", e?.message ?? e));
  }
});

/**
 * 健康檢查：確認憑證與綁定都在（不回傳任何憑證內容）。
 *
 * 會把綁到的品牌「名稱」查出來一起回 —— 綁錯 brandId 是這套東西最難發現的
 * 故障：稿子照樣產得出來、看起來也完全正常，只是用了別人的品牌大腦。
 * 印出名字就能一眼確認，不必等到發現語氣不對。
 */
router.get("/health", async (_req, res) => {
  const bind = binding();
  let brandName: string | null = null;
  if (bind) {
    try {
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT name FROM brands WHERE id = ? LIMIT 1`, [bind.brandId],
      );
      brandName = rows?.[0]?.name ?? null;
    } catch { /* 查不到就留 null，健康檢查本身不該因此失敗 */ }
  }
  res.json({
    ok: true,
    hasAccessToken: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
    hasChannelSecret: !!process.env.LINE_CHANNEL_SECRET,
    bound: !!bind,
    brandId: bind?.brandId ?? null,
    brandName,
    menu: LINE_MENU.map((m) => m.label),
  });
});
