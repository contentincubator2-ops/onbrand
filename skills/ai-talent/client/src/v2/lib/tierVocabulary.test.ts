/**
 * tierVocabulary 的單元測試 + 全 client 掃描守衛。
 *
 * 守衛存在的理由：這條規則（用戶端不講秒數、顯示名只有一個定義處）在 2026-07-17
 * 就定了，只寫在 PlatformTaskPage.tsx 的一行註解裡，結果同一個檔案自己就漂出
 * 三種寫法。規則沒有執行點就等於沒有規則，所以改由測試來擋。
 *
 * 前例：viralSourceGuard.parity.test.ts（鏡像防漂移）、inferMockup 與 RunPage
 * 兩份沒同步的關鍵字比對表。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TIER_VOCAB,
  TIER_ORDER,
  normalizeTier,
  tierLabel,
  tierAccent,
} from "./tierVocabulary";

// ── 單元 ────────────────────────────────────────────────────────────────────

describe("tierVocabulary", () => {
  it("每個 tier 都有中英短長版與識別色", () => {
    for (const code of TIER_ORDER) {
      const e = TIER_VOCAB[code];
      expect(e.zh).toBeTruthy();
      expect(e.zhLong).toBeTruthy();
      expect(e.en).toBeTruthy();
      expect(e.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("顯示名彼此不重複（不然分頁會出現兩個一樣的字）", () => {
    const zh = TIER_ORDER.map((c) => TIER_VOCAB[c].zh);
    const zhLong = TIER_ORDER.map((c) => TIER_VOCAB[c].zhLong);
    const en = TIER_ORDER.map((c) => TIER_VOCAB[c].en);
    expect(new Set(zh).size).toBe(zh.length);
    expect(new Set(zhLong).size).toBe(zhLong.length);
    expect(new Set(en).size).toBe(en.length);
  });

  it("沒有任何顯示名帶秒數", () => {
    for (const code of TIER_ORDER) {
      const e = TIER_VOCAB[code];
      for (const label of [e.zh, e.zhLong, e.en]) {
        expect(label).not.toMatch(/\d+\s*s\b/i);
      }
    }
  });

  it("tierLabel 給出短版 / 長版 / 英文", () => {
    expect(tierLabel("30s", "zh")).toBe("單篇");
    expect(tierLabel("60s", "zh")).toBe("套組");
    expect(tierLabel("99s", "zh")).toBe("企劃");
    expect(tierLabel("30s", "zh", { long: true })).toBe("單篇內容");
    expect(tierLabel("60s", "zh", { long: true })).toBe("內容套組");
    expect(tierLabel("99s", "zh", { long: true })).toBe("完整企劃");
    expect(tierLabel("99s", "en")).toBe("Campaign");
    // 英文長短同字 —— 現行 UI 就是這樣，別讓 long 悄悄換掉文案
    expect(tierLabel("30s", "en", { long: true })).toBe(tierLabel("30s", "en"));
  });

  it("退役 tier 值收斂到現行 code，而不是掉進 fallback", () => {
    // 收斂前這兩個值會被各處的 if/else 一路掉到「單篇」—— 企劃級產出顯示成單篇
    expect(normalizeTier("100s")).toBe("99s");
    expect(normalizeTier("90s")).toBe("99s");
    expect(tierLabel("100s", "zh")).toBe("企劃");
    expect(tierLabel("90s", "en")).toBe("Campaign");
  });

  it("認不得的值 fallback 成 30s（沿用收斂前行為）", () => {
    expect(normalizeTier(null)).toBe("30s");
    expect(normalizeTier(undefined)).toBe("30s");
    expect(normalizeTier("")).toBe("30s");
    expect(normalizeTier("nonsense")).toBe("30s");
    expect(tierLabel(undefined, "zh")).toBe("單篇");
  });

  it("tierAccent 跟著 tier 走，退役值也對得上", () => {
    expect(tierAccent("60s")).toBe(TIER_VOCAB["60s"].accent);
    expect(tierAccent("100s")).toBe(TIER_VOCAB["99s"].accent);
  });
});

// ── 全 client 掃描守衛 ──────────────────────────────────────────────────────

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_SRC = path.resolve(HERE, "../..");

/**
 * 定義處與它的測試本來就要寫出顯示名、也要在測試名稱裡寫出秒數（例如
 * 「認不得的值 fallback 成 30s」），兩條規則都跳過這兩個檔案。
 */
