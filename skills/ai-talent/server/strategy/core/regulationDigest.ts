/**
 * regulationDigest — 從法規原文萃取「行銷審查重點」（背景工作，進度寫回資料表）。
 *
 * 2026-09-30（CJ「用戶上傳相關資料後，跳出視窗提醒目前多少字、佔品牌容量多少，要萃取嗎？要的話，
 * 該任務卡片就有進度顯示，萃取好以後請用戶回來確認（法規 mission tray 會跳出通知）」）。
 *
 * 流程：
 *   1. 讀取：原文依條文邊界切段（每段 ≤ CHUNK_CHARS，優先在「第 X 條」前切）
 *   2. 萃取：每段各問一次「這段有哪些跟行銷有關的規範」（3 段並行），進度＝做完幾段
 *   3. 整理：合併、去重、依重要性排序，壓到 REG_DIGEST_MAX 字以內（最多重試兩次，
 *      仍超過就在行尾截斷——截斷的清單照樣要用戶確認，用戶看得到、改得到）
 *   4. 結果放 draftDigest、jobStatus=review——**不直接生效**，要用戶確認
 *
 * 萃取期間用戶改了原文：結束時原文跟開始時不一樣就丟掉這次結果（jobStatus 回 idle），
 * 不把舊原文的重點塞給新原文。
 */
import { invokeLLM } from "../../platform/core/llm";
import localPool from "../../localDb";
import { REG_DIGEST_MAX, charLen, getRegulation, setJob } from "./brandRegulations";

/** 一段送去萃取的原文最多幾字。 */
export const CHUNK_CHARS = 6_000;
const CONCURRENCY = 3;
const CALL_TIMEOUT_MS = 90_000;

/**
 * 依條文邊界切段：先按行切，行首是「第 X 條」時是好的切點；單行超長（沒有換行的貼上）
 * 就硬切。空白行不算字數以外的東西，保留原樣。
 */
export function splitRegulation(text: string, max = CHUNK_CHARS): string[] {
  const src = text.replace(/\r\n?/g, "\n").trim();
  if (!src) return [];
  if (charLen(src) <= max) return [src];
  const lines = src.split("\n");
  const pieces: string[] = [];
  for (const line of lines) {
    const cs = [...line];
    if (cs.length <= max) { pieces.push(line); continue; }
    for (let i = 0; i < cs.length; i += max) pieces.push(cs.slice(i, i + max).join(""));
  }
  const isArticle = (l: string) => /^\s*第\s*[0-9０-９一二三四五六七八九十百千零〇]+\s*條/.test(l);
  const chunks: string[] = [];
  let cur: string[] = [];
  let curLen = 0;
  const flush = () => { if (cur.join("\n").trim()) chunks.push(cur.join("\n").trim()); cur = []; curLen = 0; };
  for (const p of pieces) {
    const n = charLen(p) + 1;
    // 快滿了遇到新條文就先切，不要把一條拆成兩半；真的塞不下才在任意行切。
    if (curLen > 0 && (curLen + n > max || (isArticle(p) && curLen > max * 0.7))) flush();
    cur.push(p);
    curLen += n;
  }
  flush();
  return chunks;
}

const textOf = (r: any): string => {
  const c = r?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
  return String(r?.content ?? r?.text ?? "");
};

async function ask(system: string, user: string, maxTokens: number): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), CALL_TIMEOUT_MS);
  try {
    const r = await invokeLLM({ signal: ac.signal, maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] });
    return textOf(r).trim();
  } finally {
    clearTimeout(t);
  }
}

const EXTRACT_SYSTEM = `你是廣告法規分析師。你會拿到一部法規的其中一段原文。
只萃取跟「行銷文案、廣告、社群貼文、商品標示」有關、寫文案時可以對照檢查的規範：
1. 不得宣稱或暗示的內容（療效、功效、保證、誇大、比較、未經核准的宣稱……）
2. 必須標示或揭露的事項
3. 限制使用的字詞或表達方式
4. 對象、通路、時段等限制
規則：每點一行、以「- 」開頭；保留條號（例：第28條）；寫成具體可檢查的句子；
不要抄罰則金額、主管機關、申請程序等跟寫文案無關的條文。這一段沒有相關規範就只回「無」。`;

const MERGE_SYSTEM = (max: number) => `你是廣告法規審查清單的編輯。把下列從同一部法規各段萃取出的行銷相關規範，
整理成一份給文案審查用的清單：
- 合併重複與相近的規定；保留條號
- 最常被文案違反、後果最嚴重的排前面
- 每點一行、以「- 」開頭，寫成具體可檢查的句子
- 總長（含標點與換行）不得超過 ${max} 字——寧可刪掉次要的，也不要超過
只輸出清單本身，不要前言。`;

