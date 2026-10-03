/**
 * RegulationsPanel — 策略層「法規」mission tray。
 *
 * 2026-09-30（CJ「策略層加一個 mission tray，是法規……每一個法規就是一個任務卡的形式」）。
 * 2026-09-30 第二版（CJ「法規可以容納的字數好少」→「用戶上傳相關資料後，跳出視窗提醒目前多少字、
 * 佔品牌容量多少，要萃取嗎？要的話該任務卡片就有進度顯示，萃取好以後請用戶回來確認（法規 mission
 * tray 會跳出通知）」）：
 *
 *   · 一張卡＝一條法規：原文（最多 5 萬字，只存著）＋審查重點（AI 萃取、用戶確認後才進大腦）。
 *   · 存完原文 → 「要萃取嗎？」視窗：原文幾字、佔大腦容量多少、萃取後大約多少。
 *   · 萃取中：卡片上有進度條（第幾段／共幾段）；可以離開，萃取好會亮 rail 圖示點、通知鈴鐺、
 *     tray 頂端提示條，卡片變成「待確認」。
 *   · 確認：可以直接改審查重點，確認後才生效；原文改了，舊的審查重點照常用到新的確認為止。
 *   · 免責：頁首常駐一段；確認鍵上方再一句。
 */
import { useEffect, useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@heroui/react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { showToastGlobal } from "../../../platform/components/Toast";
import { ICON, CloseIcon } from "../../../platform/components/icons";
import { HelpTip } from "../../../platform/components/HelpTip";
import { IllustratedEmpty } from "../../../platform/components/EmptyIllustration";
import {
  cardState, charLen, digestRoom, fmt, isUrl, progressPct, progressText,
  type CardState, type Regulation, type RegulationList, type RegulationStats,
} from "./regulationModel";

const btnPrimary = "rounded-full bg-neutral-900 px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40";
const btnGhost = "rounded-full border border-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-neutral-900 transition hover:bg-neutral-900 hover:text-white disabled:opacity-40";
const btnQuiet = "rounded-full border border-neutral-300 px-3 py-1 text-[12px] font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-40";
const labelCls = "mb-1.5 block text-[12px] font-semibold text-neutral-500";
const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-[13.5px] outline-none focus:border-neutral-900";

const errToast = (e: any) => showToastGlobal(String(e?.message ?? "error"), "error");

type Screen =
  | { kind: "source"; reg: Regulation | null }
  | { kind: "digest"; id: number }
  | { kind: "prompt"; id: number; title: string; stats: RegulationStats; changed: boolean };

export default function RegulationsPanel({ brandId, focusId }: { brandId: number; focusId?: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const T = trpc as any;
  const utils = T.useUtils();
  const listQ = T.brandRegulation.list.useQuery({ brandId }, { staleTime: 5_000 });
  const data = listQ.data as RegulationList | undefined;
  const [screen, setScreen] = useState<Screen | null>(null);

  const refresh = () => {
    listQ.refetch?.();
    try { utils.brandRegulation.reviewCount.invalidate(); utils.brandRegulation.activeCount.invalidate(); } catch { /* noop */ }
  };
  const setEnabled = T.brandRegulation.setEnabled.useMutation({ onSuccess: refresh, onError: errToast });

  // 萃取中：每 3 秒刷新，卡片進度條跟著走；萃取好了自動變成「待確認」。
  const anyExtracting = !!data?.items.some((r) => r.jobStatus === "extracting");
  const reviewNow = data?.reviewCount ?? 0;
  useEffect(() => {
    if (!anyExtracting) return;
    const t = setInterval(() => listQ.refetch?.(), 3_000);
    return () => clearInterval(t);
  }, [anyExtracting]); // eslint-disable-line react-hooks/exhaustive-deps
  // 待確認的數量變了（萃取剛好）→ rail 的通知點與鈴鐺一起更新。
  useEffect(() => {
    try { utils.brandRegulation.reviewCount.invalidate(); utils.notifications?.list?.invalidate?.(); } catch { /* noop */ }
  }, [reviewNow]); // eslint-disable-line react-hooks/exhaustive-deps

  // 從「記憶」或通知點某一條法規過來：直接打開那張卡。
  useEffect(() => {
    if (!focusId || !data) return;
    const r = data.items.find((x) => x.id === focusId);
    if (r) setScreen(openScreenFor(r));
  }, [focusId, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (listQ.isLoading || !data) {
    return <p className="px-2 py-6 text-[13px] text-neutral-400">{en ? "Loading…" : "載入中…"}</p>;
  }

  const { items, usedTotal, budget, limits } = data;
  const full = items.length >= limits.maxCards;
  const reviewItems = items.filter((r) => r.jobStatus === "review");
  const newCard = () => setScreen({ kind: "source", reg: null });
  const current = screen && screen.kind !== "source" ? items.find((r) => r.id === screen.id) ?? null : null;

  return (
    <div className="mx-auto max-w-[1040px] space-y-6 px-2">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-[20px] font-semibold text-neutral-900">
          {en ? "Regulations" : "法規"}
          <HelpTip>
            {en
              ? "Add the regulations your marketing must follow — one card each, the full text is fine. The AI extracts the review points that matter for marketing; once you confirm them, every draft is checked against them before and after writing."
              : "把行銷文案必須遵守的法規加進來，一條一張卡，整部法規貼進來也可以。AI 會從原文萃取跟行銷有關的審查重點，你確認後，每一篇產文寫之前、寫完後都會依它審查。"}
          </HelpTip>
        </h2>
        {/* 2026-09-30（CJ「免責聲明或審查重點用量，仿 Tesla UI 或任務卡視窗的圖示，版面更小」）：
            兩個圖示方塊，點開才看細節。新增法規只在卡片牆裡（右上角不放）。 */}
        <div className="flex items-start gap-1">
          <UsageTile en={en} used={usedTotal} budget={budget} onOpenMemory={() => navigate(`/brands/edit?b=${brandId}&cat=brain`)} />
          <DisclaimerTile en={en} />
        </div>
      </header>

      {/* 萃取好、等確認：tray 頂端的通知 */}
      {reviewItems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-900 bg-white px-5 py-3">
          <p className="flex items-center gap-2 text-[13.5px] text-neutral-900">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#F37E4A]" />
            {en
              ? `${reviewItems.length} regulation${reviewItems.length > 1 ? "s have" : " has"} review points ready — please confirm before they're used.`
              : `有 ${reviewItems.length} 條法規的審查重點萃取好了，請確認後才會開始用在審查。`}
          </p>
          <button type="button" className={btnGhost} onClick={() => setScreen({ kind: "digest", id: reviewItems[0]!.id })}>
            {en ? "Review now" : "去確認"}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200">
          <IllustratedEmpty
            kind="cards"
            title={en ? "No regulations yet" : "還沒有法規"}
            note={en
              ? "Paste the whole regulation — the AI will pull out what matters for marketing."
              : "整部法規直接貼進來就好，AI 會幫你萃取跟行銷有關的審查重點。"}
            action={{ label: en ? "+ Add regulation" : "＋ 新增法規", onPress: newCard }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <RegulationCard key={r.id} r={r} en={en} onOpen={() => setScreen(openScreenFor(r))}
              onToggle={(v) => setEnabled.mutate({ id: r.id, enabled: v, en })} busy={setEnabled.isPending} />
          ))}
          {!full && (
            <button type="button" onClick={newCard}
              className="flex min-h-[208px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 text-neutral-500 transition-colors hover:border-neutral-900 hover:text-neutral-900">
              <FontAwesomeIcon icon={ICON.add} className="text-[18px]" />
              <span className="text-[13.5px] font-medium">{en ? "Add regulation" : "新增法規"}</span>
            </button>
          )}
        </div>
      )}
      {full && (
        <p className="text-[12px] text-neutral-500">
          {en ? `Up to ${limits.maxCards} regulation cards per brand.` : `一個品牌最多 ${limits.maxCards} 張法規卡。`}
        </p>
      )}

      {screen?.kind === "source" && (
        <SourceEditor
          key={screen.reg?.id ?? "new"} brandId={brandId} en={en} reg={screen.reg} limits={limits}
          onClose={() => setScreen(null)}
          onSaved={(id, title, stats, changed) => {
            refresh();
            // 新卡或改了原文：問要不要萃取。只改名稱／來源：回到審查重點。
            setScreen(changed ? { kind: "prompt", id, title, stats, changed } : { kind: "digest", id });
          }}
        />
      )}
      {screen?.kind === "prompt" && (
        <ExtractPrompt
          en={en} id={screen.id} title={screen.title} stats={screen.stats} hasDigest={!!current?.digest}
          onClose={() => { refresh(); setScreen(null); }}
          onStarted={() => { refresh(); setScreen(null); }}
        />
      )}
      {screen?.kind === "digest" && current && (
        <DigestEditor
          key={`${current.id}-${current.jobStatus}`} en={en} reg={current} list={data}
          onClose={() => setScreen(null)}
          onChanged={refresh}
          onEditSource={() => setScreen({ kind: "source", reg: current })}
          onDeleted={() => { refresh(); setScreen(null); }}
        />
      )}
    </div>
  );
}

/** 點卡片一律打開審查重點視窗：萃取進度、待確認、使用中、尚未萃取都在這一個視窗處理。 */
function openScreenFor(r: Regulation): Screen {
  return { kind: "digest", id: r.id };
}

// ─── 頁首的兩個圖示方塊（任務卡視窗同款：40px 圓角方塊＋一行小字，點開看細節） ───────

function InfoTile({ icon, label, tip, alert, children }: {
  icon: ReactNode; label: string; tip: string; alert?: boolean; children: ReactNode;
}) {
  return (
    <Popover placement="bottom-end" showArrow triggerScaleOnOpen={false}>
      <PopoverTrigger>
        <button type="button" aria-label={tip} title={tip} className="group flex w-[60px] flex-col items-center gap-1">
          <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 text-neutral-800 transition group-hover:bg-neutral-200">
            {icon}
            {alert && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-600" />}
          </span>
          <span className="w-full truncate text-center text-[11px] leading-tight text-neutral-600 tabular-nums">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="max-w-[300px] px-1 py-1.5 text-[12.5px] leading-relaxed text-neutral-700">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/** Tesla 電量式：方塊從底部往上填，填多少＝審查重點用掉可用額度的多少。 */
function UsageTile({ en, used, budget, onOpenMemory }: {
  en: boolean; used: number; budget: RegulationList["budget"]; onOpenMemory: () => void;
}) {
  const allowed = budget.allowedTotal;
  const ratio = allowed > 0 ? Math.min(1, used / allowed) : used > 0 ? 1 : 0;
  const noRoom = allowed === 0 && budget.limitedByBrain;
  const pct = Math.round(ratio * 100);
  return (
    <InfoTile
      alert={noRoom}
      label={noRoom ? (en ? "Full" : "已滿") : (en ? `Used ${pct}%` : `用量 ${pct}%`)}
      tip={en ? "Review points in brand memory" : "審查重點用量"}
      icon={<>
        <span className="absolute inset-x-0 bottom-0 bg-neutral-900/15 transition-all duration-500" style={{ height: `${pct}%` }} />
        <FontAwesomeIcon icon={ICON.regulation} className="relative text-[15px]" />
      </>}
    >
      <p className="font-semibold text-neutral-900">{en ? "Review points in brand memory" : "審查重點用量"}</p>
      <p className="mt-0.5 tabular-nums">{fmt(used)} / {fmt(allowed)} {en ? "chars" : "字"}</p>
      <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-neutral-200">
        <span className="block h-full rounded-full bg-neutral-900" style={{ width: `${pct}%` }} />
      </span>
      <p className="mt-2 text-[12px] text-neutral-500">
        {noRoom ? (
          <>
            {en ? "The brand memory is full, so there is no room for review points. " : "品牌大腦已經滿了，放不下審查重點。"}
            <button type="button" onClick={onOpenMemory} className="font-medium text-neutral-900 underline">
              {en ? "Free up space in Memory" : "到「記憶」騰出空間"}
            </button>
          </>
        ) : budget.limitedByBrain
          ? (en ? `The limit is what the brand memory has left (${fmt(budget.nonRegulationChars)} of ${fmt(budget.capacity)} chars used by the rest of your strategy).`
            : `上限是品牌大腦剩下的空間（其他策略內容已用 ${fmt(budget.nonRegulationChars)} / ${fmt(budget.capacity)} 字）。`)
          : (en ? "Only confirmed review points count; the full text is stored separately. Active review points are never pushed out of memory."
            : "只算確認過的審查重點；原文另外存著，不佔品牌大腦。啟用中的審查重點，大腦滿了也不會被擠掉。")}
      </p>
    </InfoTile>
  );
}

function DisclaimerTile({ en }: { en: boolean }) {
  return (
    <InfoTile
      label={en ? "Disclaimer" : "免責聲明"}
      tip={en ? "Disclaimer" : "免責聲明"}
      icon={<FontAwesomeIcon icon={ICON.shield} className="text-[15px]" />}
    >
      <p className="font-semibold text-neutral-900">{en ? "Disclaimer" : "免責聲明"}</p>
      <p className="mt-1">
        {en
          ? "Regulation text is provided by you; onBrand Studio does not verify that it is complete, accurate or current. The review points are extracted by AI and may miss rules — please check them before confirming. The AI checks each draft against them before and after writing, but cannot guarantee the output is compliant. The check is for reference only and is not legal advice — please confirm before publishing, or consult a qualified legal professional."
          : "法規內容由你自行提供，onBrand Studio 不驗證其完整性、正確性或是否為最新版本。審查重點由 AI 從原文萃取，可能有遺漏，確認前請自行核對。AI 會在動筆前與寫完後依審查重點檢查，但無法保證產出完全合規；審查結果僅供參考，不構成法律意見。發布前請自行確認，或諮詢專業法律人士。"}
      </p>
    </InfoTile>
  );
}

// ─── 卡片 ────────────────────────────────────────────────────────────────

const STATE_TEXT: Record<CardState, { zh: string; en: string }> = {
  extracting: { zh: "萃取中", en: "Extracting" },
  review: { zh: "待確認", en: "Ready to confirm" },
  failed: { zh: "萃取失敗", en: "Extraction failed" },
  pending: { zh: "尚未萃取", en: "Not extracted" },
  active: { zh: "寫文前後審查", en: "Checked before & after writing" },
  off: { zh: "停用", en: "Off" },
};

function RegulationCard({ r, en, onOpen, onToggle, busy }: {
  r: Regulation; en: boolean; onOpen: () => void; onToggle: (v: boolean) => void; busy: boolean;
}) {
  const s = cardState(r);
  const t = STATE_TEXT[s];
  const attention = s === "review" || s === "failed";
  return (
    <div className={`flex min-h-[208px] flex-col rounded-2xl border bg-white transition-colors ${
      attention ? "border-neutral-900" : s === "off" ? "border-neutral-200 opacity-60 hover:opacity-100" : "border-neutral-200 hover:border-neutral-900"}`}>
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col px-5 pt-4 text-left">
        <span className={`flex items-center gap-2 text-[11.5px] font-medium ${attention ? "text-neutral-900" : "text-neutral-500"}`}>
          {s === "review" ? <span className="h-2 w-2 rounded-full bg-[#F37E4A]" /> : <FontAwesomeIcon icon={ICON.regulation} className="text-[12px]" />}
          {en ? t.en : t.zh}
        </span>
        <span className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug text-neutral-900">{r.title}</span>
        {r.source && <span className="mt-1 truncate text-[12px] text-neutral-500">{r.source}</span>}
        {s === "extracting" ? (
          <span className="mt-3 block">
            <span className="block h-1.5 overflow-hidden rounded-full bg-neutral-200">
              <span className="block h-full rounded-full bg-[#F37E4A] transition-all duration-700" style={{ width: `${progressPct(r.jobProgress)}%` }} />
            </span>
            <span className="mt-1.5 block text-[12px] text-neutral-500">{progressText(r.jobProgress, en)}</span>
            <span className="mt-0.5 block text-[11.5px] text-neutral-400">
              {en ? "You can leave — we'll let you know when it's ready." : "可以先離開，萃取好會通知你回來確認。"}
            </span>
          </span>
        ) : s === "review" ? (
          <span className="mt-2 text-[12.5px] leading-relaxed text-neutral-700">
            {en ? "The AI has extracted the review points. Check them and confirm to start using them." : "AI 已經萃取好審查重點，點開確認後才會開始用在審查。"}
          </span>
        ) : s === "failed" ? (
          <span className="mt-2 text-[12.5px] leading-relaxed text-neutral-700">{r.jobError || (en ? "Extraction failed — open to retry." : "萃取沒有完成，點開重新萃取。")}</span>
        ) : s === "pending" ? (
          <span className="mt-2 text-[12.5px] leading-relaxed text-neutral-500">
            {en ? "No review points yet — this regulation isn't used in checks." : "還沒有審查重點——這條法規目前不會用在審查。"}
          </span>
        ) : (
          <span className="mt-2 line-clamp-3 whitespace-pre-line text-[12.5px] leading-relaxed text-neutral-600">{r.digest}</span>
        )}
      </button>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-neutral-100 px-5 py-2.5">
        <span className="text-[12px] tabular-nums text-neutral-500">
          {en ? "Full text" : "原文"} {fmt(r.chars)}
          {r.digest && <> · {en ? "review points" : "重點"} {fmt(r.digestChars)}</>}
          {" "}{en ? "chars" : "字"}
        </span>
        {r.digest ? (
          <Switch on={r.enabled} disabled={busy} onChange={onToggle}
            label={r.enabled ? (en ? "Turn off" : "停用") : (en ? "Turn on" : "啟用")} />
        ) : null}
      </div>
    </div>
  );
}

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!on); }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-neutral-900" : "bg-neutral-300"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className={`max-h-[90vh] w-full ${wide ? "max-w-[760px]" : "max-w-[560px]"} overflow-y-auto rounded-2xl bg-white px-6 py-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalHead({ title, en, onClose }: { title: string; en: boolean; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <h3 className="flex items-center gap-2 text-[16px] font-semibold text-neutral-900">
        <FontAwesomeIcon icon={ICON.regulation} className="text-[14px]" />
        {title}
      </h3>
      <button type="button" onClick={onClose} aria-label={en ? "Close" : "關閉"} className="text-neutral-400 hover:text-neutral-900">
        <CloseIcon size={16} />
      </button>
    </div>
  );
}

