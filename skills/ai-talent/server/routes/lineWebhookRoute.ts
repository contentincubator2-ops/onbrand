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
 * ── 為什麼有 session 狀態 ──────────────────────────────────────────────────
 * 第一版沒有：rich menu 用 postback + fillInText 預填「FB貼文：」，使用者接著
 * 打主題，一則訊息講完，伺服器不必記任何事。改掉是因為 hermes 的慣例是
 * rich menu 用 message 動作（送出固定文字），而且上線順序是文字回覆先通、
 * rich menu 最後上。message 動作送出「FB文案」之後，她貼的內容沒有前綴，
 * 就得記住她走到哪一步。完整理由見 _core/lineFlows.ts 的檔頭。
 *
 * ── 為什麼 reply 完還要 push ───────────────────────────────────────────────
 * LINE 要求 webhook 幾秒內回 200，replyToken 約一分鐘失效；任務要跑 30–130 秒。
 * 所以：立刻 200 → reply「收到，正在寫」→ 背景跑完 → push 結果。
 */
import { Router, type Request, type Response } from "express";
import {
  verifyLineSignature, replyMessage, pushMessage, textMessages, imageMessages,
  withQuickReply,
} from "../_core/lineClient";
import {
  FLOWS, findFlowByTrigger, findFlowById, findPendingTrigger,
  startFlow, advanceFlow, menuText, menuChoices,
  type Flow,
} from "../_core/lineFlows";
import { getSession, setSession, clearSession } from "../_core/lineSessions";

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

/* ── 流程 ───────────────────────────────────────────────────────────────────
 * 選單、觸發語、引導句、推進規則全部在 _core/lineFlows.ts（純函式、離線可測）。
 * 這裡只負責把它接上 LINE 的訊息與 session 儲存。
 *
 * 2026-09-18：第一版是 postback + fillInText 的無狀態設計，改掉的原因見
 * lineFlows.ts 的檔頭 —— hermes 的慣例是 rich menu 用 message 動作、
 * 文字回覆先通、rich menu 最後上。 */

/* ── 跑任務 ──────────────────────────────────────────────────────────────── */

async function runAndPush(
  lineUserId: string,
  flow: Flow,
  taskId: string,
  tier: "30s" | "60s",
  inputs: Record<string, string>,
): Promise<void> {
  const bind = binding();
  if (!bind) {
    await pushMessage(lineUserId, textMessages("系統尚未完成品牌綁定，請聯絡我們。"));
    return;
  }
  try {
    // 額度閘門走跟網站同一支 —— 試用到期、餘額不足在這裡就會被擋，
    // 訊息也是既有那套中文說明，不必另外寫一份。
    const { preflightCostCheck } = await import("../llmWithBilling");
    const guard = await preflightCostCheck(bind.userId);
    if (!guard.ok) {
      await pushMessage(lineUserId, textMessages(guard.reason));
      return;
    }

    const { resolveTaskForRun } = await import("../routers/quickTaskRouter");
    const { template, config } = await resolveTaskForRun(taskId);
    const { runOrchestra } = await import("../_core/quickTaskOrchestra");

    const result = await runOrchestra({
      template, config, inputs,
      brandId: bind.brandId,
      userId: bind.userId,
      tier,
    });

    const first = result.variants?.[0];
    if (!first?.caption) {
      // 失敗就說失敗。hermes 的規矩：a source failure is reported,
      // never filled with made-up content —— 產不出來時不要塞一段像樣的東西。
      await pushMessage(lineUserId, withQuickReply(
        textMessages(
          `這次沒有產出成功${result.errors?.length ? `（${result.errors[0]}）` : ""}。` +
          `
可以再試一次，或換個說法多給一點背景。`,
        ),
        menuChoices(),
      ));
      return;
    }

    const caption = [first.caption, (first.hashtags ?? []).join(" ")]
      .filter(Boolean).join("\n\n");
    // 配圖建議：orchestra 本來就會同時產出視覺 brief，之前沒推出來。
    // IG 那格特別需要 —— CJ 要的是「文案加上圖片的建議」。
    const brief = (first.image?.style ?? "").trim();
    const urls = (first.cards?.length ? first.cards.map((c) => c.image?.url) : [first.image?.url]);

    await pushMessage(lineUserId, withQuickReply([
      ...textMessages(caption),
      ...(brief ? textMessages(`📷 配圖建議
${brief}`) : []),
      ...imageMessages(urls),
    ], menuChoices()));
  } catch (e: any) {
    console.error("[line] run failed:", e?.message ?? e);
    await pushMessage(lineUserId, textMessages("產出時出了點問題，請再試一次。"))
      .catch(() => { /* push 也失敗就只能留在 log 裡 */ });
  }
}

/* ── 事件處理 ────────────────────────────────────────────────────────────── */

async function handleEvent(ev: any): Promise<void> {
  const lineUserId = ev?.source?.userId;
  if (!lineUserId) return;

  const reply = async (text: string, choices = menuChoices()) => {
    if (!ev.replyToken) return;
    await replyMessage(ev.replyToken, withQuickReply(textMessages(text), choices))
      .catch((e) => console.error("[line] reply failed:", e?.message ?? e));
  };

  if (ev.type === "follow") {
    await clearSession(lineUserId);
    await reply(`歡迎！我可以幫你把想法整理成貼文。

${menuText()}`);
    return;
  }

  if (ev.type !== "message" || ev.message?.type !== "text") return;
  const text = String(ev.message.text ?? "");

  // 觸發語永遠優先於進行中的流程 —— 她按「IG文案」就是要換一個，
  // 不是要把「IG文案」四個字當成 FB 貼文的素材。
  const started = findFlowByTrigger(text);
  if (started) {
    const a = startFlow(started);
    if (a.kind === "ask") {
      await setSession(lineUserId, started.id, a.nextStep, {});
      await reply(a.prompt, a.choices ?? []);
    }
    return;
  }

  // 選單上有、但還沒做好的格子 —— 誠實講「還沒開」，不要讓她以為按鈕壞了。
  const pending = findPendingTrigger(text);
  if (pending) {
    await reply(`「${pending.trigger}」還在做：${pending.note}。

現在可以用的是下面這些。`);
    return;
  }

  const session = await getSession(lineUserId);
  if (!session) {
    await reply(menuText());
    return;
  }
  const flow = findFlowById(session.flowId);
  if (!flow) {
    // 流程被改版拿掉了，舊 session 沒有去處。清掉重來，不要靜默卡住。
    await clearSession(lineUserId);
    await reply(menuText());
    return;
  }

  const a = advanceFlow(flow, session.step, text, session.data);
  if (a.kind === "retry") {
    await reply(a.prompt, a.choices ?? []);
    return;
  }
  if (a.kind === "ask") {
    await setSession(lineUserId, flow.id, a.nextStep, session.data);
    await reply(a.prompt, a.choices ?? []);
    return;
  }

  // 收齊了。先回一句「正在寫」再跑 —— replyToken 等不到任務跑完（約一分鐘），
  // 結果只能用 push 送。順序不能對調。
  await clearSession(lineUserId);
  if (ev.replyToken) {
    await replyMessage(ev.replyToken, textMessages(
      `收到，正在用媽爹的品牌設定寫${flow.trigger}，大約一分鐘。`,
    )).catch((e) => console.error("[line] reply failed:", e?.message ?? e));
  }
  await runAndPush(lineUserId, flow, a.taskId, a.tier, a.inputs);
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
    flows: FLOWS.map((f) => f.trigger),
  });
});