/** 模型回的清單清乾淨：只留「- 」開頭的行（沒有就整段），「無」視為空。 */
export function cleanBullets(raw: string): string {
  const t = raw.replace(/```[a-z]*\n?|```/g, "").trim();
  if (!t || /^無[。.]?$/.test(t)) return "";
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-•・*]\s*/.test(l)).map((l) => `- ${l.replace(/^[-•・*]\s*/, "")}`);
  return (bullets.length ? bullets : lines).join("\n");
}

/** 超過上限時在行尾截斷（不切半句）。 */
export function clipAtLine(text: string, max: number): string {
  if (charLen(text) <= max) return text;
  const out: string[] = [];
  let n = 0;
  for (const line of text.split("\n")) {
    const add = charLen(line) + (out.length ? 1 : 0);
    if (n + add > max) break;
    out.push(line);
    n += add;
  }
  return out.length ? out.join("\n") : [...text].slice(0, max).join("");
}

const running = new Set<number>();

/** 跑一條法規的萃取。已經在跑就不重複跑。錯誤一律寫進 jobStatus=failed，不往外丟。 */
export async function runRegulationExtraction(id: number): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  try {
    const reg = await getRegulation(id);
    if (!reg) return;
    const bodyAtStart = reg.body;
    await setJob(id, "extracting", { stage: "reading", done: 0, total: 0 });
    const chunks = splitRegulation(bodyAtStart);
    if (!chunks.length) { await setJob(id, "failed", null, "原文是空的"); return; }

    const found: string[] = new Array(chunks.length).fill("");
    let done = 0;
    await setJob(id, "extracting", { stage: "extracting", done, total: chunks.length });
    let next = 0;
    const worker = async () => {
      while (next < chunks.length) {
        const i = next++;
        found[i] = cleanBullets(await ask(EXTRACT_SYSTEM, `# 法規：${reg.title}\n\n# 原文（第 ${i + 1}／${chunks.length} 段）\n${chunks[i]}`, 1500));
        done++;
        await setJob(id, "extracting", { stage: "extracting", done, total: chunks.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));

    const merged = found.filter(Boolean).join("\n");
    let digest = "";
    if (!merged) {
      digest = "";
    } else if (charLen(merged) <= REG_DIGEST_MAX && chunks.length === 1) {
      digest = merged;
    } else {
      await setJob(id, "extracting", { stage: "merging", done, total: chunks.length });
      let input = merged;
      for (let attempt = 0; attempt < 3; attempt++) {
        digest = cleanBullets(await ask(MERGE_SYSTEM(REG_DIGEST_MAX), `# 法規：${reg.title}\n\n# 各段萃取結果\n${input}`, 1500));
        if (charLen(digest) <= REG_DIGEST_MAX) break;
        input = digest;   // 還是太長：拿這一版再壓一次
      }
      digest = clipAtLine(digest, REG_DIGEST_MAX);
    }

    // 萃取期間原文被改了：這份重點對不上新原文，丟掉。
    const now = await getRegulation(id);
    if (!now) return;
    if (now.body !== bodyAtStart) { await setJob(id, "idle", null); return; }

    await localPool.execute(`UPDATE brand_regulations SET draftDigest = ? WHERE id = ?`, [digest, id]);
    if (!digest) {
      await setJob(id, "failed", null, "這份原文裡找不到跟行銷文案有關的規範");
      return;
    }
    await setJob(id, "review", { stage: "done", done: chunks.length, total: chunks.length });
  } catch (e: any) {
    await setJob(id, "failed", null, String(e?.message ?? e)).catch(() => {});
  } finally {
    running.delete(id);
  }
}

/** 背景開跑（不等）。 */
export function startRegulationExtraction(id: number): void {
  void runRegulationExtraction(id);
}

/** 伺服器重啟後，把還停在「萃取中」的接著跑（包含第一版遷移過來、排隊等萃取的卡）。 */
export async function resumeRegulationExtractions(): Promise<number> {
  try {
    const [rows]: any = await localPool.execute(`SELECT id FROM brand_regulations WHERE jobStatus = 'extracting'`);
    const ids = (rows as any[]).map((r) => Number(r.id));
    for (const id of ids) startRegulationExtraction(id);
    return ids.length;
  } catch {
    return 0;
  }
}
