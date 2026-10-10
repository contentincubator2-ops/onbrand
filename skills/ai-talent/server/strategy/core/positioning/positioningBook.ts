/**
 * positioningBook — 「品牌定位書」：品牌定位頁的卡片牆。
 *
 * 2026-10-10（CJ「一直很不滿意品牌策略頁面的設計，似乎無法讓顧問拿來做一份品牌定位的提案，
 * 現在很多欄位，反而會變成很不想閱讀，也不知道要怎麼修改或貢獻」→「跟通路一樣的呈現方式，
 * 每一個卡片按進去可以對話式修改，全部完成後像活動定位一樣產出草擬提案。可以自己加減欄位」
 * →「第一次進來可以是空白」「用戶可以新增卡片，自由在不同卡片之間排列」「標語之後還有
 * 展現的形式 manifesto」）。
 *
 * 原本的 10 個 segment 是問卷（約 35 格平行排列），顧問找不到可以下筆改的結論。這裡換成
 * 一本定位書該有的十張卡：先診斷（課題、檢驗、受眾、競爭者）→ 再推導（文化張力、品牌最好的
 * 自己）→ 最後表達（定位主張、個性語氣、標語、宣言）。每張卡就是一段文字，不是一組欄位。
 *
 * ── 跟原本 segment 的關係 ─────────────────────────────────────────────
 * 原本的 segment **不刪也不搬**：SoWork 定位法與「自己上傳」仍然寫那些格、產文仍然讀那些格
 * （brandContext 的 PROMPT_FIELDS）。卡片還沒有人寫過時，畫面顯示的是從那些格**整理出來的
 * 文字**（derived）——所以跑完 SoWork 定位法或上傳文件後，卡片牆不會是空的。顧問改過存檔的
 * 才是卡片自己的內容（body），並且另外進品牌大腦（見 brandContext 的 book 區塊，標明
 * 「與其他定位資料衝突時以這裡為準」）。
 *
 * 存放：brands.positioning._book。讀寫比照 channelRoles——淺層 read-modify-write。
 */
import { createHash } from "node:crypto";
import { patchPositioning, loadPositioning } from "./positioningDocs";
import { clampField } from "../brand/channelRoles";

export type BookPresetId =
  | "challenge" | "audit" | "audience" | "competitors" | "tension"
  | "bestSelf" | "proposition" | "voice" | "tagline" | "manifesto";

export interface BookPreset {
  id: BookPresetId;
  title: string; titleEn: string;
  /** 這張卡要回答的問題——卡片空白時的提示，也是顧問對話的題目。 */
  ask: string; askEn: string;
  /** 單張字數上限。 */
  max: number;
  /** 整理 derived 時讀了原本哪幾個 segment（畫面上給「編輯原始資料」的連結）。 */
  sources: string[];
}

