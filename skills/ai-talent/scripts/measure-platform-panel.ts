/**
 * measure-platform-panel — 量「哪一種商業模式的品牌，官網上掛了哪些平台」。
 *
 * 2026-09-10 (CJ「可以呈現出，我們推薦的平台，是根據多少個品牌統計而來的」)
 *
 * ── 為什麼要自己量 ───────────────────────────────────────────────────
 * onboarding 要在通路旁邊寫出「N 個品牌裡有 M 個」，那個 N 就必須是真的。
 * 三個來源只有這個能對齊我們自己的商業模式分類：
 *
 *   第三方年度調查   有 N，但軸是 B2B/DTC，切不出「Amazon 賣家 vs 獨立電商」
 *   perplexityScout  會給引用，但**沒有母體**，而且每次答案不一樣 —— 不能用
 *   自己量（這支）   N 是我們量的，軸是我們定的，而且標得出量測年月
 *
 * 第二項是陷阱，因為它長得最像研究。socialListeningScout 現在真的在跑，但它
 * 產的是「3–5 個帶引用的爆款模式」，不是統計。拿它生百分比，數字是模型講的。
 *
 * ── 這支量得到什麼、量不到什麼（重要）────────────────────────────────
 *
 *   ✅ 量得到：官網首頁**掛了哪些社群連結**（facebook / instagram / youtube /
 *      tiktok / linkedin / x）。
 *
 *   ❌ 量不到：「有沒有在經營」。要說經營得看近 90 天有沒有發文 —— YouTube
 *      有 API 可查，IG / FB / LinkedIn / TikTok 沒有公開 API，得爬、脆弱、
 *      而且踩 ToS。所以輸出的欄位叫 `linked`，文案也只能寫「掛了連結」。
 *
 *   ❌ 量不到：email / website / pr / brand / audience / kol 這 6 個通路。
 *      它們不是社群連結，首頁上看不出來。這 6 個的預選只能靠人工判斷。
 *
 * ── 母體選錯這支就白跑（2026-09-10 實測）────────────────────────────
 * 第一次抽大品牌（Allbirds / Gymshark / HubSpot / Zendesk…）：
 *
 *   大 DTC  N=4：facebook 100%  instagram 100%  tiktok 100%  linkedin 50%
 *   大 B2B  N=5：facebook 100%  instagram 100%  youtube 100%  linkedin 100%
 *
 * 幾乎全 100%，**沒有鑑別力** —— 大品牌全都掛。換成同規模小品牌再跑：
 *
 *   小 DTC  N=4：instagram 100%  facebook 50%  tiktok 25%  youtube 25%
 *   小 B2B  N=4：linkedin 50%   x 50%         youtube 25%  instagram 0%  facebook 0%
 *
 * 形狀完全不同。所以名單只能收「跟我們客戶同規模」的品牌，收錯規模不是
 * 誤差變大，是整份數據沒有意義。腳本會在偵測到「某平台在所有商業模式都
 * ≥90%」時直接警告。
 *
 * ── 用法 ─────────────────────────────────────────────────────────────
 *   npx tsx scripts/measure-platform-panel.ts --sample
 *       跑內建的 8 個示範品牌，確認程式會動（不要拿這個結果當數據）
 *
 *   npx tsx scripts/measure-platform-panel.ts --panel data/platform-panel.csv
 *       量你自己的名單，只印結果
 *
 *   npx tsx scripts/measure-platform-panel.ts --panel data/platform-panel.csv --write
 *       量完並寫出 server/content/core/platformPanel.ts（前台讀這支）
 *
 *   選項：--delay <ms>（預設 1000，對別人的站客氣一點）
 *         --concurrency <n>（預設 4）
 *         --min-n <n>（預設 30；低於這個數不給寫檔，見下）
 *
 * ── 為什麼 N < 30 不給寫檔 ───────────────────────────────────────────
 * 「4 個裡有 4 個」印成 100% 會比不印更誤導。要嘛收滿 30 個以上，要嘛不要
 * 在畫面上寫百分比。--force 可以蓋過，但那是你自己決定要印一個小樣本。
 *
 * exit 1 的情況：名單讀不到、可用母體為 0、或 --write 時 N 不足且沒有 --force。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────
// 偵測規則
// ─────────────────────────────────────────────────────────────────────

/** 六個我們真的有任務卡的社群通路。 */
const PATTERNS: Record<string, RegExp> = {
  // 排除 sharer / share / dialog / plugins / tr? —— 那些是分享按鈕與追蹤像素，
  // 不是品牌自己的粉專。第一版沒排除時每個電商站都會誤判成有 FB。
  facebook: /(?:https?:)?\/\/(?:[\w.-]*\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\?)[\w./-]+/i,
  instagram: /(?:https?:)?\/\/(?:[\w.-]*\.)?instagram\.com\/(?!p\/|explore)[\w./-]+/i,
  youtube: /(?:https?:)?\/\/(?:[\w.-]*\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)[\w./-]+/i,
  linkedin: /(?:https?:)?\/\/(?:[\w.-]*\.)?linkedin\.com\/(?:company|school)\/[\w./-]+/i,
  tiktok: /(?:https?:)?\/\/(?:[\w.-]*\.)?tiktok\.com\/@[\w./-]+/i,
  x: /(?:https?:)?\/\/(?:[\w.-]*\.)?(?:twitter|x)\.com\/(?!intent|share)[\w./-]+/i,
};

