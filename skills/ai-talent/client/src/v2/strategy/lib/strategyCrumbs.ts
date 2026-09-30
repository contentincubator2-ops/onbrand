/**
 * strategyCrumbs — 策略層頁面頂端的路徑列（麵包屑）：所有品牌 › SoWork › 品牌定位總覽 › 品牌黃金圈。
 *
 * 2026-09-30（CJ「寫完以後，品牌願景頁的左上方有三個按鈕，所有品牌跟品牌定位總覽似乎很像，可以
 * 怎麼讓他調整後，可以選擇上一頁到哪一個」）：原本「← 所有品牌」「回到記憶」「← 品牌定位總覽」
 * 三個返回分三行、三種樣式；「← 所有資產」又是第四種。收成一條路徑列，每一段都能點，想回哪一層
 * 點哪一段；最後一段是目前位置、不能點。「回到記憶」固定在同一行最右邊（只有從記憶過來才有）。
 *
 * 純函式：頁面把目前的範圍、分頁、段落丟進來，拿回每一段的名稱與要去哪裡。
 */
export type CrumbScope = "brand" | "product" | "event";

/** 點了要去哪：外部頁（所有品牌）或本頁的某個分頁／段落。 */
export type CrumbTarget =
  | { href: string }
  | { cat: string; scope: "brand" | "entity"; section?: string };

export interface Crumb { label: string; target?: CrumbTarget }

export interface CrumbInput {
  en: boolean;
  brandName: string | null;
  scopeMode: CrumbScope | "none";
  /** 產品／活動名稱（scopeMode 是 product/event 時）。 */
  entityName?: string | null;
  category: string;
  section: string;
  /** 目前段落的標題（section 是 `seg:<id>` 時由頁面查好傳進來）。 */
  segmentTitle?: string | null;
  /** 目前文字／視覺卡的名稱（section 是 `asset:<key>` 時）。 */
  assetLabel?: string | null;
}

const T = (en: boolean, zh: string, e: string) => (en ? e : zh);

/** 各分頁在路徑列上的名稱（跟策略層 rail 同名）。 */
function categoryLabel(cat: string, scope: CrumbInput["scopeMode"], en: boolean): string {
  switch (cat) {
    case "positioning":
      return scope === "product" ? T(en, "產品定位總覽", "Product positioning")
        : scope === "event" ? T(en, "活動定位總覽", "Campaign positioning")
        : T(en, "品牌定位總覽", "Positioning overview");
    case "copy": return T(en, "文字", "Copy");
    case "visual": return T(en, "視覺", "Visual");
    case "info": return T(en, "基本資料", "Info");
    case "meetings": return T(en, "會議", "Meetings");
    case "regulations": return T(en, "法規", "Regulations");
    case "brain": return T(en, "記憶", "Memory");
    case "products": return T(en, "產品", "Products");
    case "events": return T(en, "活動", "Campaigns");
    case "campaign": return T(en, "宣傳企劃", "Campaign plan");
    case "persona": return T(en, "人設", "Persona");
    case "knowledge": return T(en, "知識庫", "Knowledge");
    case "publish": return T(en, "平台授權", "Publishing");
    default: return cat;
  }
}

/** 這個分頁的「總覽」是哪個 section（點分頁那一段時回到這裡）。 */
function overviewSection(cat: string): string | undefined {
  if (cat === "positioning") return "pos:home";
  if (cat === "copy" || cat === "visual") return "asset:all";
  return undefined;
}

export function strategyCrumbs(i: CrumbInput): Crumb[] {
  const out: Crumb[] = [{ label: T(i.en, "所有品牌", "All brands"), target: { href: "/brands?all=1" } }];
  if (!i.brandName) return out;
  out.push({ label: i.brandName, target: { cat: "positioning", scope: "brand", section: "pos:home" } });

  const entity = i.scopeMode === "product" || i.scopeMode === "event";
  if (entity) {
    out.push({
      label: i.scopeMode === "product" ? T(i.en, "產品", "Products") : T(i.en, "活動", "Campaigns"),
      target: { cat: i.scopeMode === "product" ? "products" : "events", scope: "brand" },
    });
    if (i.entityName) out.push({ label: i.entityName, target: { cat: "positioning", scope: "entity", section: "pos:home" } });
  }

  // 產品／活動列表頁：分頁名稱就是上面那一段，不再重複。
  const isListPage = !entity && (i.category === "products" || i.category === "events");
  if (!isListPage) {
    out.push({
      label: categoryLabel(i.category, i.scopeMode, i.en),
      target: { cat: i.category, scope: entity ? "entity" : "brand", section: overviewSection(i.category) },
    });
  } else {
    out.push({ label: categoryLabel(i.category, i.scopeMode, i.en) });
  }

  // 分頁裡的某一段／某一張卡
  const inSegment = i.section.startsWith("seg:") && i.segmentTitle;
  const inAsset = i.section.startsWith("asset:") && i.section !== "asset:all" && i.assetLabel;
  const inDoc = i.section === "doc" && i.category === "positioning";
  if (inSegment) out.push({ label: i.segmentTitle! });
  else if (inAsset) out.push({ label: i.assetLabel! });
  else if (inDoc) out.push({ label: T(i.en, "我的定位文件", "My positioning doc") });

  // 最後一段是目前位置，不能點；品牌範圍時「SoWork」與「品牌定位總覽」指向同一處——保留兩段，
  // 讓路徑讀起來完整（CJ 確認的樣子：所有品牌 › SoWork › 品牌定位總覽 › 品牌黃金圈）。
  out[out.length - 1] = { label: out[out.length - 1]!.label };
  return out;
}
