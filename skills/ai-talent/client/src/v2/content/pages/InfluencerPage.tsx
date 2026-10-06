/**
 * InfluencerPage — 「網紅」：一進來就是點子牆（每位網紅三個點子），設定收在彈跳視窗裡。
 *
 * 功能：選品牌／產品／活動與要講的賣點 → 從網紅庫點人、貼連結或上傳 Excel → 讀懂每一位、
 * 配一個主打賣點、照他的口吻想三個點子 → 挑一個才寫邀約信 → 整批匯出或開自己的信箱寄。
 *
 * 版面的來歷（都是 CJ 2026-10-06 實際用過後的回饋）：
 *   · 原本照靈感舞台由上往下排（標題→主體→名單→結果）。「輸入連結後，底下沒有按開始研究的按鈕」
 *     「底下太複雜，字太多」「我沒看到 Tesla UI，而且上面一直填充到下面，路徑很久…可以參考任務卡
 *     彈跳視窗的設計」→ 現在的兩層：
 *       頁面＝一條工具列＋滿版的牆。設定不在頁面上。
 *       「研究網紅」＝跟任務卡同一個樣子的視窗（taskModalStyle）：講什麼、找誰，按下去就關掉回到牆上。
 *       點卡片＝同一個樣子的視窗：三個點子的開場、選一個、邀約信、他的資料。牆上的格子不會忽大忽小。
 *   · 「我還是想要一次看到很多位，要有滿滿 IDEA 的感覺」→ 牆是主角：卡面只有名字、主打、三個標題。
 *     （提過「一次只看一位」的焦點版面，CJ 否決。）
 *   · 「現在的 DEMO 寫起來很生硬」→ 每位三個點子是模型當他本人想的；挑一個才寫信，沒被挑的不花錢。
 *   · 「都是用同一個產品特色去講」→ 賣點來自定位，看完整批再替每位配一個，卡片上標「主打」。
 *   · 「上傳過的網紅，不用重複上傳」→ 網紅庫跟著品牌存，視窗裡直接點選。
 * 規則與提示詞在 server/content/core/influencer/influencerAngles.ts、influencerUsps.ts、influencerRoster.ts。
 */
import React from "react";
import { useOutletContext } from "react-router-dom";
import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { Icon } from "../../platform/components/icons";
import { HelpTip } from "../../platform/components/HelpTip";
import { showToastGlobal } from "../../platform/components/Toast";
import { friendlyError } from "../../platform/lib/friendlyError";
import { TASK_MODAL_CLASSNAMES, TASK_MODAL_HEADER, TASK_MODAL_QUESTION } from "../../platform/components/taskModalStyle";

const INK = "#171717", META = "#6B6B6B", LINE = "#EAEAEA", SOFT = "#F6F6F5", WARN = "#B45309";
const SERIF = '"Source Serif Pro", "Noto Serif TC", Georgia, serif';
/** 同 server influencerAngles.MAX_PEOPLE／NOTES_MAX。 */
const MAX_PEOPLE = 30, NOTES_MAX = 3000;

type Subject = { kind: "brand" | "product" | "event"; id: number | null };
type Status = "draft" | "queued" | "reading" | "thinking" | "done" | "needs_material" | "invalid_link" | "failed";
interface Person {
  id: string; url: string; name?: string; email?: string; notes?: string;
  status: Status;
  /** 從網紅庫加進來、庫裡已經有他的內容（不用先貼貼文）。只在前端用。 */
  saved?: boolean;
  platform?: string | null; handle?: string | null; followers?: string | null; displayName?: string | null; source?: string;
  profile?: string; evidence?: string; format?: string; voice?: string;
  /** 配給他主打的賣點與理由。 */
  usp?: string; uspTag?: string; uspWhy?: string;
  ideas?: Idea[]; picked?: number;
  emailSubject?: string; emailBody?: string; quoteWarning?: boolean;
  /** 2026-10-06 改寫前的舊資料：一位一個切角。 */
  talkingPoints?: string[]; angle?: string; angleWhy?: string; hook?: string;
}
interface Idea { kind?: string; title: string; hook: string; productPoint?: string; why?: string; basedOn?: string }
/** 同 server influencerAngles.IDEA_KINDS。 */
const KIND_LABEL: Record<string, [string, string]> = {
  own: ["幕後", "Behind the scenes"],
  contrast: ["反差", "Contrarian"],
  method: ["方法", "Method"],
};
/** 這一位的點子；舊資料只有一個切角，當成一個已經選好的點子。 */
function ideasOf(p: Person): { ideas: Idea[]; picked: number | undefined } {
  if (p.ideas?.length) return { ideas: p.ideas, picked: p.picked };
  if (p.angle) return { ideas: [{ title: p.angle, hook: p.hook ?? "", productPoint: (p.talkingPoints ?? []).join("、"), why: p.angleWhy }], picked: 0 };
  return { ideas: [], picked: undefined };
}

const RUNNING: Status[] = ["queued", "reading", "thinking"];
const PLATFORM_NAME: Record<string, string> = {
  instagram: "Instagram", threads: "Threads", tiktok: "TikTok", facebook: "Facebook", youtube: "YouTube",
  x: "X", linkedin: "LinkedIn", podcast: "Podcast",
};
/** 伺服器讀不到的平台（同 server influencerLink.classifyLink 的 serverReadable；以伺服器為準，這裡只用來先提示）。 */
const WALLED: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/, "instagram"], [/(^|\.)threads\.(net|com)$/, "threads"], [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(facebook|fb)\.com$/, "facebook"], [/(^|\.)(x|twitter)\.com$/, "x"], [/(^|\.)linkedin\.com$/, "linkedin"],
];
/** readable：伺服器接了數據商、現在讀得到的社群平台（server influencer.readable）。 */
function isWalled(url: string, readable: string[]): boolean {
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    const platform = WALLED.find(([re]) => re.test(host))?.[1];
    return !!platform && !readable.includes(platform);
  } catch { return false; }
}
function looksLikeUrl(s: string): boolean {
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/|\?|$)/i.test(s.trim());
}
/** 判斷兩條連結是不是同一位（大小寫、結尾斜線、www、追蹤參數不算）。以伺服器的 urlKeyOf 為準，這裡只用來不重複顯示。 */
function sameKey(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return `${u.hostname.replace(/^(www|m|mobile)\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch { return url.trim().toLowerCase(); }
}
interface RosterRow { id: number; url: string; name: string | null; email: string | null; platform: string | null; handle: string | null; followers: string | null; displayName: string | null; hasMaterial: boolean; stale: boolean }
/** 還沒進網紅庫、這次新加的人（貼連結或上傳名單）。 */
interface NewPerson { url: string; name?: string; email?: string; notes?: string }

let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const labelOf = (p: { name?: string | null; displayName?: string | null; handle?: string | null }) =>
  (p.name || p.displayName || (p.handle ? `@${p.handle}` : "")).trim();

function mailtoHref(p: Person): string {
  return `mailto:${encodeURIComponent((p.email ?? "").trim()).replace(/%40/g, "@")}`
    + `?subject=${encodeURIComponent(p.emailSubject ?? "")}&body=${encodeURIComponent((p.emailBody ?? "").replace(/\n/g, "\r\n"))}`;
}
/**
 * mailto 連結太長時（Windows 交給信箱程式的網址上限約 2,000 字元；中文一個字編碼後 9 個字元），
 * 信箱會打不開或內文被切掉。超過就只帶收件人與主旨，內文改放剪貼簿讓用戶貼上。
 */
const MAILTO_MAX = 1800;
function mailtoSubjectOnly(p: Person): string {
  return `mailto:${encodeURIComponent((p.email ?? "").trim()).replace(/%40/g, "@")}?subject=${encodeURIComponent(p.emailSubject ?? "")}`;
}
function gmailHref(p: Person): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent((p.email ?? "").trim())}`
    + `&su=${encodeURIComponent(p.emailSubject ?? "")}&body=${encodeURIComponent(p.emailBody ?? "")}`;
}

