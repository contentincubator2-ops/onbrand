/**
 * InfluencerPage — 「網紅切角」：主體（品牌／產品／活動）固定，貼上或上傳網紅連結，
 * 讀懂每一位的個人特色，替每一位各配「可以講的產品特色＋獨特切角＋邀約信」。
 * 可整批匯出 Excel／Word，或逐位開啟自己的信箱寄出。
 *
 * 2026-10-06（CJ「網紅的功能，我想參考靈感台…上傳一個網紅的連結或是上傳 excel 批量網紅的連結…
 * 提供給客戶不同網紅可以講的產品特色和該網紅獨特切角，可以批量匯出 excel or word 或是直接在
 * 平台上發送」→ 發送定案：開啟用戶自己的信箱）。
 *   · 版面照靈感舞台：標題區 → 主體 → 名單 → 結果卡。
 *   · IG／Threads／TikTok／FB 伺服器讀不到：那幾列直接展開「貼上他的貼文」欄，不讓用戶按了才知道。
 *   · 資料不足就不寫，卡片上明講，補了素材可以只重寫那一位。
 *
 * 2026-10-06（CJ 實際用過後：「輸入連結後，底下沒有按開始研究的按鈕」「底下太複雜，字太多」）：
 *   · 「開始研究」放在貼連結的框旁邊，一顆按鈕＝把貼的連結加進名單並開始；右上角那顆拿掉。
 *   · 卡面只留四樣：誰、切角、開場示範、可以講的幾點。個人特色、依據、稱呼／Email、邀約信全文
 *     收進「看細節」。名單格式的說明收進「?」。
 *
 * 2026-10-06（CJ：「現在的 DEMO 寫起來很生硬，不有趣…直接生成 agent 模擬該用戶，看會怎麼寫？」→ 三個）：
 *   · 每位三個點子，是模型當他本人、用三個不同出發點想的；卡面只放點子標題與開場。
 *   · 跟靈感舞台一樣是「挑一個」：挑了才寫邀約信，沒被挑的不花錢。
 *
 * 2026-10-06（CJ：「目前都是用同一個產品特色去講，所以看來會太一致性…直接套用定位裡的 USP 或是讓用戶
 * 選擇 USP，當然也可以新增，然後你自由幫忙策略性匹配」「並且標註在卡片上」）：
 *   · 主體下面列出定位裡現成的賣點，預設全選；可以取消、可以自己加。
 *   · 研究時先看完整批名單，替每位配一個賣點；卡片上標「主打」。
 * 規則與提示詞在 server/content/core/influencer/influencerAngles.ts、influencerUsps.ts。
 */
import React from "react";
import { useOutletContext } from "react-router-dom";
import { Button } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { Icon } from "../../platform/components/icons";
import { HelpTip } from "../../platform/components/HelpTip";
import { showToastGlobal } from "../../platform/components/Toast";
import { friendlyError } from "../../platform/lib/friendlyError";

const INK = "#171717", META = "#6B6B6B", LINE = "#EAEAEA", SOFT = "#F6F6F5";
/** 同 server influencerAngles.MAX_PEOPLE／NOTES_MAX。 */
const MAX_PEOPLE = 30, NOTES_MAX = 3000;

type Subject = { kind: "brand" | "product" | "event"; id: number | null };
type Status = "draft" | "queued" | "reading" | "thinking" | "done" | "needs_material" | "invalid_link" | "failed";
interface Person {
  id: string; url: string; name?: string; email?: string; notes?: string;
  status: Status;
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
  own: ["從他做過的內容延伸", "Builds on their own work"],
  contrast: ["反差吐槽", "Contrarian take"],
  method: ["觀眾會存的方法", "A method worth saving"],
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

let seq = 0;
const newId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;
const labelOf = (p: Person) => (p.name || p.displayName || (p.handle ? `@${p.handle}` : "")).trim();

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
  const products: any[] = (productsQ.data as any[]) ?? [];
  const events: any[] = (eventsQ.data as any[]) ?? [];

  const utils = T.useUtils();
  const parseSheet = T.influencer.parseSheet.useMutation();
  const analyzeStart = T.influencer.analyzeStart.useMutation();
  const savePerson = T.influencer.savePerson.useMutation();
  const pickIdea = T.influencer.pickIdea.useMutation();
  /** 正在替誰的第幾個點子寫信。 */
  const [picking, setPicking] = React.useState<Record<string, number>>({});
  const exportFile = T.influencer.exportFile.useMutation();

