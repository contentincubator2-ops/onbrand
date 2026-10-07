/**
 * InspireDemoPage — 醫師自媒體示範頁（/inspire），免登入。
 *
 * 2026-10-07（CJ「醫生掃 QR code、輸入自己的名字後，選主要議題、搭配不同網紅語調，產出文章內容」
 * 「真實網紅名字不要露出」「展現出正在審查哪些條文」）。
 *   · 手機優先：入口是 QR code，幾乎都是手機開。
 *   · 靈感卡只放三樣（切角、開場第一句、為什麼這樣切）；採用了才寫成稿，沒選的不花錢。
 *   · 成稿審完才顯示；審查面板逐組列出條文與出處連結，狀態對應伺服器真的那一次審查。
 * 題庫、風格、條文都在 server/content/core/inspire/，這裡不留副本。
 * 這頁只給台灣醫師用，所以只有中文。
 */
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare, faCheck, faCircleNotch, faCopy, faMinus, faPen, faPlay, faTriangleExclamation, faWandMagicSparkles, faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { faFacebookF, faInstagram, faTiktok, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { trpc } from "../../../lib/trpc";

const INK = "#171717", META = "#6B6B6B", LINE = "#EAEAEA", SOFT = "#F6F6F5", ORANGE = "#F37E4A";
const OK = "#15803D", WARN = "#B45309";

const PLATFORM_ICON: Record<string, any> = { facebook: faFacebookF, youtube: faYoutube, instagram: faInstagram, tiktok: faTiktok };
const PLATFORM_ORDER = ["facebook", "youtube", "instagram", "tiktok"];
const MARKET_LABEL: Record<string, string> = { tw: "台灣", us: "美國" };

interface Topic { id: string; label: string; hint: string }
interface Persona { key: string; platform: string; platformLabel: string; market: string; label: string; pitch: string; format: string }
interface RegItem { id: string; law: string; article: string; title: string; gist: string; url: string; amended: string; secondary: boolean }
interface RegGroup { id: string; label: string; note: string; items: RegItem[] }
type Subject = { topicId?: string; customTopic?: string };
interface Idea { id: string; persona: string; answer: string; title: string; hook: string; why: string; format: string; subject: Subject }
interface Issue { regulationId: string; quote: string; detail: string }

const NAME_KEY = "inspire.doctorName";
const readName = () => { try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; } };
const saveName = (n: string) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* 無痕模式：不記也能用 */ } };

let seq = 0;
const newId = () => `i${Date.now().toString(36)}${(seq++).toString(36)}`;
const byline = (name: string) => (/醫師|醫生|Dr\.?/i.test(name) ? name : `${name} 醫師`);
const errText = (e: any) => String(e?.message ?? "").slice(0, 80) || "出了一點問題，請再試一次。";

function StepTitle({ n, children, aside }: { n: number; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold" style={{ color: INK }}>
        <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: INK }}>{n}</span>
        {children}
      </h2>
      {aside ? <span className="shrink-0 text-[12px]" style={{ color: META }}>{aside}</span> : null}
    </div>
  );
}

function NameGate({ onDone }: { onDone: (name: string) => void }) {
  const [v, setV] = React.useState("");
  const ok = v.trim().length >= 1;
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-2 text-[12px] font-semibold tracking-[0.08em]" style={{ color: ORANGE }}>onBrand Studio・醫師自媒體靈感</div>
      <h1 className="text-[26px] font-bold leading-snug" style={{ color: INK }}>同一個高血壓議題，<br />換一種說法試試看</h1>
      <p className="mt-3 text-[14px] leading-relaxed" style={{ color: META }}>
        選一個想講的議題，再挑幾種各平台熱門創作者的說話風格，AI 會各想一個切角。喜歡的那一個，再寫成可以直接用的內容，並逐條對照醫療法規。
      </p>
      <form className="mt-7" onSubmit={(e) => { e.preventDefault(); if (ok) onDone(v.trim()); }}>
        <label htmlFor="inspire-name" className="mb-1.5 block text-[13px] font-medium" style={{ color: INK }}>怎麼稱呼您？</label>
        <div className="flex items-center gap-2">
          <input id="inspire-name" value={v} onChange={(e) => setV(e.target.value)} maxLength={20} autoFocus autoComplete="off" placeholder="例如：王小明"
            className="h-12 min-w-0 flex-1 rounded-lg px-3 text-[16px] outline-none" style={{ border: `1px solid ${LINE}`, color: INK, background: "#fff" }} />
          <span className="shrink-0 text-[14px]" style={{ color: META }}>醫師</span>
        </div>
        <button type="submit" disabled={!ok} className="mt-4 h-12 w-full rounded-lg text-[15px] font-semibold text-white disabled:opacity-40" style={{ background: INK }}>開始</button>
      </form>
      <p className="mt-4 text-[12px] leading-relaxed" style={{ color: META }}>名字只用來署名，存在您這支手機上，不需要註冊。</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === "checking") return <FontAwesomeIcon icon={faCircleNotch} spin style={{ color: ORANGE }} />;
  if (status === "pass") return <FontAwesomeIcon icon={faCheck} style={{ color: OK }} />;
  if (status === "issue") return <FontAwesomeIcon icon={faTriangleExclamation} style={{ color: WARN }} />;
  if (status === "skipped") return <FontAwesomeIcon icon={faMinus} style={{ color: META }} />;
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: LINE }} />;
}
const STATUS_TEXT: Record<string, string> = { pending: "等待中", checking: "審查中", pass: "通過", issue: "有疑慮", skipped: "這一組沒審到" };

