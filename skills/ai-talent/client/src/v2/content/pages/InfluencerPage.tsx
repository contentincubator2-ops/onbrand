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
 * 規則與提示詞在 server/content/core/influencer/influencerAngles.ts。
 */
import React from "react";
import { useOutletContext } from "react-router-dom";
import { Button } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { Icon } from "../../platform/components/icons";
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
  profile?: string; evidence?: string; talkingPoints?: string[]; angle?: string; angleWhy?: string; hook?: string; format?: string;
  emailSubject?: string; emailBody?: string;
}

const RUNNING: Status[] = ["queued", "reading", "thinking"];
const PLATFORM_NAME: Record<string, string> = {
  instagram: "Instagram", threads: "Threads", tiktok: "TikTok", facebook: "Facebook", youtube: "YouTube",
  x: "X", linkedin: "LinkedIn", podcast: "Podcast",
};
/** 伺服器讀不到的平台（同 server influencerLink.classifyLink 的 serverReadable；以伺服器為準，這裡只用來先提示）。 */
const WALLED = /(^|\.)(instagram\.com|threads\.net|threads\.com|tiktok\.com|facebook\.com|fb\.com|x\.com|twitter\.com|linkedin\.com)$/;
function isWalled(url: string): boolean {
  try { return WALLED.test(new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase()); } catch { return false; }
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
  const latestQ = T.influencer.latest.useQuery({ brandId: brandId ?? 0 }, { enabled: !!brandId, refetchOnWindowFocus: false });
  const products: any[] = (productsQ.data as any[]) ?? [];
  const events: any[] = (eventsQ.data as any[]) ?? [];

  const utils = T.useUtils();
  const parseSheet = T.influencer.parseSheet.useMutation();
  const analyzeStart = T.influencer.analyzeStart.useMutation();
  const savePerson = T.influencer.savePerson.useMutation();
  const exportFile = T.influencer.exportFile.useMutation();

  const [subject, setSubject] = React.useState<Subject>({ kind: "brand", id: null });
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

  const addFromPaste = () => {
    const lines = paste.split(/[\n,，\s]+/).map((s) => s.trim()).filter(Boolean);
    const urls = lines.filter(looksLikeUrl);
    if (!urls.length) { showToastGlobal(L("沒有看到連結。請貼上網紅的主頁網址，一行一位。", "No links found. Paste one profile URL per line."), "error"); return; }
    const room = MAX_PEOPLE - people.length;
    addPeople(urls.map((url) => ({ url })));
    setPaste("");
    if (urls.length > room) showToastGlobal(L(`一批最多 ${MAX_PEOPLE} 位，多的沒有加進來。`, `Up to ${MAX_PEOPLE} per batch; the rest were left out.`));
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
  const run = async (ids?: string[]) => {
    if (!brandId || busy) return;
    const targets = people.filter((p) => (ids ? ids.includes(p.id) : p.status !== "done"));
    if (!targets.length) return;
    if (subject.kind !== "brand" && !subject.id) { showToastGlobal(L("請先選一個產品或活動。", "Pick a product or campaign first."), "error"); return; }
    const seqNo = ++runSeq.current;
    setBusy(true);
    setPeople((cur) => cur.map((p) => (targets.some((t) => t.id === p.id) ? { ...p, status: "queued" } : p)));
    try {
      const r = await analyzeStart.mutateAsync({
        brandId, subject, direction: direction.trim() || undefined, batchId: batchId ?? undefined,
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
    if (!brandId || !batchId || p.status === "draft" || busy) return;
    savePerson.mutate({
      brandId, batchId, id: p.id, name: p.name ?? "", email: p.email ?? "",
      ...(p.status === "done" ? { emailSubject: p.emailSubject ?? "", emailBody: p.emailBody ?? "" } : {}),
    });
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

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); showToastGlobal(L("已複製。", "Copied.")); }
    catch { showToastGlobal(L("複製失敗，請手動選取。", "Couldn't copy. Select the text manually."), "error"); }
  };

  const pending = people.filter((p) => p.status !== "done" && !RUNNING.includes(p.status));
  const doneCount = people.filter((p) => p.status === "done").length;
  const canStart = !!brandId && !busy && pending.length > 0;

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
          <div className="flex items-center gap-2">
            <Button color="primary" onPress={() => run()} isDisabled={!canStart}
              startContent={busy ? undefined : <Icon name="play" size={13} />}>
              {busy ? L("正在讀與寫…", "Reading and writing…") : pending.length ? L(`開始寫（${pending.length} 位）`, `Write (${pending.length})`) : L("開始寫", "Write")}
            </Button>
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
            <p className="m-0 text-[13px] font-semibold" style={{ color: INK }}>
              {L("網紅名單", "Creators")}
              <span className="ml-2 font-normal" style={{ color: META }}>{people.length}／{MAX_PEOPLE}</span>
            </p>
            {people.length > 0 && !busy && (
              <button type="button" onClick={startOver} className="text-[12.5px] underline underline-offset-2" style={{ color: META }}>
                {L("清空，開新的一批", "Clear and start a new batch")}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-start">
            <textarea value={paste} disabled={busy} onChange={(e) => setPaste(e.target.value)} rows={3}
              placeholder={L("貼上網紅的主頁連結，一行一位\nhttps://www.youtube.com/@…\nhttps://www.instagram.com/…", "Paste profile links, one per line\nhttps://www.youtube.com/@…\nhttps://www.instagram.com/…")}
              className="min-h-[84px] flex-1 rounded-xl border px-3.5 py-2.5 text-[14px] outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
            <div className="flex shrink-0 flex-row gap-2 md:flex-col">
              <Button variant="flat" onPress={addFromPaste} isDisabled={busy || !paste.trim() || people.length >= MAX_PEOPLE}
                startContent={<Icon name="add" size={12} />}>{L("加入名單", "Add")}</Button>
              <Button variant="flat" onPress={() => fileRef.current?.click()} isDisabled={busy || people.length >= MAX_PEOPLE} isLoading={parseSheet.isPending}
                startContent={parseSheet.isPending ? undefined : <Icon name="upload" size={12} />}>{L("上傳名單", "Upload a list")}</Button>
              <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
          </div>
          <p className="m-0 text-[12px] leading-relaxed" style={{ color: META }}>
            {L(
              "名單檔支援 Excel（.xlsx）與 CSV：每一列一位，有連結就行；有「名字」「Email」「備註」欄會一起帶進來。YouTube、部落格、個人網站我們會自己讀；Instagram、Threads、TikTok、Facebook 的個人頁讀不到，請在那一列貼上他的幾則貼文。",
              "Lists can be Excel (.xlsx) or CSV: one creator per row, a link is enough; Name, Email and Notes columns come along. We read YouTube, blogs and personal sites ourselves; Instagram, Threads, TikTok and Facebook profiles can't be read, so paste a few of their posts on that row.",
            )}
          </p>
        </section>

        {/* ── 每一位 ── */}
        {people.length > 0 && (
          <section aria-label={L("每一位的切角", "Angles")} className="flex flex-col gap-4">
            {doneCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="m-0 text-[13px]" style={{ color: META }}>
                  {L(`已寫好 ${doneCount} 位`, `${doneCount} written`)}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="flat" isDisabled={busy} isLoading={exportFile.isPending && exportFile.variables?.format === "xlsx"}
                    onPress={() => doExport("xlsx")} startContent={<Icon name="download" size={12} />}>{L("匯出 Excel", "Export Excel")}</Button>
                  <Button size="sm" variant="flat" isDisabled={busy} isLoading={exportFile.isPending && exportFile.variables?.format === "docx"}
                    onPress={() => doExport("docx")} startContent={<Icon name="download" size={12} />}>{L("匯出 Word", "Export Word")}</Button>
                </div>
              </div>
            )}
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))" }}>
              {people.map((p) => (
                <PersonCard key={p.id} p={p} en={en} busy={busy}
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
              ? `Add a few creators and press "Write" — each gets their own angle on ${subjectName ?? "your brand"}.`
              : `加入幾位網紅後按「開始寫」，每一位會針對${subjectName ? `「${subjectName}」` : "品牌"}各有一個切角。`}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusLine({ p, en }: { p: Person; en: boolean }) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const text: Record<Status, string> = {
    draft: isWalled(p.url) && !(p.notes ?? "").trim()
      ? L("這個平台我們讀不到，請在下面貼上他的幾則貼文", "We can't read this platform. Paste a few of their posts below.")
      : L("還沒寫", "Not written yet"),
    queued: L("排隊中…", "Queued…"), reading: L("正在讀他的內容…", "Reading their content…"), thinking: L("正在寫切角與邀約信…", "Writing the angle and outreach…"),
    done: "", needs_material: L("資料不足：連結讀不到內容。貼上他的幾則貼文或自我介紹後再寫。", "Not enough to go on: the link gave us nothing. Paste a few posts or a bio, then write again."),
    invalid_link: L("這個連結無法辨識，請確認是完整的網址。", "We couldn't recognise this link. Check it's a full URL."),
    failed: L("這一位沒寫成，請再試一次。", "This one didn't finish. Try again."),
  };
  if (!text[p.status]) return null;
  const warn = p.status === "needs_material" || p.status === "invalid_link" || p.status === "failed" || (p.status === "draft" && isWalled(p.url) && !(p.notes ?? "").trim());
  return (
    <p className="m-0 flex items-start gap-1.5 text-[12.5px] leading-relaxed" style={{ color: warn ? "#B45309" : META }} aria-live="polite">
      {RUNNING.includes(p.status) ? <Icon name="working" size={12} className="mt-0.5 animate-spin" /> : warn ? <Icon name="warning" size={12} className="mt-0.5" /> : null}
      <span>{text[p.status]}</span>
    </p>
  );
}

function PersonCard({ p, en, busy, onPatch, onBlurSave, onRemove, onRun, onCopy }: {
  p: Person; en: boolean; busy: boolean;
  onPatch: (v: Partial<Person>) => void; onBlurSave: () => void; onRemove: () => void; onRun: () => void; onCopy: (t: string) => void;
}) {
  const L = (zh: string, e: string) => (en ? e : zh);
  const running = RUNNING.includes(p.status);
  const done = p.status === "done";
  const walled = isWalled(p.url);
  const [notesOpen, setNotesOpen] = React.useState(false);
  const showNotes = !done && !running && (notesOpen || walled || p.status === "needs_material" || !!(p.notes ?? "").trim());
  const platform = p.platform ? (PLATFORM_NAME[p.platform] ?? (p.platform === "web" ? L("網站", "Website") : p.platform)) : null;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((p.email ?? "").trim());
  const field = "rounded-lg border px-2.5 py-1.5 text-[13px] outline-none focus:border-neutral-900 disabled:opacity-60";

  return (
    <article className="flex flex-col gap-3 rounded-2xl border bg-white p-5" style={{ borderColor: LINE }}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold" style={{ color: INK }}>{labelOf(p) || L("（還沒有名字）", "(no name yet)")}</span>
            {platform && <span className="rounded-full px-2 py-0.5 text-[11.5px]" style={{ background: SOFT, color: META }}>{platform}</span>}
            {p.followers && <span className="text-[12px]" style={{ color: META }}>{p.followers}</span>}
          </div>
          <a href={p.url} target="_blank" rel="noreferrer noopener" className="truncate text-[12px] underline underline-offset-2" style={{ color: META }}>{p.url}</a>
        </div>
        {!running && !busy && (
          <button type="button" onClick={onRemove} aria-label={L("從名單拿掉", "Remove")} title={L("從名單拿掉", "Remove")}
            className="shrink-0 rounded-full p-1.5 hover:bg-neutral-100" style={{ color: META }}>
            <Icon name="close" size={12} />
          </button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-2">
        <input value={p.name ?? ""} disabled={running} onChange={(e) => onPatch({ name: e.target.value.slice(0, 60) })} onBlur={onBlurSave}
          placeholder={L("怎麼稱呼他（選填）", "Name (optional)")} aria-label={L("名字", "Name")} className={field} style={{ borderColor: LINE }} />
        <input value={p.email ?? ""} disabled={running} onChange={(e) => onPatch({ email: e.target.value.slice(0, 160) })} onBlur={onBlurSave}
          placeholder={L("Email（寄信用，選填）", "Email (optional)")} aria-label="Email" type="email" className={field} style={{ borderColor: LINE }} />
      </div>

      <StatusLine p={p} en={en} />

      {showNotes && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px]" style={{ color: META }}>{L("他的貼文或自我介紹（貼 3–5 則最準）", "Their posts or bio (3–5 posts works best)")}</span>
          <textarea value={p.notes ?? ""} onChange={(e) => onPatch({ notes: e.target.value.slice(0, NOTES_MAX) })} rows={4}
            placeholder={L("把他最近幾則貼文的文字貼在這裡，一則一段", "Paste the text of a few recent posts, one per paragraph")}
            className="rounded-xl border px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
        </label>
      )}

      {done && (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold tracking-wide" style={{ color: META }}>{L("個人特色", "Who they are")}</span>
            <p className="m-0 text-[13.5px] leading-relaxed" style={{ color: INK }}>{p.profile}</p>
            {p.evidence && <p className="m-0 text-[12px] leading-relaxed" style={{ color: META }}>{L("依據：", "Based on: ")}{p.evidence}</p>}
          </div>
          <div className="flex flex-col gap-1 rounded-xl p-3.5" style={{ background: SOFT }}>
            <span className="text-[11.5px] font-semibold tracking-wide" style={{ color: META }}>{L("獨特切角", "Their angle")}{p.format ? `・${p.format}` : ""}</span>
            <p className="m-0 text-[16px] font-semibold leading-snug" style={{ color: INK }}>{p.angle}</p>
            {p.angleWhy && <p className="m-0 text-[12.5px] leading-relaxed" style={{ color: META }}>{p.angleWhy}</p>}
            {p.hook && <p className="m-0 mt-1 text-[13.5px] leading-relaxed" style={{ color: INK, fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif' }}>「{p.hook}」</p>}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold tracking-wide" style={{ color: META }}>{L("他可以講的產品特色", "Selling points they can carry")}</span>
            <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-[13.5px] leading-relaxed" style={{ color: INK }}>
              {(p.talkingPoints ?? []).map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
          <details className="rounded-xl border" style={{ borderColor: LINE }}>
            <summary className="cursor-pointer select-none px-3.5 py-2.5 text-[13px] font-semibold" style={{ color: INK }}>
              {L("邀約信", "Outreach email")}<span className="ml-2 font-normal" style={{ color: META }}>{p.emailSubject}</span>
            </summary>
            <div className="flex flex-col gap-2 px-3.5 pb-3.5">
              <input value={p.emailSubject ?? ""} onChange={(e) => onPatch({ emailSubject: e.target.value.slice(0, 60) })} onBlur={onBlurSave}
                aria-label={L("主旨", "Subject")} className={field} style={{ borderColor: LINE }} />
              <textarea value={p.emailBody ?? ""} onChange={(e) => onPatch({ emailBody: e.target.value.slice(0, 1200) })} onBlur={onBlurSave} rows={9}
                aria-label={L("內文", "Body")} className="rounded-lg border px-2.5 py-2 text-[13px] leading-relaxed outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-2">
            <a href={mailtoHref(p)} className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: INK }}
              title={emailOk ? undefined : L("還沒填 Email，信箱打開後自己填收件人", "No email yet — add the recipient in your mail app")}>
              <Icon name="mail" size={12} /> {L("開啟我的信箱寄出", "Open in my mail app")}
            </a>
            <a href={gmailHref(p)} target="_blank" rel="noreferrer noopener" className="rounded-full border px-3.5 py-2 text-[13px]" style={{ borderColor: LINE, color: INK }}>
              {L("用 Gmail 開", "Open in Gmail")}
            </a>
            <button type="button" onClick={() => onCopy(`${p.emailSubject ?? ""}\n\n${p.emailBody ?? ""}`)}
              className="flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px]" style={{ borderColor: LINE, color: INK }}>
              <Icon name="copy" size={12} /> {L("複製（私訊用）", "Copy (for DMs)")}
            </button>
            <button type="button" onClick={onRun} disabled={busy}
              className="ml-auto flex items-center gap-1.5 text-[12.5px] underline underline-offset-2 disabled:opacity-40" style={{ color: META }}>
              <Icon name="regenerate" size={11} /> {L("重寫這一位", "Rewrite")}
            </button>
          </div>
        </>
      )}

      {!done && !running && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="flat" onPress={onRun} isDisabled={busy}>
            {p.status === "draft" ? L("只寫這一位", "Write this one") : L("再寫一次", "Write again")}
          </Button>
          {!showNotes && (
            <button type="button" onClick={() => setNotesOpen(true)} className="text-[12.5px] underline underline-offset-2" style={{ color: META }}>
              {L("我想補充他的貼文", "Add some of their posts")}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