/** 順序＝定位書的預設章節順序（診斷 → 推導 → 表達）。 */
export const BOOK_PRESETS: BookPreset[] = [
  { id: "challenge", max: 1200, sources: [],
    title: "課題與策略目的", titleEn: "Challenge & strategic intent",
    ask: "品牌現在遇到什麼問題？這次定位要達成什麼？",
    askEn: "What problem is the brand facing, and what must this positioning achieve?" },
  { id: "audit", max: 1500, sources: [],
    title: "品牌檢驗", titleEn: "Brand audit",
    ask: "消費者現在怎麼看這個品牌？從產品、形象、顧客、通路、視覺、聲譽六個面向各看一眼。",
    askEn: "How do people see the brand today — across product, image, customer, channel, visual and reputation?" },
  { id: "audience", max: 1500, sources: ["audience"],
    title: "受眾與洞察", titleEn: "Audience & insight",
    ask: "對誰說？最多三個受眾，標出一個主受眾，並寫下一句關於他們的洞察。",
    askEn: "Who are we talking to? Up to three audiences, one of them primary — plus one insight about them." },
  { id: "competitors", max: 1200, sources: ["competition"],
    title: "競爭者", titleEn: "Competitors",
    ask: "消費者會拿我們跟誰比？對方佔住了什麼，還有哪裡是空的？",
    askEn: "Who do people compare us with, what do they own, and where is the open space?" },
  { id: "tension", max: 800, sources: ["trends"],
    title: "文化張力", titleEn: "Cultural tension",
    ask: "受眾所處的社會或文化裡，有什麼拉扯是這個品牌可以回應的？",
    askEn: "What tension in the audience's culture can this brand respond to?" },
  { id: "bestSelf", max: 1200, sources: ["goldenCircle", "origin", "values", "differentiation"],
    title: "品牌最好的自己", titleEn: "The brand's best self",
    ask: "品牌在最好的狀態下是什麼樣子？憑什麼這麼說——列出三個支撐點。",
    askEn: "What is the brand at its best, and why should anyone believe it? Give three supports." },
  { id: "proposition", max: 600, sources: ["differentiation"],
    title: "定位主張", titleEn: "Positioning statement",
    ask: "一句話：對〔誰〕來說，我們是〔什麼〕，因為〔差異〕。",
    askEn: "One sentence: for [whom], we are [what], because [difference]." },
  { id: "voice", max: 1000, sources: ["voice"],
    title: "品牌個性與語氣", titleEn: "Personality & voice",
    ask: "如果品牌是一個人，他是誰、怎麼說話、哪些話不說？",
    askEn: "If the brand were a person — who is it, how does it talk, what does it never say?" },
  { id: "tagline", max: 600, sources: ["tagline"],
    title: "標語", titleEn: "Tagline",
    ask: "把定位主張變成一句對外說的話。",
    askEn: "Turn the positioning statement into one line the public hears." },
  { id: "manifesto", max: 2000, sources: [],
    title: "品牌宣言", titleEn: "Manifesto",
    ask: "用品牌自己的口吻，把相信什麼、為誰而做、要改變什麼寫成一段宣言。",
    askEn: "In the brand's own voice: what it believes, who it is for, what it sets out to change." },
];

const PRESET_BY_ID = new Map(BOOK_PRESETS.map((p) => [p.id, p]));
export const isBookPresetId = (s: unknown): s is BookPresetId => typeof s === "string" && PRESET_BY_ID.has(s as BookPresetId);

export const BOOK_TITLE_MAX = 24;
export const BOOK_CUSTOM_BODY_MAX = 1500;
export const BOOK_MAX_CUSTOM_CARDS = 10;
/** 至少幾張卡有內容才草擬提案——再少寫出來的只是把一兩張卡重講一次。 */
export const BOOK_MIN_CARDS_TO_DRAFT = 3;
/** 每張卡進品牌大腦的字數上限（宣言最長，所以另外放寬）。 */
export const BOOK_CARD_PROMPT_MAX = 600;
export const BOOK_MANIFESTO_PROMPT_MAX = 900;

/** 存在 positioning._book 的形狀。 */
interface StoredCard { title?: string; body: string; updatedAt: string }
export interface StoredBook {
  /** 卡片順序（預設卡的 id 或自訂卡的 id）。沒列到的預設卡排在最後。 */
  order?: string[];
  cards?: Record<string, StoredCard>;
  /** 用戶從定位書拿掉的預設卡。 */
  hidden?: string[];
  proposal?: { text: string; at: string; mark: string };
}

/** 畫面與提案用的一張卡。 */
export interface BookCard {
  id: string;
  preset: BookPresetId | null;
  title: string; titleEn: string;
  ask: string; askEn: string;
  max: number;
  /** 顧問寫過、存下來的內容。 */
  body: string;
  /** 還沒人寫過時，從原本定位資料整理出來的文字（只有預設卡有）。 */
  derived: string;
  sources: string[];
  updatedAt: string | null;
  /** 排在前面的卡片在這張之後改過——這張可能要跟著重看。 */
  upstreamChanged: boolean;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x)).filter(Boolean) : []);
