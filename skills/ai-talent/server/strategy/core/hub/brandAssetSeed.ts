/**
 * 展場示範用的品牌資料。全部取自 ASUS 的公開資訊，或標明是示意。
 *
 * 2026-09-22：品牌頁五張卡空著不能展示，但這裡放的每一筆都要能被追問。
 * 網址一律用 asus.com 底下真實存在的路徑；客戶白名單**刻意留空**——那是
 * 唯一一類「編一筆就等於編造客戶關係」的資料，空著本身就是正確的示範，
 * 而且卡面上那句「空的代表一個客戶都不能提」正好是展場上要講的話。
 */
import { ensureBrandAssetTable, listBrandAssets, saveBrandAsset, type BrandAssetKind } from "./brandAssets";

type Seed = { kind: BrandAssetKind; payload: Record<string, any> };

/** 緘默期示範區間：以跑種子的當天為準往後 14 天，展場上一定是「生效中」。 */
function demoQuietWindow(): { startsOn: string; endsOn: string } {
  const p = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const start = new Date(Date.now() - 2 * 86_400_000);
  const end = new Date(Date.now() + 12 * 86_400_000);
  return { startsOn: fmt(start), endsOn: fmt(end) };
}

export function brandAssetSeeds(): Seed[] {
  const q = demoQuietWindow();
  return [
    {
      kind: "destination",
      payload: {
        label: "ExpertHub — solutions",
        url: "https://expertHub.asus.com/smb",
        useWhen: "Default destination for any post about a solution.",
      },
    },
    {
      kind: "destination",
      payload: {
        label: "ASUS Business — main site",
        url: "https://www.asus.com/business/",
        useWhen: "Company-level posts, hiring, awards.",
      },
    },
    {
      kind: "destination",
      payload: {
        label: "Find a partner",
        url: "https://www.asus.com/business/where-to-buy/",
        useWhen: "When the post ends in a buying question — channel-led, never a direct sale.",
      },
    },
    {
      kind: "identity",
      payload: {
        term: "ASUS",
        wrong: "Asus, ASUSTeK, asus",
        note: "All caps, every occurrence, including mid-sentence.",
      },
    },
    {
      kind: "identity",
      payload: {
        term: "ExpertHub",
        wrong: "Expert Hub, Experthub",
        note: "One word, capital E and H. Never spaced.",
      },
    },
    {
      kind: "identity",
      payload: {
        term: "ASUSTeK Computer Inc.",
        wrong: "",
        note: "Legal entity name. Use it in contracts, invoices and page footers — not in social posts.",
      },
    },
    {
      kind: "account",
      payload: { platform: "LinkedIn", handle: "ASUS Business", url: "https://www.linkedin.com/company/asus/" },
    },
    {
      kind: "account",
      payload: { platform: "Facebook", handle: "@ASUS", url: "https://www.facebook.com/asus/" },
    },
    {
      kind: "account",
      payload: { platform: "YouTube", handle: "@ASUS", url: "https://www.youtube.com/@ASUS" },
    },
    {
      kind: "quiet",
      payload: {
        label: "Q3 earnings quiet period (demo window)",
        startsOn: q.startsOn,
        endsOn: q.endsOn,
        topics: ["revenue", "growth rate", "unannounced deals", "forecasts", "order visibility"],
      },
    },
    // customer: 刻意沒有種子。見檔頭。
  ];
}

/**
 * 只在該類別完全沒有資料時才寫入，所以展場上改過的東西不會被下一次部署蓋掉
 * （每次部署都會跑 hub-seed）。
 */
export async function seedBrandAssets(orgId: number): Promise<{ added: number; skipped: number }> {
  await ensureBrandAssetTable();
  const existing = await listBrandAssets(orgId);
  const kindsPresent = new Set(existing.map((a) => a.kind));
  let added = 0;
  let skipped = 0;
  for (const seed of brandAssetSeeds()) {
    if (kindsPresent.has(seed.kind)) { skipped++; continue; }
    await saveBrandAsset({ orgId, kind: seed.kind, payload: seed.payload });
    added++;
  }
  return { added, skipped };
}
