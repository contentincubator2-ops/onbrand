/**
 * channelRoleRouter — 策略層「通路角色」：每個平台各一張小卡的讀、存、與 AI 討論。
 *
 * 2026-10-03（CJ「用戶可以直接在這邊與 AI 討論出該平台的定位，也要可以直接貼上其他討論好的文字串」）。
 * 資料形狀與注入規則見 core/channelRoles.ts。這裡是需要 LLM 與 tRPC context 的那一半：
 *
 *  · discuss      與 AI 一來一回討論；AI 覺得資訊夠了（或用戶說「幫我整理」）才附一份草案。
 *  · importPaste  貼上別處（ChatGPT / Claude…）已經討論好的文字 → **逐字**對映到五格。
 *
 * 兩條路的共同紀律（跟 positioningDocsRouter 一致）：**提案，不是自動套用**。這裡永遠不寫入
 * positioning；寫入只有 save，而且是用戶看過、可能改過之後按的。定位是所有任務的上游，
 * 靜靜寫錯一格會污染每一張該平台的卡。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { invokeLLM } from "../../platform/core/llm";
import { buildBrandPrefix, invalidateBrandPrefix } from "../core/brandContext";
import {
  ROLE_CHANNELS, CHANNEL_LABEL_ZH, CHANNEL_ROLE_FIELDS, type RoleChannel, type ChannelRole,
  cleanChannelRole, isEmptyChannelRole, channelRolesOf, channelRoleBody, isVerbatimIn,
  saveChannelRole, loadChannelRoles,
} from "../core/channelRoles";
import { loadPositioning } from "../core/positioningDocs";

const channelInput = z.enum(ROLE_CHANNELS);

const roleInput = z.object({
  role: z.string().max(2000).default(""),
  audience: z.string().max(2000).default(""),
  coreMessage: z.string().max(2000).default(""),
  tone: z.string().max(2000).default(""),
  avoid: z.string().max(2000).default(""),
});

// ── per-user rate limit（跟策略總監對話同一套數字：LLM 呼叫要花錢）──
type RateState = { hourCount: number; hourReset: number; minCount: number; minReset: number };
const rateByUser = new Map<number, RateState>();
function checkRate(userId: number): boolean {
  const now = Date.now();
  let s = rateByUser.get(userId);
  if (!s) { s = { hourCount: 0, hourReset: now + 3600_000, minCount: 0, minReset: now + 60_000 }; rateByUser.set(userId, s); }
  if (now >= s.hourReset) { s.hourCount = 0; s.hourReset = now + 3600_000; }
  if (now >= s.minReset) { s.minCount = 0; s.minReset = now + 60_000; }
  if (s.minCount >= 8 || s.hourCount >= 60) return false;
  s.minCount++; s.hourCount++;
  return true;
}

async function guard(userId: number): Promise<void> {
  if (!checkRate(userId)) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "問得太快了，稍等一下再繼續討論" });
  }
  try {
    const { preflightCostCheck } = await import("../../platform/core/llmWithBilling");
    const g = await preflightCostCheck(userId);
    if (!g.ok) throw new TRPCError({ code: "FORBIDDEN", message: g.reason });
  } catch (e) { if (e instanceof TRPCError) throw e; /* guard optional */ }
}

function extractJson(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

async function callJson(system: string, messages: { role: "user" | "assistant"; content: string }[], maxTokens: number): Promise<string> {
  const r = await Promise.race([
    invokeLLM({
      messages: [{ role: "system", content: system }, ...messages],
      maxTokens,
    }),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), 90_000)),
  ]);
  const raw = r.choices[0]?.message?.content;
  return typeof raw === "string" ? raw : "";
}

const FIELD_GUIDE = CHANNEL_ROLE_FIELDS
  .map((f) => `- "${f.key}"（${f.label}，≤${f.max} 字）`)
  .join("\n");

/** 其他平台已定下的角色——讓 AI 知道要跟它們區隔，而不是每個平台都產出同一套話。 */
function otherChannelsBlock(roles: ReturnType<typeof channelRolesOf>, channel: RoleChannel): string {
  const lines = ROLE_CHANNELS
    .filter((c) => c !== channel && roles[c])
    .map((c) => `- ${CHANNEL_LABEL_ZH[c]}：${channelRoleBody(roles[c]!)}`);
  return lines.length ? `\n【其他平台已經定下的角色（要跟它們區隔，不要重複同一套話）】\n${lines.join("\n")}\n` : "";
}