/** 條文清單：審查時帶狀態，頁尾的「審查依據」不帶。 */
function RegulationList({ groups, statusOf, issues }: { groups: RegGroup[]; statusOf?: (g: string) => string; issues?: Issue[] }) {
  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const st = statusOf?.(g.id);
        return (
          <div key={g.id} className="rounded-lg p-3" style={{ border: `1px solid ${st === "checking" ? ORANGE : LINE}`, background: "#fff" }}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold" style={{ color: INK }}>{g.label}</div>
                <div className="text-[12px]" style={{ color: META }}>{g.note}</div>
              </div>
              {st ? (
                <span className="flex shrink-0 items-center gap-1.5 text-[12px]" style={{ color: st === "pass" ? OK : st === "issue" ? WARN : META }}>
                  <StatusDot status={st} />{STATUS_TEXT[st] ?? ""}
                </span>
              ) : null}
            </div>
            <ul className="mt-2 space-y-1.5">
              {g.items.map((r) => {
                const hit = issues?.filter((i) => i.regulationId === r.id) ?? [];
                return (
                  <li key={r.id} className="text-[12px] leading-relaxed" style={{ color: META }}>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-2 hover:underline" style={{ color: INK }}>
                      {r.law} {r.article}
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="ml-1 text-[10px]" style={{ color: META }} />
                    </a>
                    <span>｜{r.title}</span>
                    {!statusOf ? <div>{r.gist}（{r.amended}{r.secondary ? "；連結為二手出處，原文請向主管機關核對" : ""}）</div> : null}
                    {hit.map((i, k) => (
                      <div key={k} className="mt-1 rounded px-2 py-1.5" style={{ background: "#FFFBEB", color: WARN }}>
                        「{i.quote}」<br />{i.detail}
                      </div>
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

const VERDICT: Record<string, { text: string; color: string }> = {
  compliant: { text: "逐條審查完成，沒有發現疑慮。", color: OK },
  fixed: { text: "審查發現下面幾句有疑慮，已經改寫；改寫後的版本沒有再審一次，請您確認。", color: WARN },
  flagged: { text: "審查發現下面幾句有疑慮，自動改寫沒有成功，請您自己修改後再使用。", color: WARN },
  partial: { text: "有幾組條文這次沒審到（標示為「這一組沒審到」），請您特別留意那幾組。", color: WARN },
};

function DraftSheet({ doctor, subject, idea, persona, groups, onClose }: {
  doctor: string; subject: Subject; idea: Idea; persona?: Persona; groups: RegGroup[]; onClose: () => void;
}) {
  const T = trpc as any;
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [showBefore, setShowBefore] = React.useState(false);
  const start = T.inspire.writeStart.useMutation({
    onSuccess: (r: any) => setJobId(r.jobId),
    onError: (e: any) => setError(errText(e)),
  });
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    start.mutate({ name: doctor, ...subject, persona: idea.persona, title: idea.title, hook: idea.hook, answer: idea.answer, why: idea.why });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [finished, setFinished] = React.useState(false);
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

  return (
    <div className="fixed inset-0 z-50 flex justify-center" style={{ background: "rgba(0,0,0,0.4)" }} role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-2xl flex-col" style={{ background: SOFT }}>
        <div className="flex items-start justify-between gap-3 px-4 py-3" style={{ background: "#fff", borderBottom: `1px solid ${LINE}` }}>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px]" style={{ color: META }}>
              {persona ? <FontAwesomeIcon icon={PLATFORM_ICON[persona.platform]} /> : null}
              <span>{persona?.platformLabel}・{persona?.format}・{persona?.label}</span>
            </div>
            <div className="mt-0.5 text-[15px] font-semibold leading-snug" style={{ color: INK }}>{idea.title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ border: `1px solid ${LINE}`, color: INK }}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {stage === "failed" ? (
            <div className="rounded-lg p-4 text-[14px]" style={{ background: "#fff", border: `1px solid ${LINE}`, color: INK }}>
              {error || (d?.lost ? "這一篇的進度不見了（伺服器剛更新），請關掉再採用一次。" : "這一篇沒有寫成功，請關掉再採用一次。")}
            </div>
          ) : null}

          {stage === "writing" ? (
            <div className="flex items-center gap-2 rounded-lg p-4 text-[14px]" style={{ background: "#fff", border: `1px solid ${LINE}`, color: INK }}>
              <FontAwesomeIcon icon={faCircleNotch} spin style={{ color: ORANGE }} />正在用這個風格寫成稿⋯⋯
            </div>
          ) : null}

          {stage === "done" ? (
            <div className="rounded-lg" style={{ background: "#fff", border: `1px solid ${LINE}` }}>
              {verdict ? (
                <div className="px-4 py-3 text-[13px] leading-relaxed" style={{ color: verdict.color, borderBottom: `1px solid ${LINE}` }}>{verdict.text}</div>
              ) : null}
              <div className="whitespace-pre-wrap px-4 py-4 text-[15px] leading-[1.8]" style={{ color: INK }}>{text}</div>
              <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderTop: `1px solid ${LINE}` }}>
                <button type="button" onClick={copy} className="flex h-10 items-center gap-2 rounded-lg px-4 text-[14px] font-semibold text-white" style={{ background: INK }}>
                  <FontAwesomeIcon icon={copied ? faCheck : faCopy} />{copied ? "已複製" : "複製全文"}
                </button>
                {d?.before ? (
                  <button type="button" onClick={() => setShowBefore((v) => !v)} className="h-10 rounded-lg px-3 text-[13px]" style={{ border: `1px solid ${LINE}`, color: INK }}>
                    {showBefore ? "看改寫後的版本" : "看改寫前的原稿"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {stage !== "failed" ? (
            <div>
              <div className="mb-2 flex items-center justify-between text-[13px] font-semibold" style={{ color: INK }}>
                <span>逐條審查</span>
                <span className="font-normal" style={{ color: META }}>
                  {stage === "writing" ? "寫完就開始" : stage === "reviewing" ? "審查中" : stage === "fixing" ? "正在改寫有疑慮的句子" : "已完成"}
                </span>
              </div>
              <RegulationList groups={groups} statusOf={statusOf} issues={stage === "done" ? (d?.issues as Issue[]) : undefined} />
            </div>
          ) : null}

          <p className="text-[12px] leading-relaxed" style={{ color: META }}>
            內容由 AI 產生，審查也是 AI 依條文重點做的初步對照，不是法律意見。發布前請您自己看過，必要時請教所屬機構或法律專業人員。
          </p>
        </div>
      </div>
    </div>
  );
}

export default function InspireDemoPage() {
  const T = trpc as any;
  const [doctor, setDoctor] = React.useState<string>(() => readName());
  const cfg = T.inspire.config.useQuery(undefined, { staleTime: 600_000 });
  const topics: Topic[] = cfg.data?.topics ?? [];
  const personas: Persona[] = cfg.data?.personas ?? [];
  const groups: RegGroup[] = cfg.data?.regulationGroups ?? [];
  const maxPersonas: number = cfg.data?.maxPersonas ?? 4;

  const [topicId, setTopicId] = React.useState<string>("");
  const [custom, setCustom] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [ideas, setIdeas] = React.useState<Idea[]>([]);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string[]>([]);
  const [notice, setNotice] = React.useState("");
  const [open, setOpen] = React.useState<Idea | null>(null);
  const [showBasis, setShowBasis] = React.useState(false);
  const wallRef = React.useRef<HTMLDivElement>(null);

  const subject: Subject = custom.trim() ? { customTopic: custom.trim() } : { topicId };
  // 切角屬於想的當下那個議題；之後換議題，舊卡採用時仍照原議題寫。
  const runSubject = React.useRef<Subject>(subject);
  const hasTopic = !!custom.trim() || !!topicId;
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
    setNotice(""); setPending(keys);
    runSubject.current = subject;
    start.mutate({ name: doctor, ...subject, personas: keys, count, avoid: ideas.map((i) => i.title).slice(0, 30) });
    setTimeout(() => wallRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const toggle = (k: string) => setPicked((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : cur.length >= maxPersonas ? cur : [...cur, k]));

  if (!doctor) return <div style={{ background: SOFT }}><NameGate onDone={(n) => { saveName(n); setDoctor(n); }} /></div>;

  return (
    <div className="min-h-screen" style={{ background: SOFT }}>
      <header className="sticky top-0 z-10 px-4 py-3" style={{ background: "#fff", borderBottom: `1px solid ${LINE}` }}>
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-[0.08em]" style={{ color: ORANGE }}>onBrand Studio・醫師自媒體靈感</div>
            <div className="truncate text-[15px] font-semibold" style={{ color: INK }}>{byline(doctor)}，今天想講什麼？</div>
          </div>
          <button type="button" onClick={() => { saveName(""); setDoctor(""); }} className="flex shrink-0 items-center gap-1.5 text-[12px]" style={{ color: META }}>
            <FontAwesomeIcon icon={faPen} />換名字
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-7 px-4 py-6">
        <section>
          <StepTitle n={1}>選一個高血壓議題</StepTitle>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => {
              const on = !custom.trim() && topicId === t.id;
              return (
                <button key={t.id} type="button" title={t.hint} aria-pressed={on} onClick={() => { setTopicId(t.id); setCustom(""); }}
                  className="rounded-full px-3.5 py-2 text-left text-[14px]" style={{ border: `1px solid ${on ? INK : LINE}`, background: on ? INK : "#fff", color: on ? "#fff" : INK }}>
                  {t.label}
                </button>
              );
            })}
          </div>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={60} placeholder="或自己寫一個跟血壓有關的題目"
            className="mt-3 h-11 w-full rounded-lg px-3 text-[15px] outline-none" style={{ border: `1px solid ${custom.trim() ? INK : LINE}`, background: "#fff", color: INK }} />
        </section>

        <section>
          <StepTitle n={2} aside={`已選 ${picked.length}／${maxPersonas}`}>挑幾種說話風格</StepTitle>
          <p className="mb-3 text-[12px] leading-relaxed" style={{ color: META }}>
            風格取自台灣與美國各平台排行榜前段創作者的公開手法（怎麼開場、怎麼安排），不使用任何人的名字或肖像；寫出來的都是您本人的口吻。
          </p>
          <div className="space-y-4">
            {PLATFORM_ORDER.map((pf) => {
              const own = personas.filter((p) => p.platform === pf);
              if (!own.length) return null;
              return (
                <div key={pf}>
                  <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold" style={{ color: INK }}>
                    <FontAwesomeIcon icon={PLATFORM_ICON[pf]} />{own[0]!.platformLabel}
                    <span className="font-normal" style={{ color: META }}>寫成{own[0]!.format}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {own.map((p) => {
                      const on = picked.includes(p.key);
                      const full = !on && picked.length >= maxPersonas;
                      return (
                        <button key={p.key} type="button" aria-pressed={on} disabled={full} onClick={() => toggle(p.key)}
                          className="rounded-lg p-3 text-left disabled:opacity-40" style={{ border: `1px solid ${on ? INK : LINE}`, background: "#fff", boxShadow: on ? `inset 0 0 0 1px ${INK}` : undefined }}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[14px] font-semibold" style={{ color: INK }}>{p.label}</span>
                            <span className="flex shrink-0 items-center gap-1.5 text-[11px]" style={{ color: META }}>
                              {MARKET_LABEL[p.market]}
                              <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] text-white" style={{ background: on ? INK : LINE }}>
                                {on ? <FontAwesomeIcon icon={faCheck} /> : null}
                              </span>
                            </span>
                          </div>
                          <div className="mt-1 text-[12px] leading-relaxed" style={{ color: META }}>{p.pitch}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="sticky bottom-3 z-10">
          <button type="button" disabled={busy || !hasTopic || !picked.length} onClick={() => run(picked, 1)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg text-[15px] font-semibold text-white shadow-lg" style={{ background: busy || !hasTopic || !picked.length ? "#A3A3A3" : ORANGE }}>
            <FontAwesomeIcon icon={busy ? faCircleNotch : faPlay} spin={busy} />
            {busy ? "正在想⋯⋯" : !hasTopic ? "先選一個議題" : !picked.length ? "再挑至少一種風格" : `請這 ${picked.length} 種風格各想一個切角`}
          </button>
        </div>

        <section ref={wallRef} className="scroll-mt-20">
          <StepTitle n={3} aside={ideas.length ? `${ideas.length} 個切角` : undefined}>靈感牆</StepTitle>
          {notice ? <div className="mb-3 rounded-lg px-3 py-2 text-[13px]" style={{ background: "#FFFBEB", color: WARN }}>{notice}</div> : null}
          {!ideas.length && !pending.length ? (
            <div className="rounded-lg px-4 py-8 text-center text-[13px]" style={{ border: `1px dashed ${LINE}`, color: META, background: "#fff" }}>
              選好議題與風格，切角會出現在這裡。
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pending.map((k) => (
              <div key={`p-${k}`} className="flex items-center gap-2 rounded-lg p-4 text-[13px]" style={{ border: `1px solid ${LINE}`, background: "#fff", color: META }}>
                <FontAwesomeIcon icon={faCircleNotch} spin style={{ color: ORANGE }} />{personaOf(k)?.label} 正在想⋯⋯
              </div>
            ))}
            {ideas.map((i) => {
              const p = personaOf(i.persona);
              return (
                <article key={i.id} className="flex flex-col rounded-lg p-4" style={{ border: `1px solid ${LINE}`, background: "#fff" }}>
                  <div className="flex items-center gap-1.5 text-[12px]" style={{ color: META }}>
                    {p ? <FontAwesomeIcon icon={PLATFORM_ICON[p.platform]} /> : null}
                    <span>{p?.platformLabel}・{i.format}・{p?.label}</span>
                  </div>
                  <h3 className="mt-2 text-[16px] font-semibold leading-snug" style={{ color: INK }}>{i.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed" style={{ color: INK }}>「{i.hook}」</p>
                  {i.why ? <p className="mt-2 text-[12px] leading-relaxed" style={{ color: META }}>{i.why}</p> : null}
                  <div className="mt-auto flex items-center gap-2 pt-3">
                    <button type="button" onClick={() => setOpen(i)} className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-[14px] font-semibold text-white" style={{ background: INK }}>
                      <FontAwesomeIcon icon={faWandMagicSparkles} />採用，寫成{i.format}
                    </button>
                    <button type="button" disabled={busy || !hasTopic} onClick={() => run([i.persona], 3)} className="h-10 shrink-0 rounded-lg px-3 text-[13px] disabled:opacity-40" style={{ border: `1px solid ${LINE}`, color: INK }}>
                      再想 3 個
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <button type="button" onClick={() => setShowBasis((v) => !v)} aria-expanded={showBasis} className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-[14px] font-semibold"
            style={{ border: `1px solid ${LINE}`, background: "#fff", color: INK }}>
            <span>審查依據：每一篇成稿會逐條對照這些條文</span>
            <span className="text-[12px] font-normal" style={{ color: META }}>{showBasis ? "收起" : "展開"}</span>
          </button>
          {showBasis ? (
            <div className="mt-3 space-y-3">
              <RegulationList groups={groups} />
              <div className="rounded-lg p-3 text-[12px] leading-relaxed" style={{ border: `1px solid ${LINE}`, background: "#fff", color: META }}>
                <div className="mb-1 text-[13px] font-semibold" style={{ color: INK }}>事實白名單（文案裡的數字只能來自這裡）</div>
                <ul className="list-disc space-y-1 pl-4">
                  {(cfg.data?.facts ?? []).map((f: any) => <li key={f.id}>{f.text}</li>)}
                </ul>
                {cfg.data?.factSource ? (
                  <a href={cfg.data.factSource.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block underline" style={{ color: INK }}>出處：{cfg.data.factSource.label}</a>
                ) : null}
              </div>
              <p className="text-[12px]" style={{ color: META }}>條文最後核對日期：{cfg.data?.checkedAt}。條文重點是我們寫的摘要，原文以連結的官方頁面為準。</p>
            </div>
          ) : null}
        </section>

        <footer className="pb-16 text-[12px] leading-relaxed" style={{ color: META }}>
          這是示範頁：內容由 AI 產生，僅供醫師參考與改寫，不是醫療建議，也不是法律意見。
        </footer>
      </main>

      {open ? <DraftSheet key={open.id} doctor={doctor} subject={open.subject} idea={open} persona={personaOf(open.persona)} groups={groups} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