/** 我們真的有任務卡的那 6 個。
 *  2026-09-10 X 通路上線後 x 從「僅供判讀」變成產品通路，所以移進來。 */
const PRODUCT_CHANNELS = ["facebook", "instagram", "youtube", "tiktok", "linkedin", "x"] as const;

/** 量不到的 6 個通路。輸出時明講，免得有人以為 0% 是「沒人用」。 */
const UNMEASURABLE = ["email", "website", "pr", "brand", "audience", "kol"] as const;

// 與 productMeta.ts fetchHtml 同一組標頭。站台擋 bot 是常態，換成誠實的
// research UA 會讓可用母體再掉一截，那是另一種失真。
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 4 * 1024 * 1024;

// ─────────────────────────────────────────────────────────────────────
// 名單
// ─────────────────────────────────────────────────────────────────────

export interface PanelRow {
  /** ISO 3166-1 alpha-2，須是焦點市場之一（目前 TW / US）。 */
  market: string;
  model: string;
  name: string;
  url: string;
}

/**
 * 2026-09-10 (CJ「我認為，這也跟選擇的市場有關」→「我先做台灣跟美國就好」)。
 *
 * 與 client/src/lib/countries.ts 的 FOCUS_MARKET_CODES 同一組。這裡重寫一份
 * 是因為 scripts 不 import client（跨邊界規則）；兩邊不同步時腳本會直接
 * 報錯而不是默默算錯 —— 未知市場代號會被拒收並列出來。
 *
 * 收到 2 個市場的好處直接反映在這支腳本上：母體不必再攤薄成 14 份。
 * 「市場×模式」那張交叉表本來每格都撐不到 30，現在 2 市場 × 3 模式＝6 格，
 * 每格 30 個就是 180 個品牌 —— 這是收得完的量，而且每格都說得出 N。
 */
export const FOCUS_MARKETS = ["TW", "US"] as const;

/** CSV：market,model,name,url。`#` 開頭與空行略過，允許有沒有標題列。 */
export function parsePanelCsv(text: string): { rows: PanelRow[]; rejected: string[] } {
  const rows: PanelRow[] = [];
  const rejected: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cols = line.split(",").map((c) => c.trim());
    if (cols.length < 4) { rejected.push(`${line} → 欄位不足（要 market,model,name,url）`); continue; }
    const [market, model, name, url] = cols;
    if (/^market$/i.test(market)) continue; // 標題列
    const mk = market.toUpperCase();
    if (!FOCUS_MARKETS.includes(mk as any)) {
      rejected.push(`${line} → 市場代號 "${market}" 不在焦點市場（${FOCUS_MARKETS.join(" / ")}）裡`);
      continue;
    }
    if (!model) { rejected.push(`${line} → 缺 model`); continue; }
    if (!/^https?:\/\//i.test(url)) { rejected.push(`${line} → 網址要以 http(s):// 開頭`); continue; }
    rows.push({ market: mk, model, name: name || url, url });
  }
  return { rows, rejected };
}

