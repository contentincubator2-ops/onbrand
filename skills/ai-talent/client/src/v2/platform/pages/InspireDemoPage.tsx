/**
 * InspireDemoPage — 醫師自媒體示範頁（/inspire），免登入。
 *
 * 2026-10-07（CJ「醫生掃 QR code、輸入自己的名字後，選主要議題、搭配不同網紅語調，產出文章內容」
 * 「真實網紅名字不要露出」「展現出正在審查哪些條文」→「mobile first，Tesla UI」→
 * 「整個設計要更像 Tesla UI」「每個風格寫上參考哪一類、什麼量級的網紅」）。
 *
 * 版面照 Tesla 官網的兩種畫面做，只取做法，不使用它的字體、標誌或素材：
 *   · 首頁＝全螢幕深色主視覺：標題在上、兩顆並排按鈕在最下面。
 *   · 設定頁＝訂車設定器：上面一塊「目前的設定」預覽，下面一段一段置中的小標（議題／平台／說話風格），
 *     平台用圓形色票式的選鈕，選取＝外圈；最底下固定一條「摘要＋主按鈕」。
 *   · 靈感牆＝庫存車卡片：灰底卡、標題、三格規格列、兩顆按鈕。
 * 靈感卡放點子、開場、怎麼做、為什麼；採用了才寫成稿。審查只提建議（CJ「審查後不要直接改寫，
 * 要提出建議，看醫生自己是否要改寫」）：成稿在醫師手上，逐句決定照建議改、維持原句或自己改，
 * 改過可以再審一次。審查面板逐組列出條文與出處，狀態對應伺服器真的那一次審查。
 * 題庫、風格、條文都在 server/content/core/inspire/，這裡不留副本。這頁只給台灣醫師用，所以只有中文。
 */
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare, faCheck, faChevronLeft, faCircleNotch, faCopy, faMinus, faTriangleExclamation, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { faFacebookF, faInstagram, faTiktok, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { trpc } from "../../../lib/trpc";

const INK = "#171A20", SUB = "#5C5E62", FAINT = "#8E8E8E", PANEL = "#F4F4F4", LINE = "#D0D1D2", BLUE = "#3E6AE1";
const OK = "#12BB00", WARN = "#B45309";
const FONT = `system-ui, -apple-system, "Segoe UI", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
const GLASS = { background: "rgba(255,255,255,0.86)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" } as const;

const PLATFORM_ICON: Record<string, any> = { facebook: faFacebookF, youtube: faYoutube, instagram: faInstagram, tiktok: faTiktok };
const PLATFORM_ORDER = ["facebook", "youtube", "instagram", "tiktok"];
const MARKETS: Array<{ id: string; label: string }> = [{ id: "all", label: "全部" }, { id: "tw", label: "台灣" }, { id: "us", label: "美國" }];
const MARKET_LABEL: Record<string, string> = { tw: "台灣", us: "美國" };

interface Topic { id: string; label: string; hint: string }
interface Persona { key: string; platform: string; platformLabel: string; market: string; label: string; reference: string; pitch: string; format: string }
interface RegItem { id: string; law: string; article: string; title: string; gist: string; url: string; amended: string; secondary: boolean }
interface RegGroup { id: string; label: string; note: string; items: RegItem[] }
type Subject = { topicId?: string; customTopic?: string };
interface Idea { id: string; job: string; persona: string; answer: string; title: string; hook: string; concept: string; why: string; format: string; subject: Subject; topicLabel: string }
interface Issue { regulationId: string; quote: string; detail: string; suggestion: string }
type View = "studio" | "wall";

const NAME_KEY = "inspire.doctorName";
const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } };
const saveName = (n: string) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* 無痕模式：不記也能用 */ } };

const byline = (name: string) => (/醫師|醫生|Dr\.?/i.test(name) ? name : `${name} 醫師`);
const errText = (e: any) => String(e?.message ?? "").slice(0, 80) || "出了一點問題，請再試一次。";
const toTop = () => { try { window.scrollTo({ top: 0 }); } catch { /* 舊瀏覽器 */ } };

// ── 共用零件 ──

function Frame({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className="min-h-[100dvh] w-full" style={{ background: dark ? "#000" : "#fff", color: dark ? "#fff" : INK, fontFamily: FONT }}>
      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">{children}</div>
    </div>
  );
}

function Wordmark() {
  return <span className="text-[15px] font-medium uppercase" style={{ letterSpacing: "0.32em" }}>onBrand</span>;
}

function Nav({ onBack, right }: { onBack?: () => void; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between px-6" style={GLASS}>
      <div className="flex items-center gap-2">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="上一步" className="-ml-3 flex h-10 w-10 items-center justify-center rounded" style={{ color: INK }}>
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
        ) : null}
        <Wordmark />
      </div>
      <div className="text-[13px] font-medium" style={{ color: INK }}>{right}</div>
    </header>
  );
}

/** 設定器裡每一段的置中小標。 */
function Section({ title, caption, children }: { title: string; caption?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="px-6 pt-12">
      <h2 className="text-center text-[24px] font-medium" style={{ letterSpacing: "-0.01em" }}>{title}</h2>
      <div className="mt-6">{children}</div>
      {caption ? <div className="mt-5 text-center text-[13px] leading-relaxed" style={{ color: SUB }}>{caption}</div> : null}
    </section>
  );
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 mt-auto px-6 pt-3" style={{ ...GLASS, boxShadow: `inset 0 1px 0 ${PANEL}`, paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Btn({ kind = "primary", disabled, onClick, children, type = "button" }: {
  kind?: "primary" | "secondary"; disabled?: boolean; onClick?: () => void; children: React.ReactNode; type?: "button" | "submit";
}) {
  const primary = kind === "primary";
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className="flex h-11 w-full items-center justify-center gap-2 rounded px-4 text-[14px] font-medium"
      style={{ background: disabled ? PANEL : primary ? BLUE : PANEL, color: disabled ? FAINT : primary ? "#fff" : "#393C41" }}>
      {children}
    </button>
  );
}

/** 選項：選取＝藍色粗外框（不改底色、不加動畫，低階手機也一致）。 */
function Option({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      className="w-full rounded px-4 py-3.5 text-left disabled:opacity-40"
      style={{ background: "#fff", boxShadow: on ? `inset 0 0 0 3px ${BLUE}` : `inset 0 0 0 1px ${LINE}` }}>
      {children}
    </button>
  );
}

// ── 首頁：全螢幕主視覺 ──

/** 主視覺：一條血壓波形（自己畫的線條，不是任何品牌素材）。 */
function PulseArt() {
  return (
    <svg viewBox="0 0 480 260" className="w-full" aria-hidden="true">
      <defs>
        <linearGradient id="inspire-pulse" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.25" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.75" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[60, 110, 160, 210].map((y) => <line key={y} x1="0" x2="480" y1={y} y2={y} stroke="#fff" strokeOpacity="0.06" />)}
      <path d="M0 150 H120 l14 -8 l12 8 h20 l10 26 l18 -130 l18 150 l12 -46 h26 l16 -22 l18 22 H480" fill="none" stroke="url(#inspire-pulse)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <text x="240" y="236" textAnchor="middle" fill="#fff" fillOpacity="0.5" fontSize="12" letterSpacing="4">130 / 80 mmHg</text>
    </svg>
  );
}

function Hero({ onDone, onBasis }: { onDone: (name: string) => void; onBasis: () => void }) {
  const [v, setV] = React.useState("");
  const ok = v.trim().length >= 1;
  return (
    <Frame dark>
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 70% at 50% 45%, #2A2D34 0%, #101114 55%, #000 100%)" }} />
      <header className="relative z-10 flex h-14 items-center px-6"><Wordmark /></header>
      <div className="relative z-10 px-6 pt-10 text-center">
        <h1 className="text-[40px] font-medium leading-[1.15]" style={{ letterSpacing: "-0.02em" }}>換一種說法</h1>
        <p className="mt-2 text-[15px]" style={{ color: "rgba(255,255,255,0.8)" }}>高血壓衛教 × 各平台熱門創作者的說話風格</p>
      </div>
      <div className="relative z-10 flex flex-1 items-center"><PulseArt /></div>
      <form className="relative z-10 px-6" style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }} onSubmit={(e) => { e.preventDefault(); if (ok) onDone(v.trim()); }}>
        <label htmlFor="inspire-name" className="mb-2 block text-center text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>怎麼稱呼您</label>
        <div className="flex items-center gap-3 rounded px-4" style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(12px)" }}>
          <input id="inspire-name" value={v} onChange={(e) => setV(e.target.value)} maxLength={20} autoComplete="off" placeholder="王小明"
            className="h-11 min-w-0 flex-1 bg-transparent text-center text-[16px] font-medium text-white outline-none placeholder:text-white/40" />
          <span className="shrink-0 text-[14px]" style={{ color: "rgba(255,255,255,0.7)" }}>醫師</span>
        </div>
        <div className="mt-3 flex gap-3">
          <button type="submit" disabled={!ok} className="h-11 flex-1 rounded text-[14px] font-medium text-white" style={{ background: BLUE, opacity: ok ? 1 : 0.5 }}>開始設定</button>
          <button type="button" onClick={onBasis} className="h-11 flex-1 rounded text-[14px] font-medium" style={{ background: "rgba(244,244,244,0.9)", color: "#393C41" }}>審查依據</button>
        </div>
        <p className="mt-3 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>名字只用來署名，存在這支手機上，不需要註冊。</p>
      </form>
    </Frame>
  );
}

// ── 條文清單 ──

function StatusMark({ status }: { status: string }) {
  if (status === "checking") return <FontAwesomeIcon icon={faCircleNotch} spin style={{ color: BLUE }} />;
  if (status === "pass") return <FontAwesomeIcon icon={faCheck} style={{ color: OK }} />;
  if (status === "issue") return <FontAwesomeIcon icon={faTriangleExclamation} style={{ color: WARN }} />;
  if (status === "skipped") return <FontAwesomeIcon icon={faMinus} style={{ color: FAINT }} />;
  return <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#D0D1D2" }} />;
}
const STATUS_TEXT: Record<string, string> = { pending: "等待中", checking: "審查中", pass: "通過", issue: "有疑慮", skipped: "這一組沒審到" };

/** 審查時帶狀態；「審查依據」不帶狀態、改顯示條文重點。 */
function RegulationList({ groups, statusOf, issues }: { groups: RegGroup[]; statusOf?: (g: string) => string; issues?: Issue[] }) {
  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const st = statusOf?.(g.id);
        return (
          <div key={g.id} className="rounded p-4" style={{ background: PANEL, boxShadow: st === "checking" ? `inset 0 0 0 2px ${BLUE}` : undefined }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14px] font-medium">{g.label}</div>
                <div className="mt-0.5 text-[12px]" style={{ color: SUB }}>{g.note}</div>
              </div>
              {st ? (
                <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[12px] font-medium" style={{ color: st === "issue" ? WARN : st === "pass" ? INK : SUB }}>
                  <StatusMark status={st} />{STATUS_TEXT[st] ?? ""}
                </span>
              ) : null}
            </div>
            <ul className="mt-3 space-y-2">
              {g.items.map((r) => {
                const hit = issues?.filter((i) => i.regulationId === r.id) ?? [];
                return (
                  <li key={r.id} className="text-[12px] leading-relaxed" style={{ color: SUB }}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium underline decoration-[#D0D1D2] underline-offset-4" style={{ color: INK }}>
                      {r.law} {r.article}
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="ml-1 text-[9px]" style={{ color: FAINT }} />
                    </a>
                    <span className="ml-1.5">{r.title}</span>
                    {!statusOf ? <div className="mt-0.5">{r.gist}（{r.amended}{r.secondary ? "；連結為二手出處，原文請向主管機關核對" : ""}）</div> : null}
                    {hit.map((i, k) => (
                      <div key={k} className="mt-1.5 rounded px-3 py-2" style={{ background: "#fff", color: WARN }}>「{i.quote}」<br />{i.detail}</div>
                    ))}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Sheet({ title, kicker, onClose, children, footer }: { title: React.ReactNode; kicker?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-center" style={{ background: "rgba(0,0,0,0.35)", fontFamily: FONT, color: INK }} role="dialog" aria-modal="true">
      <div className="flex h-[100dvh] w-full max-w-[480px] flex-col" style={{ background: "#fff" }}>
        <div className="flex items-start justify-between gap-3 px-6 pb-3 pt-4">
          <div className="min-w-0">
            {kicker ? <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: SUB }}>{kicker}</div> : null}
            <div className="mt-1 text-[20px] font-medium leading-snug">{title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉" className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded" style={{ background: PANEL }}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 pb-6 pt-2">{children}</div>
        {footer}
      </div>
    </div>
  );
}

const VERDICT: Record<string, { text: (n: number) => string; warn: boolean }> = {
  compliant: { text: () => "逐條審查完成，沒有發現疑慮。", warn: false },
  issues: { text: (n) => `審查對 ${n} 句提出建議。要不要改、怎麼改，由您決定。`, warn: true },
  partial: { text: (n) => `有幾組條文這次沒審到，請特別留意那幾組。${n ? `另外對 ${n} 句提出建議。` : ""}`, warn: true },
};

interface Advice { quote: string; suggestion: string; items: Array<{ ref: string; detail: string }> }
type Decision = "applied" | "kept";

/** 同一句被好幾條點名時合成一張建議卡；建議的改法取第一個有寫的。 */
function groupAdvice(issues: Issue[], groups: RegGroup[]): Advice[] {
  const refOf = new Map<string, string>();
  for (const g of groups) for (const r of g.items) refOf.set(r.id, `${r.law} ${r.article}`);
  const out: Advice[] = [];
  for (const i of issues) {
    let a = out.find((x) => x.quote === i.quote);
    if (!a) { a = { quote: i.quote, suggestion: "", items: [] }; out.push(a); }
    if (!a.suggestion && i.suggestion) a.suggestion = i.suggestion;
    a.items.push({ ref: refOf.get(i.regulationId) ?? i.regulationId, detail: i.detail });
  }
  return out;
}

/** 成稿裡還沒處理的疑慮句子畫底線。 */
function MarkedText({ text, quotes }: { text: string; quotes: string[] }) {
  const parts: Array<{ t: string; mark: boolean }> = [{ t: text, mark: false }];
  for (const q of quotes) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!;
      const at = p.mark ? -1 : p.t.indexOf(q);
      if (at < 0) continue;
      parts.splice(i, 1, { t: p.t.slice(0, at), mark: false }, { t: q, mark: true }, { t: p.t.slice(at + q.length), mark: false });
      break;
    }
  }
  return (
    <div className="whitespace-pre-wrap text-[16px] leading-[1.85]">
      {parts.map((p, i) => (p.mark
        ? <mark key={i} style={{ background: "#FFF4E0", color: INK, boxShadow: `inset 0 -2px 0 ${WARN}` }}>{p.t}</mark>
        : <React.Fragment key={i}>{p.t}</React.Fragment>))}
    </div>
  );
}

function DraftSheet({ doctor, idea, persona, groups, onClose }: { doctor: string; idea: Idea; persona?: Persona; groups: RegGroup[]; onClose: () => void }) {
  const T = trpc as any;
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [finished, setFinished] = React.useState(false);
  // 文字在醫師手上：審查只提建議，改不改都在這裡發生。
  const [text, setText] = React.useState("");
  const [reviewedText, setReviewedText] = React.useState("");
  const [issues, setIssues] = React.useState<Issue[]>([]);
  const [decisions, setDecisions] = React.useState<Record<string, Decision>>({});
  const [editing, setEditing] = React.useState(false);

  const onStarted = { onSuccess: (r: any) => { setFinished(false); setJobId(r.jobId); }, onError: (e: any) => setError(errText(e)) };
  const start = T.inspire.writeStart.useMutation(onStarted);
  const recheck = T.inspire.reviewStart.useMutation(onStarted);
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    start.mutate({ name: doctor, ...idea.subject, persona: idea.persona, title: idea.title, hook: idea.hook, concept: idea.concept, answer: idea.answer, why: idea.why });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const poll = T.inspire.writePoll.useQuery({ jobId: jobId ?? "" }, { enabled: !!jobId && !finished, refetchInterval: 1000 });
  const d = poll.data as any;
  React.useEffect(() => {
    if (!d || finished) return;
    if (d.stage === "done") {
      // 第一次：收下成稿；重審：文字留醫師改過的那一份，只換審查結果。
      setText((cur) => cur || d.text);
      setReviewedText(d.text);
      setIssues(d.issues ?? []);
      setDecisions({});
      setFinished(true);
    } else if (d.stage === "failed") setFinished(true);
  }, [d, finished]);

  const stage: string = error ? "failed" : d?.stage ?? "writing";
  const hasDraft = !!text;
  const statusOf = (g: string) => (d?.review as any[] | undefined)?.find((r) => r.group === g)?.status ?? "pending";
  const advice = groupAdvice(issues, groups);
  const openAdvice = advice.filter((a) => !decisions[a.quote] && text.includes(a.quote));
  const dirty = hasDraft && stage === "done" && text.trim() !== reviewedText.trim();
  const verdict = stage === "done" && d?.verdict ? VERDICT[d.verdict] : null;
  const reviewing = stage === "reviewing" || recheck.isPending;

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* 不支援就讓用戶手動選取 */ }
  };
  const apply = (a: Advice) => { setText((cur) => cur.replace(a.quote, a.suggestion).replace(/\n{3,}/g, "\n\n")); setDecisions((m) => ({ ...m, [a.quote]: "applied" })); };
  const keep = (a: Advice) => setDecisions((m) => ({ ...m, [a.quote]: "kept" }));
  const reReview = () => { setEditing(false); setError(""); recheck.mutate({ text }); };

  return (
    <Sheet onClose={onClose} title={idea.title}
      kicker={<>{persona ? <FontAwesomeIcon icon={PLATFORM_ICON[persona.platform]} /> : null}<span>{persona?.platformLabel}・{persona?.format}・{persona?.label}</span></>}
      footer={hasDraft ? (
        <BottomBar>
          {dirty && !reviewing ? <Btn onClick={reReview}>用改過的內容重新審查</Btn> : null}
          <Btn kind={dirty && !reviewing ? "secondary" : "primary"} onClick={copy}><FontAwesomeIcon icon={copied ? faCheck : faCopy} />{copied ? "已複製" : "複製全文"}</Btn>
        </BottomBar>
      ) : undefined}>
      {stage === "failed" ? (
        <div className="rounded p-4 text-[14px]" style={{ background: PANEL }}>
          {error || (d?.lost ? "進度不見了（伺服器剛更新），請關掉再試一次。" : hasDraft ? "這次審查沒有完成，請再按一次重新審查。" : "這一篇沒有寫成功，請關掉再採用一次。")}
        </div>
      ) : null}

      {!hasDraft && stage !== "failed" ? (
        <div className="flex items-center gap-3 rounded p-4 text-[14px] font-medium" style={{ background: PANEL }}>
          <FontAwesomeIcon icon={faCircleNotch} spin style={{ color: BLUE }} />{stage === "writing" ? "正在寫成稿" : "正在逐條審查"}
        </div>
      ) : null}

      {hasDraft ? (
        <div>
          {reviewing ? (
            <div className="mb-4 flex items-center gap-3 rounded px-4 py-3 text-[13px] font-medium" style={{ background: PANEL }}>
              <FontAwesomeIcon icon={faCircleNotch} spin style={{ color: BLUE }} />正在重新審查
            </div>
          ) : dirty ? (
            <div className="mb-4 rounded px-4 py-3 text-[13px] leading-relaxed" style={{ background: PANEL, color: WARN }}>內容改過了，下面的審查結果是改之前的。可以按最下面的按鈕重新審查。</div>
          ) : verdict ? (
            <div className="mb-4 flex items-start gap-2 rounded px-4 py-3 text-[13px] leading-relaxed" style={{ background: PANEL, color: verdict.warn ? WARN : INK }}>
              <span className="pt-0.5"><FontAwesomeIcon icon={verdict.warn ? faTriangleExclamation : faCheck} style={{ color: verdict.warn ? WARN : OK }} /></span>
              <span>{verdict.text(advice.length)}</span>
            </div>
          ) : null}

          {editing ? (
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16}
              className="w-full rounded p-4 text-[16px] leading-[1.8] outline-none" style={{ background: PANEL, color: INK, boxShadow: `inset 0 0 0 3px ${BLUE}` }} />
          ) : <MarkedText text={text} quotes={openAdvice.map((a) => a.quote)} />}
          <button type="button" onClick={() => setEditing((v) => !v)} className="mt-3 text-[13px] font-medium underline decoration-[#D0D1D2] underline-offset-4" style={{ color: "#393C41" }}>
            {editing ? "完成修改" : "自己修改內容"}
          </button>
        </div>
      ) : null}

      {hasDraft && advice.length && !reviewing ? (
        <div>
          <div className="mb-3 text-[17px] font-medium">審查建議</div>
          <div className="space-y-2">
            {advice.map((a) => {
              const dec = decisions[a.quote];
              const gone = !dec && !text.includes(a.quote);
              return (
                <div key={a.quote} className="rounded p-4" style={{ background: PANEL }}>
                  <div className="text-[11px] font-medium" style={{ color: SUB }}>原句</div>
                  <div className="mt-1 text-[14px] leading-relaxed">「{a.quote}」</div>
                  <ul className="mt-3 space-y-1">
                    {a.items.map((it, k) => (
                      <li key={k} className="text-[12px] leading-relaxed" style={{ color: SUB }}><span className="font-medium" style={{ color: INK }}>{it.ref}</span>　{it.detail}</li>
                    ))}
                  </ul>
                  <div className="mt-3 text-[11px] font-medium" style={{ color: SUB }}>建議</div>
                  <div className="mt-1 rounded px-3 py-2 text-[14px] leading-relaxed" style={{ background: "#fff" }}>{a.suggestion ? `「${a.suggestion}」` : "建議拿掉這一句。"}</div>
                  {dec || gone ? (
                    <div className="mt-3 text-[12px] font-medium" style={{ color: SUB }}>
                      {dec === "applied" ? "已照建議修改" : dec === "kept" ? "維持原句" : "這一句已經改過"}
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => apply(a)} className="h-10 flex-1 rounded text-[13px] font-medium text-white" style={{ background: BLUE }}>{a.suggestion ? "照建議修改" : "拿掉這一句"}</button>
                      <button type="button" onClick={() => keep(a)} className="h-10 flex-1 rounded text-[13px] font-medium" style={{ background: "#fff", color: "#393C41" }}>維持原句</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {stage !== "failed" || hasDraft ? (
        <div>
          <div className="mb-3 text-[17px] font-medium">逐條審查</div>
          <RegulationList groups={groups} statusOf={statusOf} />
        </div>
      ) : null}

      <p className="text-[12px] leading-relaxed" style={{ color: FAINT }}>
        內容由 AI 產生，審查也是 AI 依條文重點做的初步對照，建議僅供參考，不是法律意見。發布前請您自己看過，必要時請教所屬機構或法律專業人員。
      </p>
    </Sheet>
  );
}

function BasisSheet({ groups, facts, factSource, checkedAt, onClose }: { groups: RegGroup[]; facts: any[]; factSource?: { url: string; label: string }; checkedAt?: string; onClose: () => void }) {
  return (
    <Sheet title="審查依據" kicker="每一篇成稿會逐條對照這些條文" onClose={onClose}>
      <RegulationList groups={groups} />
      <div className="rounded p-4 text-[12px] leading-relaxed" style={{ background: PANEL, color: SUB }}>
        <div className="mb-2 text-[14px] font-medium" style={{ color: INK }}>事實白名單</div>
        <ul className="list-disc space-y-1 pl-4">{facts.map((f: any) => <li key={f.id}>{f.text}</li>)}</ul>
        {factSource ? (
          <a href={factSource.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-medium underline decoration-[#D0D1D2] underline-offset-4" style={{ color: INK }}>出處：{factSource.label}</a>
        ) : null}
      </div>
      <p className="text-[12px] leading-relaxed" style={{ color: FAINT }}>條文最後核對日期：{checkedAt}。條文重點是我們寫的摘要，原文以連結的官方頁面為準。</p>
    </Sheet>
  );
}

/** 規格列：上面大字、下面小字（靈感卡與預覽共用）。 */
function Specs({ items }: { items: Array<{ value: React.ReactNode; label: string }> }) {
  return (
    <div className="flex">
      {items.map((s, i) => (
        <div key={i} className="min-w-0 flex-1 px-1 text-center">
          <div className="truncate text-[15px] font-medium">{s.value}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: SUB }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── 主頁 ──

export default function InspireDemoPage() {
  const T = trpc as any;
  const [doctor, setDoctor] = React.useState<string>(() => readName());
  const cfg = T.inspire.config.useQuery(undefined, { staleTime: 600_000 });
  const topics: Topic[] = cfg.data?.topics ?? [];
  const personas: Persona[] = cfg.data?.personas ?? [];
  const groups: RegGroup[] = cfg.data?.regulationGroups ?? [];
  const maxPersonas: number = cfg.data?.maxPersonas ?? 4;

  const [view, setView] = React.useState<View>("studio");
  const [topicId, setTopicId] = React.useState<string>("");
  const [custom, setCustom] = React.useState("");
  const [platform, setPlatform] = React.useState<string>("facebook");
  const [market, setMarket] = React.useState<string>("all");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [ideas, setIdeas] = React.useState<Idea[]>([]);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState("");
  const [open, setOpen] = React.useState<Idea | null>(null);
  const [showBasis, setShowBasis] = React.useState(false);

  const subject: Subject = custom.trim() ? { customTopic: custom.trim() } : { topicId };
  const hasTopic = !!custom.trim() || !!topicId;
  const topic = topics.find((t) => t.id === topicId);
  const topicLabel = custom.trim() || topic?.label || "";
  // 切角屬於想的當下那個議題；之後換議題，舊卡採用時仍照原議題寫。
  const runCtx = React.useRef<{ subject: Subject; topicLabel: string }>({ subject, topicLabel });
  const personaOf = (k: string) => personas.find((p) => p.key === k);

  const start = T.inspire.ideateStart.useMutation({
    onSuccess: (r: any) => setJobId(r.jobId),
    onError: (e: any) => { setPending([]); setNotice(errText(e)); },
  });
  const poll = T.inspire.ideatePoll.useQuery({ jobId: jobId ?? "" }, { enabled: !!jobId, refetchInterval: 1200 });
  React.useEffect(() => {
    const d = poll.data as any;
    if (!jobId || !d) return;
    // 誰先想完誰先出現：每次 poll 把這一輪目前的點子整批換上去。
    const got: Idea[] = (d.ideas ?? []).map((a: any) => ({ ...a, id: `${jobId}:${a.persona}:${a.title}`, job: jobId, ...runCtx.current }));
    setIdeas((cur) => [...got, ...cur.filter((i) => i.job !== jobId)]);
    setPending(d.pending ?? []);
    if (!d.done) return;
    if (d.lost) setNotice("這一輪的進度不見了（伺服器剛更新），請再按一次。");
    else if (!got.length) setNotice("這一輪沒有想出來，請再按一次。");
    else if (d.failed?.length) setNotice(`有 ${d.failed.length} 位這一輪沒想出來，可以再請他想一次。`);
    setPending([]); setJobId(null);
  }, [poll.data, jobId]);

  const busy = start.isPending || !!jobId;
  const run = (keys: string[], ctx = { subject, topicLabel }) => {
    if (busy || !keys.length || !(ctx.subject.customTopic || ctx.subject.topicId)) return;
    setNotice(""); setPending(keys); setView("wall");
    runCtx.current = ctx;
    start.mutate({ name: doctor, ...ctx.subject, personas: keys, avoid: ideas.map((i) => i.title).slice(0, 40) });
    toTop();
  };
  const toggle = (k: string) => setPicked((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : cur.length >= maxPersonas ? cur : [...cur, k]));
  const go = (v: View) => { setView(v); toTop(); };

  const basis = showBasis ? (
    <BasisSheet groups={groups} facts={cfg.data?.facts ?? []} factSource={cfg.data?.factSource} checkedAt={cfg.data?.checkedAt} onClose={() => setShowBasis(false)} />
  ) : null;

  if (!doctor) return <><Hero onDone={(n) => { saveName(n); setDoctor(n); }} onBasis={() => setShowBasis(true)} />{basis}</>;

  const tab = personas.find((p) => p.platform === platform);
  const shown = personas.filter((p) => p.platform === platform && (market === "all" || p.market === market));
  const pickedPersonas = picked.map(personaOf).filter(Boolean) as Persona[];
  const ready = hasTopic && picked.length > 0;

  return (
    <Frame>
      {view === "studio" ? (
        <>
          <Nav right={<button type="button" onClick={() => { saveName(""); setDoctor(""); }}>換名字</button>} />

          {/* 目前的設定——相當於設定器最上面那張車圖 */}
          <div className="px-6 pb-2 pt-6 text-center">
            <div className="text-[13px]" style={{ color: SUB }}>{byline(doctor)}的內容設定</div>
            <h1 className="mx-auto mt-2 max-w-[360px] text-[32px] font-medium leading-[1.2]" style={{ letterSpacing: "-0.02em" }}>{topicLabel || "今天想講什麼"}</h1>
            <div className="mt-6 rounded py-5" style={{ background: PANEL }}>
              <Specs items={[
                { value: hasTopic ? "已選" : "未選", label: "議題" },
                { value: `${picked.length}／${maxPersonas}`, label: "說話風格" },
                { value: pickedPersonas.length ? Array.from(new Set(pickedPersonas.map((p) => p.platformLabel))).length : 0, label: "平台" },
              ]} />
            </div>
          </div>

          <Section title="議題" caption={custom.trim() ? "自訂議題" : topic?.hint ?? "選一個高血壓議題，或在下面自己寫"}>
            <div className="grid grid-cols-2 gap-2">
              {topics.map((t) => (
                <Option key={t.id} on={!custom.trim() && topicId === t.id} onClick={() => { setTopicId(t.id); setCustom(""); }}>
                  <div className="text-[14px] font-medium leading-snug">{t.label}</div>
                </Option>
              ))}
            </div>
            <div className="mt-2 rounded px-4" style={{ background: PANEL, boxShadow: custom.trim() ? `inset 0 0 0 3px ${BLUE}` : undefined }}>
              <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={60} placeholder="自己寫一個跟血壓有關的題目"
                className="h-11 w-full bg-transparent text-center text-[14px] outline-none" style={{ color: INK }} />
            </div>
          </Section>

          <Section title="平台" caption={tab ? <><span className="font-medium" style={{ color: INK }}>{tab.platformLabel}</span><br />寫成{tab.format}</> : null}>
            <div className="flex justify-center gap-4" role="tablist">
              {PLATFORM_ORDER.map((pf) => {
                const on = platform === pf;
                const n = picked.filter((k) => personaOf(k)?.platform === pf).length;
                return (
                  <button key={pf} type="button" role="tab" aria-selected={on} aria-label={pf} onClick={() => setPlatform(pf)}
                    className="relative flex h-14 w-14 items-center justify-center rounded-full"
                    style={{ boxShadow: on ? `0 0 0 3px #fff, 0 0 0 5px ${BLUE}` : undefined }}>
                    <span className="flex h-full w-full items-center justify-center rounded-full text-[18px]" style={{ background: on ? INK : PANEL, color: on ? "#fff" : INK }}>
                      <FontAwesomeIcon icon={PLATFORM_ICON[pf]} />
                    </span>
                    {n ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium text-white" style={{ background: BLUE }}>{n}</span> : null}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="說話風格" caption={<>最多選 {maxPersonas} 位，可以跨平台；每一位會各想 {cfg.data?.ideasPerPersona ?? 3} 個點子。<br />每個風格是一位依排行榜前段創作者的公開手法訓練的 agent，不使用任何人的名字或肖像，寫出來的都是您本人的口吻。</>}>
            <div className="mb-4 flex rounded p-1" style={{ background: PANEL }}>
              {MARKETS.map((m) => (
                <button key={m.id} type="button" aria-pressed={market === m.id} onClick={() => setMarket(m.id)}
                  className="h-9 flex-1 rounded text-[13px] font-medium" style={{ background: market === m.id ? "#fff" : "transparent", color: market === m.id ? INK : SUB }}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {shown.map((p) => {
                const on = picked.includes(p.key);
                return (
                  <Option key={p.key} on={on} disabled={!on && picked.length >= maxPersonas} onClick={() => toggle(p.key)}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[16px] font-medium">{p.label}</span>
                      <span className="shrink-0 text-[12px]" style={{ color: SUB }}>{MARKET_LABEL[p.market]}</span>
                    </div>
                    <div className="mt-1 text-[12px] font-medium" style={{ color: "#393C41" }}>參考：{p.reference}</div>
                    <div className="mt-1 text-[12px] leading-relaxed" style={{ color: SUB }}>{p.pitch}</div>
                  </Option>
                );
              })}
              {!shown.length ? <div className="py-8 text-center text-[13px]" style={{ color: FAINT }}>這個組合目前沒有風格。</div> : null}
            </div>
          </Section>

          <div className="px-6 pb-8 pt-10 text-center">
            <button type="button" onClick={() => setShowBasis(true)} className="text-[13px] font-medium underline decoration-[#D0D1D2] underline-offset-4" style={{ color: "#393C41" }}>審查依據與事實出處</button>
            {ideas.length ? <div className="mt-4"><button type="button" onClick={() => go("wall")} className="text-[13px] font-medium underline decoration-[#D0D1D2] underline-offset-4" style={{ color: "#393C41" }}>回到靈感牆（{ideas.length}）</button></div> : null}
          </div>

          {/* 底部摘要列：左邊是目前的設定，右邊是主按鈕 */}
          <div className="sticky bottom-0 z-20 mt-auto flex items-center gap-4 px-6 pt-3" style={{ ...GLASS, boxShadow: `inset 0 1px 0 ${PANEL}`, paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium">{picked.length ? `${picked.length} 種風格` : "還沒選風格"}</div>
              <div className="truncate text-[12px]" style={{ color: SUB }}>{topicLabel || "還沒選議題"}</div>
            </div>
            <button type="button" disabled={busy || !ready} onClick={() => run(picked)}
              className="h-11 shrink-0 rounded px-6 text-[14px] font-medium" style={{ background: ready && !busy ? BLUE : PANEL, color: ready && !busy ? "#fff" : FAINT }}>
              產生靈感
            </button>
          </div>
        </>
      ) : null}

      {view === "wall" ? (
        <>
          <Nav onBack={() => go("studio")} right={ideas.length ? `${ideas.length} 個點子` : undefined} />
          <div className="px-6 pb-6 pt-8 text-center">
            <h1 className="text-[32px] font-medium" style={{ letterSpacing: "-0.02em" }}>靈感牆</h1>
            <p className="mt-1 text-[14px]" style={{ color: SUB }}>{byline(doctor)}・{runCtx.current.topicLabel || topicLabel}</p>
          </div>
          <div className="space-y-4 px-6 pb-8">
            {notice ? <div className="rounded px-4 py-3 text-center text-[13px]" style={{ background: PANEL, color: WARN }}>{notice}</div> : null}
            {pending.map((k) => (
              <div key={`p-${k}`} className="flex items-center justify-center gap-3 rounded py-10 text-[14px] font-medium" style={{ background: PANEL, color: SUB }}>
                <FontAwesomeIcon icon={faCircleNotch} spin style={{ color: BLUE }} />{personaOf(k)?.label}正在想
              </div>
            ))}
            {!ideas.length && !pending.length && !notice ? <div className="py-10 text-center text-[13px]" style={{ color: FAINT }}>還沒有點子。</div> : null}
            {ideas.map((i) => {
              const p = personaOf(i.persona);
              return (
                <article key={i.id} className="rounded px-5 pb-5 pt-6" style={{ background: PANEL }}>
                  <h3 className="text-[22px] font-medium leading-snug" style={{ letterSpacing: "-0.01em" }}>{i.title}</h3>
                  <p className="mt-1 text-[12px]" style={{ color: SUB }}>{p?.label}・參考{p?.reference}</p>
                  <p className="mt-4 text-[15px] leading-relaxed">「{i.hook}」</p>
                  {i.concept ? <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "#393C41" }}><span className="font-medium" style={{ color: INK }}>怎麼做　</span>{i.concept}</p> : null}
                  {i.why ? <p className="mt-2 text-[12px] leading-relaxed" style={{ color: SUB }}>{i.why}</p> : null}
                  <div className="my-5 h-px" style={{ background: LINE }} />
                  <Specs items={[
                    { value: <><FontAwesomeIcon icon={p ? PLATFORM_ICON[p.platform] : faCheck} className="mr-1.5 text-[13px]" />{p?.platformLabel}</>, label: "平台" },
                    { value: i.format, label: "形式" },
                    { value: p ? MARKET_LABEL[p.market] : "", label: "風格市場" },
                  ]} />
                  <div className="mt-5 flex gap-3">
                    <button type="button" onClick={() => setOpen(i)} className="h-11 flex-1 rounded text-[14px] font-medium text-white" style={{ background: BLUE }}>採用並寫成稿</button>
                    <button type="button" disabled={busy} onClick={() => run([i.persona], { subject: i.subject, topicLabel: i.topicLabel })}
                      className="h-11 flex-1 rounded text-[14px] font-medium disabled:opacity-40" style={{ background: "#fff", color: "#393C41" }}>請他再想</button>
                  </div>
                </article>
              );
            })}
            <p className="pt-2 text-center text-[11px] leading-relaxed" style={{ color: FAINT }}>示範頁：內容由 AI 產生，僅供醫師參考與改寫，不是醫療建議，也不是法律意見。</p>
          </div>
          <BottomBar><Btn kind="secondary" disabled={busy} onClick={() => go("studio")}>調整議題與風格</Btn></BottomBar>
        </>
      ) : null}

      {open ? <DraftSheet key={open.id} doctor={doctor} idea={open} persona={personaOf(open.persona)} groups={groups} onClose={() => setOpen(null)} /> : null}
      {basis}
    </Frame>
  );
}