const rows = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : []);
const lines = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join("\n");
const labeled = (label: string, v: string) => (v ? `${label}：${v}` : "");

/**
 * 從原本的 segment 整理出這張卡的文字。只搬運、不改寫——每一句都是定位資料裡已經有的字，
 * 所以不需要模型，也不會多出品牌沒說過的話。課題／檢驗／宣言在原本的資料裡沒有對應，回空字串。
 */
export function deriveBookCard(id: BookPresetId, pos: Record<string, any> | null | undefined): string {
  const p = pos ?? {};
  switch (id) {
    case "audience": {
      const a = p.audience ?? {};
      return lines(
        labeled("主受眾", str(a.primary)),
        labeled("次受眾", str(a.secondary)),
        labeled("痛點", list(a.painPoints).join("、")),
      );
    }
    case "competitors": {
      const c = p.competition ?? {};
      const direct = rows(c.direct)
        .map((r) => [str(r.name), str(r.position), labeled("我方差異", str(r.ourEdge))].filter(Boolean).join("｜"))
        .filter(Boolean);
      return lines(
        labeled("競爭強度", str(c.intensity)),
        direct.length ? `直接競爭者：\n${direct.map((d) => `・${d}`).join("\n")}` : "",
        labeled("定位地圖", str(c.map)),
      );
    }
    case "tension": {
      const t = p.trends ?? {};
      const fav = rows(t.favorable).map((r) => [str(r.name), str(r.body)].filter(Boolean).join("：")).filter(Boolean);
      return fav.length ? `市場上正在發生的事（可以從這裡找張力）：\n${fav.map((f) => `・${f}`).join("\n")}` : "";
    }
    case "bestSelf": {
      const g = p.goldenCircle ?? {}, d = p.differentiation ?? {};
      const values = rows(p.values?.items).map((r) => str(r.label)).filter(Boolean);
      return lines(
        labeled("相信什麼", str(g.why)),
        labeled("怎麼做", str(g.how)),
        labeled("提供什麼", str(g.what)),
        labeled("起源", str(p.origin?.story)),
        labeled("價值觀", values.join("、")),
        labeled("支撐證據", str(d.reasonToBelieve)),
      );
    }
    case "proposition": {
      const d = p.differentiation ?? {};
      return lines(str(d.summary), labeled("唯一致勝理由", str(d.discriminator)));
    }
    case "voice": {
      const v = p.voice ?? {};
      return lines(
        labeled("人格原型", list(v.archetypes).join(" / ")),
        labeled("語調", list(v.tone).join("、")),
        labeled("不說的話", list(v.forbidden).join("、")),
      );
    }
    case "tagline": {
      const t = p.tagline;
      if (typeof t === "string") return t.trim();
      return lines(str(t?.zhTagline), str(t?.enTagline), labeled("標語背後的故事", str(t?.story)));
    }
    default:
      return "";
  }
}

export function storedBookOf(pos: Record<string, any> | null | undefined): StoredBook {
  const b = pos?._book;
  return b && typeof b === "object" && !Array.isArray(b) ? (b as StoredBook) : {};
}

const isCustomId = (id: string) => id.startsWith("c_");

/** 目前在定位書上的卡片 id，依顯示順序。 */
function orderedIds(book: StoredBook): string[] {
  const hidden = new Set(Array.isArray(book.hidden) ? book.hidden : []);
  const cards = book.cards ?? {};
  const exists = (id: string) => (isBookPresetId(id) ? !hidden.has(id) : isCustomId(id) && !!cards[id]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of Array.isArray(book.order) ? book.order : []) {
    if (typeof id !== "string" || seen.has(id) || !exists(id)) continue;
    seen.add(id); out.push(id);
  }
  // order 沒列到的：預設卡照預設順序、自訂卡照建立順序，接在後面。
  for (const p of BOOK_PRESETS) if (!seen.has(p.id) && exists(p.id)) { seen.add(p.id); out.push(p.id); }
  for (const id of Object.keys(cards)) if (!seen.has(id) && exists(id)) { seen.add(id); out.push(id); }
  return out;
}

