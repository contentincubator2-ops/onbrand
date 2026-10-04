/**
 * brandTaskCardRouter — 用戶自己新增任務卡的作者流程。
 *
 * 2026-09-04 (CJ「用戶自己命名任務卡，貼上自己理想中的內容(例如十篇促購文)、
 * 以及希望用戶輸入的資料(選填)，然後AI會總結成SKILL，形成任務卡，可以試寫後，
 * 確認沒問題，就新增完成」)。
 *
 * 流程對到的 procedure：
 *   命名 + 貼範例 + 指定要問什麼  → `create`（背景生成 SKILL，有進度）
 *   AI 總結成 SKILL              → `distil`（create 自己會叫，也可手動重跑）
 *   試寫看看                     → `dryRun`（不寫 mission_outputs、不扣點）
 *   確認沒問題就新增完成         → `publish`（status → ready，卡才出現在任務頁）
 *
 * ── 為什麼試寫不扣點也不落地 ─────────────────────────────────────────
 * 試寫是「這張卡做得對不對」的驗證，不是一次產出。落地會讓 /projects 塞滿半成品，
 * 扣點會讓調卡片變成付費行為 —— 用戶會因此不敢多試，最後拿到一張沒調好的卡。
 * `runOrchestra` 的 userId 是選填的，不傳就不會走 recordTaskRun，剛好就是要的行為。
 *
 * ── 為什麼 publish 是獨立一步 ────────────────────────────────────────
 * `registerBrandTaskCardSource` 只認 status === "ready"。沒有這道閘門，SKILL 還在
 * 生成中的卡就會出現在任務頁，使用者按下去會拿到一篇用空 prompt 寫出來的東西。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { planQuotaFor, isUnlimited, assertCanAct } from "../../platform/core/billing/planGate";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { assertBrandAccess } from "../../platform/core/brandAuth";
import { invokeLLM } from "../../platform/core/llm/llm";
import { readFileSync } from "fs";
import { coverFilePath, saveCoverFile } from "../../platform/core/media/mediaGen";
import { drawIllustration, shrinkToWebp, writeIllustrationConcepts } from "../core/image/taskIllustration";
import type { CardReference } from "../core/catalog/cardResearch";
import { buildBrandPrefix } from "../../strategy/core/brand/brandContext";
import { CUSTOM_CHANNEL_RE, isCustomChannelId, brandIdOfChannelId } from "../../platform/core/customChannelId";
import { listCustomChannels } from "../core/catalog/customChannels";
import {
  DEFAULT_LISTING_FIELDS, sanitizeListingFields, parseListing, type ListingSpec,
} from "../core/engine/listingContract";
import {
  type BrandTaskCard, type BrandTaskCardField,
  listBrandTaskCards, getBrandTaskCard, mutateBrandTaskCards,
  measureSamples, slugifyCardName, cardTemplate, cardConfig, duplicateCard, listingSpecOf,
  factLeaks, redactFactLeaks, verbatimSamples, illustrationInFlight,
  numberThread, renderNumbered, chunkLineRanges, parsePieceRanges, sliceByRanges,
  MAX_CARDS_PER_BRAND, MAX_SAMPLES, MAX_SAMPLE_CHARS,
  registerBrandTaskCardSource,
} from "../core/catalog/brandTaskCards";

// 在模組載入時就把自建卡接進 taskRegistry —— 放這裡而不是 index.ts 的啟動流程，
// 是因為這個 router 一定會被 routers/index.ts 匯入，所以「忘記註冊」不可能發生。
// registerTaskSource 靠 name 去重，重複 import 不會註冊兩次。
registerBrandTaskCardSource();

const CHANNELS = [
  "facebook", "instagram", "threads", "linkedin", "tiktok",
  "youtube", "email", "pr", "website",
  // 2026-09-29 CJ：台灣市場加 LINE（官方帳號群發訊息）。
  "line",
] as const;

/**
 * 內建通路，或這個品牌自己加的通路（`c<brandId>-<slug>`，見 customChannelRouter）。
 * 形狀在這裡驗；「這個通路真的存在、而且是這個品牌的」要到 assertChannelUsable 才驗，
 * 因為那需要 brandId 與一次讀取。
 */
const channelInput = z.union([z.enum(CHANNELS), z.string().regex(CUSTOM_CHANNEL_RE)]);

async function assertChannelUsable(brandId: number, channel: string): Promise<void> {
  if (!isCustomChannelId(channel)) return;
  const owned = brandIdOfChannelId(channel) === brandId
    && (await listCustomChannels(brandId)).some((c) => c.id === channel);
  if (!owned) throw new TRPCError({ code: "BAD_REQUEST", message: "找不到這個通路（可能已被刪除）" });
}

