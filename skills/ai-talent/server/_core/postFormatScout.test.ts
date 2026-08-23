/**
 * postFormatScout 的確定性部分測試。
 *
 * 掃描本身要打網路，不在這裡測；這裡守住的是「模型回了垃圾時會發生什麼」——
 * 那才是這條流程真正的風險。編造的 URL、把題材標成形式、編一個不存在的
 * task id 說「這個我們已經有了」，每一種都會讓佇列失去可信度。
 */
import { describe, it, expect } from "vitest";
import {
  buildFbCatalog,
  buildScanPrompt,
  parseScanResult,
  candidateKey,
  type ScanMarket,
} from "./postFormatScout";
import { mergeEvidence } from "./postFormatStore";

const MARKET: ScanMarket = { country: "TW", language: "zh-TW", brandCount: 12 };

const CATALOG = buildFbCatalog();
const REAL_ID = CATALOG[0]!.id;

function wrap(items: unknown): string {
  return JSON.stringify({ items });
}

const GOOD = {
  kind: "format",
  name: "步驟式教學貼文",
  nameEn: "Step-by-step how-to post",
  mechanism: "把一件事拆成 3-7 個編號步驟，每步一句話，最後給結果照片。",
  whyItWorks: "資訊價值自帶轉發動機，不依賴既有粉絲。",
  duplicateOf: null,
  evidence: [{ title: "某某整理文", url: "https://example.com/a", observedAt: "2026-08-01" }],
};

describe("buildFbCatalog", () => {
  it("涵蓋 30s / 60s / 99s 三層且沒有重複 id", () => {
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((i) => i.startsWith("fb-30-"))).toBe(true);
    expect(ids.some((i) => i.startsWith("fb-60-"))).toBe(true);
    expect(ids.some((i) => i.startsWith("fb-99-"))).toBe(true);
  });

  it("每張卡都有中文名（去重比對就是靠這個）", () => {
    for (const c of CATALOG) expect(c.zh.length).toBeGreaterThan(0);
  });

  it("只收 FB —— 別的平台混進來會讓去重亂判", () => {
    for (const c of CATALOG) expect(c.id.startsWith("fb-")).toBe(true);
  });
});

describe("buildScanPrompt", () => {
  const { system, query } = buildScanPrompt(MARKET, CATALOG);

  it("把形式與題材的差別講清楚", () => {
    expect(system).toContain("format");
    expect(system).toContain("topic");
    expect(system).toContain("可重複");
  });

  it("要求真實 URL，並明說編造比不答更糟", () => {
    expect(system).toContain("URL");
    expect(system).toMatch(/編造/);
  });

  it("帶入市場與在地語言", () => {
    expect(query).toContain("TW");
    expect(query).toContain("zh-TW");
  });

  it("整份已覆蓋清單都進了 prompt", () => {
    for (const c of CATALOG) expect(query).toContain(c.id);
  });
});