/** 定位書現在的樣子：卡片（依順序）＋被拿掉、可以加回來的預設卡。 */
export function bookView(pos: Record<string, any> | null | undefined): { cards: BookCard[]; hidden: BookPreset[] } {
  const book = storedBookOf(pos);
  const stored = book.cards ?? {};
  let latestBefore = "";
  const cards = orderedIds(book).map((id): BookCard => {
    const preset = isBookPresetId(id) ? PRESET_BY_ID.get(id)! : null;
    const s = stored[id];
    const body = str(s?.body);
    const updatedAt = body && typeof s?.updatedAt === "string" ? s.updatedAt : null;
    const upstreamChanged = !!updatedAt && !!latestBefore && latestBefore > updatedAt;
    if (updatedAt && updatedAt > latestBefore) latestBefore = updatedAt;
    const title = preset ? preset.title : str(s?.title);
    return {
      id, preset: preset?.id ?? null,
      title, titleEn: preset ? preset.titleEn : title,
      ask: preset?.ask ?? "", askEn: preset?.askEn ?? "",
      max: preset?.max ?? BOOK_CUSTOM_BODY_MAX,
      body,
      derived: preset && !body ? deriveBookCard(preset.id, pos) : "",
      sources: preset?.sources ?? [],
      updatedAt, upstreamChanged,
    };
  });
  const hiddenSet = new Set(Array.isArray(book.hidden) ? book.hidden : []);
  return { cards, hidden: BOOK_PRESETS.filter((p) => hiddenSet.has(p.id)) };
}

/** 一張卡現在「有的內容」：顧問寫過的優先，沒有才是整理出來的。 */
export const effectiveBody = (c: Pick<BookCard, "body" | "derived">) => c.body || c.derived;

/** 提案是照哪一版卡片寫的——卡片的順序、標題或內容變了，這個值就變。 */
export function bookMark(cards: BookCard[]): string {
  const h = createHash("sha1");
  for (const c of cards) h.update(`${c.id}\u0000${c.title}\u0000${effectiveBody(c)}\u0001`);
  return h.digest("hex").slice(0, 16);
}

export function proposalOf(pos: Record<string, any> | null | undefined, cards: BookCard[]) {
  const p = storedBookOf(pos).proposal;
  if (!p || !str(p.text)) return null;
  return { text: p.text, at: p.at, stale: p.mark !== bookMark(cards) };
}

/** 進品牌大腦的卡片：只有顧問寫過存下來的（整理出來的那些，原本的欄位已經會被讀到）。 */
export function bookPromptCards(pos: Record<string, any> | null | undefined): { id: string; title: string; body: string; max: number }[] {
  return bookView(pos).cards
    .filter((c) => c.body)
    .map((c) => ({ id: c.id, title: c.title, body: c.body, max: c.preset === "manifesto" ? BOOK_MANIFESTO_PROMPT_MAX : BOOK_CARD_PROMPT_MAX }));
}

const cleanTitle = (t: unknown) => [...str(t).replace(/\s+/g, " ")].slice(0, BOOK_TITLE_MAX).join("");

async function patchBook(brandId: number, userId: number, fn: (book: StoredBook, pos: Record<string, any>) => StoredBook): Promise<void> {
  await patchPositioning("brand", brandId, userId, (cur) => ({ ...cur, _book: fn({ ...storedBookOf(cur) }, cur) }));
}

/** 第一次有人動順序或加卡時，把目前畫面上的順序寫成明確的 order——之後才能在中間插入、搬動。 */
const withOrder = (book: StoredBook): StoredBook => ({ ...book, order: orderedIds(book) });

