/**
 * InspirationPage — 「靈感舞台」：主體（品牌／產品／活動）固定，請幾位 agent 各用自己的思考方式
 * 想切角。用戶挑一個採用 → 排進本週企劃 → 任務視窗直接疊上來寫全文、改稿、生圖。取代七日發布台的入口。
 *
 * 2026-09-29（CJ「七日發布台改成靈感舞台」「讓用戶選擇要哪些 agent 幫忙想」→ 定案：預設陣容＋事後調整）。
 *   · 陣容不是必經步驟：預設五位直接按「開始想」；想控制的人點頭像換人。
 *   · 選擇放在看完結果之後：每張切角卡有「請他再想 3 個」「換掉他」。
 *   · 切角卡只放三樣：切角名稱、開場第一句、為什麼這樣切。採用了才寫全文，沒選的不花錢。
 * 思考框架與偏好紀錄在 server/content/core/inspirationStage.ts。
 */
import React from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate, faChevronDown, faXmark, faPlus, faCheck, faEnvelope, faGlobe, faPlay, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@heroui/react";
import { faFacebookF, faInstagram, faThreads, faLine, faTiktok } from "@fortawesome/free-brands-svg-icons";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { showToastGlobal } from "../../../components/ui/Toast";
import { channelRoute } from "../lib/channelMeta";
import { logActivation } from "../../platform/lib/activationTelemetry";
import { PlatformTaskModal, type TaskEmbed } from "./PlatformTaskPage";

const INK = "#171717", META = "#6B6B6B", LINE = "#EAEAEA", SOFT = "#F6F6F5";

const PLATFORM_ICON: Record<string, any> = {
  facebook: faFacebookF, instagram: faInstagram, threads: faThreads, line: faLine, tiktok: faTiktok,
  email: faEnvelope, website: faGlobe,
};

// ── 日期（台北）──
const ymdTpe = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
function addDays(ymd: string, n: number) { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function mondayOf(ymd: string) { const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay(); return addDays(ymd, dow === 0 ? -6 : 1 - dow); }
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const dayLabel = (ymd: string, en: boolean) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  const [, m, dd] = ymd.split("-");
  return en ? d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" }) : `週${WD[d.getUTCDay()]} ${Number(m)}/${Number(dd)}`;
};

type ThinkerKey = string;
interface ThinkerCard { key: ThinkerKey; name: string; avatarUrl: string; school: string; schoolEn: string; pitch: string; pitchEn: string }
interface AngleView { id: string; thinker: ThinkerKey; answer?: string; title: string; hook: string; why: string; platform: string; format: string; adopted?: { date: string } }
type Subject = { kind: "brand" | "product" | "event"; id: number | null };

/** 同 server inspirationStage.DEFAULT_LINEUP——不同才顯示「恢復預設陣容」。 */
const DEFAULT_LINEUP = ["story", "direct", "contrarian", "insight", "customer"];

let seq = 0;
const newId = () => `a${Date.now().toString(36)}${(seq++).toString(36)}`;

function Avatar({ t, size = 32 }: { t?: ThinkerCard; size?: number }) {
  const [broken, setBroken] = React.useState(false);
  if (t?.avatarUrl && !broken) {
    return <img src={t.avatarUrl} alt="" onError={() => setBroken(true)} className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size, border: `1px solid ${LINE}`, background: SOFT }} />;
  }
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, fontSize: size * 0.4, background: SOFT, border: `1px solid ${LINE}`, color: "#525252" }}>
      {(t?.name ?? "?").slice(0, 1)}
    </span>
  );
}

