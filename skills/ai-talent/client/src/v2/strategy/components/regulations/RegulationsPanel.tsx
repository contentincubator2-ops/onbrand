/**
 * RegulationsPanel — 策略層「法規」mission tray。
 *
 * 2026-09-30（CJ「策略層，我要加一個 mission tray，是法規，用戶自行增加整個法規來源（但是有
 * 字數上限，確定品牌大腦吃得下），agent 寫文章前要審查，介面上要有免責。每一個法規，就是一個
 * 任務卡的形式」）。
 *
 *   · 每條法規＝一張卡；「＋ 新增法規」也是一張卡，點開是編輯視窗。
 *   · 啟用中的法規放進品牌大腦最後一段，每一篇產文動筆前逐條審查（server: brandContext）。
 *   · 用量條：法規能放多少，是硬上限與品牌大腦剩餘空間取小——打字時就看得到還能放幾字。
 *   · 免責：頁首常駐一段，編輯視窗的存檔鍵上方再一句。
 *
 * 版面沿用策略會議的單色 neutral 系統——顏色只拿來表達狀態。
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { showToastGlobal } from "../../../../components/ui/Toast";
import { ICON, CloseIcon } from "../../../platform/components/icons";
import { HelpTip } from "../../../platform/components/HelpTip";
import { IllustratedEmpty } from "../../../platform/components/EmptyIllustration";
import { cardRoom, charLen, fmt, isUrl, type Regulation, type RegulationList } from "./regulationModel";

const btnPrimary = "rounded-full bg-neutral-900 px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40";
const btnQuiet = "rounded-full border border-neutral-300 px-3 py-1 text-[12px] font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900 disabled:opacity-40";
const label = "mb-1.5 block text-[12px] font-semibold text-neutral-500";
const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-[13.5px] outline-none focus:border-neutral-900";

const errToast = (e: any) => showToastGlobal(String(e?.message ?? "error"), "error");

type Editing = { id: number | null; title: string; source: string; body: string; enabled: boolean };

export default function RegulationsPanel({ brandId, focusId }: { brandId: number; focusId?: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const navigate = useNavigate();
  const T = trpc as any;
  const listQ = T.brandRegulation.list.useQuery({ brandId }, { staleTime: 10_000 });
  const data = listQ.data as RegulationList | undefined;
  const [editing, setEditing] = useState<Editing | null>(null);

  const refetch = () => listQ.refetch?.();
  const setEnabled = T.brandRegulation.setEnabled.useMutation({ onSuccess: refetch, onError: errToast });

  const openCard = (r: Regulation) => setEditing({ id: r.id, title: r.title, source: r.source, body: r.body, enabled: r.enabled });

  // 從「記憶」點某一條法規過來：直接打開那張卡。
  useEffect(() => {
    if (!focusId || !data) return;
    const r = data.items.find((x) => x.id === focusId);
    if (r) openCard(r);
  }, [focusId, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (listQ.isLoading || !data) {
    return <p className="px-2 py-6 text-[13px] text-neutral-400">{en ? "Loading…" : "載入中…"}</p>;
  }

  const { items, usedTotal, budget, limits } = data;
  const full = items.length >= limits.maxCards;
  const newCard = () => setEditing({ id: null, title: "", source: "", body: "", enabled: true });

  return (
    <div className="mx-auto max-w-[1040px] space-y-6 px-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-[20px] font-semibold text-neutral-900">
          {en ? "Regulations" : "法規"}
          <HelpTip>
            {en
              ? "Add the regulations your marketing must follow — one card each. Every active card goes into the brand memory; before writing, the AI checks its draft against them one by one and leaves out anything that may break them."
              : "把行銷文案必須遵守的法規加進來，一條一張卡。啟用中的卡會放進品牌大腦，AI 每次動筆前都會逐條對照，可能違反的說法不會寫進去。"}
          </HelpTip>
        </h2>
        {items.length > 0 && !full && (
          <button type="button" className={btnPrimary} onClick={newCard}>{en ? "+ Add regulation" : "＋ 新增法規"}</button>
        )}
      </header>

      <Disclaimer en={en} />

      <Usage en={en} used={usedTotal} budget={budget} onOpenMemory={() => navigate(`/brands/edit?b=${brandId}&cat=brain`)} />

      {items.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200">
          <IllustratedEmpty
            kind="cards"
            title={en ? "No regulations yet" : "還沒有法規"}
            note={en
              ? "Paste only the articles that apply to your marketing — e.g. what food ads may not claim."
              : "只貼跟行銷文案有關的條文就好——例如食品廣告不得宣稱的內容。"}
            action={{ label: en ? "+ Add regulation" : "＋ 新增法規", onPress: newCard }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <RegulationCard key={r.id} r={r} en={en} onOpen={() => openCard(r)}
              onToggle={(v) => setEnabled.mutate({ id: r.id, enabled: v, en })} busy={setEnabled.isPending} />
          ))}
          {!full && (
            <button type="button" onClick={newCard}
              className="flex min-h-[188px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 text-neutral-500 transition-colors hover:border-neutral-900 hover:text-neutral-900">
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

      {editing && (
        <RegulationEditor
          key={editing.id ?? "new"} brandId={brandId} en={en} initial={editing} list={data}
          onClose={() => setEditing(null)}
          onSaved={() => { refetch(); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ─── 免責 ────────────────────────────────────────────────────────────────

function Disclaimer({ en }: { en: boolean }) {
  return (
    <div className="flex gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-4 text-[12.5px] leading-relaxed text-neutral-600">
      <FontAwesomeIcon icon={ICON.info} className="mt-0.5 shrink-0 text-[13px] text-neutral-400" />
      <p>
        <span className="font-semibold text-neutral-800">{en ? "Disclaimer. " : "免責聲明："}</span>
        {en
          ? "Regulation text is provided by you; onBrand Studio does not verify that it is complete, accurate or current. The AI checks each draft against it before writing, but cannot guarantee the output is compliant. The check is for reference only and is not legal advice — please confirm before publishing, or consult a qualified legal professional."
          : "法規內容由你自行提供，onBrand Studio 不驗證其完整性、正確性或是否為最新版本。AI 會在動筆前依這些法規自我審查，但無法保證產出完全合規；審查結果僅供參考，不構成法律意見。發布前請自行確認，或諮詢專業法律人士。"}
      </p>
    </div>
  );
}

// ─── 用量 ────────────────────────────────────────────────────────────────

function Usage({ en, used, budget, onOpenMemory }: {
  en: boolean; used: number; budget: RegulationList["budget"]; onOpenMemory: () => void;
}) {
  const allowed = budget.allowedTotal;
  const w = allowed > 0 ? Math.min(100, (used / allowed) * 100) : used > 0 ? 100 : 0;
  const noRoom = allowed === 0 && budget.limitedByBrain;
  return (
    <div className="rounded-xl border border-neutral-200 px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-neutral-900">{en ? "Space for regulations" : "法規用量"}</span>
        <span className="text-[12.5px] tabular-nums text-neutral-600">
          {fmt(used)} / {fmt(allowed)} {en ? "chars" : "字"}
        </span>
      </div>
      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-neutral-200">
        <span className="block h-full rounded-full bg-neutral-900" style={{ width: `${w}%` }} />
      </span>
      <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">
        {noRoom ? (
          <>
            {en ? "The brand memory is full, so there is no room for regulations. " : "品牌大腦已經滿了，放不下法規。"}
            <button type="button" onClick={onOpenMemory} className="font-medium text-neutral-900 underline">
              {en ? "Free up space in Memory" : "到「記憶」騰出空間"}
            </button>
          </>
        ) : budget.limitedByBrain ? (
          en
            ? `The limit is what the brand memory has left (${fmt(budget.nonRegulationChars)} of ${fmt(budget.capacity)} chars already used by the rest of your strategy).`
            : `上限是品牌大腦剩下的空間（其他策略內容已用 ${fmt(budget.nonRegulationChars)} / ${fmt(budget.capacity)} 字）。`
        ) : (
          en
            ? "Active regulations are always kept in the brand memory — they are never pushed out when it gets full."
            : "啟用中的法規一定會放進品牌大腦，大腦滿了也不會被擠掉。"
        )}
      </p>
    </div>
  );
}

// ─── 卡片 ────────────────────────────────────────────────────────────────

function RegulationCard({ r, en, onOpen, onToggle, busy }: {
  r: Regulation; en: boolean; onOpen: () => void; onToggle: (v: boolean) => void; busy: boolean;
}) {
  return (
    <div className={`flex min-h-[188px] flex-col rounded-2xl border bg-white transition-colors ${r.enabled ? "border-neutral-200 hover:border-neutral-900" : "border-neutral-200 opacity-60 hover:opacity-100"}`}>
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col px-5 pt-4 text-left">
        <span className="flex items-center gap-2 text-[11.5px] font-medium text-neutral-500">
          <FontAwesomeIcon icon={ICON.regulation} className="text-[12px]" />
          {r.enabled ? (en ? "Checked before writing" : "寫文前審查") : (en ? "Off" : "停用")}
        </span>
        <span className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug text-neutral-900">{r.title}</span>
        {r.source && <span className="mt-1 truncate text-[12px] text-neutral-500">{r.source}</span>}
        <span className="mt-2 line-clamp-3 whitespace-pre-line text-[12.5px] leading-relaxed text-neutral-600">{r.body}</span>
      </button>
      <div className="mt-3 flex items-center justify-between border-t border-neutral-100 px-5 py-2.5">
        <span className="text-[12px] tabular-nums text-neutral-500">{fmt(r.chars)} {en ? "chars" : "字"}</span>
        <Switch on={r.enabled} disabled={busy} onChange={onToggle}
          label={r.enabled ? (en ? "Turn off" : "停用") : (en ? "Turn on" : "啟用")} />
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

// ─── 編輯視窗 ────────────────────────────────────────────────────────────

function RegulationEditor({ brandId, en, initial, list, onClose, onSaved }: {
  brandId: number; en: boolean; initial: Editing; list: RegulationList; onClose: () => void; onSaved: () => void;
}) {
  const T = trpc as any;
  const [f, setF] = useState<Editing>(initial);
  const create = T.brandRegulation.create.useMutation({ onSuccess: onSaved, onError: errToast });
  const update = T.brandRegulation.update.useMutation({ onSuccess: onSaved, onError: errToast });
  const remove = T.brandRegulation.remove.useMutation({ onSuccess: onSaved, onError: errToast });
  const busy = create.isPending || update.isPending || remove.isPending;

  const chars = charLen(f.body);
  const room = cardRoom(list, f.id, f.enabled);
  const over = chars > room;
  const canSave = f.title.trim() && chars > 0 && !over && !busy;

  const save = () => {
    const payload = { title: f.title.trim(), source: f.source.trim(), body: f.body.trim(), enabled: f.enabled, en };
    if (f.id == null) create.mutate({ brandId, ...payload });
    else update.mutate({ id: f.id, ...payload });
  };

  // 大腦放不下時提示「存成停用」——原文先留著，騰出空間再啟用。
  const overHint = f.enabled && room < list.limits.cardMax
    ? (list.budget.limitedByBrain
      ? (en ? `The brand memory has room for ${fmt(room)} more characters of regulations.` : `品牌大腦還能放 ${fmt(room)} 字的法規。`)
      : (en ? `All active regulations share ${fmt(list.limits.totalMax)} characters; ${fmt(room)} left.` : `所有啟用中的法規合計 ${fmt(list.limits.totalMax)} 字，還剩 ${fmt(room)} 字。`))
    : null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-[720px] overflow-y-auto rounded-2xl bg-white px-6 py-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[16px] font-semibold text-neutral-900">
            <FontAwesomeIcon icon={ICON.regulation} className="text-[14px]" />
            {f.id == null ? (en ? "Add regulation" : "新增法規") : (en ? "Edit regulation" : "編輯法規")}
          </h3>
          <button type="button" onClick={onClose} aria-label={en ? "Close" : "關閉"} className="text-neutral-400 hover:text-neutral-900">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={label}>{en ? "Name" : "法規名稱"}</label>
            <input className={input} value={f.title} maxLength={list.limits.titleMax}
              placeholder={en ? "e.g. Food Safety Act, Art. 28" : "例：食品安全衛生管理法 第 28 條"}
              onChange={(e) => setF({ ...f, title: e.target.value })} />
          </div>
          <div>
            <label className={label}>{en ? "Source (optional)" : "來源（選填）"}</label>
            <input className={input} value={f.source} maxLength={list.limits.sourceMax}
              placeholder={en ? "Link, authority or reference number" : "網址、主管機關或文號"}
              onChange={(e) => setF({ ...f, source: e.target.value })} />
            {isUrl(f.source) && (
              <a href={f.source.trim()} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[12px] text-neutral-500 underline hover:text-neutral-900">
                {en ? "Open source" : "開啟來源"}
              </a>
            )}
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label className="text-[12px] font-semibold text-neutral-500">{en ? "Regulation text" : "條文內容"}</label>
              <span className={`text-[12px] tabular-nums ${over ? "font-semibold text-red-600" : "text-neutral-500"}`}>
                {fmt(chars)} / {fmt(room)} {en ? "chars" : "字"}
              </span>
            </div>
            <textarea className={`${input} min-h-[260px] leading-relaxed`} value={f.body}
              placeholder={en
                ? "Paste the articles that apply to your marketing. Keep only what matters for ads and posts — the AI reads all of it before every draft."
                : "貼上跟行銷有關的條文。只留廣告、貼文用得到的部分——AI 每次動筆前都會整段讀過。"}
              onChange={(e) => setF({ ...f, body: e.target.value })} />
            {(over || overHint) && (
              <p className={`mt-1.5 text-[12px] ${over ? "text-red-600" : "text-neutral-500"}`}>
                {over
                  ? (room === 0 && f.enabled
                    ? (en ? "No room left for active regulations. Save it as off for now, or free up space." : "已經沒有空間放啟用中的法規。可以先存成停用，騰出空間再啟用。")
                    : (en ? `Over the limit by ${fmt(chars - room)} characters.` : `超過 ${fmt(chars - room)} 字。`))
                  : overHint}
              </p>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-3 text-[13px] text-neutral-800">
            <Switch on={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label={en ? "Check before writing" : "寫文前審查"} />
            {f.enabled ? (en ? "On — every draft is checked against it" : "啟用——每一篇產文動筆前都會審查") : (en ? "Off — kept, but not read" : "停用——保留原文，但不讀")}
          </label>
        </div>

        <p className="mt-5 rounded-lg bg-neutral-50 px-4 py-2.5 text-[12px] leading-relaxed text-neutral-500">
          {en
            ? "The AI's check is for reference only and is not legal advice. Please confirm compliance before publishing."
            : "AI 審查僅供參考，不構成法律意見；發布前請自行確認是否合規。"}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {f.id != null ? (
            <button type="button" className={btnQuiet} disabled={busy}
              onClick={() => { if (window.confirm(en ? `Delete “${f.title}”?` : `刪除「${f.title}」？`)) remove.mutate({ id: f.id }); }}>
              {en ? "Delete" : "刪除"}
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" className={btnQuiet} onClick={onClose} disabled={busy}>{en ? "Cancel" : "取消"}</button>
            <button type="button" className={btnPrimary} onClick={save} disabled={!canSave}>
              {busy ? (en ? "Saving…" : "儲存中…") : (en ? "Save" : "儲存")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