export async function loadBook(brandId: number, userId: number) {
  const pos = await loadPositioning("brand", brandId, userId);
  const view = bookView(pos);
  return { ...view, proposal: proposalOf(pos, view.cards) };
}

/** 存一張卡的內容。內容清空＝這張卡回到「還沒寫」（預設卡會再顯示整理出來的文字）。 */
export async function saveBookCard(args: {
  brandId: number; userId: number; cardId: string; body: string; title?: string;
}): Promise<void> {
  await patchBook(args.brandId, args.userId, (book) => {
    const preset = isBookPresetId(args.cardId) ? PRESET_BY_ID.get(args.cardId)! : null;
    const cards = { ...(book.cards ?? {}) };
    const prior = cards[args.cardId];
    if (!preset && !prior) throw new Error("找不到這張卡片");
    const body = clampField(str(args.body), preset?.max ?? BOOK_CUSTOM_BODY_MAX);
    const title = preset ? undefined : (cleanTitle(args.title) || str(prior?.title));
    if (preset && !body) delete cards[args.cardId];
    else cards[args.cardId] = { ...(title ? { title } : {}), body, updatedAt: new Date().toISOString() };
    return { ...book, cards };
  });
}

/** 加一張卡：帶 preset＝把拿掉的預設卡加回來；帶 title＝開一張自訂卡。回傳卡片 id。 */
export async function addBookCard(args: {
  brandId: number; userId: number; preset?: BookPresetId; title?: string;
}): Promise<string> {
  let id = "";
  await patchBook(args.brandId, args.userId, (book) => {
    const next = withOrder(book);
    if (args.preset) {
      id = args.preset;
      next.hidden = (book.hidden ?? []).filter((h) => h !== args.preset);
      if (!next.order!.includes(id)) next.order = orderedIds(next);
      return next;
    }
    const title = cleanTitle(args.title);
    if (!title) throw new Error("卡片要有標題");
    const cards = { ...(book.cards ?? {}) };
    if (Object.keys(cards).filter(isCustomId).length >= BOOK_MAX_CUSTOM_CARDS) {
      throw new Error(`自訂卡片最多 ${BOOK_MAX_CUSTOM_CARDS} 張`);
    }
    id = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    cards[id] = { title, body: "", updatedAt: new Date().toISOString() };
    next.cards = cards;
    next.order = [...next.order!, id];
    return next;
  });
  return id;
}

/** 從定位書拿掉一張卡。預設卡只是收起來（內容留著，可以加回來）；自訂卡是刪除。 */
export async function removeBookCard(args: { brandId: number; userId: number; cardId: string }): Promise<void> {
  await patchBook(args.brandId, args.userId, (book) => {
    const next = withOrder(book);
    next.order = next.order!.filter((id) => id !== args.cardId);
    if (isBookPresetId(args.cardId)) {
      next.hidden = [...new Set([...(book.hidden ?? []), args.cardId])];
    } else {
      const cards = { ...(book.cards ?? {}) };
      delete cards[args.cardId];
      next.cards = cards;
    }
    return next;
  });
}

/** 重排。只接受目前在定位書上的卡片；漏列的接在後面，不會因為前端少送一張就把卡弄丟。 */
export async function reorderBook(args: { brandId: number; userId: number; order: string[] }): Promise<void> {
  await patchBook(args.brandId, args.userId, (book) => {
    const current = orderedIds(book);
    const valid = new Set(current);
    const seen = new Set<string>();
    const order = args.order.filter((id) => valid.has(id) && !seen.has(id) && !!seen.add(id));
    for (const id of current) if (!seen.has(id)) order.push(id);
    return { ...book, order };
  });
}

export async function saveBookProposal(args: { brandId: number; userId: number; text: string; mark: string }): Promise<{ text: string; at: string }> {
  const proposal = { text: args.text, at: new Date().toISOString(), mark: args.mark };
  await patchBook(args.brandId, args.userId, (book) => ({ ...book, proposal }));
  return proposal;
}