function downloadBase64(base64: string, mime: string, filename: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const sameSubject = (a: Subject, b: Subject) => a.kind === b.kind && (a.id ?? null) === (b.id ?? null);
const pill = (on: boolean): React.CSSProperties => ({ borderColor: on ? INK : LINE, background: on ? INK : "#FFFFFF", color: on ? "#FFFFFF" : INK });

export default function InfluencerPage() {
  const { lang } = useLang();
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const T = trpc as any;
  const ctx = useOutletContext<{ brandId: number | null; brands: any[] } | undefined>();
  const brandId = ctx?.brandId ?? null;
  const brandName: string | null = ctx?.brands?.find((b: any) => b.id === brandId)?.name ?? null;

  const productsQ = T.product?.list?.useQuery({ brandId: brandId ?? undefined }, { enabled: !!brandId, refetchOnWindowFocus: false }) ?? { data: [] };
  const eventsQ = T.event?.list?.useQuery({ brandId: brandId ?? undefined }, { enabled: !!brandId, refetchOnWindowFocus: false }) ?? { data: [] };
  const readableQ = T.influencer.readable.useQuery(undefined, { refetchOnWindowFocus: false, staleTime: 10 * 60_000 });
  const readable: string[] = readableQ.data?.social ?? [];
  const latestQ = T.influencer.latest.useQuery({ brandId: brandId ?? 0 }, { enabled: !!brandId, refetchOnWindowFocus: false });
  const rosterQ = T.influencer.roster.useQuery({ brandId: brandId ?? 0 }, { enabled: !!brandId, refetchOnWindowFocus: false });
  const products: any[] = (productsQ.data as any[]) ?? [];
  const events: any[] = (eventsQ.data as any[]) ?? [];
  const roster: RosterRow[] = (rosterQ.data as RosterRow[] | undefined) ?? [];

  const utils = T.useUtils();
  const parseSheet = T.influencer.parseSheet.useMutation();
  const analyzeStart = T.influencer.analyzeStart.useMutation();
  const removeFromRoster = T.influencer.removeFromRoster.useMutation();
  const savePerson = T.influencer.savePerson.useMutation();
  const pickIdea = T.influencer.pickIdea.useMutation();
  const exportFile = T.influencer.exportFile.useMutation();

  // ── 牆（目前這一批）──
  const [subject, setSubject] = React.useState<Subject>({ kind: "brand", id: null });
  const [people, setPeople] = React.useState<Person[]>([]);
  const [batchId, setBatchId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  /** 正在替誰的第幾個點子寫信。 */
  const [picking, setPicking] = React.useState<Record<string, number>>({});
  /** 打開哪一位的視窗、先展開第幾個點子。 */
  const [detail, setDetail] = React.useState<{ id: string; idea: number | null } | null>(null);

  // ── 「研究網紅」視窗 ──
  const [setupOpen, setSetupOpen] = React.useState(false);
  /** 視窗裡選的主體。視窗關著的時候永遠等於牆的主體（賣點清單跟著它查）。 */
  const [draft, setDraft] = React.useState<Subject>({ kind: "brand", id: null });
  const [sel, setSel] = React.useState<number[]>([]);
  const [extra, setExtra] = React.useState<NewPerson[]>([]);
  const [paste, setPaste] = React.useState("");
  const [direction, setDirection] = React.useState("");
  const [uspOpen, setUspOpen] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [rosterEdit, setRosterEdit] = React.useState(false);
  /** 定位裡的賣點被取消勾選的、用戶自己加的。換主體就重來。 */
  const [uspOff, setUspOff] = React.useState<string[]>([]);
  const [uspCustom, setUspCustom] = React.useState<string[]>([]);
  const [uspDraft, setUspDraft] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const uspsQ = T.influencer.usps.useQuery(
    { brandId: brandId ?? 0, subject: draft },
    { enabled: !!brandId && (draft.kind === "brand" || !!draft.id), refetchOnWindowFocus: false, staleTime: 60_000 },
  );

  /** 換品牌、離開頁面、開新一輪時遞增——舊的輪詢看到號碼變了就停。 */
  const runSeq = React.useRef(0);
  React.useEffect(() => () => { runSeq.current++; }, []);

  const poll = React.useCallback(async (jobId: string, seqNo: number) => {
    let misses = 0;
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      if (runSeq.current !== seqNo) return;
      const r = await utils.influencer.analyzePoll.fetch({ jobId }, { staleTime: 0 }).catch(() => null);
      if (runSeq.current !== seqNo) return;
      if (!r) { if (++misses > 5) break; continue; }
      misses = 0;
      if (r.lost) break;
      setPeople(r.people as Person[]);
      if (r.done) { setBusy(false); void rosterQ.refetch(); return; }
    }
    // 伺服器重啟或斷線：改讀存下來的那一批。
    const saved = (await latestQ.refetch().catch(() => null))?.data;
    if (runSeq.current !== seqNo) return;
    if (saved) setPeople(saved.people as Person[]);
    setBusy(false);
  }, [utils, latestQ, rosterQ]);

  const busyRef = React.useRef(false);
  busyRef.current = busy;
  /** 已經套用過哪一次 latest（品牌＋資料時間）。 */
  const appliedKey = React.useRef<string | null>(null);
  // 換品牌：清空，等 latest 回來。
  React.useEffect(() => {
    runSeq.current++;
    appliedKey.current = null;
    const none: Subject = { kind: "brand", id: null };
    setPeople([]); setBatchId(null); setSubject(none); setDraft(none); setBusy(false);
    setSetupOpen(false); setDetail(null); setSel([]); setExtra([]); setPaste(""); setDirection("");
  }, [brandId]);
  // 載入這個品牌最近一批。正在研究的時候以輪詢為準，不套用。
  React.useEffect(() => {
    if (!brandId || latestQ.isLoading) return;
    const key = `${brandId}:${latestQ.dataUpdatedAt}`;
    if (appliedKey.current === key) return;
    appliedKey.current = key;
    const d = latestQ.data;
    if (!d || busyRef.current) return;
    setPeople(d.people as Person[]); setBatchId(d.batchId); setSubject(d.subject as Subject);
    if (!setupOpen) setDraft(d.subject as Subject);
    if (d.jobId) { setBusy(true); void poll(d.jobId, ++runSeq.current); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestQ.data, latestQ.dataUpdatedAt, latestQ.isLoading, brandId]);

  // ── 賣點 ──
  const uspList: Array<{ text: string; from?: string }> = uspsQ.data?.usps ?? [];
  const uspMax: number = uspsQ.data?.max ?? 8;
  const draftKey = `${brandId}:${draft.kind}:${draft.id ?? ""}`;
  React.useEffect(() => { setUspOff([]); setUspCustom([]); setUspDraft(""); }, [draftKey]);
  // 牆上的人有、定位清單裡沒有的賣點＝當時用戶自己加的，補回清單（不然重新研究會少掉它）。只在視窗的主體就是牆的主體時補。
  React.useEffect(() => {
    if (!uspsQ.data || !sameSubject(draft, subject)) return;
    const known = new Set([...uspList.map((u) => u.text), ...uspCustom]);
    const more = Array.from(new Set(people.map((p) => p.usp).filter((u): u is string => !!u && !known.has(u))));
    if (more.length) setUspCustom((cur) => [...cur, ...more].slice(0, uspMax));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, uspsQ.data, draftKey]);
  const uspSelected = [...uspList.map((u) => u.text).filter((t) => !uspOff.includes(t)), ...uspCustom].slice(0, uspMax);
  const addUsp = () => {
    const text = uspDraft.replace(/\s+/g, " ").trim().slice(0, 120);
    if (text.length < 2) return;
    if (uspSelected.length >= uspMax) { showToastGlobal(L(`最多 ${uspMax} 個賣點。`, `Up to ${uspMax} selling points.`), "error"); return; }
    if (![...uspList.map((u) => u.text), ...uspCustom].includes(text)) setUspCustom((cur) => [...cur, text]);
    setUspOff((cur) => cur.filter((t) => t !== text));
    setUspDraft("");
  };

  const nameOfSubject = (s: Subject) => (s.kind === "product" ? products.find((p) => p.id === s.id)?.name
    : s.kind === "event" ? events.find((e) => e.id === s.id)?.name : null) ?? brandName ?? L("品牌", "Brand");

  const patch = (id: string, v: Partial<Person>) => setPeople((cur) => cur.map((p) => (p.id === id ? { ...p, ...v } : p)));

  /** 送去研究。where：這一批是哪個主體、接在哪一批後面（預設＝牆上這一批）。 */
  const run = async (ids: string[], list: Person[], refresh = false, where: { subject: Subject; batchId: number | null } = { subject, batchId }) => {
    if (!brandId || busy) return;
    const targets = list.filter((p) => ids.includes(p.id));
    if (!targets.length) return;
    const seqNo = ++runSeq.current;
    setBusy(true);
    setPeople(list.map((p) => (ids.includes(p.id) ? { ...p, status: "queued" } : p)));
    try {
      const r = await analyzeStart.mutateAsync({
        brandId, subject: where.subject, direction: direction.trim() || undefined, batchId: where.batchId ?? undefined, usps: uspSelected, refresh,
        people: targets.map((p) => ({ id: p.id, url: p.url, name: p.name?.trim() || undefined, email: p.email?.trim() || undefined, notes: p.notes?.trim().slice(0, NOTES_MAX) || undefined })),
      });
      setBatchId(r.batchId);
      void poll(r.jobId, seqNo);
    } catch (e) {
      setBusy(false);
      setPeople(list);
      showToastGlobal(friendlyError(e, L("沒有開始，請再試一次。", "Couldn't start. Try again.")), "error");
    }
  };

  // ── 視窗：找誰 ──
  /** 視窗的主體就是牆的主體＝接在這一批後面；換了主體＝開新的一批。 */
  const extend = batchId !== null && sameSubject(draft, subject);
  const onWall = new Set((extend ? people : []).map((p) => sameKey(p.url)));
  const room = MAX_PEOPLE - (extend ? people.length : 0);
  const pastedUrls = React.useMemo(() => {
    const out: string[] = [];
    for (const raw of paste.split(/[\n,，\s]+/)) {
      const url = raw.trim();
      if (url && looksLikeUrl(url) && !out.some((u) => sameKey(u) === sameKey(url))) out.push(url);
    }
    return out;
  }, [paste]);
  /** 這次要研究的人：網紅庫勾的＋上傳的＋貼的；去掉重複與已經在牆上的。 */
  const chosen = React.useMemo(() => {
    const seen = new Set(onWall);
    const out: Array<NewPerson & Partial<Person>> = [];
    const push = (x: NewPerson & Partial<Person>) => {
      const k = sameKey(x.url);
      if (seen.has(k) || out.length >= room) return;
      seen.add(k); out.push(x);
    };
    for (const r of roster) {
      if (sel.includes(r.id)) push({ url: r.url, name: r.name ?? undefined, email: r.email ?? undefined, saved: r.hasMaterial, platform: r.platform, handle: r.handle, followers: r.followers, displayName: r.displayName });
    }
    for (const x of extra) push(x);
    for (const url of pastedUrls) push({ url });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, sel, extra, pastedUrls, room, extend, people]);

  const openSetup = () => { setDraft(subject); setSel([]); setExtra([]); setPaste(""); setUspOpen(false); setRosterEdit(false); setSetupOpen(true); };
  const closeSetup = () => { setSetupOpen(false); setDraft(subject); };

  const onFile = async (file: File | undefined) => {
    if (!file || !brandId) return;
    if (file.size > 2 * 1024 * 1024) { showToastGlobal(L("名單檔太大了（上限 2MB）。", "That file is too large (2MB max)."), "error"); return; }
    try {
      const r = await parseSheet.mutateAsync({ brandId, filename: file.name, contentBase64: await fileToBase64(file) });
      if (!r.people.length) { showToastGlobal(L("這個檔案裡沒有找到連結。", "No links found in that file."), "error"); return; }
      setExtra((cur) => [...cur, ...(r.people as NewPerson[]).filter((x) => !cur.some((c) => sameKey(c.url) === sameKey(x.url)))]);
      showToastGlobal([
        L(`讀到 ${r.people.length} 位`, `Found ${r.people.length}`),
        r.skipped ? L(`${r.skipped} 列沒有連結已略過`, `${r.skipped} rows without a link skipped`) : "",
        r.truncated ? L(`超過 ${MAX_PEOPLE} 位的 ${r.truncated} 位沒有加進來`, `${r.truncated} over the ${MAX_PEOPLE} limit left out`) : "",
      ].filter(Boolean).join(L("，", ", ")));
    } catch (e) {
      showToastGlobal(friendlyError(e, L("名單讀不出來，請確認是 .xlsx 或 .csv。", "Couldn't read that file. Use .xlsx or .csv.")), "error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const startResearch = () => {
    if (draft.kind !== "brand" && !draft.id) { showToastGlobal(L("請先選一個產品或活動。", "Pick a product or campaign first."), "error"); return; }
    if (!chosen.length) {
      showToastGlobal(paste.trim()
        ? L("沒有看到新的連結。請貼上網紅的主頁網址。", "No new links found. Paste a profile URL.")
        : L("先選幾位網紅，或貼上連結。", "Pick a few creators or paste a link first."), "error");
      return;
    }
    const fresh: Person[] = chosen.map((x) => ({ ...x, id: newId(), status: "draft" }));
    const list = [...(extend ? people : []), ...fresh];
    const where = { subject: draft, batchId: extend ? batchId : null };
    setSubject(draft);
    if (!extend) setBatchId(null);
    setSetupOpen(false);
    setSel([]); setExtra([]); setPaste("");
    void run(fresh.map((p) => p.id), list, false, where);
  };

  const dropFromRoster = async (r: RosterRow) => {
    if (!brandId) return;
    try { await removeFromRoster.mutateAsync({ brandId, id: r.id }); setSel((cur) => cur.filter((x) => x !== r.id)); await rosterQ.refetch(); }
    catch (e) { showToastGlobal(friendlyError(e, L("沒有移除，請再試一次。", "Couldn't remove. Try again.")), "error"); }
  };

  // ── 單一位 ──
  /** 用戶改了名字、Email 或邀約信：存回這一批（匯出才會是改過的版本）。 */
  const persist = (p: Person) => {
    if (!brandId || !batchId || p.status === "draft") return;
    savePerson.mutate({
      brandId, batchId, id: p.id, name: p.name ?? "", email: p.email ?? "",
      ...(p.emailBody ? { emailSubject: p.emailSubject ?? "", emailBody: p.emailBody } : {}),
    });
  };
  /** 挑一個點子：這時才寫那封邀約信。 */
  const pick = async (p: Person, index: number) => {
    if (!brandId || !batchId || picking[p.id] !== undefined) return;
    setPicking((cur) => ({ ...cur, [p.id]: index }));
    try {
      const r = await pickIdea.mutateAsync({ brandId, batchId, id: p.id, index });
      patch(p.id, r);
    } catch (e) {
      showToastGlobal(friendlyError(e, L("這封信沒寫成，請再選一次。", "The email didn't finish. Pick again.")), "error");
    } finally {
      setPicking((cur) => { const next = { ...cur }; delete next[p.id]; return next; });
    }
  };
  const doExport = async (format: "xlsx" | "docx") => {
    if (!brandId || !batchId) return;
    try {
      const r = await exportFile.mutateAsync({ brandId, batchId, format });
      downloadBase64(r.base64, r.mime, r.filename);
    } catch (e) {
      showToastGlobal(friendlyError(e, L("匯出失敗，請再試一次。", "Export failed. Try again.")), "error");
    }
  };
  const copy = async (text: string, okMessage?: string) => {
    try { await navigator.clipboard.writeText(text); showToastGlobal(okMessage ?? L("已複製。", "Copied.")); }
    catch { showToastGlobal(L("複製失敗，請手動選取。", "Couldn't copy. Select the text manually."), "error"); }
  };

  const doneCount = people.filter((p) => p.status === "done").length;
  const ideaCount = people.reduce((n, p) => n + (p.status === "done" ? ideasOf(p).ideas.length : 0), 0);
  const runningCount = people.filter((p) => RUNNING.includes(p.status)).length;
  const detailPerson = detail ? people.find((p) => p.id === detail.id) ?? null : null;

  if (!brandId) {
    return <p className="m-0 py-24 text-center text-[14px]" style={{ color: META }}>{L("請先選一個品牌。", "Pick a brand first.")}</p>;
  }

  const subjectPills: Array<{ s: Subject; label: string }> = [
    { s: { kind: "brand", id: null }, label: L("品牌本身", "The brand") },
    ...products.map((p: any) => ({ s: { kind: "product" as const, id: Number(p.id) }, label: String(p.name) })),
    ...events.map((e: any) => ({ s: { kind: "event" as const, id: Number(e.id) }, label: String(e.name) })),
  ];
  const tag = "rounded-full px-2.5 py-1 text-[12px]";

  return (
    <div className="min-h-full">
      {/* ── 工具列：這一頁唯一的常駐控制 ── */}
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-2 px-6 pb-3 pt-6">
        <h1 className="m-0 mr-1 text-[20px] font-semibold tracking-tight" style={{ color: INK }}>{L("網紅", "Creators")}</h1>
        {people.length > 0 && (
          <>
            <span className={tag} style={{ background: SOFT, color: INK }}>{nameOfSubject(subject)}</span>
            <span className={tag} style={{ background: SOFT, color: META }}>
              {L(`${doneCount} 位・${ideaCount} 個點子`, `${doneCount} creators · ${ideaCount} ideas`)}
            </span>
          </>
        )}
        {busy && (
          <span className={`${tag} flex items-center gap-1.5`} style={{ color: META }} aria-live="polite">
            <Icon name="working" size={11} className="animate-spin" />
            {runningCount ? L(`研究中，還有 ${runningCount} 位`, `Researching — ${runningCount} to go`) : L("研究中…", "Researching…")}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {doneCount > 0 && (
            <>
              <Button size="sm" variant="light" isDisabled={busy} isLoading={exportFile.isPending && exportFile.variables?.format === "xlsx"}
                onPress={() => doExport("xlsx")} startContent={<Icon name="download" size={12} />}>Excel</Button>
              <Button size="sm" variant="light" isDisabled={busy} isLoading={exportFile.isPending && exportFile.variables?.format === "docx"}
                onPress={() => doExport("docx")} startContent={<Icon name="download" size={12} />}>Word</Button>
            </>
          )}
          <Button color="primary" onPress={openSetup} isDisabled={busy} startContent={<Icon name="add" size={12} />}>
            {L("研究網紅", "Research creators")}
          </Button>
        </div>
      </div>

      {/* ── 牆 ── */}
      <div className="mx-auto max-w-[1600px] px-6 pb-12">
        {people.length > 0 ? (
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(236px, 1fr))" }}>
            {people.map((p) => (
              <WallTile key={p.id} p={p} en={en} readable={readable} onOpen={(idea) => setDetail({ id: p.id, idea })} />
            ))}
          </div>
        ) : !latestQ.isLoading && (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="m-0 max-w-[420px] text-[22px] font-semibold leading-snug" style={{ color: INK }}>
              {L("每位網紅三個點子，一次看一整面牆", "Three ideas per creator, a whole wall at a glance")}
            </p>
            <p className="m-0 max-w-[420px] text-[14px] leading-relaxed" style={{ color: META }}>
              {roster.length
                ? L(`網紅庫裡有 ${roster.length} 位，點一下就能開始。`, `${roster.length} saved creators are ready to go.`)
                : L("貼上網紅的連結，我們照他的口吻替你想。", "Paste a creator's link and we'll pitch in their voice.")}
            </p>
            <Button color="primary" size="lg" onPress={openSetup} startContent={<Icon name="add" size={13} />}>{L("研究網紅", "Research creators")}</Button>
          </div>
        )}
      </div>

      {/* ── 研究網紅（跟任務卡同一個樣子的視窗）── */}
      <Modal isOpen={setupOpen} onClose={closeSetup} size="2xl" scrollBehavior="inside" backdrop="blur" classNames={TASK_MODAL_CLASSNAMES}>
        <ModalContent>
          <ModalHeader className={TASK_MODAL_HEADER}>
            <p className={TASK_MODAL_QUESTION}>{L("這次想請誰講什麼？", "Who should say what?")}</p>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-5">
            {/* 講什麼 */}
            <div className="flex flex-col gap-2">
              <p className="m-0 text-[12px]" style={{ color: META }}>{L("講什麼", "About")}</p>
              <div className="flex max-h-[104px] flex-wrap gap-2 overflow-y-auto">
                {subjectPills.map(({ s, label }) => (
                  <button key={`${s.kind}:${s.id ?? ""}`} type="button" onClick={() => setDraft(s)} aria-pressed={sameSubject(draft, s)}
                    className="max-w-[260px] truncate rounded-full border px-3.5 py-1.5 text-[13px] transition" style={pill(sameSubject(draft, s))}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setUspOpen((v) => !v)} aria-expanded={uspOpen}
                  className="flex items-center gap-1.5 text-[12.5px] underline underline-offset-2" style={{ color: META }}>
                  {uspSelected.length
                    ? L(`${uspSelected.length} 個賣點，每位配一個`, `${uspSelected.length} selling points, one per creator`)
                    : L("沒有賣點（每位不分配）", "No selling points (none assigned)")}
                  <Icon name="chevronRight" size={9} className={uspOpen ? "-rotate-90" : "rotate-90"} />
                </button>
                <HelpTip>
                  {L("賣點來自你的定位。我們會看完整批名單，替每一位配一個最適合由他來講的，卡片上會標出來。",
                    "Selling points come from your positioning. We look at the whole list and give each creator the one they can carry best — it's tagged on their card.")}
                </HelpTip>
              </div>
              {uspOpen && (
                <div className="flex flex-col gap-2 rounded-2xl p-3" style={{ background: SOFT }}>
                  <div className="flex flex-wrap gap-2">
                    {[...uspList, ...uspCustom.map((text) => ({ text, from: L("自己加的", "Added by you") }))].map((u) => {
                      const on = uspSelected.includes(u.text);
                      const mine = uspCustom.includes(u.text);
                      return (
                        <button key={u.text} type="button" aria-pressed={on} title={u.from ? `${u.from}｜${u.text}` : u.text}
                          onClick={() => (mine
                            ? setUspCustom((cur) => cur.filter((t) => t !== u.text))
                            : setUspOff((cur) => (cur.includes(u.text) ? cur.filter((t) => t !== u.text) : [...cur, u.text])))}
                          className="flex max-w-full items-start gap-1.5 rounded-2xl border bg-white px-3 py-1.5 text-left text-[12.5px] leading-snug transition"
                          style={{ borderColor: on ? INK : LINE, color: on ? INK : META }}>
                          <span className="mt-[3px] shrink-0"><Icon name={on ? "check" : "add"} size={9} /></span>
                          <span className="line-clamp-2">{u.text}</span>
                          {mine && <span className="mt-[3px] shrink-0"><Icon name="close" size={8} /></span>}
                        </button>
                      );
                    })}
                    {uspList.length + uspCustom.length === 0 && !uspsQ.isLoading && (
                      <p className="m-0 text-[12.5px]" style={{ color: META }}>{L("定位裡還沒有寫賣點，可以在下面自己加。", "Your positioning has no selling points yet — add some below.")}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input value={uspDraft} onChange={(e) => setUspDraft(e.target.value.slice(0, 120))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUsp(); } }}
                      placeholder={L("自己加一個賣點", "Add a selling point")} aria-label={L("自己加一個賣點", "Add a selling point")}
                      className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-1.5 text-[13px] outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
                    <Button size="sm" variant="flat" onPress={addUsp} isDisabled={uspDraft.trim().length < 2}>{L("加入", "Add")}</Button>
                  </div>
                </div>
              )}
            </div>

            {/* 找誰 */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <p className="m-0 text-[12px]" style={{ color: META }}>{L("找誰", "Who")}</p>
                {roster.length > 0 && (
                  <>
                    {!rosterEdit && roster.some((r) => !onWall.has(sameKey(r.url)) && !sel.includes(r.id)) && (
                      <button type="button" className="text-[12.5px] underline underline-offset-2" style={{ color: META }}
                        onClick={() => setSel(roster.filter((r) => !onWall.has(sameKey(r.url))).map((r) => r.id))}>{L("全選", "Select all")}</button>
                    )}
                    <button type="button" onClick={() => setRosterEdit((v) => !v)} className="ml-auto text-[12.5px] underline underline-offset-2" style={{ color: META }}>
                      {rosterEdit ? L("完成", "Done") : L("整理網紅庫", "Manage saved")}
                    </button>
                  </>
                )}
              </div>
              {roster.length > 0 && (
                <div className="flex max-h-[148px] flex-wrap gap-2 overflow-y-auto">
                  {roster.filter((r) => rosterEdit || !onWall.has(sameKey(r.url))).map((r) => {
                    const here = onWall.has(sameKey(r.url));
                    const on = sel.includes(r.id);
                    return (
                      <button key={r.id} type="button" title={r.url} disabled={!rosterEdit && here} aria-pressed={on}
                        onClick={() => (rosterEdit ? void dropFromRoster(r) : setSel((cur) => (on ? cur.filter((x) => x !== r.id) : [...cur, r.id])))}
                        className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition disabled:opacity-45"
                        style={{ borderColor: on && !rosterEdit ? INK : LINE, background: on && !rosterEdit ? SOFT : "#FFFFFF", color: INK }}>
                        <Icon name={rosterEdit ? "close" : on || here ? "check" : "add"} size={9} color={META} />
                        <span className="max-w-[160px] truncate">{labelOf(r) || shortUrl(r.url)}</span>
                        {r.platform && <span className="text-[11.5px]" style={{ color: META }}>{PLATFORM_NAME[r.platform] ?? (r.platform === "web" ? L("網站", "Web") : r.platform)}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {!rosterEdit && roster.length > 0 && roster.every((r) => onWall.has(sameKey(r.url))) && (
                <p className="m-0 text-[12.5px]" style={{ color: META }}>{L("網紅庫裡的人都已經在牆上了。貼上新的連結，或換一個要講的東西。", "Everyone saved is already on the wall. Paste a new link, or pick a different subject.")}</p>
              )}
              {rosterEdit && <p className="m-0 text-[12px]" style={{ color: META }}>{L("點一下就從網紅庫移除（之前的研究結果不受影響）。", "Tap to remove from saved creators (past results aren't affected).")}</p>}
              {extra.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {extra.map((x) => (
                    <button key={x.url} type="button" title={x.url} onClick={() => setExtra((cur) => cur.filter((c) => c.url !== x.url))}
                      className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px]" style={{ borderColor: INK, background: SOFT, color: INK }}>
                      <span className="max-w-[180px] truncate">{x.name || shortUrl(x.url)}</span>
                      <Icon name="close" size={8} color={META} />
                    </button>
                  ))}
                </div>
              )}
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={2}
                placeholder={L("貼上新的網紅連結，一行一位", "Paste new profile links, one per line")}
                aria-label={L("貼上新的網紅連結", "Paste new profile links")}
                className="rounded-2xl border px-4 py-3 text-[14px] outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
              <div className="flex flex-wrap items-center gap-4">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={parseSheet.isPending}
                  className="flex items-center gap-1.5 text-[12.5px] underline underline-offset-2 disabled:opacity-40" style={{ color: META }}>
                  <Icon name={parseSheet.isPending ? "working" : "upload"} size={11} className={parseSheet.isPending ? "animate-spin" : undefined} />
                  {L("上傳 Excel 名單", "Upload an Excel list")}
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}
                  className="text-[12.5px] underline underline-offset-2" style={{ color: META }}>
                  {L("補充合作方向", "Add a direction")}
                </button>
              </div>
              {moreOpen && (
                <input value={direction} onChange={(e) => setDirection(e.target.value.slice(0, 160))}
                  placeholder={L("例如：想主打送禮情境、希望以短影音為主", "e.g. lean on gifting, short video preferred")}
                  aria-label={L("合作方向", "Direction")}
                  className="rounded-2xl border px-4 py-2.5 text-[14px] outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
              )}
            </div>
          </ModalBody>
          <ModalFooter className="flex items-center gap-3">
            <span className="mr-auto text-[12.5px]" style={{ color: META }}>
              {!extend && people.length > 0 && !sameSubject(draft, subject)
                ? L("換了要講的東西，牆會換成新的一批。原本那一批要留的話請先匯出。", "Different subject: the wall starts a new batch. Export the current one first if you need it.")
                : room <= 0 ? L(`這一批已經滿 ${MAX_PEOPLE} 位。`, `This batch is full (${MAX_PEOPLE}).`) : ""}
            </span>
            <Button color="primary" onPress={startResearch} isDisabled={!chosen.length} startContent={<Icon name="play" size={12} />}>
              {chosen.length ? L(`開始研究 ${chosen.length} 位`, `Research ${chosen.length}`) : L("開始研究", "Research")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── 單一位（同一個樣子的視窗）── */}
      {detailPerson && (
        <PersonModal p={detailPerson} en={en} busy={busy} readable={readable} startIdea={detail!.idea} pickingIndex={picking[detailPerson.id]}
          onClose={() => setDetail(null)}
          onPatch={(v) => patch(detailPerson.id, v)}
          onBlurSave={() => persist(detailPerson)}
          onPick={(i) => pick(detailPerson, i)}
          onCopy={copy}
          onRun={(refresh) => { setDetail(null); void run([detailPerson.id], people, refresh); }}
          onRemove={() => { setDetail(null); setPeople((cur) => cur.filter((x) => x.id !== detailPerson.id)); }} />
      )}
    </div>
  );
}

function statusText(p: Person, en: boolean, readable: string[]): { text: string; warn: boolean } | null {
  const L = (zh: string, e: string) => (en ? e : zh);
  const needPosts = !p.saved && isWalled(p.url, readable) && !(p.notes ?? "").trim();
  switch (p.status) {
    case "queued": return { text: L("排隊中…", "Queued…"), warn: false };
    case "reading": return { text: L("正在讀他的內容…", "Reading their content…"), warn: false };
    case "thinking": return { text: L("正在想他會怎麼做…", "Working out what they'd make…"), warn: false };
    case "needs_material": return { text: L("資料不足，點開貼上他的幾則貼文。", "Not enough to go on. Open to paste a few posts."), warn: true };
    case "invalid_link": return { text: L("連結無法辨識。", "We couldn't recognise this link."), warn: true };
    case "failed": return { text: L("沒研究成，點開再試一次。", "Didn't finish. Open to try again."), warn: true };
    case "draft": return needPosts
      ? { text: L("這個平台讀不到，點開貼上他的貼文。", "We can't read this platform. Open to paste their posts."), warn: true }
      : { text: L("還沒研究", "Not researched yet"), warn: false };
    default: return null;
  }
}

/** 牆上的一格：名字、主打、三個點子的標題。其他都在點開的視窗裡。 */
function WallTile({ p, en, readable, onOpen }: { p: Person; en: boolean; readable: string[]; onOpen: (idea: number | null) => void }) {
  const running = RUNNING.includes(p.status);
  const { ideas, picked } = ideasOf(p);
  const st = statusText(p, en, readable);
  const name = labelOf(p) || shortUrl(p.url);
  return (
    <article className="flex flex-col rounded-2xl border bg-white px-3.5 pb-1.5 pt-3 transition hover:border-neutral-400"
      style={{ borderColor: LINE, borderStyle: running ? "dashed" : "solid" }}>
      <button type="button" onClick={() => onOpen(null)} className="flex flex-col gap-0.5 pb-2 text-left" title={p.url}>
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12.5px] font-semibold" style={{ color: INK }}>{name}</span>
          {p.followers && <span className="shrink-0 text-[11px]" style={{ color: META }}>{p.followers}</span>}
        </span>
        {p.usp && <span className="truncate text-[11.5px]" style={{ color: META }} title={p.usp}>{p.uspTag || p.usp}</span>}
      </button>
      {p.status === "done" ? ideas.map((idea, i) => (
        <button key={i} type="button" onClick={() => onOpen(i)}
          className="flex items-start gap-1.5 border-t py-2 text-left transition hover:bg-neutral-50" style={{ borderColor: LINE }}>
          {picked === i && <span className="mt-[5px] shrink-0" style={{ color: INK }}><Icon name="check" size={9} /></span>}
          <span className="text-[14px] leading-snug" style={{ color: INK, fontWeight: picked === i ? 700 : 600 }}>{idea.title}</span>
        </button>
      )) : (
        <button type="button" onClick={() => onOpen(null)} disabled={running}
          className="flex items-start gap-1.5 border-t py-3 text-left text-[12.5px] leading-relaxed" style={{ borderColor: LINE, color: st?.warn ? WARN : META }} aria-live="polite">
          {running ? <Icon name="working" size={11} className="mt-[3px] animate-spin" /> : st?.warn ? <Icon name="warning" size={11} className="mt-[3px]" /> : null}
          <span>{st?.text}</span>
        </button>
      )}
    </article>
  );
}

/** 點開一位：三個點子的開場、選一個、邀約信、他的資料。 */
function PersonModal({ p, en, busy, readable, startIdea, pickingIndex, onClose, onPatch, onBlurSave, onPick, onCopy, onRun, onRemove }: {
  p: Person; en: boolean; busy: boolean; readable: string[];
  /** 從牆上點了第幾個點子進來（null＝點名字進來）。 */
  startIdea: number | null;
  /** 正在替第幾個點子寫信（沒有＝undefined）。 */
  pickingIndex: number | undefined;
  onClose: () => void;
  onPatch: (v: Partial<Person>) => void; onBlurSave: () => void; onPick: (index: number) => void;
  onCopy: (t: string, okMessage?: string) => void;
  /** refresh＝不用網紅庫裡存的內容，重讀他的連結。 */
  onRun: (refresh: boolean) => void;
  onRemove: () => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const running = RUNNING.includes(p.status);
  const done = p.status === "done";
  const { ideas, picked } = ideasOf(p);
  const [peek, setPeek] = React.useState<number | null>(startIdea ?? picked ?? null);
  const [more, setMore] = React.useState(false);
  const chosen = picked !== undefined ? ideas[picked] : undefined;
  const hasEmail = !!p.emailBody && chosen !== undefined;
  const writing = pickingIndex !== undefined;
  const st = statusText(p, en, readable);
  const platform = p.platform ? (PLATFORM_NAME[p.platform] ?? (p.platform === "web" ? L("網站", "Website") : p.platform)) : null;
  const mailLong = mailtoHref(p).length > MAILTO_MAX;
  const field = "rounded-xl border px-3 py-2 text-[13px] outline-none focus:border-neutral-900";
  const label = "text-[11.5px] font-semibold tracking-wide";

  return (
    <Modal isOpen onClose={onClose} size="2xl" scrollBehavior="inside" backdrop="blur" classNames={TASK_MODAL_CLASSNAMES}>
      <ModalContent>
        <ModalHeader className={TASK_MODAL_HEADER}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <a href={p.url} target="_blank" rel="noreferrer noopener" title={p.url} className="truncate text-[17px] font-bold text-neutral-900 hover:underline">
              {labelOf(p) || shortUrl(p.url)}
            </a>
            {platform && <span className="rounded-full px-2 py-0.5 text-[11.5px] font-normal" style={{ background: SOFT, color: META }}>{platform}</span>}
            {p.followers && <span className="text-[12px] font-normal" style={{ color: META }}>{p.followers}</span>}
          </div>
          {p.usp && (
            <p className="m-0 mt-1.5 flex items-start gap-2 text-[12.5px] font-normal leading-snug">
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: INK, color: "#FFFFFF" }}>{L("主打", "Leads with")}</span>
              <span style={{ color: INK }}>{p.usp}</span>
            </p>
          )}
        </ModalHeader>
        <ModalBody className="flex flex-col gap-4">
          {!done && st && (
            <p className="m-0 flex items-start gap-1.5 text-[13px] leading-relaxed" style={{ color: st.warn ? WARN : META }} aria-live="polite">
              {running ? <Icon name="working" size={12} className="mt-0.5 animate-spin" /> : st.warn ? <Icon name="warning" size={12} className="mt-0.5" /> : null}
              <span>{st.text}</span>
            </p>
          )}
          {!done && !running && (
            <>
              <textarea value={p.notes ?? ""} onChange={(e) => onPatch({ notes: e.target.value.slice(0, NOTES_MAX) })} rows={5}
                aria-label={L("他的貼文", "Their posts")}
                placeholder={L("貼上他最近 3–5 則貼文的文字（讀得到連結的可以不貼）", "Paste the text of 3–5 recent posts (optional if we can read the link)")}
                className="rounded-2xl border px-4 py-3 text-[13.5px] leading-relaxed outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
              <div><Button color="primary" onPress={() => onRun(false)} isDisabled={busy}>{p.status === "draft" ? L("研究這一位", "Research this one") : L("再試一次", "Try again")}</Button></div>
            </>
          )}

          {done && (
            <div className="flex flex-col" role="list" aria-label={L("三個點子", "Three ideas")}>
              {ideas.map((idea, i) => {
                const on = picked === i;
                const busyHere = pickingIndex === i;
                const shown = peek === i || busyHere;
                const kind = idea.kind ? KIND_LABEL[idea.kind] : undefined;
                return (
                  <div key={i} role="listitem" className="border-t first:border-t-0" style={{ borderColor: LINE }}>
                    <button type="button" onClick={() => setPeek(shown ? null : i)} aria-expanded={shown} className="flex w-full items-start gap-2.5 py-3 text-left">
                      <span className="mt-[6px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full"
                        style={{ background: on ? INK : "transparent", border: on ? "none" : `1px solid ${LINE}`, color: "#FFFFFF" }}>
                        {on && <Icon name="check" size={8} />}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[17px] leading-snug" style={{ color: INK, fontWeight: on ? 700 : 600 }}>{idea.title}</span>
                        {kind && <span className="text-[11.5px]" style={{ color: META }}>{en ? kind[1] : kind[0]}</span>}
                      </span>
                    </button>
                    {shown && (
                      <div className="flex flex-col gap-2 pb-4 pl-[25px]">
                        {idea.hook && <p className="m-0 text-[14.5px] leading-relaxed" style={{ color: INK, fontFamily: SERIF }}>「{idea.hook}」</p>}
                        {(idea.productPoint || idea.why) && (
                          <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: META }}>
                            {[idea.productPoint ? `${L("會帶到：", "Brings in: ")}${idea.productPoint}` : "", idea.why ? `${L("觀眾為什麼會看：", "Why watch: ")}${idea.why}` : ""].filter(Boolean).join("　")}
                          </p>
                        )}
                        {busyHere ? (
                          <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: META }} aria-live="polite">
                            <Icon name="working" size={11} className="animate-spin" /> {L("正在寫邀約信…", "Writing the outreach email…")}
                          </span>
                        ) : !on && !!p.ideas?.length && (
                          <div>
                            <Button size="sm" color="primary" onPress={() => onPick(i)} isDisabled={writing}>
                              {hasEmail ? L("改選這個，重寫邀約信", "Switch to this one") : L("選這個，寫邀約信", "Pick this, write the email")}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {done && hasEmail && (
            <div className="flex flex-col gap-2 rounded-2xl p-4" style={{ background: SOFT }}>
              <span className={label} style={{ color: META }}>{L("邀約信", "Outreach email")}</span>
              {p.quoteWarning && (
                <p className="m-0 flex items-start gap-1.5 text-[12.5px] leading-relaxed" style={{ color: WARN }}>
                  <Icon name="warning" size={12} className="mt-0.5" />
                  <span>{L("信裡有一句引用查不到出處，寄出前請核對。", "The email quotes a line we couldn't trace. Check before sending.")}</span>
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input value={p.name ?? ""} onChange={(e) => onPatch({ name: e.target.value.slice(0, 60) })} onBlur={onBlurSave}
                  placeholder={L("怎麼稱呼他", "Name")} aria-label={L("名字", "Name")} className={`${field} bg-white`} style={{ borderColor: LINE }} />
                <input value={p.email ?? ""} onChange={(e) => onPatch({ email: e.target.value.slice(0, 160) })} onBlur={onBlurSave}
                  placeholder={L("他的 Email", "Their email")} aria-label="Email" type="email" className={`${field} bg-white`} style={{ borderColor: LINE }} />
              </div>
              <input value={p.emailSubject ?? ""} onChange={(e) => onPatch({ emailSubject: e.target.value.slice(0, 60) })} onBlur={onBlurSave}
                aria-label={L("主旨", "Subject")} className={`${field} bg-white`} style={{ borderColor: LINE }} />
              <textarea value={p.emailBody ?? ""} onChange={(e) => onPatch({ emailBody: e.target.value.slice(0, 1200) })} onBlur={onBlurSave} rows={7}
                aria-label={L("內文", "Body")} className={`${field} bg-white leading-relaxed`} style={{ borderColor: LINE }} />
            </div>
          )}

          {done && (
            <div className="flex flex-col gap-3">
              <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="self-start text-[12.5px] underline underline-offset-2" style={{ color: META }}>
                {more ? L("收起他的資料", "Hide their profile") : L("看他的資料", "Their profile")}
              </button>
              {more && (
                <>
                  {p.uspWhy && (
                    <div className="flex flex-col gap-1">
                      <span className={label} style={{ color: META }}>{L("為什麼由他講這個賣點", "Why this selling point")}</span>
                      <p className="m-0 text-[13px] leading-relaxed" style={{ color: INK }}>{p.uspWhy}</p>
                    </div>
                  )}
                  {(p.profile || p.evidence) && (
                    <div className="flex flex-col gap-1">
                      <span className={label} style={{ color: META }}>{L("個人特色", "Who they are")}{p.format ? `・${p.format}` : ""}</span>
                      {p.profile && <p className="m-0 text-[13px] leading-relaxed" style={{ color: INK }}>{p.profile}</p>}
                      {p.evidence && <p className="m-0 text-[12px] leading-relaxed" style={{ color: META }}>{L("依據：", "Based on: ")}{p.evidence}</p>}
                    </div>
                  )}
                  {p.voice && (
                    <div className="flex flex-col gap-1">
                      <span className={label} style={{ color: META }}>{L("他怎麼說話", "How they talk")}</span>
                      <p className="m-0 whitespace-pre-wrap text-[12.5px] leading-relaxed" style={{ color: INK }}>{p.voice}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter className="flex flex-wrap items-center gap-2">
          {done && (
            <div className="mr-auto flex flex-wrap items-center gap-3 text-[12.5px]" style={{ color: META }}>
              <button type="button" onClick={() => onRun(false)} disabled={busy} className="flex items-center gap-1.5 underline underline-offset-2 disabled:opacity-40">
                <Icon name="regenerate" size={11} /> {L("換三個點子", "Three new ideas")}
              </button>
              <button type="button" onClick={() => onRun(true)} disabled={busy} className="underline underline-offset-2 disabled:opacity-40"
                title={L("重新讀他的連結（他最近發了新內容時用）", "Re-read their link (use when they've posted new content)")}>
                {L("更新他的資料", "Refresh their content")}
              </button>
            </div>
          )}
          {!running && !busy && !done && (
            <button type="button" onClick={onRemove} className="mr-auto text-[12.5px] underline underline-offset-2" style={{ color: META }}>{L("從牆上拿掉", "Remove from the wall")}</button>
          )}
          {hasEmail && (
            <>
              <a href={gmailHref(p)} target="_blank" rel="noreferrer noopener" className="text-[12.5px] underline underline-offset-2" style={{ color: META }}>{L("用 Gmail 開", "Open in Gmail")}</a>
              <Button variant="flat" onPress={() => onCopy(`${p.emailSubject ?? ""}\n\n${p.emailBody ?? ""}`)} startContent={<Icon name="copy" size={12} />}>{L("複製", "Copy")}</Button>
              <a href={mailLong ? mailtoSubjectOnly(p) : mailtoHref(p)}
                onClick={mailLong ? () => onCopy(p.emailBody ?? "", L("信箱已開啟。內文已複製，在信裡貼上就可以寄。", "Mail app opened. The body is copied — paste it into the message.")) : undefined}
                className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[14px] font-semibold text-white" style={{ background: INK }}>
                <Icon name="mail" size={12} /> {L("寄邀約信", "Send outreach")}
              </a>
            </>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
