/**
 * InspireDemoPage — 醫師自媒體示範頁（/inspire），免登入。
 *
 * 2026-10-07（CJ「醫生掃 QR code、輸入自己的名字後，選主要議題、搭配不同網紅語調，產出文章內容」
 * 「真實網紅名字不要露出」「展現出正在審查哪些條文」→「mobile first 的介面，Tesla UI」）。
 *   · 手機優先、一步一個畫面：名字 → 議題 → 風格 → 靈感 → 成稿。主要按鈕固定在畫面底部，拇指按得到。
 *   · 視覺只取 Tesla 訂車流程的做法（白底、大標題、灰色面板、4px 圓角、單一藍色主按鈕、
 *     選項用外框表示選取），不使用它的字體、標誌或素材。這頁刻意不跟 OnBrand 外框。
 *   · 靈感卡只放三樣（切角、開場第一句、為什麼這樣切）；採用了才寫成稿，沒選的不花錢。
 *   · 成稿審完才顯示；審查面板逐組列出條文與出處連結，狀態對應伺服器真的那一次審查。
 * 題庫、風格、條文都在 server/content/core/inspire/，這裡不留副本。
 * 這頁只給台灣醫師用，所以只有中文。
 */
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare, faCheck, faChevronLeft, faCircleNotch, faCopy, faMinus, faTriangleExclamation, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { faFacebookF, faInstagram, faTiktok, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { trpc } from "../../../lib/trpc";

const INK = "#171A20", SUB = "#5C5E62", FAINT = "#8E8E8E", PANEL = "#F4F4F4", LINE = "#E2E3E3", BLUE = "#3E6AE1";
const OK = "#12BB00", WARN = "#B45309";
const FONT = `system-ui, -apple-system, "Segoe UI", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;

const PLATFORM_ICON: Record<string, any> = { facebook: faFacebookF, youtube: faYoutube, instagram: faInstagram, tiktok: faTiktok };
const PLATFORM_ORDER = ["facebook", "youtube", "instagram", "tiktok"];
const MARKETS: Array<{ id: string; label: string }> = [{ id: "all", label: "全部" }, { id: "tw", label: "台灣" }, { id: "us", label: "美國" }];
const MARKET_LABEL: Record<string, string> = { tw: "台灣", us: "美國" };

interface Topic { id: string; label: string; hint: string }
interface Persona { key: string; platform: string; platformLabel: string; market: string; label: string; pitch: string; format: string }
interface RegItem { id: string; law: string; article: string; title: string; gist: string; url: string; amended: string; secondary: boolean }
interface RegGroup { id: string; label: string; note: string; items: RegItem[] }
type Subject = { topicId?: string; customTopic?: string };
interface Idea { id: string; persona: string; answer: string; title: string; hook: string; why: string; format: string; subject: Subject }
interface Issue { regulationId: string; quote: string; detail: string }
type Step = "topic" | "style" | "wall";

const NAME_KEY = "inspire.doctorName";
const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } };
const saveName = (n: string) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* 無痕模式：不記也能用 */ } };

let seq = 0;
const newId = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;
const byline = (name: string) => (/醫師|醫生|Dr\.?/i.test(name) ? name : `${name} 醫師`);
const errText = (e: any) => String(e?.message ?? "").slice(0, 80) || "出了一點問題，請再試一次。";

// ── 共用零件 ──

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full" style={{ background: "#fff", color: INK, fontFamily: FONT }}>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col">{children}</div>
    </div>
  );
}

function TopBar({ onBack, right, progress }: { onBack?: () => void; right?: React.ReactNode; progress?: number }) {
  return (
    <header className="sticky top-0 z-20" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)" }}>
      <div className="flex h-14 items-center justify-between px-2">
        <div className="flex w-20 items-center">
          {onBack ? (
            <button type="button" onClick={onBack} aria-label="上一步" className="flex h-11 w-11 items-center justify-center rounded" style={{ color: INK }}>
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
          ) : null}
        </div>
        <div className="text-[13px] font-medium uppercase" style={{ letterSpacing: "0.28em" }}>onBrand</div>
        <div className="flex w-20 items-center justify-end pr-2 text-[13px] font-medium" style={{ color: SUB }}>{right}</div>
      </div>
      {progress != null ? (
        <div className="h-[2px] w-full" style={{ background: PANEL }}>
          <div className="h-full transition-all duration-300" style={{ width: `${progress}%`, background: INK }} />
        </div>
      ) : null}
    </header>
  );
}

function Heading({ title, sub }: { title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="px-6 pb-6 pt-8 text-center">
      <h1 className="text-[28px] font-medium leading-[1.25]" style={{ letterSpacing: "-0.01em" }}>{title}</h1>
      {sub ? <p className="mx-auto mt-2 max-w-[340px] text-[14px] leading-relaxed" style={{ color: SUB }}>{sub}</p> : null}
    </div>
  );
}

/** 固定在底部的按鈕列。 */
function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 mt-auto px-6 pt-3" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
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
      className="flex h-12 w-full items-center justify-center gap-2 rounded text-[14px] font-medium transition-colors"
      style={{ background: disabled ? PANEL : primary ? BLUE : PANEL, color: disabled ? FAINT : primary ? "#fff" : INK }}>
      {children}
    </button>
  );
}

/** 選項：選取＝藍色外框（不改底色）。 */
function Option({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} disabled={disabled} onClick={onClick}
      className="w-full rounded px-4 py-3.5 text-left transition-shadow disabled:opacity-40"
      style={{ background: "#fff", boxShadow: on ? `inset 0 0 0 2px ${BLUE}` : `inset 0 0 0 1px ${LINE}` }}>
      {children}
    </button>
  );
}

// ── 第 0 步：名字 ──

function NameStep({ onDone }: { onDone: (name: string) => void }) {
  const [v, setV] = React.useState("");
  const ok = v.trim().length >= 1;
  return (
    <Frame>
      <TopBar />
      <form className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); if (ok) onDone(v.trim()); }}>
        <div className="flex flex-1 flex-col justify-center pb-10">
          <Heading title={<>同一個高血壓議題<br />換一種說法</>} sub="挑幾種各平台熱門創作者的說話風格，AI 各想一個切角，再寫成可以直接用的內容，並逐條對照醫療法規。" />
          <div className="px-6">
            <label htmlFor="inspire-name" className="mb-2 block text-[13px] font-medium" style={{ color: SUB }}>怎麼稱呼您</label>
            <div className="flex items-center gap-3 rounded px-4" style={{ background: PANEL }}>
              <input id="inspire-name" value={v} onChange={(e) => setV(e.target.value)} maxLength={20} autoComplete="off" placeholder="王小明"
                className="h-12 min-w-0 flex-1 bg-transparent text-[16px] font-medium outline-none" style={{ color: INK }} />
              <span className="shrink-0 text-[14px]" style={{ color: SUB }}>醫師</span>
            </div>
            <p className="mt-3 text-[12px]" style={{ color: FAINT }}>名字只用來署名，存在這支手機上，不需要註冊。</p>
          </div>
        </div>
        <BottomBar><Btn type="submit" disabled={!ok}>開始</Btn></BottomBar>
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

const VERDICT: Record<string, { text: string; warn: boolean }> = {
  compliant: { text: "逐條審查完成，沒有發現疑慮。", warn: false },
  fixed: { text: "審查發現幾句有疑慮，已經改寫。改寫後的版本沒有再審一次，請您確認。", warn: true },
  flagged: { text: "審查發現幾句有疑慮，自動改寫沒有成功，請您自己修改後再使用。", warn: true },
  partial: { text: "有幾組條文這次沒審到，請您特別留意那幾組。", warn: true },
};

function DraftSheet({ doctor, idea, persona, groups, onClose }: { doctor: string; idea: Idea; persona?: Persona; groups: RegGroup[]; onClose: () => void }) {
  const T = trpc as any;
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [showBefore, setShowBefore] = React.useState(false);
  const [finished, setFinished] = React.useState(false);
  const start = T.inspire.writeStart.useMutation({
    onSuccess: (r: any) => setJobId(r.jobId),
    onError: (e: any) => setError(errText(e)),
  });
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    start.mutate({ name: doctor, ...idea.subject, persona: idea.persona, title: idea.title, hook: idea.hook, answer: idea.answer, why: idea.why });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const poll = T.inspire.writePoll.useQuery({ jobId: jobId ?? "" }, { enabled: !!jobId && !finished, refetchInterval: 1000 });
  const d = poll.data as any;
  React.useEffect(() => { if (d && (d.stage === "done" || d.stage === "failed")) setFinished(true); }, [d]);

  const stage: string = error ? "failed" : d?.stage ?? "writing";
  const statusOf = (g: string) => (d?.review as any[] | undefined)?.find((r) => r.group === g)?.status ?? "pending";
  const verdict = d?.verdict ? VERDICT[d.verdict] : null;
  const text: string = showBefore ? d?.before ?? "" : d?.text ?? "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(d?.text ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* 不支援就讓用戶手動選取 */ }
  };
  const stageText = stage === "writing" ? "正在寫成稿" : stage === "reviewing" ? "正在逐條審查" : stage === "fixing" ? "正在改寫有疑慮的句子" : "審查完成";

  return (
    <Sheet onClose={onClose} title={idea.title}
      kicker={<>{persona ? <FontAwesomeIcon icon={PLATFORM_ICON[persona.platform]} /> : null}<span>{persona?.platformLabel}・{persona?.format}・{persona?.label}</span></>}
      footer={stage === "done" ? (
        <BottomBar>
          <Btn onClick={copy}><FontAwesomeIcon icon={copied ? faCheck : faCopy} />{copied ? "已複製" : "複製全文"}</Btn>
          {d?.before ? <Btn kind="secondary" onClick={() => setShowBefore((v) => !v)}>{showBefore ? "看改寫後的版本" : "看改寫前的原稿"}</Btn> : null}
        </BottomBar>
      ) : undefined}>
      {stage === "failed" ? (
        <div className="rounded p-4 text-[14px]" style={{ background: PANEL }}>
          {error || (d?.lost ? "這一篇的進度不見了（伺服器剛更新），請關掉再採用一次。" : "這一篇沒有寫成功，請關掉再採用一次。")}
        </div>
      ) : null}

      {stage !== "failed" && stage !== "done" ? (
        <div className="flex items-center gap-3 rounded p-4 text-[14px] font-medium" style={{ background: PANEL }}>
          <FontAwesomeIcon icon={faCircleNotch} spin style={{ color: BLUE }} />{stageText}
        </div>
      ) : null}

      {stage === "done" ? (
        <div>
          {verdict ? (
            <div className="mb-4 flex items-start gap-2 rounded px-4 py-3 text-[13px] leading-relaxed" style={{ background: PANEL, color: verdict.warn ? WARN : INK }}>
              <span className="pt-0.5"><FontAwesomeIcon icon={verdict.warn ? faTriangleExclamation : faCheck} style={{ color: verdict.warn ? WARN : OK }} /></span>
              <span>{verdict.text}</span>
            </div>
          ) : null}
          <div className="whitespace-pre-wrap text-[16px] leading-[1.85]">{text}</div>
        </div>
      ) : null}

      {stage !== "failed" ? (
        <div>
          <div className="mb-3 text-[17px] font-medium">逐條審查</div>
          <RegulationList groups={groups} statusOf={statusOf} issues={stage === "done" ? (d?.issues as Issue[]) : undefined} />
        </div>
      ) : null}

      <p className="text-[12px] leading-relaxed" style={{ color: FAINT }}>
        內容由 AI 產生，審查也是 AI 依條文重點做的初步對照，不是法律意見。發布前請您自己看過，必要時請教所屬機構或法律專業人員。
      </p>
    </Sheet>
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

  const [step, setStep] = React.useState<Step>("topic");
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
  // 切角屬於想的當下那個議題；之後換議題，舊卡採用時仍照原議題寫。
  const runSubject = React.useRef<Subject>(subject);
  const hasTopic = !!custom.trim() || !!topicId;
  const topicLabel = custom.trim() || topics.find((t) => t.id === topicId)?.label || "";
  const personaOf = (k: string) => personas.find((p) => p.key === k);

  const start = T.inspire.ideateStart.useMutation({
    onSuccess: (r: any) => setJobId(r.jobId),
    onError: (e: any) => { setPending([]); setNotice(errText(e)); },
  });
  const poll = T.inspire.ideatePoll.useQuery({ jobId: jobId ?? "" }, { enabled: !!jobId, refetchInterval: 1200 });
  React.useEffect(() => {
    const d = poll.data as any;
    if (!jobId || !d?.done) return;
    const got: Idea[] = (d.ideas ?? []).map((a: any) => ({ ...a, id: newId(), subject: runSubject.current }));
    setIdeas((cur) => [...got, ...cur]);
    if (d.lost) setNotice("這一輪的進度不見了（伺服器剛更新），請再按一次。");
    else if (!got.length) setNotice("這一輪沒有想出來，請再按一次。");
    else if (d.failed?.length) setNotice(`有 ${d.failed.length} 種風格這一輪沒想出來，可以再請它想一次。`);
    setPending([]); setJobId(null);
  }, [poll.data, jobId]);

  const busy = start.isPending || !!jobId;
  const run = (keys: string[], count: number) => {
    if (busy || !hasTopic || !keys.length) return;
    setNotice(""); setPending(keys); setStep("wall");
    runSubject.current = subject;
    start.mutate({ name: doctor, ...subject, personas: keys, count, avoid: ideas.map((i) => i.title).slice(0, 30) });
    try { window.scrollTo({ top: 0 }); } catch { /* 舊瀏覽器 */ }
  };
  const toggle = (k: string) => setPicked((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : cur.length >= maxPersonas ? cur : [...cur, k]));
  const go = (s: Step) => { setStep(s); try { window.scrollTo({ top: 0 }); } catch { /* 舊瀏覽器 */ } };

  if (!doctor) return <NameStep onDone={(n) => { saveName(n); setDoctor(n); }} />;

  const basisLink = (
    <button type="button" onClick={() => setShowBasis(true)} className="mx-auto mt-6 block text-[12px] font-medium underline decoration-[#D0D1D2] underline-offset-4" style={{ color: SUB }}>
      審查依據與事實出處
    </button>
  );
  const shown = personas.filter((p) => p.platform === platform && (market === "all" || p.market === market));

  return (
    <Frame>
      {step === "topic" ? (
        <>
          <TopBar progress={33} right={<button type="button" onClick={() => { saveName(""); setDoctor(""); }}>換名字</button>} />
          <Heading title={<>{byline(doctor)}<br />今天想講什麼</>} sub="選一個高血壓議題，或自己寫一個。" />
          <div className="space-y-2 px-6 pb-6">
            {topics.map((t) => {
              const on = !custom.trim() && topicId === t.id;
              return (
                <Option key={t.id} on={on} onClick={() => { setTopicId(t.id); setCustom(""); }}>
                  <div className="text-[15px] font-medium">{t.label}</div>
                  <div className="mt-0.5 text-[12px]" style={{ color: SUB }}>{t.hint}</div>
                </Option>
              );
            })}
            <div className="rounded px-4" style={{ background: PANEL, boxShadow: custom.trim() ? `inset 0 0 0 2px ${BLUE}` : undefined }}>
              <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={60} placeholder="自己寫一個跟血壓有關的題目"
                className="h-12 w-full bg-transparent text-[15px] outline-none" style={{ color: INK }} />
            </div>
            {basisLink}
          </div>
          <BottomBar>
            <Btn disabled={!hasTopic} onClick={() => go("style")}>下一步</Btn>
            {ideas.length ? <Btn kind="secondary" onClick={() => go("wall")}>回到靈感牆（{ideas.length}）</Btn> : null}
          </BottomBar>
        </>
      ) : null}

      {step === "style" ? (
        <>
          <TopBar progress={66} onBack={() => go("topic")} right={`${picked.length}／${maxPersonas}`} />
          <Heading title="換誰的說法" sub={<>最多選 {maxPersonas} 種。風格取自各平台排行榜前段創作者的公開手法，不使用任何人的名字或肖像，寫出來的都是您本人的口吻。</>} />
          <div className="sticky top-[58px] z-10 px-6 pb-3 pt-1" style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)" }}>
            <div className="flex" style={{ boxShadow: `inset 0 -1px 0 ${LINE}` }} role="tablist">
              {PLATFORM_ORDER.map((pf) => {
                const on = platform === pf;
                const n = picked.filter((k) => personaOf(k)?.platform === pf).length;
                return (
                  <button key={pf} type="button" role="tab" aria-selected={on} onClick={() => setPlatform(pf)}
                    className="flex h-11 flex-1 items-center justify-center gap-1.5 text-[13px] font-medium"
                    style={{ color: on ? INK : SUB, boxShadow: on ? `inset 0 -2px 0 ${INK}` : undefined }}>
                    <FontAwesomeIcon icon={PLATFORM_ICON[pf]} />
                    {n ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] text-white" style={{ background: BLUE }}>{n}</span> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="flex gap-1 rounded p-1" style={{ background: PANEL }}>
                {MARKETS.map((m) => (
                  <button key={m.id} type="button" aria-pressed={market === m.id} onClick={() => setMarket(m.id)}
                    className="h-8 rounded px-3 text-[12px] font-medium" style={{ background: market === m.id ? "#fff" : "transparent", color: market === m.id ? INK : SUB }}>
                    {m.label}
                  </button>
                ))}
              </div>
              <span className="text-[12px]" style={{ color: SUB }}>{personas.find((p) => p.platform === platform)?.platformLabel}・寫成{personas.find((p) => p.platform === platform)?.format}</span>
            </div>
          </div>
          <div className="space-y-2 px-6 pb-6">
            {shown.map((p) => {
              const on = picked.includes(p.key);
              return (
                <Option key={p.key} on={on} disabled={!on && picked.length >= maxPersonas} onClick={() => toggle(p.key)}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[15px] font-medium">{p.label}</span>
                    <span className="shrink-0 text-[11px] font-medium" style={{ color: FAINT }}>{MARKET_LABEL[p.market]}</span>
                  </div>
                  <div className="mt-0.5 text-[12px] leading-relaxed" style={{ color: SUB }}>{p.pitch}</div>
                </Option>
              );
            })}
            {!shown.length ? <div className="py-10 text-center text-[13px]" style={{ color: FAINT }}>這個組合目前沒有風格。</div> : null}
          </div>
          <BottomBar>
            <Btn disabled={busy || !picked.length} onClick={() => run(picked, 1)}>
              {picked.length ? `請 ${picked.length} 種風格各想一個切角` : "至少選一種風格"}
            </Btn>
          </BottomBar>
        </>
      ) : null}

      {step === "wall" ? (
        <>
          <TopBar progress={100} onBack={() => go("style")} right={ideas.length ? `${ideas.length} 個` : undefined} />
          <Heading title="靈感牆" sub={topicLabel} />
          <div className="space-y-3 px-6 pb-6">
            {notice ? <div className="rounded px-4 py-3 text-[13px]" style={{ background: PANEL, color: WARN }}>{notice}</div> : null}
            {pending.map((k) => (
              <div key={`p-${k}`} className="flex items-center gap-3 rounded p-5 text-[14px] font-medium" style={{ background: PANEL, color: SUB }}>
                <FontAwesomeIcon icon={faCircleNotch} spin style={{ color: BLUE }} />{personaOf(k)?.label}正在想
              </div>
            ))}
            {!ideas.length && !pending.length && !notice ? <div className="py-10 text-center text-[13px]" style={{ color: FAINT }}>還沒有切角。</div> : null}
            {ideas.map((i) => {
              const p = personaOf(i.persona);
              return (
                <article key={i.id} className="rounded p-5" style={{ background: PANEL }}>
                  <div className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color: SUB }}>
                    {p ? <FontAwesomeIcon icon={PLATFORM_ICON[p.platform]} /> : null}
                    <span>{p?.platformLabel}・{p?.label}</span>
                  </div>
                  <h3 className="mt-3 text-[20px] font-medium leading-snug">{i.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed">「{i.hook}」</p>
                  {i.why ? <p className="mt-2 text-[12px] leading-relaxed" style={{ color: SUB }}>{i.why}</p> : null}
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => setOpen(i)} className="h-11 flex-1 rounded text-[14px] font-medium text-white" style={{ background: BLUE }}>採用，寫成{i.format}</button>
                    <button type="button" disabled={busy} onClick={() => run([i.persona], 3)} className="h-11 shrink-0 rounded px-4 text-[13px] font-medium disabled:opacity-40" style={{ background: "#fff", color: INK }}>再想 3 個</button>
                  </div>
                </article>
              );
            })}
            {basisLink}
            <p className="pt-2 text-center text-[11px] leading-relaxed" style={{ color: FAINT }}>示範頁：內容由 AI 產生，僅供醫師參考與改寫，不是醫療建議，也不是法律意見。</p>
          </div>
          <BottomBar>
            <Btn kind="secondary" disabled={busy} onClick={() => go("topic")}>換一個議題</Btn>
          </BottomBar>
        </>
      ) : null}

      {open ? <DraftSheet key={open.id} doctor={doctor} idea={open} persona={personaOf(open.persona)} groups={groups} onClose={() => setOpen(null)} /> : null}

      {showBasis ? (
        <Sheet title="審查依據" kicker="每一篇成稿會逐條對照這些條文" onClose={() => setShowBasis(false)}>
          <RegulationList groups={groups} />
          <div className="rounded p-4 text-[12px] leading-relaxed" style={{ background: PANEL, color: SUB }}>
            <div className="mb-2 text-[14px] font-medium" style={{ color: INK }}>事實白名單</div>
            <ul className="list-disc space-y-1 pl-4">
              {(cfg.data?.facts ?? []).map((f: any) => <li key={f.id}>{f.text}</li>)}
            </ul>
            {cfg.data?.factSource ? (
              <a href={cfg.data.factSource.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-medium underline decoration-[#D0D1D2] underline-offset-4" style={{ color: INK }}>出處：{cfg.data.factSource.label}</a>
            ) : null}
          </div>
          <p className="text-[12px] leading-relaxed" style={{ color: FAINT }}>條文最後核對日期：{cfg.data?.checkedAt}。條文重點是我們寫的摘要，原文以連結的官方頁面為準。</p>
        </Sheet>
      ) : null}
    </Frame>
  );
}