export default function InspirationPage() {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const T = trpc as any;
  const ctx = useOutletContext<{ brandId: number | null; brands: any[] } | undefined>();
  const brandId = ctx?.brandId ?? null;

  const rosterQ = T.inspiration?.roster?.useQuery({ brandId: brandId ?? 0 }, { enabled: !!brandId, refetchOnWindowFocus: false }) ?? { data: null };
  const productsQ = T.product?.list?.useQuery({ brandId: brandId ?? undefined }, { enabled: !!brandId, refetchOnWindowFocus: false }) ?? { data: [] };
  const eventsQ = T.event?.list?.useQuery({ brandId: brandId ?? undefined }, { enabled: !!brandId, refetchOnWindowFocus: false }) ?? { data: [] };
  const thinkers: ThinkerCard[] = rosterQ.data?.thinkers ?? [];
  const platforms: Array<{ id: string; label: string }> = rosterQ.data?.platforms ?? [];
  const products: any[] = (productsQ.data as any[]) ?? [];
  const events: any[] = (eventsQ.data as any[]) ?? [];
  const byKey = (k: ThinkerKey) => thinkers.find((t) => t.key === k);

  const [subject, setSubject] = React.useState<Subject>({ kind: "brand", id: null });
  const [occasion, setOccasion] = React.useState("");
  const [lineup, setLineup] = React.useState<ThinkerKey[]>([]);
  const [angles, setAngles] = React.useState<AngleView[]>([]);
  /** 正在想的 thinker（整輪時是整個陣容；「請他再想」時只有他）。 */
  const [thinking, setThinking] = React.useState<ThinkerKey[]>([]);
  const [swapFor, setSwapFor] = React.useState<ThinkerKey | "add" | null>(null);
  const [adoptFor, setAdoptFor] = React.useState<AngleView | null>(null);
  const [writing, setWriting] = React.useState<Omit<TaskEmbed, "onClose"> | null>(null);

  // 換品牌：陣容回到那個品牌存的、結果清空。
  React.useEffect(() => {
    setAngles([]); setSubject({ kind: "brand", id: null }); setOccasion("");
  }, [brandId]);
  React.useEffect(() => {
    if (rosterQ.data?.lineup) setLineup(rosterQ.data.lineup);
  }, [rosterQ.data]);
  // 活化漏斗第 4 步（後台只取每人第一次）。
  React.useEffect(() => { if (brandId) logActivation("first_inspiration_arrived", { brandId }); }, [brandId]);

  const utils = T.useUtils?.();
  const ideateStart = T.inspiration?.ideateStart?.useMutation?.();
  const saveLineup = T.inspiration?.setLineup?.useMutation?.();
  const resetLineup = T.inspiration?.resetLineup?.useMutation?.();
  const adopt = T.inspiration?.adopt?.useMutation?.();

  const subjectName = subject.kind === "product" ? products.find((p) => p.id === subject.id)?.name
    : subject.kind === "event" ? events.find((e) => e.id === subject.id)?.name : null;
  const brandName: string | null = ctx?.brands?.find((b: any) => b.id === brandId)?.name ?? null;

  /** 換品牌、離開頁面、開新一輪時遞增——舊的輪詢看到號碼變了就停。 */
  const runSeq = React.useRef(0);
  React.useEffect(() => () => { runSeq.current++; }, []);
  React.useEffect(() => { runSeq.current++; setThinking([]); }, [brandId]);

  /**
   * 2026-09-30（CJ「邊想邊顯示」）：開始後伺服器立刻回 jobId，想好一張就能拿走一張；
   * 這裡每秒問一次，把這一輪目前的卡片換進畫面（同一輪的卡用同一個前綴 id，重複換不會疊）。
   */
  const run = async (opts: { keys: ThinkerKey[]; count: 1 | 3; mode: "replace" | "append"; avoid: string[] }) => {
    if (!brandId || !ideateStart || !utils || !opts.keys.length) return;
    const seq = ++runSeq.current;
    const batch = newId();
    const before = angles;
    setThinking(opts.keys);
    // 整輪重想：沒採用的舊卡先收起來（失敗時用 before 還原）。
    if (opts.mode === "replace") setAngles((cur) => cur.filter((a) => a.adopted));
    const place = (list: any[]) => setAngles((cur) => {
      const rest = cur.filter((a) => !a.id.startsWith(batch));
      const fresh: AngleView[] = list.map((a, i) => ({ ...a, id: `${batch}-${i}` }));
      if (opts.mode === "replace") return [...rest.filter((a) => a.adopted), ...fresh];
      // 「請他再想」：新想的接在他原本那張後面，不要跑到最底下。
      const lastIdx = rest.map((a) => a.thinker).lastIndexOf(opts.keys[0]!);
      if (lastIdx < 0) return [...rest, ...fresh];
      return [...rest.slice(0, lastIdx + 1), ...fresh, ...rest.slice(lastIdx + 1)];
    });
    try {
      const { jobId } = await ideateStart.mutateAsync({
        brandId, subject, occasion: occasion.trim() || undefined,
        thinkers: opts.keys, count: opts.count, avoid: opts.avoid.slice(0, 40),
      });
      let last: { angles: any[]; done: boolean; failed: string[]; lost: boolean } = { angles: [], done: false, failed: [], lost: false };
      for (let i = 0; i < 180 && seq === runSeq.current; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (seq !== runSeq.current) return;
        last = await utils.inspiration.ideatePoll.fetch({ jobId }, { staleTime: 0 });
        if (seq !== runSeq.current) return;
        if (last.angles.length) {
          place(last.angles);
          // 已經有卡的人就不再顯示「在想」；「請他再想」只有一位，想完三張前都算在想。
          if (opts.count === 1) setThinking(opts.keys.filter((k) => !last.angles.some((a) => a.thinker === k)));
        }
        if (last.done) break;
      }
      if (!last.angles.length) {
        setAngles(before);
        showToastGlobal(last.lost
          ? (en ? "The server restarted mid-way. Please try again." : "伺服器剛好重啟，這輪沒想完，再按一次。")
          : (en ? "Nothing came back this time. Try again." : "這輪沒想出來，再試一次。"));
      } else if (last.failed?.length) {
        const names = last.failed.map((k: string) => byKey(k)?.name ?? k).join("、");
        showToastGlobal(en ? `${names} couldn't come up with anything this time.` : `${names} 這次沒想出來，可以再試一次。`);
      }
    } catch (e: any) {
      if (seq === runSeq.current) setAngles(before);
      showToastGlobal(e?.message || (en ? "Something went wrong. Try again." : "剛剛沒想好，再試一次。"));
    } finally {
      if (seq === runSeq.current) setThinking([]);
    }
  };

  const startRound = () => run({ keys: lineup, count: 1, mode: "replace", avoid: [] });
  const anotherRound = () => run({ keys: lineup, count: 1, mode: "replace", avoid: angles.map((a) => a.title) });
  const moreFrom = (k: ThinkerKey) => run({ keys: [k], count: 3, mode: "append", avoid: angles.map((a) => a.title) });

  const persistLineup = (next: ThinkerKey[], dropped?: ThinkerKey) => {
    setLineup(next);
    if (brandId) saveLineup?.mutate?.({ brandId, lineup: next, dropped });
  };
  const swap = (from: ThinkerKey | "add", to: ThinkerKey) => {
    const next = from === "add" ? [...lineup, to] : lineup.map((k) => (k === from ? to : k));
    persistLineup(next, from === "add" ? undefined : from);
    setSwapFor(null);
  };
  const removeFromLineup = (k: ThinkerKey) => {
    if (lineup.length <= 1) return;
    persistLineup(lineup.filter((x) => x !== k), k);
  };

  const confirmAdopt = async (a: AngleView, date: string, platform: string) => {
    if (!brandId || !adopt) return;
    try {
      const r = await adopt.mutateAsync({
        brandId, thinker: a.thinker, title: a.title, hook: a.hook, why: a.why, answer: a.answer ?? "", platform, format: a.format, date,
      });
      // 活化漏斗終點＝TTFV：第一次拿到成果。
      logActivation("first_angle_adopted", { brandId, thinker: a.thinker });
      setAngles((cur) => cur.map((x) => (x.id === a.id ? { ...x, platform, adopted: { date } } : x)));
      setAdoptFor(null);
      setWriting({
        route: channelRoute(platform), taskId: r.taskId, slotId: r.slotId, topic: r.topic,
        weekStart: mondayOf(date), slotDate: date,
        entity: subject.kind !== "brand" && subject.id ? { kind: subject.kind, id: subject.id } : undefined,
      });
    } catch (e: any) {
      showToastGlobal(e?.message || (en ? "Couldn't add it to this week's plan." : "沒放進本週企劃，再試一次。"));
    }
  };

  if (!brandId) {
    return <div className="p-10 text-[14px] text-neutral-500">{en ? "Pick a brand first." : "先選一個品牌。"}</div>;
  }

  const busy = thinking.length > 0;
  const bench = thinkers.filter((t) => !lineup.includes(t.key));

  const subjectBtn = (kind: Subject["kind"], label: string) => (
    <button type="button" onClick={() => setSubject({ kind, id: kind === "brand" ? null : (kind === "product" ? products[0]?.id : events[0]?.id) ?? null })}
      disabled={kind === "product" ? !products.length : kind === "event" ? !events.length : false}
      className="rounded-full border px-3.5 py-1.5 text-[13px] transition disabled:opacity-40"
      style={subject.kind === kind ? { borderColor: INK, background: INK, color: "#FFFFFF" } : { borderColor: LINE, background: "#FFFFFF", color: "#404040" }}>
      {label}
    </button>
  );

  // 最上面那條狀態列：跟七日發布台的 brain bar 同一個位置，想的時候報進度。
  const doneNames = lineup.filter((k) => !thinking.includes(k) && angles.some((a) => a.thinker === k)).map((k) => byKey(k)?.name ?? k);
  const statusLine = busy
    ? (en
      ? `${thinking.map((k) => byKey(k)?.name ?? k).join(", ")} thinking…${doneNames.length && thinking.length < lineup.length ? ` · ${doneNames.join(", ")} done` : ""}`
      : `${thinking.map((k) => byKey(k)?.name ?? k).join("、")} 正在想…${doneNames.length && thinking.length < lineup.length ? `　${doneNames.join("、")} 已想好` : ""}`)
    : angles.length
      ? (en ? `${angles.length} angles on the table — use one, or ask someone for more.` : `桌上有 ${angles.length} 個切角——挑一個採用，或請某位再多想幾個`)
      : (en ? "Pick a subject, add this week's hook, press Start — each agent pitches one angle." : "選好主體和由頭，按「開始想」— 每位 agent 各想一個切角");
  const canStart = !busy && lineup.length > 0 && !(subject.kind !== "brand" && !subject.id);

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* 狀態列（sticky）——位置與樣式同七日發布台的 brain bar。 */}
      <div className="sticky top-0 z-30 w-full border-b border-neutral-200 bg-white">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center gap-3" aria-live="polite">
          <FontAwesomeIcon icon={faWandMagicSparkles} className="text-neutral-400" />
          <p className="m-0 text-sm text-neutral-500">{statusLine}</p>
        </div>
      </div>

      {/* 2026-09-30（CJ「排版要跟七日發布台一樣，標題位置不能跟其他頁不一致」）：
          canonical header template — 眉標／標題／襯線副標／適合，同 /projects、/brands。 */}
      <div className="max-w-[1400px] mx-auto px-6 pt-10 pb-4">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-4">
          <div className="text-center mx-auto" style={{ flex: "1 1 auto" }}>
            <h1
              className="font-semibold tracking-tight leading-tight"
              style={{
                fontSize: "clamp(1.6rem, 3vw, 2.25rem)",
                background: "#171717",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {en ? "Idea Stage · Angles First" : "靈感舞台 · 先想角度"}
            </h1>
            <p
              className="mt-3 mx-auto text-default-700"
              style={{
                fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif',
                fontStyle: "italic", fontSize: 14, lineHeight: 1.7, maxWidth: 640,
              }}
            >
              {en
                ? `Built on ${brandName ?? "your brand"}'s positioning. Several agents each pitch an angle — you pick one to write.`
                : `以 ${brandName ?? "你的品牌"} 的定位為骨架，幾位 agent 各想一個切角，你挑一個開始寫`}
            </p>
            <p
              className="mt-2 mx-auto text-default-700"
              style={{ fontSize: 12, lineHeight: 1.55, maxWidth: 640, letterSpacing: "0.02em" }}
            >
              <span style={{ fontWeight: 600, color: "#171717", marginRight: 6 }}>{en ? "Best for" : "適合："}</span>
              {en ? "Out of ideas this week · Before a launch · New ways to say the same product" : "這週沒靈感 · 新品上市前 · 同一個產品想換說法"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button color="primary" onPress={startRound} isDisabled={!canStart}
              startContent={busy ? undefined : <FontAwesomeIcon icon={faPlay} />}>
              {busy ? (en ? "Thinking…" : "正在想…") : angles.length ? (en ? "Start over" : "重新想") : (en ? "Start thinking" : "開始想")}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto flex flex-col gap-6 px-6 pb-12">
        {/* ── 主體＋由頭 ── */}
        <section aria-label={en ? "Subject" : "主體"} className="flex flex-col gap-3 rounded-2xl border bg-white p-5" style={{ borderColor: LINE }}>
          <p className="m-0 text-[13px] font-semibold" style={{ color: INK }}>{en ? "What are we talking about?" : "這次要講什麼？"}</p>
          <div className="flex flex-wrap items-center gap-2">
            {subjectBtn("brand", en ? "The brand" : "品牌本身")}
            {subjectBtn("product", en ? "A product" : "某個產品")}
            {subjectBtn("event", en ? "A campaign" : "某個活動")}
            {subject.kind !== "brand" && (
              <label className="relative">
                <span className="sr-only">{subject.kind === "product" ? (en ? "Product" : "產品") : (en ? "Campaign" : "活動")}</span>
                <select value={subject.id ?? ""} onChange={(e) => setSubject({ kind: subject.kind, id: Number(e.target.value) || null })}
                  className="appearance-none rounded-full border py-1.5 pl-3.5 pr-8 text-[13px] outline-none" style={{ borderColor: LINE, color: INK }}>
                  {(subject.kind === "product" ? products : events).map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
                <FontAwesomeIcon icon={faChevronDown} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: META }} />
              </label>
            )}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px]" style={{ color: META }}>{en ? "Anything happening this week? (optional)" : "這週有什麼由頭？（選填）"}</span>
            <input value={occasion} onChange={(e) => setOccasion(e.target.value.slice(0, 120))}
              placeholder={en ? "e.g. Mother's Day, new stock arrived, rainy week" : "例如：母親節、新品到貨、這週一直下雨"}
              className="rounded-xl border px-3.5 py-2.5 text-[14px] outline-none focus:border-neutral-900" style={{ borderColor: LINE }} />
          </label>
        </section>

        {/* ── 陣容 ── */}
        <section aria-label={en ? "Who's thinking" : "誰來想"} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="m-0 text-[13px]" style={{ color: META }}>
              {en ? "Thinking for you — tap a face to swap" : "這幾位會幫你想，點頭像可以換人"}
            </p>
            {lineup.join() !== DEFAULT_LINEUP.join() && (
              <button type="button" disabled={busy || !!resetLineup?.isPending}
                onClick={async () => {
                  if (!brandId || !resetLineup) return;
                  const r = await resetLineup.mutateAsync({ brandId }).catch(() => null);
                  if (r?.lineup) setLineup(r.lineup);
                }}
                className="text-[12.5px] underline underline-offset-2 disabled:opacity-40" style={{ color: META }}>
                {en ? "Back to the default team" : "恢復預設陣容"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {lineup.map((k) => {
              const t = byKey(k);
              return (
                <div key={k} className="relative">
                  <button type="button" onClick={() => setSwapFor(swapFor === k ? null : k)} disabled={busy}
                    className="flex items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-3.5 text-left transition hover:border-neutral-900 disabled:opacity-60"
                    style={{ borderColor: swapFor === k ? INK : LINE, background: "#FFFFFF" }}
                    aria-expanded={swapFor === k} aria-label={en ? `Swap ${t?.name ?? k}` : `換掉 ${t?.name ?? k}`}>
                    <Avatar t={t} size={30} />
                    <span className="flex flex-col">
                      <span className="text-[13px] font-semibold leading-tight" style={{ color: INK }}>{t?.name ?? k}</span>
                      <span className="text-[11.5px] leading-tight" style={{ color: META }}>{en ? t?.schoolEn : t?.school}</span>
                    </span>
                  </button>
                  {swapFor === k && (
                    <SwapMenu en={en} bench={bench} onPick={(to) => swap(k, to)} onClose={() => setSwapFor(null)}
                      onRemove={lineup.length > 1 ? () => { removeFromLineup(k); setSwapFor(null); } : undefined} />
                  )}
                </div>
              );
            })}
            {lineup.length < 5 && bench.length > 0 && (
              <div className="relative">
                <button type="button" onClick={() => setSwapFor(swapFor === "add" ? null : "add")} disabled={busy}
                  className="flex h-[44px] items-center gap-2 rounded-full border border-dashed px-4 text-[13px]" style={{ borderColor: LINE, color: META }}>
                  <FontAwesomeIcon icon={faPlus} /> {en ? "Add" : "加人"}
                </button>
                {swapFor === "add" && <SwapMenu en={en} bench={bench} onPick={(to) => swap("add", to)} onClose={() => setSwapFor(null)} />}
              </div>
            )}
          </div>
        </section>

        {/* ── 切角 ── */}
        {(angles.length > 0 || busy) && (
          <section aria-label={en ? "Angles" : "切角"} className="flex flex-col gap-4">
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {angles.map((a) => (
                <AngleCard key={a.id} a={a} t={byKey(a.thinker)} en={en} busy={busy}
                  inLineup={lineup.includes(a.thinker)}
                  platformLabel={platforms.find((p) => p.id === a.platform)?.label ?? a.platform}
                  onAdopt={() => setAdoptFor(a)}
                  onMore={() => moreFrom(a.thinker)}
                  onSwap={() => { setSwapFor(a.thinker); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  onOpenPlanner={() => navigate(`/planner?w=${mondayOf(a.adopted!.date)}`)} />
              ))}
              {thinking.map((k) => (
                <div key={`p-${k}`} className="flex flex-col gap-3 rounded-2xl border p-5" style={{ borderColor: LINE, background: "#FCFCFB" }} aria-live="polite">
                  <div className="flex items-center gap-2.5">
                    <Avatar t={byKey(k)} />
                    <span className="text-[13px]" style={{ color: META }}>{en ? `${byKey(k)?.name ?? k} is thinking…` : `${byKey(k)?.name ?? k} 在想…`}</span>
                  </div>
                  <div className="h-4 w-3/4 animate-pulse rounded" style={{ background: SOFT }} />
                  <div className="h-3 w-full animate-pulse rounded" style={{ background: SOFT }} />
                  <div className="h-3 w-5/6 animate-pulse rounded" style={{ background: SOFT }} />
                </div>
              ))}
            </div>
            {!busy && angles.some((a) => !a.adopted) && (
              <div className="flex justify-center">
                <button type="button" onClick={anotherRound}
                  className="flex items-center gap-2 rounded-full border px-5 py-2.5 text-[13.5px] transition hover:border-neutral-900" style={{ borderColor: LINE, color: INK }}>
                  <FontAwesomeIcon icon={faArrowsRotate} /> {en ? "None of these — another round" : "都不對，再想一輪"}
                </button>
              </div>
            )}
          </section>
        )}

        {angles.length === 0 && !busy && (
          <p className="m-0 py-10 text-center text-[14px]" style={{ color: META }}>
            {en
              ? `Press "Start thinking" and each of them will pitch one angle on ${subjectName ?? "your brand"}.`
              : `按「開始想」，每位會針對${subjectName ? `「${subjectName}」` : "品牌"}各提一個切角。`}
          </p>
        )}
      </div>

      {adoptFor && (
        <AdoptDialog en={en} a={adoptFor} platforms={platforms} busy={!!adopt?.isPending}
          onCancel={() => setAdoptFor(null)} onConfirm={(date, platform) => confirmAdopt(adoptFor, date, platform)} />
      )}

      {writing && (
        <PlatformTaskModal key={`${writing.taskId}-${writing.slotId}`} {...writing}
          onClose={() => {
            setWriting(null);
            showToastGlobal(en ? "It's in this week's plan." : "已放進本週企劃。");
          }} />
      )}
    </div>
  );
}

function SwapMenu({ en, bench, onPick, onClose, onRemove }: {
  en: boolean; bench: ThinkerCard[]; onPick: (k: ThinkerKey) => void; onClose: () => void; onRemove?: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div ref={ref} role="menu" className="absolute left-0 top-[calc(100%+6px)] z-30 w-[300px] rounded-2xl border bg-white p-2 shadow-lg" style={{ borderColor: LINE }}>
      <p className="m-0 px-2 pb-1.5 pt-1 text-[12px]" style={{ color: META }}>{en ? "Swap in" : "換成"}</p>
      {bench.length === 0 && <p className="m-0 px-2 py-2 text-[13px]" style={{ color: META }}>{en ? "Everyone's already on the team." : "大家都已經在陣容裡了。"}</p>}
      {bench.map((t) => (
        <button key={t.key} type="button" role="menuitem" onClick={() => onPick(t.key)}
          className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-neutral-50">
          <Avatar t={t} size={30} />
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px] font-semibold" style={{ color: INK }}>{t.name}・{en ? t.schoolEn : t.school}</span>
            <span className="text-[12px] leading-snug" style={{ color: META }}>{en ? t.pitchEn : t.pitch}</span>
          </span>
        </button>
      ))}
      {onRemove && (
        <button type="button" role="menuitem" onClick={onRemove}
          className="mt-1 w-full rounded-xl px-2 py-2 text-left text-[13px] hover:bg-neutral-50" style={{ color: META, borderTop: `1px solid ${LINE}` }}>
          {en ? "Just remove from the team" : "只拿掉，不換人"}
        </button>
      )}
    </div>
  );
}

function AngleCard({ a, t, en, busy, inLineup, platformLabel, onAdopt, onMore, onSwap, onOpenPlanner }: {
  a: AngleView; t?: ThinkerCard; en: boolean; busy: boolean; inLineup: boolean; platformLabel: string;
  onAdopt: () => void; onMore: () => void; onSwap: () => void; onOpenPlanner: () => void;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border p-5" style={{ borderColor: a.adopted ? INK : LINE, background: "#FFFFFF" }}>
      <div className="flex items-center gap-2.5">
        <Avatar t={t} />
        <div className="min-w-0">
          <p className="m-0 truncate text-[13px] font-semibold" style={{ color: INK }}>{t?.name ?? a.thinker}</p>
          <p className="m-0 truncate text-[12px]" style={{ color: META }}>{en ? t?.schoolEn : t?.school}</p>
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[12px]" style={{ color: META }}>
          {PLATFORM_ICON[a.platform] && <FontAwesomeIcon icon={PLATFORM_ICON[a.platform]} />}{platformLabel}・{a.format}
        </span>
      </div>
      <h2 className="m-0 text-[16px] font-bold leading-snug" style={{ color: INK }}>{a.title}</h2>
      <p className="m-0 rounded-xl px-3.5 py-2.5 text-[14px] leading-relaxed" style={{ background: SOFT, color: "#262626" }}>{/^[「『“"]/.test(a.hook) ? a.hook : `「${a.hook}」`}</p>
      {a.why && <p className="m-0 text-[13px] leading-relaxed" style={{ color: META }}>{a.why}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {a.adopted ? (
          <>
            <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: INK }}>
              <FontAwesomeIcon icon={faCheck} /> {en ? `In the plan · ${dayLabel(a.adopted.date, en)}` : `已排進 ${dayLabel(a.adopted.date, en)}`}
            </span>
            <button type="button" onClick={onOpenPlanner} className="ml-auto text-[13px] underline underline-offset-2" style={{ color: META }}>
              {en ? "Open weekly plan" : "看本週企劃"}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onAdopt} disabled={busy}
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: INK }}>
              {en ? "Use this" : "採用"}
            </button>
            <button type="button" onClick={onMore} disabled={busy}
              className="rounded-full border px-3.5 py-2 text-[13px] transition hover:border-neutral-900 disabled:opacity-40" style={{ borderColor: LINE, color: INK }}>
              {en ? "3 more like this" : "請他再想 3 個"}
            </button>
            {inLineup && (
              <button type="button" onClick={onSwap} disabled={busy} aria-label={en ? "Swap this thinker" : "換掉他"}
                className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[12.5px] disabled:opacity-40" style={{ color: META }}>
                <FontAwesomeIcon icon={faXmark} /> {en ? "Swap" : "換掉他"}
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function AdoptDialog({ en, a, platforms, busy, onCancel, onConfirm }: {
  en: boolean; a: AngleView; platforms: Array<{ id: string; label: string }>; busy: boolean;
  onCancel: () => void; onConfirm: (date: string, platform: string) => void;
}) {
  const today = ymdTpe(new Date());
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const [date, setDate] = React.useState(addDays(today, 1));
  const [platform, setPlatform] = React.useState(platforms.some((p) => p.id === a.platform) ? a.platform : platforms[0]?.id ?? "facebook");
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="adopt-title" className="w-full max-w-[440px] rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="adopt-title" className="m-0 text-[16px] font-bold" style={{ color: INK }}>{en ? "Put it in the weekly plan" : "放進本週企劃"}</h2>
        <p className="m-0 mt-1.5 text-[13.5px] leading-relaxed" style={{ color: META }}>{a.title}</p>

        <p className="m-0 mt-5 text-[12px] font-semibold" style={{ color: INK }}>{en ? "Which day?" : "哪一天發？"}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {days.map((d) => (
            <button key={d} type="button" onClick={() => setDate(d)}
              className="rounded-full border px-3 py-1.5 text-[12.5px]"
              style={date === d ? { borderColor: INK, background: INK, color: "#FFFFFF" } : { borderColor: LINE, color: "#404040" }}>
              {d === today ? (en ? "Today" : "今天") : dayLabel(d, en)}
            </button>
          ))}
        </div>

        <p className="m-0 mt-5 text-[12px] font-semibold" style={{ color: INK }}>{en ? "Where?" : "發在哪？"}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {platforms.map((p) => (
            <button key={p.id} type="button" onClick={() => setPlatform(p.id)}
              className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px]"
              style={platform === p.id ? { borderColor: INK, background: INK, color: "#FFFFFF" } : { borderColor: LINE, color: "#404040" }}>
              {PLATFORM_ICON[p.id] && <FontAwesomeIcon icon={PLATFORM_ICON[p.id]} />}{p.label}
            </button>
          ))}
        </div>

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-full border py-2.5 text-[13.5px]" style={{ borderColor: LINE, color: INK }}>
            {en ? "Cancel" : "取消"}
          </button>
          <button type="button" disabled={busy} onClick={() => onConfirm(date, platform)}
            className="flex-1 rounded-full py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-40" style={{ background: INK }}>
            {busy ? (en ? "Adding…" : "排進去…") : (en ? "Add & write it" : "排進去並開始寫")}
          </button>
        </div>
      </div>
    </div>
  );
}
