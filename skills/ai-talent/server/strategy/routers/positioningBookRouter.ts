/**
 * positioningBookRouter — 策略層「品牌定位書」：卡片牆的讀、存、排序、與顧問討論、草擬提案。
 *
 * 資料形狀與「卡片跟原本定位欄位的關係」見 core/positioning/positioningBook.ts。這裡是需要
 * LLM 與 tRPC context 的那一半：
 *
 *  · discuss        在一張卡裡跟顧問一來一回；顧問覺得夠了（或用戶說「幫我整理」）才附一份這張卡的草稿。
 *  · importPaste    貼上或上傳現成的文字 → 把跟這張卡有關的句子**逐字**挑出來當草稿。
 *  · draftProposal  把卡片照順序串成一份定位書提案（只用卡片裡有的內容）。
 *
 * 跟 channelRoleRouter 同一條紀律：**顧問給的是草稿，不是自動套用**。discuss 永遠不寫入；
 * 寫入只有 saveCard，而且是用戶看過、可能改過之後按的。
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import { buildBrandPrefix, invalidateBrandPrefix } from "../core/brand/brandContext";
import { clampField, isVerbatimIn } from "../core/brand/channelRoles";
import { loadPositioning } from "../core/positioning/positioningDocs";
import {
  BOOK_PRESETS, BOOK_MIN_CARDS_TO_DRAFT, BOOK_TITLE_MAX, type BookCard,
  addBookCard, bookMark, bookView, effectiveBody, loadBook, removeBookCard, reorderBook,
  saveBookCard, saveBookProposal,
} from "../core/positioning/positioningBook";
import { getDirectorByAgentId } from "../core/strategist/strategistDirectory";
import { callJson, extractJson, guard } from "./channelRoleRouter";
import localPool from "../../localDb";

const cardId = z.string().min(1).max(40);
const presetId = z.enum(BOOK_PRESETS.map((p) => p.id) as [string, ...string[]]);

/** 指派的顧問人設（mos_db 原文）。查不到就當沒指派，不換一位頂替。 */
async function personaBlock(agentId: number | undefined, brandId: number, userId: number): Promise<{ who: string; block: string }> {
  if (!agentId) return { who: "", block: "" };
  try {
    const [rows]: any = await localPool.execute(
      `SELECT industry FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [brandId, userId],
    );
    const industry = typeof rows?.[0]?.industry === "string" && rows[0].industry.trim() ? rows[0].industry.trim() : null;
    const d = await getDirectorByAgentId(agentId, industry);
    if (!d) return { who: "", block: "" };
    const lines = [
      `你的名字是 ${d.name}，職稱 ${d.title}。`,
      d.bio ? `你的背景：${d.bio}` : "",
      d.specialty ? `你的專長：${d.specialty}` : "",
      "用這個人的專業視角與口吻回答，但不要在每句話自我介紹，也不要編造這個人沒有的經歷。",
    ].filter(Boolean);
    return { who: `（${d.name}）`, block: `\n【你的身分】\n${lines.join("\n")}\n` };
  } catch {
    return { who: "", block: "" };
  }
}

/** 其他卡片現在的內容——定位書是一條推導鏈，這張卡要接得上前面、撐得住後面。 */
function otherCardsBlock(cards: BookCard[], currentId: string): string {
  const idx = cards.findIndex((c) => c.id === currentId);
  const line = (c: BookCard) => `- ${c.title}：${clampField(effectiveBody(c).replace(/\n+/g, " "), 300)}`;
  const before = cards.filter((c, i) => i < idx && effectiveBody(c)).map(line);
  const after = cards.filter((c, i) => i > idx && effectiveBody(c)).map(line);
  return [
    before.length ? `\n【排在這張之前、已經寫好的卡片（這張要接得上它們）】\n${before.join("\n")}\n` : "",
    after.length ? `\n【排在這張之後、已經寫好的卡片（這張改了，它們可能要跟著調整——有必要時提醒使用者）】\n${after.join("\n")}\n` : "",
  ].join("");
}

export const positioningBookRouter = router({
  /** 定位書現在的樣子：卡片（依順序）、可以加回來的預設卡、存著的提案。 */
  get: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const book = await loadBook(input.brandId, ctx.user!.id);
      return { ...book, minCardsToDraft: BOOK_MIN_CARDS_TO_DRAFT };
    }),

  saveCard: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      cardId,
      body: z.string().max(8000),
      title: z.string().max(80).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await saveBookCard({ ...input, userId: ctx.user!.id }).catch((e) => {
        throw new TRPCError({ code: "BAD_REQUEST", message: String(e?.message ?? e) });
      });
      invalidateBrandPrefix(input.brandId);
      return { ok: true };
    }),

  addCard: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      preset: presetId.optional(),
      title: z.string().max(80).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await addBookCard({
        brandId: input.brandId, userId: ctx.user!.id, preset: input.preset as any, title: input.title,
      }).catch((e) => { throw new TRPCError({ code: "BAD_REQUEST", message: String(e?.message ?? e) }); });
      return { ok: true, cardId: id };
    }),

  removeCard: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), cardId }))
    .mutation(async ({ ctx, input }) => {
      await removeBookCard({ ...input, userId: ctx.user!.id });
      invalidateBrandPrefix(input.brandId);
      return { ok: true };
    }),

  reorder: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), order: z.array(cardId).max(40) }))
    .mutation(async ({ ctx, input }) => {
      await reorderBook({ ...input, userId: ctx.user!.id });
      invalidateBrandPrefix(input.brandId);
      return { ok: true };
    }),

  /**
   * 在一張卡裡跟顧問討論。messages 是到目前為止的對話（最後一則是用戶剛送出的）。
   * 回 reply；夠了（或用戶要求整理）時另附 proposal——用戶按「套用」才進右邊，按儲存才寫入。
   */
  discuss: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      cardId,
      /** 右邊現在的內容（可能還沒存）。 */
      current: z.string().max(8000).default(""),
      /** 自訂卡還沒存的新標題。 */
      title: z.string().max(80).optional(),
      agentId: z.number().int().positive().optional(),
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
      const { cards } = bookView(pos);
      const card = cards.find((c) => c.id === input.cardId);
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這張卡片" });
      await guard(userId);

      const title = card.preset ? card.title : (input.title?.trim().slice(0, BOOK_TITLE_MAX) || card.title);
      const brand = await buildBrandPrefix(input.brandId).catch(() => "");
      const persona = await personaBlock(input.agentId, input.brandId, userId);
      const current = input.current.trim();
      const sys = `你是這個品牌的「品牌策略顧問」${persona.who}，正在跟使用者一起寫品牌定位書裡的一張卡片：【${title}】。${card.ask ? `這張卡要回答的問題是：${card.ask}` : "這是使用者自己加的卡片，先弄清楚他想在這張卡裡定下什麼。"}繁體中文。
${persona.block}${brand}${otherCardsBlock(cards, card.id)}
${current
    ? `【這張卡目前的內容（以此為基礎調整，不要無故推翻）】\n${current}\n`
    : card.derived
      ? `【這張卡還沒人寫過。以下是從品牌既有定位資料整理出來的素材，可以當起點】\n${card.derived}\n`
      : "【這張卡目前是空的】\n"}
【怎麼聊】
- 像顧問跟客戶討論，不要像填問卷：一次最多問 1–2 個問題，回覆 ≤ 200 字。
- 只根據上面的品牌資料、其他卡片與使用者說的話。沒有依據的事實（數字、獎項、市佔、調查結果）不准編；不確定就問。
- 定位書是一條推導鏈：這張卡要接得上前面的卡片。發現前後矛盾就直接點出來，不要順著寫。
- 要有立場：使用者給的方向太寬、放在任何品牌都成立時，請他取捨，並說出你會怎麼選、為什麼。
- 資訊還不夠寫時，proposal 給 null，先把關鍵問題問清楚。當你已經掌握足夠資訊，或使用者說「幫我整理／給我草稿」，才附 proposal。

【輸出 JSON，第一個字元就是 {】
{
  "reply": "給使用者看的回覆",
  "proposal": null 或 "這張卡的完整內容（純文字，可以分段或條列，**硬上限 ${card.max} 字**）"
}
proposal 是可以直接放進定位書的定稿文字，不是大綱，也不要再加卡片標題。寫短、寫完整的句子，超過上限的部分會被系統截掉。`;

      let text = "";
      try {
        text = await callJson(sys, input.messages.map((m) => ({ role: m.role, content: m.content })), 2400);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `顧問暫時沒有回應（${String(err?.message ?? err).slice(0, 120)}），可以再送一次`,
        });
      }
      const parsed = extractJson(text);
      // 模型沒照格式回就把原文當 reply——比整個失敗好，用戶至少看得到它說了什麼。
      const reply = String(parsed?.reply ?? "").trim() || text.trim().slice(0, 1200);
      const proposal = typeof parsed?.proposal === "string" ? clampField(parsed.proposal.trim(), card.max) : "";
      return { reply, proposal: proposal || null };
    }),

  /**
   * 貼上（或從檔案讀出來的）現成文字 → 挑出跟這張卡有關的句子當草稿。
   * 規則跟通路角色的 importPaste 一致：只准引用，不准創作——不是原文裡的句子，整句丟掉並回報被擋下幾句。
   */
  importPaste: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      cardId,
      title: z.string().max(80).optional(),
      text: z.string().min(4).max(30_000),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const pos = await loadPositioning("brand", input.brandId, userId).catch(() => {
        throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個品牌" });
      });
      const card = bookView(pos).cards.find((c) => c.id === input.cardId);
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "找不到這張卡片" });
      await guard(userId);

      const title = card.preset ? card.title : (input.title?.trim().slice(0, BOOK_TITLE_MAX) || card.title);
      const sys = `你在從使用者貼上的一段文字裡，挑出屬於品牌定位書【${title}】這張卡的內容。${card.ask ? `這張卡要回答的問題是：${card.ask}` : ""}繁體中文。

【這段文字可能是什麼】
可能是一整份定位文件、簡報的文字、會議紀錄，或是使用者在 ChatGPT / Claude / Gemini 裡討論過的對話紀錄。如果是對話紀錄，先在心裡清乾淨：
- 略過使用者下的指令與追問、AI 的開場白與收尾詢問
- 同一個主題被修改很多次的，只取**最後定案**的版本
- 略過大綱、比較分析這類過程性文字，只取**已經確定下來的結論**
- 跟這張卡無關的內容（屬於定位書其他章節的）不要挑

【最重要的規則：只准引用，不准創作，一字不改】
每一句都必須**逐字**出自原文——可以節錄、可以去掉講者標籤或條列符號，但不可以換句話說、不可以把用詞「順一遍」、不可以自己補一句銜接。原文沒有跟這張卡有關的內容，就回空陣列。

【輸出 JSON，第一個字元就是 {】
{ "quotes": ["逐字引用的一句或一段", "..."] }
依原文順序，最多 12 段，合計不超過 ${card.max} 字。`;

      let text = "";
      try {
        text = await callJson(sys, [{ role: "user", content: input.text }], 2400);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `整理失敗（${String(err?.message ?? err).slice(0, 120)}），貼上的內容還在，可以再試一次`,
        });
      }
      const raw: unknown[] = Array.isArray(extractJson(text)?.quotes) ? extractJson(text).quotes : [];
      const quotes = raw.map((q) => (typeof q === "string" ? q.trim() : "")).filter(Boolean);
      // 模型改寫過的句子丟掉，並讓用戶知道有幾句被擋下，而不是靜靜消失。
      const kept = quotes.filter((q) => isVerbatimIn(q, input.text));
      const joined = kept.join("\n");
      const proposal = clampField(joined, card.max);
      return {
        proposal: proposal || null,
        dropped: quotes.length - kept.length,
        truncated: [...joined].length > card.max,
      };
    }),

  /**
   * 草擬提案：把卡片照順序寫成一份定位書。只用卡片裡有的內容——提案是把推導講清楚，
   * 不是再多想一些新的定位。寫好存在 _book.proposal，卡片之後再改會標成「卡片已更新」。
   */
  draftProposal: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      agentId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const pos = await loadPositioning("brand", input.brandId, userId).catch(() => {
        throw new TRPCError({ code: "NOT_FOUND", message: "找不到這個品牌" });
      });
      const { cards } = bookView(pos);
      const filled = cards.filter((c) => effectiveBody(c));
      if (filled.length < BOOK_MIN_CARDS_TO_DRAFT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `至少要有 ${BOOK_MIN_CARDS_TO_DRAFT} 張卡片有內容，才能草擬提案（目前 ${filled.length} 張）`,
        });
      }
      await guard(userId);

      const [rows]: any = await localPool.execute(
        `SELECT name FROM brands WHERE id = ? AND userId = ? LIMIT 1`, [input.brandId, userId],
      );
      const brandName = String(rows?.[0]?.name ?? "").trim() || "品牌";
      const persona = await personaBlock(input.agentId, input.brandId, userId);
      const material = cards
        .map((c, i) => `### ${i + 1}. ${c.title}\n${effectiveBody(c) || "（這張卡還沒有內容）"}`)
        .join("\n\n");
      const sys = `你是品牌策略顧問${persona.who}，要把下面這些卡片寫成一份給客戶看的「${brandName} 品牌定位書」提案。繁體中文。
${persona.block}
【怎麼寫】
- 章節就是卡片，**順序與標題照卡片，一章都不要多、不要少、不要合併**。每章用「## 編號. 標題」開頭。
- 每一章先用一句話寫出這一章的結論，再用一小段說明；章與章之間要接得上——讓讀的人看得出「因為前一章，所以這一章」。
- **只用卡片裡有的內容。** 不准加入卡片沒寫的事實、數字、調查、競品或案例；卡片寫得簡略，就寫得簡略。
- 標語、定位主張、品牌宣言這類已經定稿的句子**照抄原文**，不要潤飾。
- 標示「（這張卡還沒有內容）」的章節，只寫一行「（尚未填寫）」，不要替它想內容。
- 最前面加一段不超過 120 字的「摘要」（用「## 摘要」），把整份定位書的推導用三四句話講完。
- 不要客套話、不要結語、不要建議下一步。直接輸出 Markdown，不要包在程式碼區塊裡。`;

      let text = "";
      try {
        text = await callJson(sys, [{ role: "user", content: `【卡片】\n\n${material}` }], 4500, 150_000);
      } catch (err: any) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `草擬失敗（${String(err?.message ?? err).slice(0, 120)}），卡片都還在，可以再試一次`,
        });
      }
      const body = text.trim().replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/, "").trim();
      if ([...body].length < 80) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "草擬出來的內容是空的，卡片都還在，可以再試一次" });
      }
      const saved = await saveBookProposal({
        brandId: input.brandId, userId, text: `# ${brandName} 品牌定位書\n\n${body}`, mark: bookMark(cards),
      });
      return { proposal: { ...saved, stale: false } };
    }),
});