/** 這個通路產出的東西：商品頁（listing）或貼文。內建通路一律是貼文。 */
async function channelCardFormat(brandId: number, channel: string): Promise<"post" | "listing"> {
  if (!isCustomChannelId(channel)) return "post";
  const ch = (await listCustomChannels(brandId)).find((c) => c.id === channel);
  return ch?.format === "listing" ? "listing" : "post";
}

/** 商品頁欄位。zod 只驗形狀，內容整理（去重、補「待補資料」、上限）交給 sanitizeListingFields。 */
const listingFieldsInput = z.array(z.object({
  key: z.string().max(24).optional(),
  label: z.string().min(1).max(20),
  kind: z.enum(["text", "bullets", "long"]).default("text"),
  maxChars: z.number().int().min(1).max(5000).nullable().optional(),
})).max(10);

const fieldInput = z.object({
  label: z.string().min(1).max(40),
  type: z.enum(["text", "textarea"]).default("text"),
  required: z.boolean().default(false),
  placeholder: z.string().max(120).default(""),
});

/**
 * 使用者只填 label（「活動日期」），key 由我們生成 —— 要求使用者想一個英文
 * 變數名是把工程細節推給他。中文 label 取不出 ascii 就用序號。
 */
function fieldsFrom(raw: z.infer<typeof fieldInput>[]): BrandTaskCardField[] {
  const seen = new Set<string>(["topic"]);            // topic 是主問題保留字
  const out: BrandTaskCardField[] = [];
  raw.forEach((f, i) => {
    const label = f.label.trim();
    if (!label) return;
    let key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!key || key.length < 2) key = `field_${i + 1}`;
    while (seen.has(key)) key = `${key}_${i + 1}`;
    seen.add(key);
    out.push({ key, label, type: f.type, required: f.required, placeholder: f.placeholder.trim() });
  });
  return out;
}

const TOTAL_STEPS = 3;   // 1 量測範例 / 2 生成 SKILL / 3 寫回

/**
 * 從範例反推 SKILL。
 *
 * prompt 的重點是「規則要可逐字檢查」—— 這是人設 Agent 學到的：問「這個人的
 * 語氣是什麼」會得到「溫暖而專業」，問「寫作時每一條規則要能被逐字檢查是否
 * 遵守」才會得到「開場不用問句」「每段不超過三句」「CTA 一律放最後一行、
 * 用祈使句」這種真的能約束產出的東西。
 *
 * 另外明文禁止把範例裡的**具體事實**寫進規則（商品名、日期、價格）——
 * 那會讓這張卡永遠在寫同一篇。卡要學的是骨架，不是那批內容。
 */
