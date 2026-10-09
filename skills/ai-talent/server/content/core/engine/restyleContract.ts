/**
 * 套另一張任務卡的寫法改寫 —— 2026-10-09。
 *
 * CJ「修改單則貼文時，旁邊可以找其他範本參考；應該用任務卡，而且先顯示用戶自訂或常用的」。
 * 作品頁右欄的「換個寫法」：挑一張同通路的任務卡，把這一篇改成那張卡的結構。
 *
 * 跟換人寫的差別：換人寫只換口氣（事實與結構不變）；這裡換結構，但**事實不能換**。
 * 任務卡的規則本來是寫給「從題目開始寫」用的，裡面常有「自己找一個案例」「補一個數字」
 * 這種指示 —— 改寫時原稿就是唯一的事實來源，所以這段合約接在卡片規則後面把它蓋掉。
 */
import { CARD_ID_RE, brandIdOfCardId } from "../catalog/brandTaskCards";

/** 卡片規則最多帶多少字進 prompt：自建卡的 SKILL 可能很長，結構通常在前段。 */
export const MAX_RULES_CHARS = 6000;

export interface RestyleCard {
  /** 任務卡名稱，例如「反差開場」 */
  label?: string | null;
  /** 這張卡的寫作規則（template.systemPrompt；自建卡＝SKILL）。 */
  rules?: string | null;
  /** 這張卡登記的參考案例（craft ref），沒有就不帶。 */
  reference?: string | null;
}

/**
 * 這張卡能不能拿來替這個品牌改寫。自建卡的編號帶著品牌（u<brandId>-…），
 * 只有同一個品牌能用 —— 不然別人的 SKILL 會透過改寫結果外洩。內建卡誰都能用。
 */
export function canRestyleWith(taskId: string, brandId: number | null | undefined): boolean {
  if (!CARD_ID_RE.test(taskId)) return true;
  const owner = brandIdOfCardId(taskId);
  return owner != null && brandId != null && owner === brandId;
}

/** 接在 system prompt 裡、品牌資料之後的「照這張卡改寫」段落。 */
export function restyleBlock(card: RestyleCard): string {
  const rules = (card.rules ?? "").trim();
  if (!rules) return "";
  const clipped = rules.length > MAX_RULES_CHARS ? `${rules.slice(0, MAX_RULES_CHARS)}…` : rules;
  const lines: string[] = [
    "",
    `【這次要套的任務卡${card.label ? `：「${card.label}」` : ""}】`,
    "下面是這張卡的寫作規則。把目前的文案改寫成這張卡的結構與節奏：",
    "",
    clipped,
  ];
  const ref = (card.reference ?? "").trim();
  if (ref) lines.push("", `這張卡的參考案例：${ref}`);
  lines.push(
    "",
    "【改寫時的事實規則 —— 勝過上面卡片規則裡任何一句】",
    "- 目前的文案是唯一的事實來源：產品、價格、數字、日期、人名、活動內容只能用原稿裡有的。",
    "- 卡片規則如果要求補案例、補數據、補見證而原稿沒有，就不補，改用原稿已有的內容撐起那一段。",
    "- 卡片規則裡提到的範例品牌、範例產品只是示範結構，不要寫進文案。",
    "- 只換結構與節奏，不換這篇在講的事。",
  );
  return lines.join("\n");
}

/** 沒有另外說要改什麼時，送給模型的那一句。 */
export function restyleRequest(label?: string | null): string {
  return label ? `請照「${label}」這張任務卡的寫法，把這篇重寫一次。` : "請照這張任務卡的寫法，把這篇重寫一次。";
}