describe("parseScanResult", () => {
  it("收下形狀正確的候選", () => {
    const r = parseScanResult(wrap([GOOD]), MARKET, CATALOG);
    expect(r.dropped).toEqual([]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toMatchObject({
      platform: "facebook",
      market: "TW",
      language: "zh-TW",
      kind: "format",
      name: "步驟式教學貼文",
      duplicateOf: null,
    });
  });

  it("吃得下 ```json 圍欄與前後雜訊", () => {
    const raw = "好的，以下是結果：\n```json\n" + wrap([GOOD]) + "\n```\n希望有幫助！";
    expect(parseScanResult(raw, MARKET, CATALOG).candidates).toHaveLength(1);
  });

  it("沒有可連結佐證的一律丟掉", () => {
    const noUrl = { ...GOOD, evidence: [{ title: "我記得有看過", url: "", observedAt: "" }] };
    const r = parseScanResult(wrap([noUrl]), MARKET, CATALOG);
    expect(r.candidates).toEqual([]);
    expect(r.dropped).toEqual([{ reason: "no_evidence", name: "步驟式教學貼文" }]);
  });

  it("evidence 整個缺席也丟掉，不是給空陣列放行", () => {
    const { evidence, ...noEvidence } = GOOD;
    const r = parseScanResult(wrap([noEvidence]), MARKET, CATALOG);
    expect(r.candidates).toEqual([]);
    expect(r.dropped[0]!.reason).toBe("no_evidence");
  });

  it("非 http(s) 的 URL 不算佐證", () => {
    for (const bad of ["facebook.com/x", "javascript:alert(1)", "ftp://x/y", "第一頁"]) {
      const r = parseScanResult(
        wrap([{ ...GOOD, evidence: [{ title: "t", url: bad }] }]),
        MARKET, CATALOG,
      );
      expect(r.candidates, `should reject ${bad}`).toEqual([]);
    }
  });

  it("只保留 YYYY-MM-DD 的日期，模糊日期一律留空不猜", () => {
    const r = parseScanResult(
      wrap([{ ...GOOD, evidence: [
        { title: "a", url: "https://example.com/a", observedAt: "約兩週前" },
        { title: "b", url: "https://example.com/b", observedAt: "2026-07-15" },
      ] }]),
      MARKET, CATALOG,
    );
    expect(r.candidates[0]!.evidence[0]!.observedAt).toBeUndefined();
    expect(r.candidates[0]!.evidence[1]!.observedAt).toBe("2026-07-15");
  });

  it("kind 不是 format / topic 就丟掉，不預設成 format", () => {
    // 預設成 format 等於把題材偷渡進開卡佇列 —— 這條流程最貴的錯誤
    for (const k of ["", "FORMAT", "形式", undefined, "trend"]) {
      const r = parseScanResult(wrap([{ ...GOOD, kind: k }]), MARKET, CATALOG);
      expect(r.candidates, `kind=${String(k)}`).toEqual([]);
      expect(r.dropped[0]!.reason).toBe("unknown_kind");
    }
  });

  it("topic 有收，但 kind 誠實標記（拿去餵 trend-rewrite，不進開卡佇列）", () => {
    const r = parseScanResult(wrap([{ ...GOOD, kind: "topic" }]), MARKET, CATALOG);
    expect(r.candidates[0]!.kind).toBe("topic");
  });

  it("duplicateOf 指到真實 task id 才採用", () => {
    const r = parseScanResult(wrap([{ ...GOOD, duplicateOf: REAL_ID }]), MARKET, CATALOG);
    expect(r.candidates[0]!.duplicateOf).toBe(REAL_ID);
  });

  it("編出來的 task id 不採用，但候選仍保留給人判斷", () => {
    const r = parseScanResult(
      wrap([{ ...GOOD, duplicateOf: "fb-30-totally-made-up" }]),
      MARKET, CATALOG,
    );
    // 若照單全收，一個假 id 就會把真正的新形式判成重複而消失
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]!.duplicateOf).toBeNull();
    expect(r.dropped[0]!.reason).toBe("phantom_duplicate_id");
  });

  it('字串 "null" 當成沒有重複', () => {
    const r = parseScanResult(wrap([{ ...GOOD, duplicateOf: "null" }]), MARKET, CATALOG);
    expect(r.candidates[0]!.duplicateOf).toBeNull();
    expect(r.dropped).toEqual([]);
  });

  it("整份不是 JSON 時回報 bad_shape，不丟例外", () => {
    const r = parseScanResult("抱歉，我無法完成這個請求。", MARKET, CATALOG);
    expect(r.candidates).toEqual([]);
    expect(r.dropped[0]!.reason).toBe("bad_shape");
  });

  it("空回應 / 空陣列 = 這個月沒發現，不是錯誤", () => {
    expect(parseScanResult(wrap([]), MARKET, CATALOG)).toEqual({ candidates: [], dropped: [] });
  });

  it("壞的那筆丟掉，好的那筆照收", () => {
    const r = parseScanResult(
      wrap([{ ...GOOD, evidence: [] }, GOOD, { kind: "format", name: "" }]),
      MARKET, CATALOG,
    );
    expect(r.candidates).toHaveLength(1);
    expect(r.dropped).toHaveLength(2);
  });

  it("超長欄位截斷，不讓模型撐爆資料庫欄位", () => {
    const r = parseScanResult(
      wrap([{ ...GOOD, name: "長".repeat(500), mechanism: "M".repeat(5000) }]),
      MARKET, CATALOG,
    );
    expect(r.candidates[0]!.name.length).toBeLessThanOrEqual(200);
    expect(r.candidates[0]!.mechanism.length).toBeLessThanOrEqual(1000);
  });
});

describe("candidateKey（跨月去重）", () => {
  it("大小寫、空白、標點不影響", () => {
    expect(candidateKey("步驟式教學", "Step-by-Step How-To"))
      .toBe(candidateKey("步驟式 教學", "step by step howto"));
  });

  it("英文名優先 —— 同一形式在不同語言市場才收斂得到同一列", () => {
    expect(candidateKey("步驟式教學貼文", "How-to post"))
      .toBe(candidateKey("ステップ解説投稿", "how to post"));
  });

  it("沒有英文名時退回中文名", () => {
    expect(candidateKey("成果快報", "")).toBe(candidateKey("成果快報", ""));
    expect(candidateKey("成果快報", "")).not.toBe(candidateKey("幕後花絮", ""));
  });

  it("不同形式不會撞鍵", () => {
    expect(candidateKey("步驟式教學", "How-to")).not.toBe(candidateKey("成果快報", "Results recap"));
  });

  it("長度受限，塞得進 VARCHAR(191) 的唯一鍵", () => {
    expect(candidateKey("長".repeat(400), "x".repeat(400)).length).toBeLessThanOrEqual(180);
  });
});

describe("mergeEvidence", () => {
  const a = { title: "a", url: "https://example.com/a" };
  const b = { title: "b", url: "https://example.com/b" };

  it("URL 去重，保留先出現的", () => {
    expect(mergeEvidence([a], [{ title: "a 改標題", url: a.url }, b])).toEqual([a, b]);
  });

  it("舊證據不會被新的一批覆蓋掉", () => {
    expect(mergeEvidence([a], [b]).map((e) => e.url)).toEqual([a.url, b.url]);
  });

  it("有上限，累積幾個月也不會無限長", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `t${i}`, url: `https://e.com/${i}` }));
    expect(mergeEvidence([], many)).toHaveLength(8);
  });

  it("空 URL 不會佔位", () => {
    expect(mergeEvidence([], [{ title: "x", url: "" }, a])).toEqual([a]);
  });
});