// ─── 原文 ────────────────────────────────────────────────────────────────

function SourceEditor({ brandId, en, reg, limits, onClose, onSaved }: {
  brandId: number; en: boolean; reg: Regulation | null; limits: RegulationList["limits"];
  onClose: () => void; onSaved: (id: number, title: string, stats: RegulationStats, bodyChanged: boolean) => void;
}) {
  const T = trpc as any;
  const [title, setTitle] = useState(reg?.title ?? "");
  const [source, setSource] = useState(reg?.source ?? "");
  const [body, setBody] = useState(reg?.body ?? "");
  const create = T.brandRegulation.create.useMutation({ onError: errToast });
  const update = T.brandRegulation.update.useMutation({ onError: errToast });
  const busy = create.isPending || update.isPending;
  const chars = charLen(body);
  const over = chars > limits.bodyMax;
  const canSave = title.trim() && chars > 0 && !over && !busy;

  const save = async () => {
    const payload = { title: title.trim(), source: source.trim(), body: body.trim(), en };
    if (!reg) {
      const r = await create.mutateAsync({ brandId, ...payload });
      onSaved(r.id, payload.title, r.stats, true);
    } else {
      const r = await update.mutateAsync({ id: reg.id, ...payload });
      onSaved(reg.id, payload.title, r.stats, r.bodyChanged);
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <ModalHead title={reg ? (en ? "Edit regulation text" : "編輯法規原文") : (en ? "Add regulation" : "新增法規")} en={en} onClose={onClose} />
      <div className="space-y-4">
        <div>
          <label className={labelCls}>{en ? "Name" : "法規名稱"}</label>
          <input className={input} value={title} maxLength={limits.titleMax}
            placeholder={en ? "e.g. Cosmetic Hygiene and Safety Act" : "例：化粧品衛生安全管理法"}
            onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>{en ? "Source (optional)" : "來源（選填）"}</label>
          <input className={input} value={source} maxLength={limits.sourceMax}
            placeholder={en ? "Link, authority or reference number" : "網址、主管機關或文號"}
            onChange={(e) => setSource(e.target.value)} />
          {isUrl(source) && (
            <a href={source.trim()} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[12px] text-neutral-500 underline hover:text-neutral-900">
              {en ? "Open source" : "開啟來源"}
            </a>
          )}
        </div>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label className="text-[12px] font-semibold text-neutral-500">{en ? "Full text" : "法規原文"}</label>
            <span className={`text-[12px] tabular-nums ${over ? "font-semibold text-red-600" : "text-neutral-500"}`}>
              {fmt(chars)} / {fmt(limits.bodyMax)} {en ? "chars" : "字"}
            </span>
          </div>
          <textarea className={`${input} min-h-[300px] leading-relaxed`} value={body}
            placeholder={en
              ? "Paste the whole regulation. It's stored as-is; the AI extracts the parts that matter for marketing."
              : "整部法規貼進來就好。原文會原樣存著，AI 會從裡面萃取跟行銷有關的審查重點。"}
            onChange={(e) => setBody(e.target.value)} />
          {reg && reg.digest && (
            <p className="mt-1.5 text-[12px] text-neutral-500">
              {en ? "Changing the text keeps the current review points in use until you confirm new ones."
                : "改了原文後，目前的審查重點會照常使用，直到你確認新的為止。"}
            </p>
          )}
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btnQuiet} onClick={onClose} disabled={busy}>{en ? "Cancel" : "取消"}</button>
        <button type="button" className={btnPrimary} onClick={() => { void save().catch(() => {}); }} disabled={!canSave}>
          {busy ? (en ? "Saving…" : "儲存中…") : (en ? "Save" : "儲存")}
        </button>
      </div>
    </Modal>
  );
}