function currentBlock(cur: ChannelRole): string {
  return isEmptyChannelRole(cur)
    ? "\n【這個平台目前還沒填任何內容】\n"
    : `\n【使用者目前在這個平台已填的內容（以此為基礎調整，不要無故推翻）】\n${channelRoleBody(cur)}\n`;
}

export const channelRoleRouter = router({
  /** 這個品牌已經存過的通路角色（只回有填的平台）。 */
  list: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }) => {
      return { roles: await loadChannelRoles(input.brandId, ctx.user!.id) };
    }),

  /** 存一個平台的角色。五格都空＝清除那個平台。 */
  save: protectedProcedure
    .input(z.object({ brandId: z.number(), channel: channelInput, role: roleInput }))
    .mutation(async ({ ctx, input }) => {
      const saved = await saveChannelRole({
        brandId: input.brandId, userId: ctx.user!.id, channel: input.channel, role: cleanChannelRole(input.role),
      });
      invalidateBrandPrefix(input.brandId);
      return { ok: true, role: isEmptyChannelRole(saved) ? null : saved };
    }),

  /**
   * 與 AI 討論這個平台的定位。messages 是到目前為止的對話（最後一則是用戶剛送出的）。
   * 回 reply；資訊夠了（或用戶要求整理）時另附 proposal——用戶按「套用到欄位」才進表單，按存檔才寫入。
   */
  discuss: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      channel: channelInput,
      current: roleInput,
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(6000),
      })).min(1).max(24),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const pos = await loadPositioning("brand", input.brandId, userId).catch(() => {
        throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個品牌" });
      });
      await guard(userId);

      const brand = await buildBrandPrefix(input.brandId).catch(() => "");
      const label = CHANNEL_LABEL_ZH[input.channel];
      const sys = `你是這個品牌的「通路策略顧問」，正在跟使用者一起討論品牌在【${label}】這個平台上的定位——也就是：這個平台在品牌裡扮演什麼角色、主要對誰說、要傳達哪句核心訊息、語氣跟其他平台有什麼不同、有哪些事不在這個平台說。繁體中文。
${brand}${otherChannelsBlock(channelRolesOf(pos), input.channel)}${currentBlock(cleanChannelRole(input.current))}
【怎麼聊】
- 像同事討論，不要像填問卷：一次最多問 1–2 個問題，回覆 ≤ 200 字。
- 只根據上面的品牌資料與使用者說的話。品牌資料沒有的事實（獎項、數字、功能、價格）不准編；不確定就問。
- ${label} 的平台特性可以提（受眾習慣、內容形式、使用情境），但要用來幫使用者做取捨，不要變成泛泛的平台介紹。
- 要點出這個平台跟其他平台**該有的不同**，不要給一套放哪個平台都成立的話。
- 資訊還不夠給草案時，proposal 給 null，先把關鍵問題問清楚。當你已經掌握足夠資訊，或使用者說「幫我整理／給我草案」，才附 proposal。

【輸出 JSON，第一個字元就是 {】
{
  "reply": "給使用者看的回覆",
  "proposal": null 或 {
${FIELD_GUIDE}
  }
}
proposal 的每一格都要簡潔、可以直接放進表單；沒有把握的格給空字串，不要硬湊。`;

      let text = "";
      try {
        text = await callJson(sys, input.messages.map((m) => ({ role: m.role, content: m.content })), 1500);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `AI 暫時沒有回應（${String(err?.message ?? err).slice(0, 120)}），可以再送一次`,
        });
      }
      const parsed = extractJson(text);
      // 模型沒照格式回就把原文當 reply——比整個失敗好，用戶至少看得到它說了什麼。
      const reply = String(parsed?.reply ?? "").trim() || text.trim().slice(0, 1200);
      const proposal = parsed?.proposal && typeof parsed.proposal === "object" ? cleanChannelRole(parsed.proposal) : null;
      return { reply, proposal: proposal && !isEmptyChannelRole(proposal) ? proposal : null };
    }),

  /**
   * 貼上別處已經討論好的文字（整段 ChatGPT / Claude 對話，或自己寫的一段說明）→ 對映到五格。
   * 規則跟「上傳定位文件」一致：只准引用，不准創作，一字不改——不是原文裡的字，整格丟掉。
   */
  importPaste: protectedProcedure
    .input(z.object({
      brandId: z.number(),
      channel: channelInput,
      text: z.string().min(4).max(30_000),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      await loadPositioning("brand", input.brandId, userId).catch(() => {
        throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個品牌" });
      });
      await guard(userId);

      const label = CHANNEL_LABEL_ZH[input.channel];
      const sys = `你在把使用者貼上的一段文字，對映到品牌在【${label}】這個平台的「通路角色」五個欄位。繁體中文。

【這段文字可能是什麼】
可能是使用者貼上的一整段 AI 對話紀錄（他之前在 ChatGPT / Claude / Gemini 裡已經討論過這個平台的定位），也可能是他自己寫的說明。如果是對話紀錄，先在心裡清乾淨：
- 略過使用者自己下的指令與追問（「幫我想一下受眾」「這段改短一點」）
- 略過 AI 的開場白、收尾詢問（「好的，這是我的分析」「需要我再調整嗎？」）
- 同一個主題被討論、修改很多次的，只取**最後定案**的版本，不要取中途被取代的舊版
- 略過大綱、條列建議、比較分析這類過程性文字，只取**已經確定下來的結論**
- 如果內容是在講別的平台，不要硬塞進【${label}】

【最重要的規則：只准引用，不准創作，一字不改】
每一格的值都必須**逐字**出自原文——可以節錄、可以把相鄰的句子接起來、可以去掉贅字、講者標籤或條列符號，但不可以換句話說、不可以把用詞「順一遍」。原文沒講到的格就整格不要出現在輸出裡：少填一格會被誠實標示「你貼的內容沒有這項」，用戶可以自己補；編一句出來則會直接變成品牌在這個平台的說法，之後每一篇文案都會沿用。

【要對映的五格】
${FIELD_GUIDE}

【輸出 JSON，第一個字元就是 {】
{ "role": "...", "audience": "...", "coreMessage": "...", "tone": "...", "avoid": "..." }
對不到的格直接省略，不要放空字串。`;

      let text = "";
      try {
        text = await callJson(sys, [{ role: "user", content: input.text }], 2000);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `整理失敗（${String(err?.message ?? err).slice(0, 120)}），貼上的內容還在，可以再試一次`,
        });
      }
      const parsed = extractJson(text) ?? {};
      const found: Partial<ChannelRole> = {};
      const dropped: string[] = [];
      for (const f of CHANNEL_ROLE_FIELDS) {
        const v = typeof parsed[f.key] === "string" ? parsed[f.key].trim() : "";
        if (!v) continue;
        if (!isVerbatimIn(v, input.text)) {
          // 模型改寫過原文：丟掉，並讓用戶知道這格被擋下，而不是靜靜消失。
          console.warn(`[channelRoleRouter] importPaste: 「${f.key}」改寫過原文，丟棄不提案`);
          dropped.push(f.label);
          continue;
        }
        found[f.key] = v;
      }
      const proposal = cleanChannelRole(found);
      const filled = CHANNEL_ROLE_FIELDS.filter((f) => proposal[f.key]).map((f) => f.key);
      return {
        proposal: isEmptyChannelRole(proposal) ? null : proposal,
        filled,
        // 被擋下的格不算「你貼的內容沒有」——它有、只是模型改寫了，兩句話並列會互相矛盾。
        missing: CHANNEL_ROLE_FIELDS.filter((f) => !proposal[f.key] && !dropped.includes(f.label)).map((f) => f.label),
        dropped,
        // 超過單格上限的值被截斷了——明講，免得以為整段都進去了。
        truncated: CHANNEL_ROLE_FIELDS
          .filter((f) => typeof found[f.key] === "string" && [...(found[f.key] as string)].length > f.max)
          .map((f) => f.label),
      };
    }),
});