async function distilSkill(args: {
  brandId: number;
  name: string;
  channel: string;
  samples: string[];
  primaryQuestion: string;
  askFields: BrandTaskCardField[];
  measured: BrandTaskCard["measured"];
  /** 商品頁卡的欄位規格；貼文卡是 null。 */
  listing?: ListingSpec | null;
}): Promise<string> {
  const brandPrefix = await buildBrandPrefix(args.brandId, null, null, "core").catch(() => "");
  // 商品頁：範例是「整頁商品介紹」，SKILL 要**逐欄**教寫法，而不是一整篇的結構與字數。
  const listingBlock = args.listing
    ? `\n【這是商品頁（電商賣場／官網商品頁），不是貼文】\n` +
      `範例是一整頁商品介紹，每次執行要交付這幾個欄位（依序）：${args.listing.fields.map((f) => `【${f.label}】`).join("")}。\n` +
      `SKILL 要**逐欄**寫規則：每個欄位各自有「結構、句型、開頭與收尾方式、能不能用符號與 emoji、要放哪些資訊」的可檢查規則，` +
      `例如標題的字數與資訊順序（品牌／品名／核心賣點／規格）、賣點每條的開頭方式與長度、描述的段落結構、關鍵字的數量與放法。` +
      `不要寫成「一篇貼文」的結構，也不要寫整體字數。\n` +
      `規格、成分、尺寸、價格、保固這類事實一律來自當次輸入、額外欄位與品牌資料；沒有就不寫，並要在「待補資料」欄列出缺什麼。\n`
    : "";
  const lengthBlock = args.listing
    ? ""
    : `【字數】範例實測 ${args.measured.count} 篇，最短 ${args.measured.minChars} 字、最長 ${args.measured.maxChars} 字、中位數 ${args.measured.medianChars} 字。\n把區間寫進規則，並說明哪些段落佔多少比重。\n`;
  const fieldList = args.askFields.length
    ? args.askFields.map((f) => `- {{${f.key}}}：${f.label}${f.required ? "（必填）" : "（選填，可能是空的）"}`).join("\n")
    : "（沒有額外欄位）";

  const sys = `你在把使用者貼上的「理想成品」反推成一份寫作 SKILL，讓後續每次執行這張任務卡都能寫出同一種東西。繁體中文。

任務卡名稱：${args.name}
發布通道：${args.channel}
每次執行會問使用者的主問題：「${args.primaryQuestion}」（答案以 {{topic}} 帶入）
額外欄位：
${fieldList}

【最重要的三條】
1. **規則要可逐字檢查。** 不要寫「語氣溫暖專業」這種形容詞 —— 要寫「開場不用問句」
   「每段不超過三句」「CTA 一律放最後一行且用祈使句」「不用驚嘆號」這種能逐條核對的規則。
   寫完自問：另一個人拿這份規則檢查一篇稿，能不能明確說出「這條有遵守 / 沒遵守」？不能就重寫。
2. **不可以把範例裡的具體事實寫進規則。** 商品名、活動日期、**價格數字**、專案名稱
   都不行 —— 那會讓這張卡永遠在重寫同一篇。使用者下次拿它寫別的商品，文案裡會冒出
   上一批商品的定價。你要抓的是骨架（結構、句長、節奏、開場與收尾方式、標點與 emoji
   習慣、資訊出現的順序），不是那批內容本身。
   舉要價格的例子時寫「兩盒 X 元」或「引用當次輸入的價格」，**不要寫「兩盒 499」**。
   交稿前自己掃一遍：規則裡出現的每一個兩位數以上的數字，都必須是字數或段落數，
   不能是範例裡的價格或數量。
3. **先判斷範例是哪一種，再決定這份 SKILL 教什麼。**
   - 如果範例本身就是貼文／文案成品：學它們的寫法（骨架）。
   - 如果範例其實是在**介紹行銷手法、做法、案例的文章**（例如「小店家怎麼做 IG」「五個促購技巧」）：
     那它們不是要被模仿的貼文。SKILL 要教的是「把這些手法套用到每次輸入的主題上，寫出一篇貼文」
     —— 抽出文章裡的**手法**（用什麼角度、什麼順序、什麼鉤子、什麼收尾），寫成可執行的步驟。
     **絕對不可以把文章舉例用的店家、商品、場景、裝潢、人物當成要寫的內容。**
   - 兩種情況都要在 SKILL 裡寫明：貼文裡的事實（店家、商品、價格、地點、活動、環境描述）
     只能來自 {{topic}}、額外欄位、執行時系統針對當次主題上網查到的「案例與說法」（若有）與品牌資料；這些來源都沒有的細節一律不寫、不推測、
     不編造，寧可少寫一句。
${listingBlock}${lengthBlock}
【輸出格式】直接輸出 SKILL 本文（純文字，可用短標題與條列），不要 JSON、不要前言、
不要「以下是…」。開頭第一行就是規則。內容要包含：
- 這張卡在產出什麼（一句話）
- 結構（依序有哪幾段、各段要做什麼、各佔多少字）
- 逐條可檢查的寫作規則（至少 8 條）
- 明確的禁止事項（從範例的共同缺席推論：範例都沒有的東西就是不該有的）
- 怎麼使用 {{topic}} 與額外欄位；欄位是空的時候要怎麼處理

${brandPrefix}`;

  const samplesBlock = args.samples
    .map((s, i) => `【範例 ${i + 1}（${s.trim().length} 字）】\n${s.trim()}`)
    .join("\n\n");

  // 我們自己塞進 prompt 的數字。它們出現在 SKILL 裡是正確的，不算洩漏。
  const ownNumbers = [
    args.measured.count, args.measured.minChars,
    args.measured.maxChars, args.measured.medianChars,
  ];

  const ask = async (extra: string): Promise<string> => {
    const r = await Promise.race([
      invokeLLM({
        messages: [
          { role: "system", content: sys + extra },
          { role: "user", content: samplesBlock.slice(0, 60_000) },
        ],
        maxTokens: 4000,
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), 120_000)),
    ]);
    const raw = r.choices[0]?.message?.content;
    return (typeof raw === "string" ? raw : "").trim();
  };

  let skill = await ask("");
  if (skill.length < 200) {
    throw new Error(`SKILL 太短（${skill.length} 字），可能是模型回了空白或前言。可以重試。`);
  }

  // 2026-09-04 dev 實測：prompt 明文禁止之後，模型還是把三個價格（499 / 279 /
  // 1499）抄進規則。純 prompt 擋不住的東西就別只靠 prompt —— 照 adCopyContract
  // 與 wuganVoiceContract 的同一模式做「驗證 → 具名重試 → 確定性修補」。
  let leaks = factLeaks(skill, args.samples, ownNumbers);
  if (leaks.length > 0) {
    console.warn(`[brandTaskCard] SKILL 洩漏範例事實，重試一次：${leaks.join("、")}`);
    const retry = await ask(`

【上一版被退回】你寫的規則裡出現了這些**來自範例的具體數字**：${leaks.join("、")}。
那些是上一批商品的價格／數量，寫進規則會讓這張卡永遠在賣同一個東西。
重寫一份，同樣的結構與規則，但用「X 元」或「引用當次輸入」代替所有具體數字。
規則裡只允許出現字數與段落數。`).catch(() => "");
    if (retry.length >= 200 && factLeaks(retry, args.samples, ownNumbers).length < leaks.length) {
      skill = retry;
      leaks = factLeaks(skill, args.samples, ownNumbers);
    }
  }
  // 重試還是漏就確定性修補。換占位而不是刪整句 —— 刪掉會把規則語意弄破
  // （「兩盒 499」變成「兩盒」），換成占位反而變成一條正確的規則。
  if (leaks.length > 0) {
    console.warn(`[brandTaskCard] 重試後仍洩漏，確定性修補：${leaks.join("、")}`);
    skill = redactFactLeaks(skill, leaks);
  }
  return skill;
}

