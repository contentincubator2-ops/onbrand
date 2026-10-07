/**
 * approvalDiff — 客戶核准頁上「改了哪裡」的顯示。
 *
 * 先去掉頭尾相同的部分（貼文的修改幾乎都集中在一小段），中間那一段再逐字比對，
 * 所以一次改了兩個地方，會標成兩處，而不是把中間整段都算成改動。
 * 前後各留一點上下文，讀的人才知道是哪一句。
 */
export interface DiffSeg { t: "same" | "del" | "ins"; s: string }

export interface CaptionDiff {
  /** 修改處之前的上下文（已截短）。 */
  lead: string;
  /** 中間那一段，依序是沒變／刪掉／加上的片段。 */
  segs: DiffSeg[];
  /** 修改處之後的上下文（已截短）。 */
  tail: string;
  leadCut: boolean;
  tailCut: boolean;
  /** 所有刪掉的字／加上的字，接在一起。 */
  removed: string;
  added: string;
}

const norm = (s: string) => s.replace(/\r\n?/g, "\n");
/** 中間段落超過這個大小就不逐字比對（整段當成一處），避免很長的貼文把瀏覽器卡住。 */
const LCS_BUDGET = 400_000;
/** 兩處改動之間，相同的字少於這個數就併成一處——中文常有零星的字剛好一樣，標出來只是碎屑。 */
const MIN_SAME = 2;

function lcsSegs(a: string[], b: string[]): DiffSeg[] {
  const n = a.length, m = b.length;
  if (n === 0 || m === 0 || n * m > LCS_BUDGET) {
    return [...(n ? [{ t: "del" as const, s: a.join("") }] : []), ...(m ? [{ t: "ins" as const, s: b.join("") }] : [])];
  }
  const w = m + 1;
  const dp = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const raw: DiffSeg[] = [];
  const push = (t: DiffSeg["t"], ch: string) => {
    const last = raw[raw.length - 1];
    if (last && last.t === t) last.s += ch; else raw.push({ t, s: ch });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("same", a[i]); i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { push("del", a[i]); i++; }
    else { push("ins", b[j]); j++; }
  }
  while (i < n) push("del", a[i++]);
  while (j < m) push("ins", b[j++]);
  return raw;
}

/** 把夾在改動之間的零星相同字併進改動，並把每一處整理成「先刪後加」。 */
function tidy(raw: DiffSeg[]): DiffSeg[] {
  const out: DiffSeg[] = [];
  let del = "", ins = "";
  const flush = () => {
    if (del) out.push({ t: "del", s: del });
    if (ins) out.push({ t: "ins", s: ins });
    del = ""; ins = "";
  };
  raw.forEach((seg, k) => {
    if (seg.t === "del") del += seg.s;
    else if (seg.t === "ins") ins += seg.s;
    else {
      const sandwiched = (del || ins) && k < raw.length - 1;
      if (sandwiched && Array.from(seg.s).length < MIN_SAME) { del += seg.s; ins += seg.s; }
      else { flush(); out.push(seg); }
    }
  });
  flush();
  return out;
}

export function captionDiff(beforeRaw: string, afterRaw: string, context = 24): CaptionDiff {
  // 以字元（code point）為單位，不然 emoji 會被切成兩半。
  const a = Array.from(norm(beforeRaw));
  const b = Array.from(norm(afterRaw));
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const segs = tidy(lcsSegs(a.slice(p, a.length - s), b.slice(p, b.length - s)));
  return {
    lead: a.slice(Math.max(0, p - context), p).join(""),
    segs,
    tail: a.slice(a.length - s, Math.min(a.length, a.length - s + context)).join(""),
    leadCut: p > context,
    tailCut: s > context,
    removed: segs.filter((x) => x.t === "del").map((x) => x.s).join(""),
    added: segs.filter((x) => x.t === "ins").map((x) => x.s).join(""),
  };
}
