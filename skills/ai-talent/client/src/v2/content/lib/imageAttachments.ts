/**
 * 圖片卡輸入框的附圖（2026-10-10 CJ「就像人們用 Claude／ChatGPT 生圖的過程，但更便利」）。
 *
 * 原本有三個上傳入口（主體照片／底圖／風格參考圖），用戶要先懂我們的分類才知道丟哪裡。
 * 現在只有一個迴紋針；每張附圖只問一件事——這張圖要怎麼用：
 *   follow  照這張畫：AI 學它的畫法、配色與構圖，內容換成你的（預設）
 *   subject 放進畫面：這張的產品／人物原樣放進新畫面（產品照預設）
 *   base    直接當底圖：不經 AI、不扣點
 */
export type AttachRole = "follow" | "subject" | "base";

export interface Attachment { url: string; name: string; role: AttachRole }

/** 「照這張畫」一次最多幾張（伺服器 imageCards.MAX_STYLE_REFS 的鏡像；伺服器才是準的）。 */
export const MAX_FOLLOW = 3;

const isLead = (r: AttachRole) => r !== "follow";
const followCount = (list: Attachment[]) => list.filter((a) => a.role === "follow").length;

/**
 * 把 url 這張設成 role。「放進畫面／直接當底圖」同時只能有一張（模型只認一張主體）：
 * 原本那張退成「照這張畫」，退不下去（已滿）就拿掉。回傳 null＝「照這張畫」已滿，放不進去。
 */
export function setAttachmentRole(list: Attachment[], url: string, role: AttachRole): Attachment[] | null {
  const others = list.filter((a) => a.url !== url);
  const self = list.find((a) => a.url === url);
  if (!self) return list;
  if (role === "follow") {
    return followCount(others) >= MAX_FOLLOW ? null : list.map((a) => (a.url === url ? { ...a, role } : a));
  }
  let room = MAX_FOLLOW - followCount(others);
  const next: Attachment[] = [];
  for (const a of list) {
    if (a.url === url) next.push({ ...a, role });
    else if (!isLead(a.role)) next.push(a);
    else if (room > 0) { next.push({ ...a, role: "follow" }); room--; }
  }
  return next;
}

/** 加一張附圖；已經在清單裡就只改用途。回傳 null＝放不進去（「照這張畫」已滿）。 */
export function addAttachment(list: Attachment[], a: Attachment): Attachment[] | null {
  if (list.some((x) => x.url === a.url)) return setAttachmentRole(list, a.url, a.role);
  if (a.role === "follow") return followCount(list) >= MAX_FOLLOW ? null : [...list, a];
  return setAttachmentRole([...list, { ...a, role: "follow" }], a.url, a.role) ?? null;
}

export const subjectOf = (list: Attachment[]) => list.find((a) => a.role === "subject") ?? null;
export const baseOf = (list: Attachment[]) => list.find((a) => a.role === "base") ?? null;
export const followUrls = (list: Attachment[]) => list.filter((a) => a.role === "follow").map((a) => a.url);