/** --sample 用。**這不是數據**，只是證明程式會動。 */
const SAMPLE: PanelRow[] = [
  { market: "US", model: "dtc-web", name: "Baron Fig", url: "https://www.baronfig.com" },
  { market: "US", model: "dtc-web", name: "Ugmonk", url: "https://ugmonk.com" },
  { market: "US", model: "dtc-web", name: "Studio Neat", url: "https://www.studioneat.com" },
  { market: "TW", model: "dtc-web", name: "印花樂", url: "https://www.inblooom.com" },
  { market: "US", model: "b2b", name: "Cronitor", url: "https://cronitor.io" },
  { market: "US", model: "b2b", name: "SavvyCal", url: "https://savvycal.com" },
  { market: "US", model: "b2b", name: "Fathom", url: "https://usefathom.com" },
  { market: "TW", model: "dtc-web", name: "綠藤生機", url: "https://www.greenvines.com.tw" },
];

// ─────────────────────────────────────────────────────────────────────
// 量測
// ─────────────────────────────────────────────────────────────────────

export interface Measurement {
  row: PanelRow;
  /** HTTP 狀態；抓不到時是錯誤字串。只有 200 進母體。 */
  status: number | string;
  linked: string[];
  /** 排除原因（status !== 200 時填），輸出時要列出來 —— N 是「抓到的」不是「名單的」。 */
  excludedReason?: string;
}

async function measureOne(row: PanelRow): Promise<Measurement> {
  try {
    const res = await fetch(row.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
      },
    });
    if (!res.ok) {
      await res.body?.cancel();
      return { row, status: res.status, linked: [], excludedReason: `HTTP ${res.status}` };
    }
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    // 首頁短到不像有 footer 的，多半是導向殼或 JS-only 空殼 —— 判成 0 個
    // 連結會把母體污染成「這個模式都不掛社群」，所以直接排除。
    if (html.length < 2_000) {
      return { row, status: res.status, linked: [], excludedReason: `頁面過短（${html.length} bytes），疑似空殼或 JS 渲染` };
    }
    const linked = Object.entries(PATTERNS)
      .filter(([, re]) => re.test(html))
      .map(([k]) => k);
    return { row, status: res.status, linked };
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 60);
    return { row, status: "ERR", linked: [], excludedReason: msg };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function measurePanel(
  rows: PanelRow[],
  opts: { delayMs: number; concurrency: number; onProgress?: (m: Measurement) => void },
): Promise<Measurement[]> {
  const out: Measurement[] = [];
  const queue = [...rows];
  const workers = Array.from({ length: Math.max(1, opts.concurrency) }, async () => {
    while (queue.length) {
      const row = queue.shift();
      if (!row) break;
      const m = await measureOne(row);
      out.push(m);
      opts.onProgress?.(m);
      if (opts.delayMs > 0) await sleep(opts.delayMs);
    }
  });
  await Promise.all(workers);
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// 統計
// ─────────────────────────────────────────────────────────────────────

export interface ModelStat {
  /** 分組鍵。cut="model" 時是模式碼，"market" 時是市場碼，"cross" 時是 "US/dtc-web"。 */
  model: string;
  /** 母體 = 真的抓到首頁的品牌數，不是名單數。 */
  n: number;
  /** 名單數，用來算涵蓋率。 */
  listed: number;
  /** platform → 掛了連結的品牌數。 */
  linked: Record<string, number>;
}

export type Cut = "model" | "market" | "cross";

function keyOf(row: PanelRow, cut: Cut): string {
  if (cut === "model") return row.model;
  if (cut === "market") return row.market;
  return `${row.market}/${row.model}`;
}

/**
 * 依指定切面統計。
 *
 * 三個切面都要看，因為它們回答不同的問題：
 *   model   這種生意通常經營哪些通路
 *   market  這個市場的品牌通常經營哪些通路
 *   cross   兩者相乘 —— 最準，但母體會被切得最碎，通常撐不到 30
 *
 * 前台預選建議用 cross（有母體時）→ 退回 model × market 的交集。
 */
export function tally(measurements: Measurement[], cut: Cut = "model"): ModelStat[] {
  const groups = new Map<string, Measurement[]>();
  for (const m of measurements) {
    const k = keyOf(m.row, cut);
    const arr = groups.get(k) ?? [];
    arr.push(m);
    groups.set(k, arr);
  }
  const stats: ModelStat[] = [];
  for (const [model, list] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ok = list.filter((m) => m.status === 200 && !m.excludedReason);
    const linked: Record<string, number> = {};
    for (const key of Object.keys(PATTERNS)) linked[key] = 0;
    for (const m of ok) for (const p of m.linked) linked[p] = (linked[p] ?? 0) + 1;
    stats.push({ model, n: ok.length, listed: list.length, linked });
  }
  return stats;
}

/**
 * 鑑別力檢查 —— 這支腳本最容易白跑的地方。
 *
 * 某個平台在**所有**商業模式都 ≥ 門檻，代表它分不出任何東西。2026-09-10
 * 抽大品牌時 facebook / instagram 就是這樣（全部 100%）。回報平台名讓你
 * 換名單，而不是把一份沒有資訊的百分比印到前台。
 */
export function uninformativePlatforms(stats: ModelStat[], threshold = 0.9): string[] {
  const usable = stats.filter((s) => s.n > 0);
  if (usable.length < 2) return [];
  return PRODUCT_CHANNELS.filter((p) =>
    usable.every((s) => (s.linked[p] ?? 0) / s.n >= threshold),
  );
}

// ─────────────────────────────────────────────────────────────────────
// 輸出
// ─────────────────────────────────────────────────────────────────────

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
}

function asOfNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * 寫出前台讀的常數檔。
 *
 * 放 server —— client 不 import server（跨邊界規則），由 tRPC 送過去。
 * 這張表跟商業模式→通路的對照表要放同一支，不要讓 client 再抄一份：
 * inferMockup 的 FORMAT_RULES 與 RunPage 的 formatFromTaskId 已經示範過
 * 兩份表各自漂移的後果。
 */
export function renderConstantFile(
  cuts: { byModel: ModelStat[]; byMarket: ModelStat[]; byCross: ModelStat[] },
  asOf: string,
): string {
  const block = (stats: ModelStat[]) =>
    stats
      .filter((s) => s.n > 0)
      .map((s) => {
        const lines = PRODUCT_CHANNELS.map(
          (p) => `      ${p}: ${s.linked[p] ?? 0},`,
        ).join("\n");
        return `  "${s.model}": {\n    n: ${s.n},\n    listed: ${s.listed},\n    linked: {\n${lines}\n    },\n  },`;
      })
      .join("\n");

  const body = block(cuts.byModel);
  const marketBody = block(cuts.byMarket);
  const crossBody = block(cuts.byCross);

  return `/**
 * platformPanel — 「N 個同規模品牌裡有 M 個掛了這個平台」的量測結果。
 *
 * ⚠️ 這個檔案由 scripts/measure-platform-panel.ts 產生，不要手改。
 *    要更新就重跑腳本（名單在 data/platform-panel.csv）。
 *
 * 量的是「官網首頁掛了社群連結」，**不是「有沒有在經營」**。文案只能寫
 * 「掛了連結」；要說經營得量近 90 天發文，那需要各平台 API。
 *
 * ${UNMEASURABLE.join(" / ")} 這 6 個通路量不到（它們不是社群連結），
 * 表上沒有它們，不代表沒人用。
 *
 * asOf 會自己變舊 —— 跟爆款卡的 asOf 同一條規則，舊了就該重量。
 */

/** 量測年月，YYYY-MM。 */
export const PANEL_AS_OF = "${asOf}";

export interface PanelStat {
  /** 母體：真的抓到首頁的品牌數（不是名單數）。 */
  n: number;
  /** 名單數。n / listed 是這次的涵蓋率。 */
  listed: number;
  /** platform → 掛了連結的品牌數。 */
  linked: Record<string, number>;
}

/** businessModel → 量測結果。 */
export const PLATFORM_PANEL: Record<string, PanelStat> = {
${body}
};

/** market（ISO 3166-1）→ 量測結果。跨商業模式混合。 */
export const PLATFORM_PANEL_BY_MARKET: Record<string, PanelStat> = {
${marketBody}
};

/** "<market>/<businessModel>" → 量測結果。最準，但母體最容易不足。 */
export const PLATFORM_PANEL_BY_CROSS: Record<string, PanelStat> = {
${crossBody}
};

/**
 * 前台文案用：回「N 個裡有 M 個」，母體不足就回 null（不要印百分比）。
 *
 * 優先序：市場×模式 → 模式 → 市場。三個都不夠母體就回 null，前台那句
 * 證據就整句不顯示 —— 寧可只寫「建議通路」，不要寫一個撐不住的數字。
 */
export function panelEvidence(
  args: { model?: string | null; market?: string | null; platform: string },
  minN = 30,
): { n: number; m: number; asOf: string; basis: "cross" | "model" | "market" } | null {
  const { model, market, platform } = args;
  const tryOne = (
    table: Record<string, PanelStat>,
    key: string | null | undefined,
    basis: "cross" | "model" | "market",
  ) => {
    if (!key) return null;
    const stat = table[key];
    if (!stat || stat.n < minN) return null;
    const m = stat.linked[platform];
    if (typeof m !== "number") return null;
    return { n: stat.n, m, asOf: PANEL_AS_OF, basis };
  };
  return (
    tryOne(PLATFORM_PANEL_BY_CROSS, market && model ? \`\${market}/\${model}\` : null, "cross") ??
    tryOne(PLATFORM_PANEL, model, "model") ??
    tryOne(PLATFORM_PANEL_BY_MARKET, market, "market")
  );
}
`;
}

