/**
 * draftSolutionCopy — 「AI 幫忙寫」產品描述。
 *
 * 2026-09-23 (CJ「用戶可新增產品，並加入描述（增加 AI 幫忙寫的功能）」)。
 *
 * ── 這支刻意只做改寫，不做研究 ───────────────────────────────────────
 * 它拿使用者自己打的粗稿，整理成兩段通順的中英描述。**不會自己去查這個產品、
 * 不會補使用者沒講的功能、不會加數字**。
 *
 * 理由跟整套系統的紀律一致：產品描述會被注入每一篇貼文的寫作指令，業務照著
 * 講出去。模型在這裡多補一句「支援 SOC 2」或「已服務 500 家客戶」，就是憑空
 * 生出一個公司要負責的宣稱。客戶白名單、市場數據、價格三個地方都已經是白名單
 * 制，產品描述沒有理由是例外。
 *
 * 所以 prompt 的第一條規則是「只能用下面這段文字裡有的資訊」，而且回傳值會
 * 附一個 `notice` 給 UI 顯示——讓按下按鈕的人知道這是改寫不是查證。
 */
import { invokeLLM } from "../../../platform/core/llm";

export interface DraftedCopy {
  summaryZh: string;
  summaryEn: string;
  model: string;
  /** UI 要顯示的那句話：這是改寫，不是查證。 */
  notice: { en: string; zh: string };
}

const NOTICE = {
  en: "Rewritten from what you typed — nothing was looked up or added. Check it before you save.",
  zh: "只根據你輸入的內容改寫，沒有去查也沒有補任何東西。存檔前請自己看過。",
};

export async function draftSolutionCopy(args: {
  name: string;
  vendor: string;
  notes: string;
}): Promise<DraftedCopy> {
  const notes = args.notes.trim();
  if (notes.length < 15) {
    throw new Error("Give me a bit more to work with — a sentence or two about what it does.");
  }

  const prompt = `以下是同事對一個 B2B 軟體方案的粗略描述。請把它整理成可以放在方案目錄上的簡介。

方案名稱：${args.name || "（未提供）"}
供應商：${args.vendor || "（未提供）"}

粗稿：
"""
${notes.slice(0, 2000)}
"""

輸出 JSON：{ "summaryZh": "...", "summaryEn": "..." }

規則（第一條最重要）：
1. **只能使用上面粗稿裡有的資訊。** 不要查、不要補、不要推測。粗稿沒提到的功能、
   認證、客戶數、年份、百分比，一律不准出現。你不知道這個產品，你只是在整理這段文字。
2. 兩段各 60-120 字（中文）／40-80 words（英文），是同一件事的兩種語言，不是翻譯腔。
3. 從「它替誰解決什麼問題」開始，再講它怎麼做到。不要用「業界領先」「最佳」
   「唯一」這類沒有依據的形容。
4. 不要寫價格，不要寫任何數字，除非粗稿裡就有。
5. 只輸出 JSON，不要說明文字。`;

  const res = await invokeLLM({
    provider: "anthropic",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 900,
  });

  const text = String(res.choices?.[0]?.message?.content ?? "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The writer didn't return anything usable — try again.");
  const parsed = JSON.parse(text.slice(start, end + 1)) as { summaryZh?: string; summaryEn?: string };

  const summaryZh = String(parsed.summaryZh ?? "").trim();
  const summaryEn = String(parsed.summaryEn ?? "").trim();
  if (!summaryZh || !summaryEn) throw new Error("The writer came back with only one language — try again.");

  return { summaryZh, summaryEn, model: String(res.model ?? "unknown"), notice: NOTICE };
}
