/**
 * 展場示範用的品牌資料。
 *
 * 2026-09-22：網址與官方帳號全部取自 ASUS 的公開資訊；客戶名單則是**虛構的**，
 * 而且每一筆的授權欄位自己就寫著是示範資料。
 *
 * ── 客戶白名單為什麼可以填，但只能填假的 ────────────────────────────
 * 一開始我把這一類留空，理由是「編一筆就等於編造客戶關係」。那個顧慮只對
 * **真實公司名**成立：寫「某某科技是 ASUS 的客戶」是在捏造一段商業關係。
 * 用虛構公司名就沒有這個問題，而且展場上反而看得到這張卡真正的形狀——
 * 特別是第三筆那種「只能提產業、不得具名」的部分授權，真實的 NDA 就是長那樣。
 *
 * ── 只補、不蓋 ──────────────────────────────────────────────────────
 * 每一筆帶一個 seedKey，只有在找不到同 key 的列時才寫入。所以：新增的種子會
 * 進去，而展場上手改過的內容不會被下一次部署蓋掉（每次部署都會跑 hub-seed）。
 */
import {
  ensureBrandAssetTable,
  listBrandAssets,
  saveBrandAsset,
  type BrandAssetKind,
} from "./brandAssets";

type Seed = { kind: BrandAssetKind; payload: Record<string, any> };

/** 以跑種子的當天為準推出三段區間，展場上一定有一段正在生效。 */
function quietWindows() {
  const p = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const day = (offset: number) => fmt(new Date(Date.now() + offset * 86_400_000));
  return {
    past: { startsOn: day(-120), endsOn: day(-96) },
    now: { startsOn: day(-2), endsOn: day(12) },
    next: { startsOn: day(80), endsOn: day(104) },
  };
}

export function brandAssetSeeds(): Seed[] {
  const w = quietWindows();
  return [
    // ── 導流目的地 ──────────────────────────────────────────────────────
    {
      kind: "destination",
      payload: {
        seedKey: "dest-solutions",
        label: "ExpertHub — solutions",
        url: "https://expertHub.asus.com/smb",
        useWhen: "Default destination for any post about a solution.",
      },
    },
    {
      kind: "destination",
      payload: {
        seedKey: "dest-business",
        label: "ASUS Business — main site",
        url: "https://www.asus.com/business/",
        useWhen: "Company-level posts, hiring, awards.",
      },
    },
    {
      kind: "destination",
      payload: {
        seedKey: "dest-partner",
        label: "Find a partner",
        url: "https://www.asus.com/business/where-to-buy/",
        useWhen: "When the post ends in a buying question — channel-led, never a direct sale.",
      },
    },
    {
      kind: "destination",
      payload: {
        seedKey: "dest-support",
        label: "Support",
        url: "https://www.asus.com/support/",
        useWhen: "Anyone asking a service question in the comments goes here, not to the rep's mobile.",
      },
    },

    // ── 公司與產品的寫法 ────────────────────────────────────────────────
    {
      kind: "identity",
      payload: {
        seedKey: "id-asus",
        term: "ASUS",
        wrong: "Asus, ASUSTeK, asus",
        note: "All caps, every occurrence, including mid-sentence.",
      },
    },
    {
      kind: "identity",
      payload: {
        seedKey: "id-experthub",
        term: "ExpertHub",
        wrong: "Expert Hub, Experthub, expertHub",
        note: "One word, capital E and H. Never spaced.",
      },
    },
    {
      kind: "identity",
      payload: {
        seedKey: "id-legal",
        term: "ASUSTeK Computer Inc.",
        wrong: "",
        note: "Legal entity name. Contracts, invoices and page footers only — never in a social post.",
      },
    },
    {
      kind: "identity",
      payload: {
        seedKey: "id-tm",
        term: "ASUS®",
        wrong: "",
        note: "Carry the ® on first mention in any published marketing piece; plain ASUS afterwards.",
      },
    },

    // ── 官方社群帳號 ────────────────────────────────────────────────────
    { kind: "account", payload: { seedKey: "acc-li", platform: "LinkedIn", handle: "ASUS Business", url: "https://www.linkedin.com/company/asus/" } },
    { kind: "account", payload: { seedKey: "acc-fb", platform: "Facebook", handle: "@ASUS", url: "https://www.facebook.com/asus/" } },
    { kind: "account", payload: { seedKey: "acc-yt", platform: "YouTube", handle: "@ASUS", url: "https://www.youtube.com/@ASUS" } },
    { kind: "account", payload: { seedKey: "acc-ig", platform: "Instagram", handle: "@asus", url: "https://www.instagram.com/asus/" } },

    // ── 可公開提及的客戶（示範：全部虛構） ──────────────────────────────
    {
      kind: "customer",
      payload: {
        seedKey: "cust-mingzhi",
        name: "明志精密 Mingzhi Precision",
        permission: "示範資料（虛構客戶）· 已簽署案例使用同意書 2026-05，可具名、可提產業",
        sourceUrl: "",
      },
    },
    {
      kind: "customer",
      payload: {
        seedKey: "cust-harborline",
        name: "Harborline Logistics",
        permission: "Demo entry (fictional customer) · published case study, name and logo cleared",
        sourceUrl: "",
      },
    },
    {
      kind: "customer",
      payload: {
        seedKey: "cust-greenfield",
        // 部分授權才是 NDA 真實的樣子，也是這張卡最值得展示的一種狀態。
        name: "綠野食品 Greenfield Foods",
        permission: "示範資料（虛構客戶）· **僅限提及產業，不得具名**——寫「一家食品加工廠」可以，寫公司名不行",
        sourceUrl: "",
      },
    },

    // ── 緘默期 ──────────────────────────────────────────────────────────
    {
      kind: "quiet",
      payload: {
        seedKey: "quiet-current",
        label: "Q3 earnings quiet period",
        startsOn: w.now.startsOn,
        endsOn: w.now.endsOn,
        topics: ["revenue", "growth rate", "unannounced deals", "forecasts", "order visibility"],
      },
    },
    {
      kind: "quiet",
      payload: {
        seedKey: "quiet-past",
        label: "Q2 earnings quiet period (closed)",
        startsOn: w.past.startsOn,
        endsOn: w.past.endsOn,
        topics: ["revenue", "growth rate", "forecasts"],
      },
    },
    {
      kind: "quiet",
      payload: {
        seedKey: "quiet-next",
        label: "Q4 earnings quiet period (scheduled)",
        startsOn: w.next.startsOn,
        endsOn: w.next.endsOn,
        topics: ["revenue", "growth rate", "unannounced deals", "forecasts"],
      },
    },
  ];
}

