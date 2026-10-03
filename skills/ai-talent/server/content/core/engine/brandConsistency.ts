/**
 * 品牌一致性檢查（2026-09-30 CJ「我希望要做一致性檢查，多幾秒沒關係」）。
 *
 * 文案寫完、禁用詞／替換對照（enforceBrandRules）跑完之後，再對照「品牌大腦」
 * 全文（跟寫手讀的是同一份 brandPrefix）檢查這篇是否符合品牌：語氣、品牌原型、
 * 目標受眾、禁用說法、WHY／價值、差異化，以及有沒有編出品牌大腦沒有的事實。
 *
 * 不一致 → 做最小幅度修正（保留事實、結構、長度、hashtag、連結、平台格式）。
 * 修正稿過不了守門（長度差太多、非 zh-TW 品牌卻變中文…）→ 保留原稿，標成 flagged。
 *
 * 跟 squadLeadQA 的差別：那個只拿得到品牌名／產業／描述，也會在失敗時回假的
 * 「通過 80 分」。這裡失敗一律回 skipped，不假裝檢查過。
 */
import { invokeLLM, invokeLLMSingleProvider } from "../../../platform/core/llm/llm";

export type BrandConsistencyStatus = "consistent" | "fixed" | "flagged" | "skipped";

export interface BrandConsistencyIssue {
  aspect: string;
  detail: string;
}

export interface BrandConsistencyResult {
  status: BrandConsistencyStatus;
  issues: BrandConsistencyIssue[];
  /** 要交出去的文案：fixed 時是修正稿，其餘都是原稿 */
  caption: string;
  /** skipped／flagged 的原因（給 metadata 與除錯用，不給用戶看） */
  reason?: string;
  /** fixed 時的原稿，存進 metadata 才看得出改了什麼 */
  before?: string;
}

const SYSTEM = `你是品牌一致性審核。你只判斷「這篇文案符不符合這個品牌」，不評文筆好壞。

逐項對照品牌大腦：
1. 語氣（tone）：說話方式是否符合
2. 品牌原型／人格：是否像這個品牌會說的話
3. 目標受眾：是不是在對對的人說話
4. 禁用說法：有沒有品牌明說不要的寫法、詞彙、承諾
5. WHY／價值／差異化：有沒有跟品牌立場矛盾
6. 事實：有沒有出現品牌大腦與用戶輸入都沒有的具體事實（數字、產品、服務、案例、承諾）

判斷原則：
- 只有「明確違反」才算不一致；風格偏好不同不算。
- 不一致時做「最小幅度修正」：只改有問題的句子。保留所有事實、段落結構、換行、
  長度（±10%）、hashtag、連結、emoji、平台格式標記。不得新增品牌大腦沒有的事實；
  編造的事實要刪掉或改成不具體的說法。
- 修正稿用原文的語言。

只輸出 JSON，不要前言：
{"consistent": true, "issues": [], "revised": ""}
或
{"consistent": false, "issues": [{"aspect": "語氣|原型|受眾|禁用|價值|事實", "detail": "40字內，指出哪一句、為什麼"}], "revised": "修正後全文"}`;

function textOf(r: any): string {
  const c = r?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
  return String(r?.content ?? r?.text ?? "");
}

function parseJson(raw: string): any {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1]! : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object");
  return JSON.parse(body.slice(start, end + 1));
}

const CJK = /[一-鿿]/g;

/** 修正稿守門：太短／太長、語言跑掉、hashtag 或連結被吃掉 → 不採用。 */
export function acceptRevision(original: string, revised: string, opts: { isZhTW: boolean }): string | null {
  const o = original.trim();
  const r = revised.trim();
  if (!r) return "empty revision";
  const ratio = r.length / Math.max(1, o.length);
  if (ratio < 0.6 || ratio > 1.4) return `length ratio ${ratio.toFixed(2)}`;
  const cjkShare = (s: string) => (s.match(CJK)?.length ?? 0) / Math.max(1, s.replace(/\s/g, "").length);
  if (opts.isZhTW && cjkShare(o) > 0.3 && cjkShare(r) < 0.3) return "language drifted away from zh-TW";
  if (!opts.isZhTW && cjkShare(o) < 0.1 && cjkShare(r) > 0.3) return "language drifted into CJK";
  const urls = (s: string) => new Set(s.match(/https?:\/\/\S+/g) ?? []);
  for (const u of urls(o)) if (!r.includes(u)) return `dropped link ${u}`;
  return null;
}

export async function checkBrandConsistency(args: {
  caption: string;
  brandPrefix: string;
  userMsg: string;
  taskLabel: string;
  isZhTW: boolean;
  timeoutMs: number;
  /** 指定後只用這一家、不做 provider 串接（IG 策略卡：依用戶授權只送去識別化內容給 Anthropic）。 */
  strictProvider?: "anthropic";
}): Promise<BrandConsistencyResult> {
  const original = args.caption;
  const skip = (reason: string): BrandConsistencyResult => ({ status: "skipped", issues: [], caption: original, reason });
  if (!original.trim()) return skip("empty caption");
  if (!args.brandPrefix.trim()) return skip("no brand brain");
  if (args.timeoutMs < 3000) return skip("no time budget left");

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), args.timeoutMs);
  try {
    const call = args.strictProvider
      ? (p: Parameters<typeof invokeLLM>[0]) => invokeLLMSingleProvider({ ...p, provider: args.strictProvider })
      : invokeLLM;
    const r = await call({
      signal: ac.signal,
      maxTokens: Math.min(4000, Math.ceil(original.length * 2) + 600),
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            `# 品牌大腦\n${args.brandPrefix}\n\n` +
            `# 任務\n${args.taskLabel}\n\n` +
            `# 用戶這次的輸入（這裡出現的事實可以用）\n${args.userMsg}\n\n` +
            `# 待檢查的文案\n${original}`,
        },
      ],
    });
    const parsed = parseJson(textOf(r));
    const issues: BrandConsistencyIssue[] = Array.isArray(parsed?.issues)
      ? parsed.issues
          .filter((i: any) => i && (i.aspect || i.detail))
          .slice(0, 6)
          .map((i: any) => ({ aspect: String(i.aspect ?? "").slice(0, 12), detail: String(i.detail ?? "").slice(0, 120) }))
      : [];
    if (parsed?.consistent === true || issues.length === 0) {
      return { status: "consistent", issues: [], caption: original };
    }
    const revised = typeof parsed?.revised === "string" ? parsed.revised : "";
    const rejected = acceptRevision(original, revised, { isZhTW: args.isZhTW });
    if (rejected) return { status: "flagged", issues, caption: original, reason: `revision rejected: ${rejected}` };
    return { status: "fixed", issues, caption: revised.trim(), before: original };
  } catch (e: any) {
    return skip(ac.signal.aborted ? `timeout ${args.timeoutMs}ms` : `llm error: ${String(e?.message ?? e).slice(0, 160)}`);
  } finally {
    clearTimeout(timer);
  }
}
