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

/**
 * 交付前檢查（2026-10-04）。帶了 taskSpec 才用這一份——除了品牌一致性，還查「是不是任務卡要的
 * 交付物」與「能不能直接發布」。
 *
 * 為什麼加：用 Microsoft Foundry 評分表評了目錄裡 289 張卡（品牌 2972），平均 0.58、通過率 29%。
 * 失分最多的三項依序是：沒照任務卡要的形式產出（251 張裡 103 張，「品牌命名 10 個」「用戶歷程
 * 地圖」被寫成一篇貼文）、不能直接發布（80 張：句子截斷、留著 [X]、像提案稿）、編造事實（65 張：
 * 「限量 500 包」「七天內全退」）。原本那份檢查有跑（289 次只跳過 3 次），但「只有明確違反才算」
 * 加上「最小幅度修正、長度 ±10%」，形式錯的稿子它既不算違反、也沒有權限改。
 *
 * 所以這一份把三件事分開講：語氣類照舊從寬、最小幅度修；事實類從嚴；形式與未完成允許改寫。
 */
const SYSTEM_DELIVERY = `你是交付前的最後一關審稿。稿子過了你這關就直接交到使用者手上、照著發出去。
你要查三件事，依序是：

【一】是不是任務卡要的交付物（最重要）
對照「# 任務卡要求」：形式、數量、結構、欄位、長度都要對。任務卡要的是「10 個命名」，交出來就要是
10 個命名的清單，不是一篇介紹產品的貼文；要的是歷程地圖、對照表、腳本、信件、標題組，就要是那個
形式。形式不對、數量不對、缺了任務卡點名的段落 → 不通過，把稿子**改寫成正確的形式**（這一項
可以大幅改寫，用同一批素材重組）。

【二】事實有沒有依據（從嚴）
跟品牌、產品、活動有關的具體事實，只能來自「# 品牌大腦」或「# 用戶這次的輸入」。下列東西只要兩邊
都找不到，一律算不通過：
- 數字：價格、折扣、限量幾包、幾人份、重量、銷量、回購率、名次、幾天內退款
- 日期與時間：開賣日、截止日、幾點開始
- 產地、成分、製程、認證、得獎
- 承諾：保證、全額退、免運、贈品
- 引述：媒體報導、專家說、客人說（品牌大腦沒有的顧客故事也算）
- 網址、帳號、優惠碼
處理方式：刪掉，或改成不含具體事實的說法（「限量 500 包」→「數量有限」；查不到截止日就不寫日期）。
**不要**用別的數字頂替，也不要留空格讓使用者填。
寫作手法上的數字不算（「三個步驟」「第一次」「五秒」這類不是在宣稱品牌事實的說法）。

【三】能不能直接發布
- 沒寫完：句子斷在一半、清單只有標題、問答只有問題沒有答案、結尾是「…」或「下方有個小請求」
- 佔位符：[X]、［日期］、（日期）、XX、「請填入」、空的括號或引號
- 不是成品的口吻：「以下是為您撰寫的…」「方案一／方案二」的提案稿、給同事看的備註、A/B 測試註記、
  向使用者要資料（「我需要你提供」）
- 簡體字、亂碼、重複段落、裸露的 JSON 或 markdown 記號
有任何一項 → 不通過，補完或刪掉。資料不夠補完時，用品牌大腦裡有的內容寫成完整的句子，不要留空。

【另外】語氣、品牌原型、受眾、禁用說法、品牌價值：只有「明確違反」才算，風格偏好不同不算；
要改也只改有問題的句子。

改稿規則：
- 保留原稿裡有依據的事實、hashtag、連結、emoji 與平台格式標記；不得新增品牌大腦沒有的事實。
- 用原稿的語言。長度照任務卡要求；任務卡沒講就盡量接近原稿。
- revised 是**可以直接發布的全文**，不是修改建議，也不要在裡面解釋改了什麼。

只輸出 JSON，不要前言：
{"consistent": true, "issues": [], "revised": ""}
或
{"consistent": false, "issues": [{"aspect": "形式|事實|未完成|語氣|原型|受眾|禁用|價值", "detail": "40字內，指出哪一句、為什麼"}], "revised": "修正後全文"}`;