/** 背景生成。失敗要寫回 lastError —— 靜靜停在 drafting 會讓使用者一直等。 */
async function runDistil(brandId: number, userId: number, cardId: string): Promise<void> {
  const patch = (fn: (c: BrandTaskCard) => BrandTaskCard) =>
    mutateBrandTaskCards(brandId, userId, (cards) =>
      cards.map((c) => (c.id === cardId ? fn(c) : c)));

  try {
    const card = await getBrandTaskCard(brandId, cardId);
    if (!card) return;
    await patch((c) => ({ ...c, currentStep: 2, updatedAt: new Date().toISOString() }));
    const skill = await distilSkill({
      brandId, name: card.name, channel: card.channel, samples: card.samples,
      primaryQuestion: card.primaryQuestion, askFields: card.askFields, measured: card.measured,
      listing: listingSpecOf(card),
    });
    await patch((c) => ({
      ...c, skill, currentStep: TOTAL_STEPS, status: "drafting", lastError: null,
      updatedAt: new Date().toISOString(),
    }));
  } catch (err: any) {
    const msg = String(err?.message ?? err).slice(0, 400);
    console.error(`[brandTaskCard] distil failed for ${cardId}:`, msg);
    await patch((c) => ({ ...c, status: "failed", lastError: msg, updatedAt: new Date().toISOString() }))
      .catch(() => {});
  }
}

/**
 * 從貼上的 AI 對話串裡挑出「哪幾段是成品」。
 *
 * 2026-09-04 (CJ「我該如何，讓用戶更無痛地，將本來在 chatgpt 等地方訓練好的
 * 對話串，複製過來」)。
 *
 * ── 為什麼不是給用戶提示詞叫他去別的工具整理 ─────────────────────────
 * 那會把工作推回另一個產品：離開這一頁 → 貼提示詞 → 等 → 複製回來，三步都在
 * 別人的地盤，而且那邊的模型不聽話我們也不知道。「整理很亂的輸入」本來就是這個
 * 產品在做的事（定位文件上傳就是同一招），把它留在自己這邊，抽取結果還能攤開來
 * 讓使用者確認。使用者只需要按一次 Ctrl+A。
 *
 * ── 抽出來的必須逐字出自原文 ─────────────────────────────────────────
 * 模型很愛順手把成品「整理得更好」再交出來。那樣抽到的就不是使用者真的發過的文，
 * 而這張卡的全部價值就建立在「學你真的寫過的東西」。所以 LLM 回來之後還要過
 * `verbatimSamples()` 這道確定性檢查，改寫過的一律丟掉 —— 寧可少幾篇。
 *
 * 2026-10-04 改版：不再叫模型抄寫成品，只回「第幾行到第幾行」（見 brandTaskCards.numberThread）。
 * 舊版輸出長度＝所有成品總長，會被 maxTokens 截斷成壞 JSON，是整串貼上一直「抽取失敗」的主因。
 */