  const [subject, setSubject] = React.useState<Subject>({ kind: "brand", id: null });
  /** 定位裡的賣點被取消勾選的、用戶自己加的。換主體就重來。 */
  const [uspOff, setUspOff] = React.useState<string[]>([]);
  const [uspCustom, setUspCustom] = React.useState<string[]>([]);
  const [uspDraft, setUspDraft] = React.useState("");
  const uspsQ = T.influencer.usps.useQuery(
    { brandId: brandId ?? 0, subject },
    { enabled: !!brandId && (subject.kind === "brand" || !!subject.id), refetchOnWindowFocus: false, staleTime: 60_000 },
  );
  const [direction, setDirection] = React.useState("");
  const [paste, setPaste] = React.useState("");
  const [people, setPeople] = React.useState<Person[]>([]);
  const [batchId, setBatchId] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

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
      // job.people 是整批；本機還沒送出的草稿接在後面。
      setPeople((cur) => [...(r.people as Person[]), ...cur.filter((p) => !(r.people as Person[]).some((x) => x.id === p.id))]);
      if (r.done) { setBusy(false); return; }
    }
    // 伺服器重啟或斷線：改讀存下來的那一批。
    const saved = (await latestQ.refetch().catch(() => null))?.data;
    if (runSeq.current !== seqNo) return;
    if (saved) setPeople(saved.people as Person[]);
    setBusy(false);
  }, [utils, latestQ]);

  const busyRef = React.useRef(false);
  busyRef.current = busy;
  /** 已經套用過哪一次 latest（品牌＋資料時間）。 */
  const appliedKey = React.useRef<string | null>(null);
  // 換品牌：清空，等 latest 回來。
  React.useEffect(() => {
    runSeq.current++;
    appliedKey.current = null;
    setPeople([]); setBatchId(null); setSubject({ kind: "brand", id: null }); setDirection(""); setPaste(""); setBusy(false);
  }, [brandId]);
  // 載入這個品牌最近一批。正在寫的時候以輪詢為準，不套用。
  React.useEffect(() => {
    if (!brandId || latestQ.isLoading) return;
    const key = `${brandId}:${latestQ.dataUpdatedAt}`;
    if (appliedKey.current === key) return;
    appliedKey.current = key;
    const d = latestQ.data;
    if (!d || busyRef.current) return;
    const saved = d.people as Person[];
    setPeople((cur) => [...saved, ...cur.filter((p) => p.status === "draft" && !saved.some((x) => x.id === p.id))]);
    setBatchId(d.batchId); setSubject(d.subject as Subject);
    if (d.jobId) { setBusy(true); void poll(d.jobId, ++runSeq.current); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestQ.data, latestQ.dataUpdatedAt, latestQ.isLoading, brandId]);

  const uspList: Array<{ text: string; from?: string }> = uspsQ.data?.usps ?? [];
  const uspMax: number = uspsQ.data?.max ?? 8;
  const subjectKey = `${brandId}:${subject.kind}:${subject.id ?? ""}`;
  React.useEffect(() => { setUspOff([]); setUspCustom([]); setUspDraft(""); }, [subjectKey]);
  // 讀回上一批時，卡片上有、定位清單裡沒有的賣點＝當時用戶自己加的，補回清單（不然重新研究會少掉它）。
  React.useEffect(() => {
    if (!uspsQ.data) return;
    const known = new Set([...uspList.map((u) => u.text), ...uspCustom]);
    const extra = Array.from(new Set(people.map((p) => p.usp).filter((u): u is string => !!u && !known.has(u))));
    if (extra.length) setUspCustom((cur) => [...cur, ...extra].slice(0, uspMax));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, uspsQ.data]);
  const uspSelected = [...uspList.map((u) => u.text).filter((t) => !uspOff.includes(t)), ...uspCustom].slice(0, uspMax);
  const addUsp = () => {
    const text = uspDraft.replace(/\s+/g, " ").trim().slice(0, 120);
    if (text.length < 2) return;
    if (uspSelected.length >= uspMax) { showToastGlobal(L(`最多 ${uspMax} 個賣點。`, `Up to ${uspMax} selling points.`), "error"); return; }
    if (![...uspList.map((u) => u.text), ...uspCustom].includes(text)) setUspCustom((cur) => [...cur, text]);
    setUspOff((cur) => cur.filter((t) => t !== text));
    setUspDraft("");
  };

  const subjectName = subject.kind === "product" ? products.find((p) => p.id === subject.id)?.name
    : subject.kind === "event" ? events.find((e) => e.id === subject.id)?.name : null;

  const patch = (id: string, v: Partial<Person>) => setPeople((cur) => cur.map((p) => (p.id === id ? { ...p, ...v } : p)));

  const addPeople = (list: Array<{ url: string; name?: string; email?: string; notes?: string }>): number => {
    let added = 0;
    setPeople((cur) => {
      const next = [...cur];
      for (const x of list) {
        const url = x.url.trim();
        if (!url || next.length >= MAX_PEOPLE || next.some((p) => p.url.replace(/\/$/, "") === url.replace(/\/$/, ""))) continue;
        next.push({ id: newId(), url, name: x.name, email: x.email, notes: x.notes, status: "draft" });
        added++;
      }
      return next;
    });
    return added;
  };

  /** 框裡貼的連結（去掉名單裡已經有的、超過上限的）。 */
  const pastedUrls = React.useMemo(() => {
    const seen = new Set(people.map((p) => p.url.replace(/\/$/, "")));
    const out: string[] = [];
    for (const raw of paste.split(/[\n,，\s]+/)) {
      const url = raw.trim();
      const key = url.replace(/\/$/, "");
      if (!url || !looksLikeUrl(url) || seen.has(key) || people.length + out.length >= MAX_PEOPLE) continue;
      seen.add(key); out.push(url);
    }
    return out;
  }, [paste, people]);

  /** 「開始研究」：把框裡的連結加進名單，連同名單裡還沒研究的一起送出。 */
  const startResearch = () => {
    if (paste.trim() && !pastedUrls.length && !pending.length) {
      showToastGlobal(L("沒有看到連結。請貼上網紅的主頁網址，一行一位。", "No links found. Paste one profile URL per line."), "error");
      return;
    }
    const fresh: Person[] = pastedUrls.map((url) => ({ id: newId(), url, status: "draft" }));
    const all = [...people, ...fresh];
    setPeople(all);
    setPaste("");
    void run(undefined, all);
  };

  const onFile = async (file: File | undefined) => {
    if (!file || !brandId) return;
    if (file.size > 2 * 1024 * 1024) { showToastGlobal(L("名單檔太大了（上限 2MB）。", "That file is too large (2MB max)."), "error"); return; }
    try {
      const r = await parseSheet.mutateAsync({ brandId, filename: file.name, contentBase64: await fileToBase64(file) });
      if (!r.people.length) { showToastGlobal(L("這個檔案裡沒有找到連結。", "No links found in that file."), "error"); return; }
      addPeople(r.people);
      const notes = [
        L(`讀到 ${r.people.length} 位`, `Found ${r.people.length}`),
        r.skipped ? L(`${r.skipped} 列沒有連結已略過`, `${r.skipped} rows without a link skipped`) : "",
        r.truncated ? L(`超過 ${MAX_PEOPLE} 位的 ${r.truncated} 位沒有加進來`, `${r.truncated} over the ${MAX_PEOPLE} limit left out`) : "",
      ].filter(Boolean).join(L("，", ", "));
      showToastGlobal(notes);
    } catch (e) {
      showToastGlobal(friendlyError(e, L("名單讀不出來，請確認是 .xlsx 或 .csv。", "Couldn't read that file. Use .xlsx or .csv.")), "error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /** 送去寫：ids 沒給＝所有還沒寫成的人。 */
  const run = async (ids?: string[], list: Person[] = people) => {
    if (!brandId || busy) return;
    const targets = list.filter((p) => (ids ? ids.includes(p.id) : p.status !== "done"));
    if (!targets.length) return;
    if (subject.kind !== "brand" && !subject.id) { showToastGlobal(L("請先選一個產品或活動。", "Pick a product or campaign first."), "error"); return; }
    const seqNo = ++runSeq.current;
    setBusy(true);
    setPeople((cur) => cur.map((p) => (targets.some((t) => t.id === p.id) ? { ...p, status: "queued" } : p)));
    try {
      const r = await analyzeStart.mutateAsync({
        brandId, subject, direction: direction.trim() || undefined, batchId: batchId ?? undefined, usps: uspSelected,
        people: targets.map((p) => ({ id: p.id, url: p.url, name: p.name?.trim() || undefined, email: p.email?.trim() || undefined, notes: p.notes?.trim().slice(0, NOTES_MAX) || undefined })),
      });
      setBatchId(r.batchId);
      void poll(r.jobId, seqNo);
    } catch (e) {
      setBusy(false);
      setPeople((cur) => cur.map((p) => (targets.some((t) => t.id === p.id) ? { ...p, status: targets.find((t) => t.id === p.id)!.status } : p)));
      showToastGlobal(friendlyError(e, L("沒有開始，請再試一次。", "Couldn't start. Try again.")), "error");
    }
  };

  const startOver = () => {
    runSeq.current++;
    setPeople([]); setBatchId(null); setBusy(false);
  };

  /** 用戶改了名字、Email 或邀約信：存回這一批（匯出才會是改過的版本）。還沒送出的草稿不用存。 */
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

  const pending = people.filter((p) => p.status !== "done" && !RUNNING.includes(p.status));
  const doneCount = people.filter((p) => p.status === "done").length;
  const toResearch = pending.length + pastedUrls.length;
  const canStart = !!brandId && !busy && (toResearch > 0 || !!paste.trim());

  const subjectBtn = (kind: Subject["kind"], label: string) => {
    const list = kind === "product" ? products : kind === "event" ? events : null;
    const disabled = busy || (!!list && list.length === 0);
    const on = subject.kind === kind;
    return (
      <button type="button" disabled={disabled}
        onClick={() => setSubject({ kind, id: list ? (list[0]?.id ?? null) : null })}
        className="rounded-full border px-3.5 py-1.5 text-[13px] transition disabled:opacity-40"
        style={{ borderColor: on ? INK : LINE, background: on ? INK : "#FFFFFF", color: on ? "#FFFFFF" : INK }}
        aria-pressed={on}>
        {label}
      </button>
    );
  };

  if (!brandId) {
    return <p className="m-0 py-24 text-center text-[14px]" style={{ color: META }}>{L("請先選一個品牌。", "Pick a brand first.")}</p>;
  }

  return (
    <div className="min-h-full">
      <div className="max-w-[1400px] mx-auto px-6 pt-10 pb-4">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-4">
          <div className="text-center mx-auto" style={{ flex: "1 1 auto" }}>
            <h1 className="font-semibold tracking-tight leading-tight" style={{ fontSize: "clamp(1.6rem, 3vw, 2.25rem)", color: INK }}>
              {L("網紅切角 · 一人一個說法", "Influencer Angles · One Take Each")}
            </h1>
            <p className="mt-3 mx-auto text-default-700"
              style={{ fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif', fontStyle: "italic", fontSize: 14, lineHeight: 1.7, maxWidth: 640 }}>
              {en
                ? `We read each creator's content, then match ${brandName ?? "your brand"}'s selling points to an angle only they can tell.`
                : `讀懂每一位網紅平常在講什麼，再從 ${brandName ?? "你的品牌"} 的特色裡，替他配一個只有他講才成立的切角`}
            </p>
            <p className="mt-2 mx-auto text-default-700" style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 640, letterSpacing: "0.02em" }}>
              <span style={{ fontWeight: 600, color: INK, marginRight: 6 }}>{L("適合：", "Best for")}</span>
              {L("手上已有網紅名單 · 要寄出第一封邀約 · 同一檔活動找多位網紅", "You already have a shortlist · First outreach · Several creators on one campaign")}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto flex flex-col gap-6 px-6 pb-12">
        {/* ── 主體 ── */}
        <section aria-label={L("主體", "Subject")} className="flex flex-col gap-3 rounded-2xl border bg-white p-5" style={{ borderColor: LINE }}>
          <p className="m-0 text-[13px] font-semibold" style={{ color: INK }}>{L("要請網紅講什麼？", "What should they talk about?")}</p>
          <div className="flex flex-wrap items-center gap-2">
            {subjectBtn("brand", L("品牌本身", "The brand"))}
            {subjectBtn("product", L("某個產品", "A product"))}
            {subjectBtn("event", L("某個活動", "A campaign"))}
            {subject.kind !== "brand" && (
              <label className="relative">
                <span className="sr-only">{subject.kind === "product" ? L("產品", "Product") : L("活動", "Campaign")}</span>
                <select value={subject.id ?? ""} disabled={busy} onChange={(e) => setSubject({ kind: subject.kind, id: Number(e.target.value) || null })}
                  className="appearance-none rounded-full border py-1.5 pl-3.5 pr-8 text-[13px] outline-none" style={{ borderColor: LINE, color: INK }}>
                  {(subject.kind === "product" ? products : events).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <Icon name="chevronRight" size={10} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90" color={META} />
              </label>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <p className="m-0 flex items-center gap-1.5 text-[12px]" style={{ color: META }}>
              {L("要請網紅講哪些賣點？", "Which selling points should they carry?")}
              <HelpTip>
                {L("這些賣點來自你的定位。我們會看完整批名單，替每一位配一個最適合由他來講的，卡片上會標出來。不想用的點一下取消，也可以自己加。",
                  "These come from your positioning. We look at the whole list and give each creator the one they can carry best — it's tagged on their card. Tap to drop one, or add your own.")}
              </HelpTip>
              {uspSelected.length > 0 && <span>{uspSelected.length}／{uspMax}</span>}
            </p>
            {uspList.length + uspCustom.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {[...uspList, ...uspCustom.map((text) => ({ text, from: L("自己加的", "Added by you") }))].map((u) => {
                  const on = uspSelected.includes(u.text);
                  const mine = uspCustom.includes(u.text);
                  return (
                    <button key={u.text} type="button" disabled={busy} aria-pressed={on} title={u.from ? `${u.from}｜${u.text}` : u.text}
                      onClick={() => (mine
                        ? setUspCustom((cur) => cur.filter((t) => t !== u.text))
                        : setUspOff((cur) => (cur.includes(u.text) ? cur.filter((t) => t !== u.text) : [...cur, u.text])))}
                      className="flex max-w-full items-start gap-1.5 rounded-2xl border px-3 py-1.5 text-left text-[13px] leading-snug transition disabled:opacity-50"
                      style={{ borderColor: on ? INK : LINE, background: on ? SOFT : "#FFFFFF", color: on ? INK : META }}>
                      <span className="mt-[3px] shrink-0"><Icon name={on ? "check" : "add"} size={10} /></span>
                      <span className="line-clamp-2">{u.text}</span>
                      {mine && <span className="mt-[3px] shrink-0" aria-label={L("拿掉", "Remove")}><Icon name="close" size={9} /></span>}
                    </button>
                  );
                })}
              </div>
            ) : !uspsQ.isLoading && (
              <p className="m-0 text-[12.5px]" style={{ color: META }}>
                {L("定位裡還沒有寫賣點。可以在下面自己加；不加也能研究，只是每位不會分配不同的賣點。",
                  "Your positioning has no selling points yet. Add some below — or go ahead without, and creators won't be given different ones.")}
              </p>
            )}
            <div className="flex gap-2">
              <input value={uspDraft} disabled={busy} onChange={(e) => setUspDraft(e.target.value.slice(0, 120))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUsp(); } }}
                placeholder={L("自己加一個賣點", "Add a selling point")} aria-label={L("自己加一個賣點", "Add a selling point")}
                className="min-w-0 flex-1 rounded-xl border px-3.5 py-2 text-[13px] outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
              <Button size="sm" variant="flat" onPress={addUsp} isDisabled={busy || uspDraft.trim().length < 2}>{L("加入", "Add")}</Button>
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px]" style={{ color: META }}>{L("這次合作有特別想要的方向嗎？（選填）", "Any direction for this collaboration? (optional)")}</span>
            <input value={direction} disabled={busy} onChange={(e) => setDirection(e.target.value.slice(0, 160))}
              placeholder={L("例如：想主打送禮情境、希望以短影音為主", "e.g. lean on gifting, short video preferred")}
              className="rounded-xl border px-3.5 py-2.5 text-[14px] outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
          </label>
        </section>

        {/* ── 名單 ── */}
        <section aria-label={L("網紅名單", "Creators")} className="flex flex-col gap-3 rounded-2xl border bg-white p-5" style={{ borderColor: LINE }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: INK }}>
              {L("要研究哪幾位？", "Who should we look at?")}
              <HelpTip>
                {readable.length
                  ? L("貼上連結我們就會去讀他的公開內容。少數讀不到的（例如 Facebook 個人頁、私人帳號），卡片上會請你貼上他的幾則貼文。名單檔可用 Excel 或 CSV，一列一位，有連結就行。",
                    "Paste a link and we read their public content. The few we can't read (Facebook profiles, private accounts) will ask you to paste some posts on the card. Lists can be Excel or CSV, one creator per row with a link.")
                  : L("YouTube、部落格、個人網站我們會自己讀。Instagram、Threads、TikTok、Facebook 的個人頁讀不到，加進來後請貼上他的幾則貼文。名單檔可用 Excel 或 CSV，一列一位，有連結就行。",
                    "We read YouTube, blogs and personal sites ourselves. Instagram, Threads, TikTok and Facebook profiles can't be read — paste a few of their posts after adding them. Lists can be Excel or CSV, one creator per row with a link.")}
              </HelpTip>
              {people.length > 0 && <span className="font-normal" style={{ color: META }}>{people.length}／{MAX_PEOPLE}</span>}
            </p>
            {people.length > 0 && !busy && (
              <button type="button" onClick={startOver} className="text-[12.5px] underline underline-offset-2" style={{ color: META }}>
                {L("清空重來", "Clear all")}
              </button>
            )}
          </div>
          <textarea value={paste} disabled={busy} onChange={(e) => setPaste(e.target.value)} rows={3}
            placeholder={L("貼上網紅的主頁連結，一行一位", "Paste profile links, one per line")}
            className="min-h-[84px] rounded-xl border px-3.5 py-2.5 text-[14px] outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
          <div className="flex flex-wrap items-center gap-2">
            <Button color="primary" onPress={startResearch} isDisabled={!canStart}
              startContent={busy ? undefined : <Icon name="play" size={13} />}>
              {busy ? L("研究中…", "Researching…") : toResearch ? L(`開始研究（${toResearch} 位）`, `Start research (${toResearch})`) : L("開始研究", "Start research")}
            </Button>
            <Button variant="flat" onPress={() => fileRef.current?.click()} isDisabled={busy || people.length >= MAX_PEOPLE} isLoading={parseSheet.isPending}
              startContent={parseSheet.isPending ? undefined : <Icon name="upload" size={12} />}>{L("上傳 Excel 名單", "Upload an Excel list")}</Button>
            <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
        </section>

        {/* ── 每一位 ── */}
        {people.length > 0 && (
          <section aria-label={L("每一位的切角", "Angles")} className="flex flex-col gap-4">
            {doneCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="m-0 text-[13px]" style={{ color: META }}>
                  {L(`已研究 ${doneCount} 位`, `${doneCount} done`)}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="flat" isDisabled={busy} isLoading={exportFile.isPending && exportFile.variables?.format === "xlsx"}
                    onPress={() => doExport("xlsx")} startContent={<Icon name="download" size={12} />}>{L("匯出 Excel", "Export Excel")}</Button>
                  <Button size="sm" variant="flat" isDisabled={busy} isLoading={exportFile.isPending && exportFile.variables?.format === "docx"}
                    onPress={() => doExport("docx")} startContent={<Icon name="download" size={12} />}>{L("匯出 Word", "Export Word")}</Button>
                </div>
              </div>
            )}
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
              {people.map((p) => (
                <PersonCard key={p.id} p={p} en={en} busy={busy} readable={readable} pickingIndex={picking[p.id]}
                  onPick={(i) => pick(p, i)}
                  onPatch={(v) => patch(p.id, v)}
                  onBlurSave={() => persist(p)}
                  onRemove={() => setPeople((cur) => cur.filter((x) => x.id !== p.id))}
                  onRun={() => run([p.id])}
                  onCopy={copy} />
              ))}
            </div>
          </section>
        )}

        {people.length === 0 && (
          <p className="m-0 py-10 text-center text-[14px]" style={{ color: META }}>
            {en
              ? `Paste a few links and press "Start research" — for each creator we pitch three ideas on ${subjectName ?? "your brand"} in their own voice.`
              : `貼上幾位網紅的連結後按「開始研究」，我們會照每一位的口吻，針對${subjectName ? `「${subjectName}」` : "品牌"}各想三個點子讓你挑。`}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusLine({ p, en, readable }: { p: Person; en: boolean; readable: string[] }) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const text: Record<Status, string> = {
    draft: isWalled(p.url, readable) && !(p.notes ?? "").trim()
      ? L("這個平台讀不到，請貼上他的幾則貼文。", "We can't read this platform. Paste a few of their posts.")
      : L("還沒研究", "Not researched yet"),
    queued: L("排隊中…", "Queued…"), reading: L("正在讀他的內容…", "Reading their content…"), thinking: L("正在想他會怎麼做…", "Working out what they'd make…"),
    done: "", needs_material: L("資料不足，請貼上他的幾則貼文。", "Not enough to go on. Paste a few of their posts."),
    invalid_link: L("這個連結無法辨識，請確認是完整的網址。", "We couldn't recognise this link. Check it's a full URL."),
    failed: L("這一位沒寫成，請再試一次。", "This one didn't finish. Try again."),
  };
  if (!text[p.status]) return null;
  const warn = p.status === "needs_material" || p.status === "invalid_link" || p.status === "failed" || (p.status === "draft" && isWalled(p.url, readable) && !(p.notes ?? "").trim());
  return (
    <p className="m-0 flex items-start gap-1.5 text-[12.5px] leading-relaxed" style={{ color: warn ? "#B45309" : META }} aria-live="polite">
      {RUNNING.includes(p.status) ? <Icon name="working" size={12} className="mt-0.5 animate-spin" /> : warn ? <Icon name="warning" size={12} className="mt-0.5" /> : null}
      <span>{text[p.status]}</span>
    </p>
  );
}

function PersonCard({ p, en, busy, readable, pickingIndex, onPatch, onBlurSave, onRemove, onRun, onCopy, onPick }: {
  p: Person; en: boolean; busy: boolean; readable: string[];
  /** 正在替第幾個點子寫信（沒有＝undefined）。 */
  pickingIndex: number | undefined;
  onPatch: (v: Partial<Person>) => void; onBlurSave: () => void; onRemove: () => void; onRun: () => void;
  onCopy: (t: string, okMessage?: string) => void; onPick: (index: number) => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const running = RUNNING.includes(p.status);
  const done = p.status === "done";
  const walled = isWalled(p.url, readable);
  const [open, setOpen] = React.useState(false);
  const showNotes = !done && !running && (walled || p.status === "needs_material" || !!(p.notes ?? "").trim());
  const platform = p.platform ? (PLATFORM_NAME[p.platform] ?? (p.platform === "web" ? L("網站", "Website") : p.platform)) : null;
  const field = "rounded-lg border px-2.5 py-1.5 text-[13px] outline-none focus:border-neutral-900 disabled:opacity-60";
  const mailLong = mailtoHref(p).length > MAILTO_MAX;
  const label = "text-[11.5px] font-semibold tracking-wide";
  const { ideas, picked } = ideasOf(p);
  const chosen = picked !== undefined ? ideas[picked] : undefined;
  const hasEmail = !!p.emailBody && chosen !== undefined;
  const writing = pickingIndex !== undefined;

  return (
    <article className="flex flex-col gap-3 rounded-2xl border bg-white p-5" style={{ borderColor: LINE }}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <a href={p.url} target="_blank" rel="noreferrer noopener" title={p.url}
            className="truncate text-[14px] font-semibold hover:underline" style={{ color: INK }}>
            {labelOf(p) || p.url.replace(/^https?:\/\/(www\.)?/, "")}
          </a>
          {platform && <span className="rounded-full px-2 py-0.5 text-[11.5px]" style={{ background: SOFT, color: META }}>{platform}</span>}
          {p.followers && <span className="text-[12px]" style={{ color: META }}>{p.followers}</span>}
        </div>
        {!running && !busy && (
          <button type="button" onClick={onRemove} aria-label={L("從名單拿掉", "Remove")} title={L("從名單拿掉", "Remove")}
            className="shrink-0 rounded-full p-1.5 hover:bg-neutral-100" style={{ color: META }}>
            <Icon name="close" size={12} />
          </button>
        )}
      </header>

      {p.usp && (
        <p className="m-0 flex items-start gap-2 text-[12.5px] leading-snug">
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: INK, color: "#FFFFFF" }}>{L("主打", "Leads with")}</span>
          <span className="font-semibold" style={{ color: INK }} title={p.usp}>{p.uspTag || p.usp}</span>
        </p>
      )}

      <StatusLine p={p} en={en} readable={readable} />

      {showNotes && (
        <textarea value={p.notes ?? ""} onChange={(e) => onPatch({ notes: e.target.value.slice(0, NOTES_MAX) })} rows={4}
          aria-label={L("他的貼文", "Their posts")}
          placeholder={L("貼上他最近 3–5 則貼文的文字", "Paste the text of 3–5 recent posts")}
          className="rounded-xl border px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
      )}

      {!done && !running && (
        <div>
          <Button size="sm" variant="flat" onPress={onRun} isDisabled={busy}>
            {p.status === "draft" ? L("研究這一位", "Research this one") : L("再試一次", "Try again")}
          </Button>
        </div>
      )}

      {done && (
        <>
          {/* 卡面：三個點子，各一句標題＋他的口吻的開場。挑一個才寫邀約信。 */}
          <div className="flex flex-col gap-2" role="radiogroup" aria-label={L("挑一個點子", "Pick an idea")}>
            {ideas.map((idea, i) => {
              const on = picked === i;
              const busyHere = pickingIndex === i;
              return (
                <button key={i} type="button" role="radio" aria-checked={on} disabled={writing}
                  onClick={() => { if (!on && p.ideas?.length) onPick(i); }}
                  className="flex flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition hover:border-neutral-400 disabled:opacity-60"
                  style={{ borderColor: on || busyHere ? INK : LINE, background: on ? SOFT : "#FFFFFF" }}>
                  {idea.kind && KIND_LABEL[idea.kind] && (
                    <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: META }}>
                      {on && <Icon name="check" size={10} />}
                      {en ? KIND_LABEL[idea.kind]![1] : KIND_LABEL[idea.kind]![0]}
                    </span>
                  )}
                  <span className="text-[15px] font-semibold leading-snug" style={{ color: INK }}>{idea.title}</span>
                  {idea.hook && (
                    <span className="text-[13px] leading-relaxed" style={{ color: META, fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif' }}>「{idea.hook}」</span>
                  )}
                  {busyHere && (
                    <span className="mt-0.5 flex items-center gap-1.5 text-[12px]" style={{ color: META }} aria-live="polite">
                      <Icon name="working" size={11} className="animate-spin" /> {L("正在寫邀約信…", "Writing the outreach email…")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {p.quoteWarning && hasEmail && (
            <p className="m-0 flex items-start gap-1.5 text-[12.5px] leading-relaxed" style={{ color: "#B45309" }}>
              <Icon name="warning" size={12} className="mt-0.5" />
              <span>{L("信裡有一句引用查不到出處，寄出前請核對。", "The email quotes a line we couldn't trace. Check before sending.")}</span>
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            {hasEmail ? (
              <>
                <a href={mailLong ? mailtoSubjectOnly(p) : mailtoHref(p)}
                  onClick={mailLong ? () => onCopy(p.emailBody ?? "", L("信箱已開啟。內文已複製，在信裡貼上就可以寄。", "Mail app opened. The body is copied — paste it into the message.")) : undefined}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: INK }}>
                  <Icon name="mail" size={12} /> {L("寄邀約信", "Send outreach")}
                </a>
                <button type="button" onClick={() => onCopy(`${p.emailSubject ?? ""}\n\n${p.emailBody ?? ""}`)}
                  className="flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px]" style={{ borderColor: LINE, color: INK }}>
                  <Icon name="copy" size={12} /> {L("複製", "Copy")}
                </button>
              </>
            ) : !writing && (
              <span className="text-[12.5px]" style={{ color: META }}>{L("挑一個，就幫你寫邀約信。", "Pick one and we'll write the outreach email.")}</span>
            )}
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
              className="ml-auto text-[12.5px] underline underline-offset-2" style={{ color: META }}>
              {open ? L("收起", "Hide") : L("看細節", "Details")}
            </button>
          </div>

          {open && (
            <div className="flex flex-col gap-3 border-t pt-3" style={{ borderColor: LINE }}>
              {chosen && (chosen.productPoint || chosen.why) && (
                <div className="flex flex-col gap-1">
                  <span className={label} style={{ color: META }}>{L("選的這個點子", "The idea you picked")}{p.format ? `・${p.format}` : ""}</span>
                  {chosen.productPoint && <p className="m-0 text-[13px] leading-relaxed" style={{ color: INK }}>{L("會帶到：", "Brings in: ")}{chosen.productPoint}</p>}
                  {chosen.why && <p className="m-0 text-[13px] leading-relaxed" style={{ color: INK }}>{L("觀眾為什麼會看：", "Why their audience watches: ")}{chosen.why}</p>}
                  {chosen.basedOn && <p className="m-0 text-[12px] leading-relaxed" style={{ color: META }}>{L("延伸自：", "Builds on: ")}{chosen.basedOn}</p>}
                </div>
              )}
              {p.usp && (p.uspWhy || p.uspTag) && (
                <div className="flex flex-col gap-1">
                  <span className={label} style={{ color: META }}>{L("主打的賣點", "The selling point they lead with")}</span>
                  <p className="m-0 text-[13px] leading-relaxed" style={{ color: INK }}>{p.usp}</p>
                  {p.uspWhy && <p className="m-0 text-[12px] leading-relaxed" style={{ color: META }}>{L("為什麼是他：", "Why them: ")}{p.uspWhy}</p>}
                </div>
              )}
              {(p.profile || p.evidence) && (
                <div className="flex flex-col gap-1">
                  <span className={label} style={{ color: META }}>{L("個人特色", "Who they are")}</span>
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
              {hasEmail && (
                <div className="flex flex-col gap-2">
                  <span className={label} style={{ color: META }}>{L("邀約信", "Outreach email")}</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p.name ?? ""} onChange={(e) => onPatch({ name: e.target.value.slice(0, 60) })} onBlur={onBlurSave}
                      placeholder={L("怎麼稱呼他", "Name")} aria-label={L("名字", "Name")} className={field} style={{ borderColor: LINE }} />
                    <input value={p.email ?? ""} onChange={(e) => onPatch({ email: e.target.value.slice(0, 160) })} onBlur={onBlurSave}
                      placeholder={L("他的 Email", "Their email")} aria-label="Email" type="email" className={field} style={{ borderColor: LINE }} />
                  </div>
                  <input value={p.emailSubject ?? ""} onChange={(e) => onPatch({ emailSubject: e.target.value.slice(0, 60) })} onBlur={onBlurSave}
                    aria-label={L("主旨", "Subject")} className={field} style={{ borderColor: LINE }} />
                  <textarea value={p.emailBody ?? ""} onChange={(e) => onPatch({ emailBody: e.target.value.slice(0, 1200) })} onBlur={onBlurSave} rows={8}
                    aria-label={L("內文", "Body")} className="rounded-lg border px-2.5 py-2 text-[13px] leading-relaxed outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-[12.5px]" style={{ color: META }}>
                {hasEmail && <a href={gmailHref(p)} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">{L("用 Gmail 開", "Open in Gmail")}</a>}
                <button type="button" onClick={onRun} disabled={busy} className="flex items-center gap-1.5 underline underline-offset-2 disabled:opacity-40">
                  <Icon name="regenerate" size={11} /> {L("重新研究這一位", "Research again")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}