// ─────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const useSample = has("sample");
  const panelPath = arg("panel") ?? "data/platform-panel.csv";
  const delayMs = Number(arg("delay") ?? 1000);
  const concurrency = Number(arg("concurrency") ?? 4);
  const minN = Number(arg("min-n") ?? 30);
  const write = has("write");
  const force = has("force");

  let rows: PanelRow[];
  if (useSample) {
    rows = SAMPLE;
    console.log("⚠️  --sample：這是 8 個示範品牌，用來確認程式會動。不要拿這個結果當數據。\n");
  } else {
    const p = resolve(process.cwd(), panelPath);
    if (!existsSync(p)) {
      console.error(`✗ 找不到名單：${p}`);
      console.error(`  先複製範本：cp data/platform-panel.example.csv ${panelPath}`);
      console.error(`  或先跑 --sample 確認程式會動。`);
      process.exit(1);
    }
    const parsed = parsePanelCsv(readFileSync(p, "utf8"));
    rows = parsed.rows;
    if (parsed.rejected.length) {
      console.log(`⚠️  略過 ${parsed.rejected.length} 行：`);
      for (const r of parsed.rejected.slice(0, 20)) console.log(`    ${r}`);
      if (parsed.rejected.length > 20) console.log(`    …還有 ${parsed.rejected.length - 20} 行`);
      console.log();
    }
    if (rows.length === 0) {
      console.error(`✗ 名單是空的：${p}（格式：market,model,name,url，# 開頭是註解）`);
      process.exit(1);
    }
    console.log(`名單 ${rows.length} 個品牌 ← ${panelPath}\n`);
  }

  let done = 0;
  const measurements = await measurePanel(rows, {
    delayMs,
    concurrency,
    onProgress: (m) => {
      done += 1;
      const mark = m.excludedReason ? "✗" : "✓";
      const detail = m.excludedReason ?? (m.linked.join(",") || "(沒掛任何社群連結)");
      console.log(
        `${String(done).padStart(3)}/${rows.length} ${mark} ${m.row.market.padEnd(3)} ${m.row.model.padEnd(12)} ${m.row.name.slice(0, 22).padEnd(24)} ${detail}`,
      );
    },
  });

  const stats = tally(measurements, "model");
  const byMarket = tally(measurements, "market");
  const byCross = tally(measurements, "cross");
  const asOf = asOfNow();

  const printTable = (title: string, rowsIn: ModelStat[], label: string) => {
    console.log(`\n${"─".repeat(78)}`);
    console.log(title);
    console.log("─".repeat(78));
    console.log([label.padEnd(16), "母體", ...PRODUCT_CHANNELS.map((p) => p.slice(0, 9).padStart(10))].join(" "));
    for (const s of rowsIn) {
      if (s.n === 0) {
        console.log(`${s.model.padEnd(16)} ${"0".padStart(4)}  （名單 ${s.listed} 個全部抓不到，見排除清單）`);
        continue;
      }
      const cells = PRODUCT_CHANNELS.map((p) => `${s.linked[p] ?? 0}/${s.n} ${pct(s.linked[p] ?? 0, s.n)}`.padStart(10));
      console.log(`${s.model.padEnd(16)} ${String(s.n).padStart(4)} ${cells.join(" ")}`);
    }
  };

  console.log(`\n${"═".repeat(78)}`);
  console.log(`量測結果（${asOf}）—— 指標是「官網首頁掛了連結」，不是「有在經營」`);
  console.log("═".repeat(78));
  printTable("① 依商業模式", stats, "商業模式");
  printTable("② 依市場", byMarket, "市場");
  printTable("③ 市場 × 商業模式（最準，母體最容易不足）", byCross, "市場/模式");

  const excluded = measurements.filter((m) => m.excludedReason);
  if (excluded.length) {
    console.log(`\n排除 ${excluded.length} 個（母體是「抓到的」不是「名單的」）：`);
    for (const m of excluded) console.log(`  ${m.row.model.padEnd(12)} ${m.row.name.slice(0, 24).padEnd(26)} ${m.excludedReason}`);
  }

  console.log(`\n量不到的通路（不是 0%，是看不到）：${UNMEASURABLE.join(" / ")}`);

  // ── 兩道健全性檢查 ────────────────────────────────────────────────
  let blocked = false;

  const dull = uninformativePlatforms(stats);
  if (dull.length) {
    console.log(
      `\n⚠️  鑑別力警告：${dull.join(" / ")} 在每一個商業模式都 ≥90%。`,
    );
    console.log(`    這通常代表名單收到大品牌了（大品牌每個平台都掛）。`);
    console.log(`    換成跟客戶同規模的品牌再量，否則這份數據印到前台等於沒說。`);
  }

  const thin = stats.filter((s) => s.n > 0 && s.n < minN);
  if (thin.length) {
    console.log(`\n⚠️  母體不足（< ${minN}）：${thin.map((s) => `${s.model}=${s.n}`).join("  ")}`);
    console.log(`    「4 個裡有 4 個」印成 100% 比不印更誤導。收滿再寫，或用 --force 自行負責。`);
    if (write && !force) blocked = true;
  }

  if (stats.every((s) => s.n === 0)) {
    console.error(`\n✗ 可用母體為 0 —— 全部抓不到，沒有東西可以統計。`);
    process.exit(1);
  }

  if (write) {
    if (blocked) {
      console.error(`\n✗ 母體不足，沒有寫檔。要照寫請加 --force。`);
      process.exit(1);
    }
    const target = resolve(process.cwd(), "server/content/core/platformPanel.ts");
    writeFileSync(target, renderConstantFile({ byModel: stats, byMarket, byCross }, asOf), "utf8");
    console.log(`\n✓ 已寫出 ${target}`);
    console.log(`  前台用 panelEvidence({ model, market, platform }) 取「N 個裡有 M 個」。`);
    console.log(`  它會依「市場×模式 → 模式 → 市場」的優先序找母體，都不足就回 null。`);
  } else {
    console.log(`\n（只印結果。要產出前台讀的常數檔請加 --write）`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