const VOCAB_FILES = new Set(["tierVocabulary.ts", "tierVocabulary.test.ts"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "dist") out.push(...sourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * 取出所有字串字面值，略過註解 —— 註解不是用戶可見文案，而且有些註解本來就
 * 在講歷史路由（/30s、/60s），不該逼人改寫正確的歷史紀錄。
 *
 * 手寫掃描而非 regex：regex 分不清註解裡的引號。三件事一定要處理對，否則掃描器
 * 會失去同步，之後整份檔案的判讀都是垃圾（會誤報，也會漏報真正的違規）：
 *   · 註解
 *   · regex 字面值 —— proposal.tsx:122 的 /[`#]/g 裡有一個反引號，第一版掃描器
 *     把它當成 template 開頭，一路吃到 40 行後的下一個反引號
 *   · template 的 ${...} 內層 —— 裡面可以再放字串甚至再一層 template
 */
function stringLiterals(src: string): Array<{ value: string; line: number }> {
  const out: Array<{ value: string; line: number }> = [];
  let i = 0;
  let line = 1;

  /** 前一個有意義的字元決定 `/` 是除號還是 regex 開頭（標準啟發式）。 */
  function regexCanStartHere(): boolean {
    let k = i - 1;
    while (k >= 0 && /\s/.test(src[k]!)) k--;
    if (k < 0) return true;
    const prev = src[k]!;
    if ("([{,;:=!&|?+-*%<>~^".includes(prev)) return true;
    // return / typeof / case … 後面接的是 regex，不是除法
    const word = src.slice(Math.max(0, k - 9), k + 1).match(/[A-Za-z]+$/)?.[0];
    return word ? ["return", "typeof", "case", "in", "of", "do", "else", "yield"].includes(word) : false;
  }

  function readQuoted(quote: '"' | "'"): void {
    const startLine = line;
    let buf = "";
    i++;
    while (i < src.length) {
      const c = src[i]!;
      if (c === "\\") { buf += src[i + 1] ?? ""; i += 2; continue; }
      if (c === quote) { i++; break; }
      if (c === "\n") { line++; i++; break; }  // 一般字串不跨行 —— 收手，別擴散誤判
      buf += c; i++;
    }
    out.push({ value: buf, line: startLine });
  }

  function readTemplate(): void {
    const startLine = line;
    let buf = "";
    i++;
    while (i < src.length) {
      const c = src[i]!;
      if (c === "\\") { if (src[i + 1] === "\n") line++; buf += src[i + 1] ?? ""; i += 2; continue; }
      if (c === "`") { i++; break; }
      if (c === "$" && src[i + 1] === "{") { i += 2; scanCode(true); continue; }
      if (c === "\n") line++;
      buf += c; i++;
    }
    out.push({ value: buf, line: startLine });
  }

  function readRegex(): void {
    i++;
    let inClass = false;
    while (i < src.length) {
      const c = src[i]!;
      if (c === "\\") { i += 2; continue; }
      if (c === "\n") { line++; i++; break; }  // regex 不跨行 —— 判斷錯了，收手
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      else if (c === "/" && !inClass) { i++; break; }
      i++;
    }
    while (i < src.length && /[a-z]/.test(src[i]!)) i++;  // flags
  }

  /** insideSubstitution=true 時，遇到未配對的 `}` 就回到外層 template。 */
  function scanCode(insideSubstitution: boolean): void {
    let depth = 0;
    while (i < src.length) {
      const c = src[i]!;
      if (c === "\n") { line++; i++; continue; }
      if (c === "/" && src[i + 1] === "/") {
        while (i < src.length && src[i] !== "\n") i++;
        continue;
      }
      if (c === "/" && src[i + 1] === "*") {
        i += 2;
        while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
          if (src[i] === "\n") line++;
          i++;
        }
        i += 2;
        continue;
      }
      if (c === "/" && regexCanStartHere()) { readRegex(); continue; }
      if (c === '"' || c === "'") { readQuoted(c); continue; }
      if (c === "`") { readTemplate(); continue; }
      if (insideSubstitution) {
        if (c === "{") depth++;
        else if (c === "}") {
          if (depth === 0) { i++; return; }
          depth--;
        }
      }
      i++;
    }
  }

  scanCode(false);
  return out;
}

const CJK = /[㐀-䶿一-鿿぀-ヿ가-힯]/;
const DURATION_TOKEN = /(?<![0-9A-Za-z])(30|60|90|99|100)s(?![0-9A-Za-z])/;
const EXACT_TIER_NAME = /^(單篇|套組|企劃|單篇內容|內容套組|完整企劃)$/;

describe("tier 詞彙守衛（掃描 client/src）", () => {
  const files = sourceFiles(CLIENT_SRC);

  it("掃得到檔案（路徑算錯的話這裡先紅，而不是假裝通過）", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("① 用戶可見的中文文案不出現秒數", () => {
    const bad: string[] = [];
    for (const file of files) {
      if (VOCAB_FILES.has(path.basename(file))) continue;
      for (const s of stringLiterals(fs.readFileSync(file, "utf8"))) {
        if (CJK.test(s.value) && DURATION_TOKEN.test(s.value)) {
          bad.push(`${path.relative(CLIENT_SRC, file)}:${s.line}  ${s.value.slice(0, 80)}`);
        }
      }
    }
    expect(
      bad,
      "中文文案裡出現 30s/60s/90s/99s/100s。\n" +
        "  · 如果指的是任務規格 → 改呼叫 tierLabel()\n" +
        "  · 如果真的在講時間 → 寫「秒」（例：約 15–30 秒）\n" +
        bad.join("\n"),
    ).toEqual([]);
  });

  it("② tier 顯示名只在 tierVocabulary.ts 定義", () => {
    const bad: string[] = [];
    for (const file of files) {
      if (VOCAB_FILES.has(path.basename(file))) continue;
      for (const s of stringLiterals(fs.readFileSync(file, "utf8"))) {
        if (EXACT_TIER_NAME.test(s.value.trim())) {
          bad.push(`${path.relative(CLIENT_SRC, file)}:${s.line}  "${s.value}"`);
        }
      }
    }
    expect(
      bad,
      "硬寫了 tier 顯示名。改用 tierLabel(tier, lang) / tierLabel(tier, lang, { long: true })：\n" +
        bad.join("\n"),
    ).toEqual([]);
  });
});