// ─── 要萃取嗎？ ─────────────────────────────────────────────────────────

function ExtractPrompt({ en, id, title, stats, hasDigest, onClose, onStarted }: {
  en: boolean; id: number; title: string; stats: RegulationStats; hasDigest: boolean;
  onClose: () => void; onStarted: () => void;
}) {
  const T = trpc as any;
  const extract = T.brandRegulation.extract.useMutation({ onSuccess: onStarted, onError: errToast });
  const adopt = T.brandRegulation.adoptOriginal.useMutation({
    onSuccess: () => { showToastGlobal(en ? "Now used in every check." : "已生效，每一篇都會依它審查。", "success"); onStarted(); },
    onError: errToast,
  });
  const busy = extract.isPending || adopt.isPending;
  const pct = Math.min(999, stats.pctOfCapacity);
  const wouldOverflow = stats.chars > Math.max(0, stats.capacity - stats.usedByOthers);
  const digestPct = Math.round((stats.digestMax / stats.capacity) * 100);
  return (
    <Modal onClose={onClose}>
      <ModalHead title={en ? "Extract review points?" : "要萃取審查重點嗎？"} en={en} onClose={onClose} />
      <p className="text-[13px] font-semibold text-neutral-900">{title}</p>
      <div className="mt-3 rounded-xl bg-neutral-50 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span className="text-neutral-600">{en ? "Full text" : "原文"}</span>
          <span className="tabular-nums font-semibold text-neutral-900">{fmt(stats.chars)} {en ? "chars" : "字"}</span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2 text-[13px]">
          <span className="text-neutral-600">{en ? "Share of brand memory" : "佔品牌大腦容量"}</span>
          <span className={`tabular-nums font-semibold ${pct >= 100 ? "text-red-600" : "text-neutral-900"}`}>{pct}%</span>
        </div>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-neutral-200">
          <span className="block h-full rounded-full bg-neutral-400" style={{ width: `${Math.min(100, (stats.usedByOthers / stats.capacity) * 100)}%` }} />
        </span>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-neutral-500">
          {en
            ? `Brand memory holds ${fmt(stats.capacity)} characters; ${fmt(stats.usedByOthers)} are already used by the rest of your strategy.`
            : `品牌大腦容量 ${fmt(stats.capacity)} 字，其他策略內容已用 ${fmt(stats.usedByOthers)} 字。`}
          {wouldOverflow && (en ? " The full text won't fit." : "整份原文放不進去。")}
        </p>
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-neutral-700">
        {en
          ? `Extracting: the AI reads the whole text and turns it into a marketing review checklist of up to ${fmt(stats.digestMax)} characters (about ${digestPct}% of memory). The card shows progress; when it's done the Regulations icon and notifications light up — confirm it and it starts being used.`
          : `萃取：AI 讀完全文，整理成 ${fmt(stats.digestMax)} 字以內、只跟行銷文案有關的審查重點（約佔 ${digestPct}%）。卡片上會顯示進度；萃取好時「法規」圖示與通知會亮起來，請回來確認，確認後才開始用在審查。`}
      </p>
      {hasDigest && (
        <p className="mt-2 text-[12px] text-neutral-500">
          {en ? "The current review points stay in use until you confirm the new ones." : "確認新的審查重點之前，目前的審查重點會照常使用。"}
        </p>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className={btnQuiet} onClick={onClose} disabled={busy}>
          {en ? "Not now" : "先存著，之後再說"}
        </button>
        {stats.canAdoptOriginal && (
          <button type="button" className={btnGhost} onClick={() => adopt.mutate({ id, en })} disabled={busy}>
            {en ? `Use the text as-is (${fmt(stats.chars)} chars)` : `直接用原文（${fmt(stats.chars)} 字）`}
          </button>
        )}
        <button type="button" className={btnPrimary} onClick={() => extract.mutate({ id, en })} disabled={busy}>
          {extract.isPending ? (en ? "Starting…" : "開始中…") : (en ? "Extract" : "開始萃取")}
        </button>
      </div>
    </Modal>
  );
}

// ─── 審查重點（確認／修改） ─────────────────────────────────────────────

function DigestEditor({ en, reg, list, onClose, onChanged, onEditSource, onDeleted }: {
  en: boolean; reg: Regulation; list: RegulationList;
  onClose: () => void; onChanged: () => void; onEditSource: () => void; onDeleted: () => void;
}) {
  const T = trpc as any;
  const s = cardState(reg);
  const reviewing = s === "review";
  const [text, setText] = useState(reviewing ? reg.draftDigest : reg.digest);
  const confirm = T.brandRegulation.confirmDigest.useMutation({
    onSuccess: () => {
      showToastGlobal(reviewing ? (en ? "Confirmed — now used in every check." : "已確認，每一篇都會依它審查。") : (en ? "Saved." : "已儲存。"), "success");
      onChanged(); onClose();
    },
    onError: errToast,
  });
  const extract = T.brandRegulation.extract.useMutation({ onSuccess: () => { onChanged(); onClose(); }, onError: errToast });
  const discard = T.brandRegulation.discardDraft.useMutation({ onSuccess: () => { onChanged(); onClose(); }, onError: errToast });
  const adopt = T.brandRegulation.adoptOriginal.useMutation({ onSuccess: () => { onChanged(); onClose(); }, onError: errToast });
  const remove = T.brandRegulation.remove.useMutation({ onSuccess: onDeleted, onError: errToast });
  const busy = confirm.isPending || extract.isPending || discard.isPending || adopt.isPending || remove.isPending;

  const room = digestRoom(list, reg.id, reg.enabled);
  const chars = charLen(text);
  const over = chars > room;
  const [showSource, setShowSource] = useState(false);

  return (
    <Modal onClose={onClose} wide>
      <ModalHead title={reg.title} en={en} onClose={onClose} />
      {reg.source && <p className="-mt-2 mb-3 truncate text-[12px] text-neutral-500">{reg.source}</p>}

      {s === "extracting" ? (
        <div className="rounded-xl bg-neutral-50 px-4 py-4">
          <span className="block h-1.5 overflow-hidden rounded-full bg-neutral-200">
            <span className="block h-full rounded-full bg-[#F37E4A] transition-all duration-700" style={{ width: `${progressPct(reg.jobProgress)}%` }} />
          </span>
          <p className="mt-2 text-[13px] text-neutral-800">{progressText(reg.jobProgress, en)}</p>
          <p className="mt-1 text-[12px] text-neutral-500">
            {en ? "You can close this — the Regulations icon and notifications will light up when it's ready."
              : "可以先關掉，萃取好時「法規」圖示與通知會亮起來。"}
          </p>
          {reg.digest && (
            <p className="mt-2 text-[12px] text-neutral-500">{en ? "The current review points stay in use meanwhile." : "萃取期間，目前的審查重點照常使用。"}</p>
          )}
        </div>
      ) : s === "pending" || s === "failed" ? (
        <div className="rounded-xl bg-neutral-50 px-4 py-4 text-[13px] leading-relaxed text-neutral-700">
          {s === "failed"
            ? <p>{reg.jobError || (en ? "Extraction didn't finish." : "萃取沒有完成。")}</p>
            : <p>{en ? "No review points yet — this regulation isn't used in checks." : "還沒有審查重點——這條法規目前不會用在審查。"}</p>}
          <p className="mt-1 text-[12px] text-neutral-500">
            {en ? `Full text: ${fmt(reg.chars)} chars. The AI can turn it into a checklist of up to ${fmt(list.limits.digestMax)} characters.`
              : `原文 ${fmt(reg.chars)} 字。AI 可以把它整理成 ${fmt(list.limits.digestMax)} 字以內的審查重點。`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={busy} onClick={() => extract.mutate({ id: reg.id, en })}>
              {s === "failed" ? (en ? "Retry extraction" : "重新萃取") : (en ? "Extract" : "開始萃取")}
            </button>
            {reg.chars <= room && (
              <button type="button" className={btnGhost} disabled={busy} onClick={() => adopt.mutate({ id: reg.id, en })}>
                {en ? `Use the text as-is (${fmt(reg.chars)} chars)` : `直接用原文（${fmt(reg.chars)} 字）`}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div>
          {reviewing && (
            <p className="mb-3 rounded-lg bg-neutral-50 px-4 py-2.5 text-[12.5px] leading-relaxed text-neutral-700">
              {en
                ? "The AI extracted these review points from the full text. Check they're correct and complete — edit freely — then confirm. They're only used after you confirm."
                : "這是 AI 從原文萃取的審查重點。請確認是否正確、完整（可以直接修改），確認後才會開始用在審查。"}
            </p>
          )}
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label className="text-[12px] font-semibold text-neutral-500">
              {reviewing ? (en ? "Review points (to confirm)" : "審查重點（待確認）") : (en ? "Review points (in use)" : "審查重點（使用中）")}
            </label>
            <span className={`text-[12px] tabular-nums ${over ? "font-semibold text-red-600" : "text-neutral-500"}`}>
              {fmt(chars)} / {fmt(room)} {en ? "chars" : "字"}
            </span>
          </div>
          <textarea className={`${input} min-h-[240px] leading-relaxed`} value={text} onChange={(e) => setText(e.target.value)} />
          {over && (
            <p className="mt-1.5 text-[12px] text-red-600">
              {room === 0
                ? (en ? "No room left in brand memory for review points — turn off another regulation or free up space in Memory." : "品牌大腦已經沒有空間放審查重點——請停用其他法規，或到「記憶」騰出空間。")
                : (en ? `Over by ${fmt(chars - room)} characters — keep the rules most likely to be broken.` : `超過 ${fmt(chars - room)} 字——留下最容易被違反的規定就好。`)}
            </p>
          )}
          {reviewing && reg.digest && (
            <details className="mt-3 text-[12px]">
              <summary className="cursor-pointer select-none text-neutral-500">{en ? "Currently in use" : "目前使用中的版本"}</summary>
              <p className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-line rounded-lg bg-neutral-50 p-3 text-neutral-700">{reg.digest}</p>
            </details>
          )}
        </div>
      )}

      <div className="mt-4">
        <button type="button" className="text-[12px] text-neutral-500 underline hover:text-neutral-900" onClick={() => setShowSource((v) => !v)}>
          {showSource ? (en ? "Hide full text" : "收起原文") : (en ? `Show full text (${fmt(reg.chars)} chars)` : `看原文（${fmt(reg.chars)} 字）`)}
        </button>
        {showSource && (
          <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-line rounded-lg bg-neutral-50 p-3 text-[12px] leading-relaxed text-neutral-700">{reg.body}</p>
        )}
      </div>

      {(reviewing || s === "active" || s === "off") && (
        <p className="mt-5 rounded-lg bg-neutral-50 px-4 py-2.5 text-[12px] leading-relaxed text-neutral-500">
          {en
            ? "AI-extracted review points may miss rules, and the AI check is for reference only — not legal advice. Please confirm compliance before publishing."
            : "AI 萃取的審查重點可能有遺漏，AI 審查僅供參考、不構成法律意見；發布前請自行確認是否合規。"}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button type="button" className={btnQuiet} disabled={busy}
            onClick={() => { if (window.confirm(en ? `Delete “${reg.title}”?` : `刪除「${reg.title}」？`)) remove.mutate({ id: reg.id }); }}>
            {en ? "Delete" : "刪除"}
          </button>
          <button type="button" className={btnQuiet} disabled={busy || s === "extracting"} onClick={onEditSource}>
            {en ? "Edit full text" : "編輯原文"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {reviewing && (
            <button type="button" className={btnQuiet} disabled={busy} onClick={() => discard.mutate({ id: reg.id, en })}>
              {en ? "Discard" : "捨棄這次結果"}
            </button>
          )}
          {(reviewing || s === "active" || s === "off") && (
            <button type="button" className={btnQuiet} disabled={busy}
              onClick={() => extract.mutate({ id: reg.id, en })}>
              {en ? "Re-extract" : "重新萃取"}
            </button>
          )}
          {(reviewing || s === "active" || s === "off") && (
            <button type="button" className={btnPrimary} disabled={busy || !chars || over}
              onClick={() => confirm.mutate({ id: reg.id, digest: text.trim(), en })}>
              {confirm.isPending ? (en ? "Saving…" : "儲存中…") : reviewing ? (en ? "Confirm & use" : "確認並啟用") : (en ? "Save" : "儲存修改")}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