/** 機器先找一遍「一看就不是成品」的痕跡，交給審稿當線索（它自己有時會放過）。 */
export function publishDefects(caption: string): string[] {
  const out: string[] = [];
  const t = caption.trim();
  if (/\[\s*(?:X|Y|Z|N|XX+|日期|時間|連結|網址|品牌|產品|價格|數字|請填[^\]]{0,10})\s*\]|［[^］]{0,8}］/i.test(t)) out.push("有方括號佔位符");
  if (/[（(]\s*(?:日期|時間|金額|價格|連結|待補|待填|TBD)\s*[）)]/i.test(t)) out.push("有括號佔位符");
  if (/請填入|待補充|\bTBD\b|\bXXX+\b|○○|＿{2,}|_{3,}/.test(t)) out.push("有待填的空格");
  if (/[「『（(]\s*[」』）)]/.test(t)) out.push("有空的括號或引號");
  if (/^(?:以下是|這是為您|這是為你|好的[，,]|當然[，,！!])/.test(t)) out.push("開頭是 AI 口吻的前言");
  if (/我需要你提供|請(?:先)?提供(?:以下)?(?:資訊|資料)|請補充/.test(t)) out.push("在向使用者要資料，不是成品");
  if (t === "{" || t === "[" || /^\s*[{\[]\s*"?(?:caption|label|hashtags)"?\s*:/m.test(t)) out.push("裸露的 JSON");
  // 結尾斷在一半：停在逗號／冒號／頓號，或停在一個不可能是句尾的虛詞上（評測裡的「…而是他們以」）。
  // 行動呼籲常常不加句號（「👉 點連結帶回家」），所以「最後一個字是中文」本身不算。
  if (t.length >= 20 && /(?:[，,、：:]|[以和與及而但是在把被讓跟對為從將並且或的])$/.test(t)) out.push("結尾像是斷在一半");
  if (/…\s*$/.test(t) && t.length < 80) out.push("很短而且以刪節號結尾");
  return out;
}

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
  const json = body.slice(start, end + 1);
  try {
    return JSON.parse(json);
  } catch {
    // 2026-10-04：模型常把 revised 的換行原樣寫進字串（289 次檢查裡 3 次因為
    // 「Bad control character in string literal」整個被跳過）。只跳脫字串「裡面」的控制字元。
    return JSON.parse(escapeControlCharsInStrings(json));
  }
}

/** 把 JSON 字串值裡的裸換行／tab 換成跳脫序列；字串外面的不動。 */
export function escapeControlCharsInStrings(json: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (const ch of json) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === "\\") { out += ch; esc = true; continue; }
      if (ch === '"') { out += ch; inStr = false; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      if (ch < " ") continue;
      out += ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}

const CJK = /[一-鿿]/g;

/** 修正稿守門：太短／太長、語言跑掉、hashtag 或連結被吃掉 → 不採用。 */
export function acceptRevision(
  original: string, revised: string,
  opts: { isZhTW: boolean; /** 形式錯／沒寫完的稿子要改寫，長度本來就會差很多。 */ allowRestructure?: boolean },
): string | null {
  const o = original.trim();
  const r = revised.trim();
  if (!r) return "empty revision";
  const ratio = r.length / Math.max(1, o.length);
  const [lo, hi] = opts.allowRestructure ? [0.3, 12] : [0.6, 1.4];
  if (ratio < lo || ratio > hi) return `length ratio ${ratio.toFixed(2)}`;
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
  /**
   * 這張任務卡要的交付物（卡名、說明、寫法要求、長度）。帶了就改用交付前檢查（SYSTEM_DELIVERY）：
   * 多查「形式對不對」「能不能直接發」，事實從嚴。沒帶＝原本的品牌一致性檢查，行為不變。
   */
  taskSpec?: string;
}): Promise<BrandConsistencyResult> {
  const original = args.caption;
  const skip = (reason: string): BrandConsistencyResult => ({ status: "skipped", issues: [], caption: original, reason });
  if (!original.trim()) return skip("empty caption");
  if (!args.brandPrefix.trim()) return skip("no brand brain");
  if (args.timeoutMs < 3000) return skip("no time budget left");

  const delivery = !!args.taskSpec?.trim();
  const defects = delivery ? publishDefects(original) : [];

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), args.timeoutMs);
  try {
    const call = args.strictProvider
      ? (p: Parameters<typeof invokeLLM>[0]) => invokeLLMSingleProvider({ ...p, provider: args.strictProvider })
      : invokeLLM;
    const r = await call({
      signal: ac.signal,
      // 交付前檢查可能要把稿子改寫成另一種形式，給的空間要夠（原本以「跟原稿差不多長」估）。
      maxTokens: delivery
        ? Math.min(6000, Math.max(1500, Math.ceil(original.length * 2.5) + 800))
        : Math.min(4000, Math.ceil(original.length * 2) + 600),
      messages: [
        { role: "system", content: delivery ? SYSTEM_DELIVERY : SYSTEM },
        {
          role: "user",
          content:
            `# 品牌大腦\n${args.brandPrefix}\n\n` +
            (delivery ? `# 任務卡要求\n${args.taskSpec}\n\n` : `# 任務\n${args.taskLabel}\n\n`) +
            `# 用戶這次的輸入（這裡出現的事實可以用）\n${args.userMsg}\n\n` +
            (defects.length ? `# 機器檢查先發現的問題（請確認並處理）\n${defects.map((d) => `- ${d}`).join("\n")}\n\n` : "") +
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
    // 形式錯或沒寫完的稿子是「改寫」不是「微調」，長度守門要放寬，不然修好的稿子反而被退回。
    const restructure = delivery && issues.some((i) => /形式|未完成/.test(i.aspect));
    const rejected = acceptRevision(original, revised, { isZhTW: args.isZhTW, allowRestructure: restructure });
    if (rejected) return { status: "flagged", issues, caption: original, reason: `revision rejected: ${rejected}` };
    return { status: "fixed", issues, caption: revised.trim(), before: original };
  } catch (e: any) {
    return skip(ac.signal.aborted ? `timeout ${args.timeoutMs}ms` : `llm error: ${String(e?.message ?? e).slice(0, 160)}`);
  } finally {
    clearTimeout(timer);
  }
}