async function extractFromThread(text: string): Promise<{ samples: string[]; raw: number }> {
  const t = numberThread(text);
  if (t.index.length === 0) return { samples: [], raw: 0 };

  const sys = `使用者貼了一段他跟 AI 助手的對話紀錄，每一行前面有編號 [n]。請找出哪幾行是「可以直接發布的成品」。

【什麼算成品】
完整的一篇貼文／文案／文章 —— 也就是他當初就是要 AI 幫他生出來的那個東西。

【什麼不算，要略過】
- 使用者自己下的指令與追問（「幫我寫十篇」「太長了改短一點」）、使用者貼進來當參考的文章
- AI 的解釋、開場白、收尾詢問（「好的，我幫你寫了三個版本」「需要我再調整嗎？」）
- 被後面版本取代的舊稿 —— 同一篇改了三次只取**最後一版**
- 大綱、條列的建議、分析、檢討

【怎麼回答】
你不用抄任何內容，只回每一篇成品的「起訖行號」（含頭尾，必須連續）。
輸出 JSON：{"pieces":[{"from":12,"to":18},{"from":25,"to":31}]}
挑不到任何成品就回 {"pieces":[]}。直接輸出 JSON，第一個字元就是 {。`;

  const askChunk = async (from: number, to: number): Promise<{ ranges: [number, number][]; invalid: number }> => {
    const call = async () => {
      const r = await Promise.race([
        invokeLLM({
          messages: [
            { role: "system", content: sys },
            { role: "user", content: renderNumbered(t, from, to) },
          ],
          maxTokens: 1500,
        }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), 90_000)),
      ]);
      const out = r.choices[0]?.message?.content;
      return parsePieceRanges(typeof out === "string" ? out : "", from, to);
    };
    try { return await call(); }
    catch (e) {
      console.warn(`[brandTaskCard] extract chunk ${from}-${to} 失敗，重試一次：`, String((e as any)?.message ?? e).slice(0, 200));
      return await call();
    }
  };

  // 長對話分塊平行問。編號是全域的，所以各塊的結果可以直接合併。
  const chunks = chunkLineRanges(t);
  const settled = await Promise.allSettled(chunks.map((c) => askChunk(c.from, c.to)));
  const ok = settled.filter((x): x is PromiseFulfilledResult<{ ranges: [number, number][]; invalid: number }> => x.status === "fulfilled");
  if (ok.length === 0) {
    const first = settled[0] as PromiseRejectedResult;
    throw new Error(String(first?.reason?.message ?? first?.reason ?? "模型沒有回應"));
  }
  const ranges = ok.flatMap((x) => x.value.ranges).sort((a, b) => a[0] - b[0]);
  const invalid = ok.reduce((n, x) => n + x.value.invalid, 0);
  const pieces = sliceByRanges(t, ranges);
  // 太長的丟掉（會讓 create 的長度驗證失敗）；數量超過上限就留前面的。
  const usable = pieces.filter((p) => p.length <= MAX_SAMPLE_CHARS);
  const samples = verbatimSamples(usable, text).slice(0, MAX_SAMPLES);
  return { samples, raw: pieces.length + invalid };
}

/**
 * 替自建卡畫插畫（背景跑，幾十秒）：Claude 寫畫面概念 → gpt-image-2 → 縮 webp。
 * 狀態寫回卡片，前端輪詢 get 看 illustrationStatus。失敗不擋任何流程，卡片照樣
 * 可以上架，modal 就退回現成的 SVG 場景。
 */
async function drawCardIllustration(brandId: number, userId: number, cardId: string): Promise<void> {
  const set = (patch: Record<string, unknown>) =>
    mutateBrandTaskCards(brandId, userId, (list) =>
      list.map((c) => (c.id === cardId ? { ...c, ...patch } : c)));
  try {
    const card = await getBrandTaskCard(brandId, cardId);
    if (!card) return;
    const concepts = await writeIllustrationConcepts([{
      id: card.id, label: card.name, question: card.primaryQuestion,
      description: (card.samples[0] ?? "").slice(0, 200),
    }]);
    const concept = concepts[card.id];
    if (!concept) throw new Error("沒拿到畫面概念");
    const r = await drawIllustration(concept);
    if ("error" in r) throw new Error(r.error);
    const file = coverFilePath(r.url);
    if (!file) throw new Error("圖檔位置不對");
    const url = saveCoverFile(await shrinkToWebp(readFileSync(file)), `taskcard-${cardId}-${Date.now()}.webp`);
    await set({ illustrationUrl: url, illustrationStatus: "ready", illustrationError: null });
  } catch (e: any) {
    await set({ illustrationStatus: "failed", illustrationError: String(e?.message ?? e).slice(0, 300) }).catch(() => {});
  }
}

