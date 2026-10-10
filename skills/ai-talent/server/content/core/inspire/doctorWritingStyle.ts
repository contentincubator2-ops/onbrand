/**
 * 醫師這一行的寫作習慣——從五個專科、70 篇醫師本人署名的文章歸納出來的（2026-10-10）。
 *
 * 客戶對第一版的反饋是「沒有考量到醫生這個行業的特色」。這一層回答的是「像醫師寫的」，跟個別醫師無關；
 * 個別醫師的口吻另外從他的口述與修改來（doctorVoice.ts）。
 *
 * 研究資料在 docs/inspire-doctor-voice/*.json，各專科的類型與規則由腳本轉成 doctorWritingStyleData.ts。
 * 兩種帶招攬意味的類型（自家病例數、前後對比、文末掛號入口）在轉檔時就排除了——那是醫療法禁止的寫法，不學。
 *
 * 已知的限制（改規則前先看）：多數文章是抓取後摘要再歸納，不是逐字讀的；每種類型只有 2 到 4 篇支撐；
 * 影片逐字稿與臉書粉專長文沒有取到樣，所以偏書面。
 */
import { DOCTOR_STYLE_DATA } from "./doctorWritingStyleData";

export type SpecialtyId = "metabolism" | "bariatric" | "family" | "hepatology" | "pediatric_endo";

export interface DoctorWritingType { id: string; name: string; oneLine: string; structure: string[]; rules: string[]; avoid: string[] }
export interface DoctorSpecialtyStyle { id: SpecialtyId; label: string; habits: string[]; types: DoctorWritingType[] }

export const DOCTOR_SPECIALTIES = DOCTOR_STYLE_DATA as DoctorSpecialtyStyle[];

export function specialtyStyle(id: string): DoctorSpecialtyStyle | undefined {
  return DOCTOR_SPECIALTIES.find((s) => s.id === id);
}

export function writingType(id: string): DoctorWritingType | undefined {
  for (const s of DOCTOR_SPECIALTIES) { const t = s.types.find((x) => x.id === id); if (t) return t; }
  return undefined;
}

/**
 * 五個專科都指出的、醫師的文章跟一般 AI 衛教文最明顯的差別。寫成可以照做的規則。
 * 這幾條是整層最重要的部分——專科與類型的規則是在這上面加細節。
 */
export const COMMON_DOCTOR_HABITS: string[] = [
  "第一句就進正題：診間裡的一句話、一個門檻數字，或直接下定義。不要用「隨著現代人生活型態改變」這類鋪陳開場。",
  "一篇只回答一個問題。跟這個問題不相干的原因、症狀、併發症不要為了完整而列出來。",
  "敢下判斷：該肯定的地方直接說（什麼情況先不用處理、哪個做法比較重要）。醫師沒有把握的地方，照他的說法寫「目前還不確定」，不要替他圓成兩邊都對。",
  "保留語氣只用在證據真的不足或因人而異的地方，而且要說出條件（「如果…就不一定」）。不要每一句都加「可能」「或許」「建議諮詢」。",
  "數字要帶單位，能換成生活單位就換（幾碗、幾餐、每週幾次）。醫師沒給數字的地方，不要用「適量」「規律」「明顯」這種形容詞假裝有內容——寧可照他的說法寫他會先看什麼再決定。",
  "壞消息與限制照實寫：做不到什麼、什麼情況沒有用、什麼檢查看不出來。不要把風險濃縮成最後一句提醒。",
  "段落長短不必整齊：重點那一段寫長，其他一兩句帶過。不要寫成每段三句、每點等長的對稱清單。",
  "結尾要短：停在最後一個重點、一句叮嚀，或一件回家可以做的事。不要寫「總而言之」的摘要段，也不要自己加制式的免責句。",
  "用這一科在診間真的會說的詞（俗稱、行話、台灣的制度與飲食），第一次出現的術語用白話帶過即可，不必每個名詞都附正式全名。",
];

/** 寫作規範這一段提示詞：共同習慣 → 專科習慣 → 選定類型的結構與規則。 */
export function writingStyleBlock(args: { specialtyId?: string; typeId?: string }): string {
  const sp = args.specialtyId ? specialtyStyle(args.specialtyId) : undefined;
  const type = args.typeId ? writingType(args.typeId) : undefined;
  return [
    `【醫師寫東西的習慣——這幾條最重要，每一條都要做到】`,
    ...COMMON_DOCTOR_HABITS.map((h) => `- ${h}`),
    sp ? `\n【${sp.label}的文章常見的習慣（口述裡有對應內容才用，不要為了符合習慣去補口述沒有的東西）】\n${sp.habits.map((h) => `- ${h}`).join("\n")}` : "",
    type ? [
      `\n【這一篇照「${type.name}」寫】${type.oneLine}`,
      `段落順序：${type.structure.join(" → ")}`,
      `口述沒有的段落就略過，不要硬湊。`,
      ...type.rules.map((r) => `- ${r}`),
      type.avoid.length ? `這一型不會做的事：${type.avoid.join("；")}` : "",
    ].filter(Boolean).join("\n") : "",
  ].filter(Boolean).join("\n");
}