/**
 * 這一筆「實質上」是什麼，用來認出已經存在的列。
 *
 * 第一版種子沒有 seedKey，而 VM 上已經有那十筆了。只比對 seedKey 的話，
 * 那十筆會被當成不存在而重新插入一次——變成每一項都兩份。所以 seedKey 與
 * 自然鍵任一命中就算已存在。
 */
function naturalKey(kind: BrandAssetKind, payload: Record<string, any>): string {
  const s = (v: any) => String(v ?? "").trim().toLowerCase();
  switch (kind) {
    case "destination": return `dest:${s(payload.url)}`;
    case "identity":    return `id:${s(payload.term)}`;
    case "account":     return `acc:${s(payload.platform)}:${s(payload.handle)}`;
    case "customer":    return `cust:${s(payload.name)}`;
    case "quiet":       return `quiet:${s(payload.label)}`;
    default:            return "";
  }
}

/**
 * 逐筆比對：seedKey 或自然鍵命中就跳過，都沒有才寫入。
 * 新增的種子會補進去，展場上改過的內容不會被蓋掉。
 */
/**
 * 2026-09-22 一次性清理。
 *
 * 第一版的緘默期標籤是「Q3 earnings quiet period (demo window)」，第二版把
 * 「(demo window)」拿掉了。自然鍵是標籤，所以改名之後舊那一列認不出來，於是
 * 同一段區間被插了兩次，而且兩段都生效。
 *
 * 教訓記在這裡：**已經種下去的資料，自然鍵欄位不能改**——要改就得同時把舊的
 * 收掉。這段在舊標籤絕跡之後可以直接刪掉。
 */
const STALE_LABELS = ["Q3 earnings quiet period (demo window)"];

async function removeStale(orgId: number): Promise<number> {
  const { removeBrandAsset } = await import("./brandAssets");
  const existing = await listBrandAssets(orgId, "quiet");
  let removed = 0;
  for (const a of existing) {
    if (STALE_LABELS.includes(String(a.payload.label ?? "").trim())) {
      await removeBrandAsset(orgId, a.id);
      removed++;
    }
  }
  return removed;
}

export async function seedBrandAssets(orgId: number): Promise<{ added: number; skipped: number; removed: number }> {
  await ensureBrandAssetTable();
  const removed = await removeStale(orgId);
  const existing = await listBrandAssets(orgId);
  const seen = new Set<string>();
  for (const a of existing) {
    const k = String(a.payload.seedKey ?? "").trim();
    if (k) seen.add(`key:${k}`);
    const nk = naturalKey(a.kind, a.payload);
    if (nk) seen.add(nk);
  }

  let added = 0;
  let skipped = 0;
  for (const seed of brandAssetSeeds()) {
    const key = String(seed.payload.seedKey ?? "").trim();
    const nk = naturalKey(seed.kind, seed.payload);
    if ((key && seen.has(`key:${key}`)) || (nk && seen.has(nk))) { skipped++; continue; }
    await saveBrandAsset({ orgId, kind: seed.kind, payload: seed.payload });
    if (key) seen.add(`key:${key}`);
    if (nk) seen.add(nk);
    added++;
  }
  return { added, skipped, removed };
}