export const brandTaskCardRouter = router({
  /**
   * 貼上整串 AI 對話 → 挑出裡面的成品，變成一格一格的範例。
   * 不寫任何東西進資料庫 —— 純粹是「幫你把貼上來的東西整理成範例框」。
   */
  extractSamples: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      text: z.string().min(80).max(200_000),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      let result: { samples: string[]; raw: number };
      try {
        result = await extractFromThread(input.text);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `抽取失敗（${String(err?.message ?? err).slice(0, 200)}）— 可以重試，或改成一篇一篇貼`,
        });
      }
      if (result.samples.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.raw > 0
            // 挑到了段落但全被濾掉（太短、單篇超過上限、範圍不合法）。
            ? `挑到的段落都不能用（太短，或單篇超過 ${MAX_SAMPLE_CHARS} 字）。請重試一次；連續失敗的話改成一篇一篇貼。`
            : "在這段對話裡找不到可以直接發布的成品。確認一下有沒有貼到完整的產出，或改成一篇一篇貼。",
        });
      }
      return {
        samples: result.samples,
        // 抽到幾篇、丟掉幾篇都要講 —— 使用者才知道是不是漏了什麼。
        dropped: Math.max(0, result.raw - result.samples.length),
      };
    }),

  list: protectedProcedure
    .input(z.object({ brandId: z.number(), channel: channelInput.optional() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      const cards = await listBrandTaskCards(input.brandId);
      return input.channel ? cards.filter((c) => c.channel === input.channel) : cards;
    }),

  get: protectedProcedure
    .input(z.object({ brandId: z.number(), cardId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertBrandAccess(ctx.user!.id, input.brandId);
      return await getBrandTaskCard(input.brandId, input.cardId);
    }),

  /**
   * 命名 + 貼範例 + 指定要問什麼 → 建卡並開始生成 SKILL。
   * 回傳當下就有 cardId，前端立刻可以顯示進度條。
   */
  create: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      name: z.string().min(1).max(60),
      channel: channelInput,
      samples: z.array(z.string().min(20).max(MAX_SAMPLE_CHARS)).min(1).max(MAX_SAMPLES),
      primaryQuestion: z.string().min(2).max(200),
      primaryPlaceholder: z.string().max(200).default(""),
      askFields: z.array(fieldInput).max(8).default([]),
      variants: z.number().int().min(1).max(5).default(1),
      agentId: z.number().nullable().default(null),
      // 商品頁通路才用：要產出哪些欄位、各欄上限（用戶填）。沒給＝預設欄位。
      listingFields: listingFieldsInput.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);   // 2026-09-07 viewer 不能建卡
      await assertChannelUsable(input.brandId, input.channel);
      const format = await channelCardFormat(input.brandId, input.channel);

      const existing = await listBrandTaskCards(input.brandId);
      // 2026-09-06：上限改成跟著方案走（基礎 3 張 / 專業 10 張）。
      // MAX_CARDS_PER_BRAND 留著當技術上限 —— 方案給再多也不該無限長，
      // 這張表是塞在 brands.positioning 的 JSON 裡。
      const ownQuota = await planQuotaFor(userId);
      const cardCap = isUnlimited(ownQuota.ownTaskCards)
        ? MAX_CARDS_PER_BRAND
        : Math.min(ownQuota.ownTaskCards, MAX_CARDS_PER_BRAND);
      if (existing.length >= cardCap) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `你的方案最多 ${cardCap} 張自建任務卡（目前 ${existing.length}）。`
            + `升級後可以增加，或先刪掉用不到的。`,
        });
      }

      // id 撞名時加序號 —— 使用者常常會建「促購文」「促購文2」這種。
      const base = `u${input.brandId}-${slugifyCardName(input.name)}`;
      let id = base;
      for (let i = 2; existing.some((c) => c.id === id); i++) id = `${base}-${i}`;

      const now = new Date().toISOString();
      const samples = input.samples.map((s) => s.trim()).filter(Boolean);
      const card: BrandTaskCard = {
        id, brandId: input.brandId, name: input.name.trim(),
        channel: input.channel as BrandTaskCard["channel"],
        status: "drafting", currentStep: 1, totalSteps: TOTAL_STEPS, lastError: null,
        samples,
        primaryQuestion: input.primaryQuestion.trim(),
        primaryPlaceholder: input.primaryPlaceholder.trim(),
        askFields: fieldsFrom(input.askFields),
        skill: "",
        measured: measureSamples(samples),
        ...(format === "listing"
          ? { format: "listing" as const, listingFields: sanitizeListingFields(input.listingFields ?? DEFAULT_LISTING_FIELDS) }
          : {}),
        variants: input.variants,
        agentId: input.agentId,
        createdAt: now, updatedAt: now, createdBy: userId,
        lastDryRun: null,
      };
      await mutateBrandTaskCards(input.brandId, userId, (cards) => [...cards, card]);

      // 背景跑。故意不 await —— SKILL 生成要幾十秒，前端要能立刻拿到 cardId 畫進度。
      void runDistil(input.brandId, userId, id);
      return { cardId: id, card };
    }),

  /** 重跑 SKILL 生成（改了範例或上次失敗時）。 */
  distil: protectedProcedure
    .input(z.object({ brandId: z.number(), cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      const card = await getBrandTaskCard(input.brandId, input.cardId);
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這張卡" });
      await mutateBrandTaskCards(input.brandId, userId, (cards) =>
        cards.map((c) => (c.id === input.cardId
          ? { ...c, status: "drafting", currentStep: 1, lastError: null, updatedAt: new Date().toISOString() }
          : c)));
      void runDistil(input.brandId, userId, input.cardId);
      return { ok: true };
    }),

  /**
   * 手改卡的內容。SKILL 是可編輯的 —— AI 反推得再好，作者本人最清楚哪條規則錯了。
   * 改了 samples 就要重跑 distil（字數區間會跟著變），這裡只更新資料，由前端決定要不要叫 distil。
   */
  update: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      cardId: z.string(),
      name: z.string().min(1).max(60).optional(),
      skill: z.string().min(50).max(20_000).optional(),
      primaryQuestion: z.string().min(2).max(200).optional(),
      primaryPlaceholder: z.string().max(200).optional(),
      askFields: z.array(fieldInput).max(8).optional(),
      // 只改既有欄位的標題、key 不動（2026-10-04：任務視窗裡改欄位標題）。askFields 會依標題重生 key，
      // 改標題若走那條，key 一變，舊產出存的 inputs 就對不上了。
      askFieldLabels: z.record(z.string(), z.string().trim().min(1).max(40)).optional(),
      samples: z.array(z.string().min(20).max(MAX_SAMPLE_CHARS)).min(1).max(MAX_SAMPLES).optional(),
      variants: z.number().int().min(1).max(5).optional(),
      agentId: z.number().nullable().optional(),
      // 商品頁卡：改欄位或各欄上限。貼文卡忽略。
      listingFields: listingFieldsInput.optional(),
      // null＝回到自動挑。只驗形狀，場景清單在前端。
      scene: z.string().regex(/^[a-z]{2,16}$/).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      const cards = await mutateBrandTaskCards(input.brandId, userId, (list) =>
        list.map((c) => {
          if (c.id !== input.cardId) return c;
          const samples = input.samples ? input.samples.map((s) => s.trim()).filter(Boolean) : c.samples;
          return {
            ...c,
            name: input.name?.trim() ?? c.name,
            skill: input.skill ?? c.skill,
            primaryQuestion: input.primaryQuestion?.trim() ?? c.primaryQuestion,
            primaryPlaceholder: input.primaryPlaceholder?.trim() ?? c.primaryPlaceholder,
            askFields: input.askFields
              ? fieldsFrom(input.askFields)
              : input.askFieldLabels
                ? c.askFields.map((f) => ({ ...f, label: input.askFieldLabels![f.key] ?? f.label }))
                : c.askFields,
            samples,
            measured: input.samples ? measureSamples(samples) : c.measured,
            variants: input.variants ?? c.variants,
            ...(c.format === "listing" && input.listingFields ? { listingFields: sanitizeListingFields(input.listingFields) } : {}),
            agentId: input.agentId !== undefined ? input.agentId : c.agentId,
            scene: input.scene !== undefined ? input.scene : (c.scene ?? null),
            updatedAt: new Date().toISOString(),
          };
        }));
      const card = cards.find((c) => c.id === input.cardId);
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這張卡" });
      return card;
    }),

  /**
   * 試寫。不寫 mission_outputs、不扣點 —— 這是驗證卡做得對不對，不是一次產出。
   * `runOrchestra` 的 userId 是選填的，不傳就不會走 recordTaskRun。
   */
  dryRun: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      cardId: z.string(),
      inputs: z.record(z.string(), z.string()).default({}),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      const card = await getBrandTaskCard(input.brandId, input.cardId);
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這張卡" });
      if (!card.skill) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SKILL 還沒生成完，請等進度跑完再試寫" });
      }

      const { runOrchestra } = await import("../core/engine/quickTaskOrchestra");
      // 試寫一律只產一個版本：驗的是「像不像」，看一篇就夠，五篇只是多等四倍。
      const config = { ...cardConfig(card), variants: 1, variantLabels: ["試寫"] };
      let result: any;
      try {
        result = await runOrchestra({
          template: cardTemplate(card),
          config: config as any,
          inputs: input.inputs,
          brandId: input.brandId,
          // userId 刻意不傳 —— 傳了就會 recordTaskRun，/projects 會塞滿半成品。
        });
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `試寫失敗：${String(err?.message ?? err).slice(0, 300)}`,
        });
      }

      const caption = String(result?.variants?.[0]?.caption ?? "").trim();
      if (!caption) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "試寫回了空白。多半是 SKILL 的字數區間跟範例差太多，或 LLM 供應商降級了 —— 可以重試或重跑 SKILL。",
        });
      }
      const at = new Date().toISOString();
      await mutateBrandTaskCards(input.brandId, userId, (list) =>
        list.map((c) => (c.id === input.cardId ? { ...c, lastDryRun: { at, caption }, updatedAt: at } : c)));

      const listing = listingSpecOf(card);
      return {
        caption,
        chars: caption.length,
        // 商品頁：逐欄的字數與是否超標（沒有「整篇字數」這回事）。
        listing: listing ? parseListing(caption, listing) : null,
        // 量出來的區間就是驗收標準 —— 直接告訴使用者這篇有沒有落在範圍內。
        inRange: listing ? true : caption.length >= card.measured.minChars && caption.length <= card.measured.maxChars,
        expected: { minChars: card.measured.minChars, maxChars: card.measured.maxChars },
        // 這次試寫時系統上網查到的案例與說法（成品旁顯示給用戶看）；沒查到時 note 說明原因。
        references: (result?.references ?? []) as CardReference[],
        researchNote: (result?.researchNote ?? null) as string | null,
      };
    }),

  /**
   * 用 gpt-image-2 替這張卡畫一張（或重畫）。會把 scene 清成 null——按了「AI 畫」
   * 就是要看 AI 的圖，不是剛剛挑的現成場景。立即回傳，圖在背景畫。
   */
  generateIllustration: protectedProcedure
    .input(z.object({ brandId: z.number(), cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanAct(ctx.user!.id);
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      const card = await getBrandTaskCard(input.brandId, input.cardId);
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這張卡" });
      if (illustrationInFlight(card)) return { ok: true, alreadyRunning: true };
      await mutateBrandTaskCards(input.brandId, userId, (list) =>
        list.map((c) => (c.id === input.cardId
          ? { ...c, scene: null, illustrationStatus: "generating", illustrationError: null, illustrationStartedAt: new Date().toISOString() }
          : c)));
      void drawCardIllustration(input.brandId, userId, input.cardId);
      return { ok: true, alreadyRunning: false };
    }),

  /** 確認沒問題 → 卡片上架，開始出現在該通道的任務頁。 */
  publish: protectedProcedure
    .input(z.object({ brandId: z.number(), cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertCanAct(ctx.user!.id);   // 2026-09-07 viewer 只能看，不能發布／排程／建卡
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      const card = await getBrandTaskCard(input.brandId, input.cardId);
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這張卡" });
      if (!card.skill) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "SKILL 還沒生成完，不能上架" });
      }
      // 刻意不強制先試寫。建議試寫，但擋住上架等於逼使用者多花一次 LLM 才能存自己的卡。
      await mutateBrandTaskCards(input.brandId, userId, (list) =>
        list.map((c) => (c.id === input.cardId
          ? { ...c, status: "ready", lastError: null, updatedAt: new Date().toISOString() }
          : c)));
      // 上架時還沒有插畫（例如沒經過試寫那步）就補畫一張；用戶自己挑了現成場景就不畫。
      if (!card.scene && !card.illustrationUrl && !illustrationInFlight(card)) {
        await mutateBrandTaskCards(input.brandId, userId, (list) =>
          list.map((c) => (c.id === input.cardId
            ? { ...c, illustrationStatus: "generating", illustrationError: null, illustrationStartedAt: new Date().toISOString() }
            : c)));
        void drawCardIllustration(input.brandId, userId, input.cardId);
      }
      return { ok: true };
    }),

  /** 下架但不刪 —— 卡先收起來，之後可能還要用。 */
  unpublish: protectedProcedure
    .input(z.object({ brandId: z.number(), cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await mutateBrandTaskCards(input.brandId, userId, (list) =>
        list.map((c) => (c.id === input.cardId
          ? { ...c, status: "drafting", updatedAt: new Date().toISOString() }
          : c)));
      return { ok: true };
    }),

  /**
   * 把一張自建卡複製一份（可以換通路）。2026-10-04，CJ「可以在不同的平台中，管理到
   * 自己常用的，或進行修改」——同一套寫法想拿到 IG 用，不該從貼範例重來一次。
   *
   * 連 SKILL 一起複製、不重新反推：反推要花一次 LLM，而且同一批範例反推兩次會得到
   * 兩份不一樣的規則，使用者調過的 SKILL 就丟了。字數區間照原卡（量自同一批範例）——
   * 換到篇幅差很多的通路時，使用者在編輯畫面改範例就會重量。
   */
  duplicate: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      cardId: z.string(),
      channel: channelInput,
      name: z.string().min(1).max(60).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await assertCanAct(userId);
      await assertChannelUsable(input.brandId, input.channel);
      const existing = await listBrandTaskCards(input.brandId);
      const source = existing.find((c) => c.id === input.cardId);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這張卡" });
      // 商品頁卡的 SKILL 是逐欄寫的，貼文卡的是整篇結構 —— 兩種不能互相複製，複製過去只會寫出怪東西。
      if ((source.format ?? "post") !== (await channelCardFormat(input.brandId, input.channel))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: source.format === "listing"
            ? "商品頁的卡只能複製到商品頁類型的通路（電商、開店平台）。"
            : "貼文的卡只能複製到貼文類型的通路。",
        });
      }
      const quota = await planQuotaFor(userId);
      const cardCap = isUnlimited(quota.ownTaskCards)
        ? MAX_CARDS_PER_BRAND
        : Math.min(quota.ownTaskCards, MAX_CARDS_PER_BRAND);
      if (existing.length >= cardCap) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `你的方案最多 ${cardCap} 張自建任務卡（目前 ${existing.length}）。`
            + `升級後可以增加，或先刪掉用不到的。`,
        });
      }
      const card = duplicateCard(source, existing, {
        channel: input.channel as BrandTaskCard["channel"], name: input.name, userId,
      });
      await mutateBrandTaskCards(input.brandId, userId, (cards) => [...cards, card]);
      return { cardId: card.id, card };
    }),

  remove: protectedProcedure
    .input(z.object({ brandId: z.number(), cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await assertBrandAccess(userId, input.brandId);
      await mutateBrandTaskCards(input.brandId, userId, (list) =>
        list.filter((c) => c.id !== input.cardId));
      return { ok: true };
    }),
});
