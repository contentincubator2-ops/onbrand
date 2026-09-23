/**
 * 用詞規範的卡片牆 —— 使用詞與禁用詞收在同一個 tray 裡。
 *
 * 2026-09-23 (CJ「呈現的方式還是要跟任務卡一樣，我想將可用詞和禁用詞都集合在
 * 同一個 mission tray」「只要寫使用詞、禁用詞，可以編輯，不需要寫為什麼。
 * 仍然要有編輯歷史」)。
 *
 * ── 欄位就兩個 ───────────────────────────────────────────────────────
 * 詞本身，加上禁用詞的「改說什麼」。**沒有理由欄**——CJ 的決定，而且理由欄在
 * 實務上只會變成空的或者一句「行銷部要求」。要追的時候看紀錄：誰在什麼時候
 * 加的，去問那個人。所以紀錄不是附屬功能，它是理由欄的替代品。
 *
 * 「改說什麼」留著，因為它不是理由是功能：沒有它，禁用詞只會被整個刪掉，
 * 句子會斷掉。
 *
 * ── 為什麼可以就地編輯 ───────────────────────────────────────────────
 * 原本只能新增與刪除，改一個錯字要刪掉重打，而那會在紀錄裡留下「刪除 + 新增」
 * 兩筆，看不出那其實是同一件事。
 */
import React, { useState } from "react";
import { Ban, Check, History, Lock, Pencil, Plus, Repeat, ThumbsUp, X } from "lucide-react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import CardShell, { CARD_GRID } from "./card-shell";
import { trpc } from "../../../lib/trpc";
import { ErrorNote } from "../ui";
import { useT } from "../lang";
import {
  MeasuredNote,
  UsageChip,
  humanizePattern,
  type Market,
  type WordingData,
  type WordingItem,
  type WordingKind,
  type TrayActions,
} from "./wording-shared";

interface CardSpec {
  kind: WordingKind;
  accent: string;
  icon: typeof ThumbsUp;
  tag: [en: string, zh: string];
  name: [en: string, zh: string];
  /** 這一類規則實際上怎麼運作 —— 卡片第二行。 */
  measure: [en: string, zh: string];
  /** 有沒有「改說什麼」那一格。 */
  hasReplacement: boolean;
}

const CARDS: CardSpec[] = [
  {
    kind: "preferred",
    accent: "#0369A1",
    icon: ThumbsUp,
    tag: ["ASKED", "請模型照做"],
    name: ["Words to use", "使用詞"],
    measure: [
      "Written into the writing prompt as a request. The model is asked to use these — nothing forces it, so each word carries how often it actually shows up.",
      "以「請優先使用」寫進寫作指令。模型被要求使用，但沒有強制，所以每個詞旁邊是它實際出現的次數。",
    ],
    hasReplacement: false,
  },
  {
    kind: "banned",
    accent: "#B91C1C",
    icon: Ban,
    tag: ["BLOCKED", "攔下來"],
    name: ["Words to avoid", "禁用詞"],
    measure: [
      "Checked on every post. A post containing one is stopped and the word replaced — or removed, if no replacement is given.",
      "每一篇貼文都會檢查。出現就攔下來並替換掉——沒有填「改說什麼」的話就整個拿掉。",
    ],
    hasReplacement: true,
  },
  {
    kind: "swap",
    accent: "#525252",
    icon: Repeat,
    tag: ["ALWAYS", "一定會換"],
    name: ["Word swaps", "替換對照"],
    measure: [
      "A plain string replacement on the finished post. It does not go through the model and is not a compliance failure — it just always happens.",
      "對完稿做的字串替換。不經過模型，也不算違規——它就是一定會發生。",
    ],
    hasReplacement: true,
  },
];

export default function StratWordingCards({
  data,
  market,
  actions,
}: {
  data: WordingData;
  market: Market;
  actions: TrayActions;
}) {
  const t = useT();
  const [open, setOpen] = useState<WordingKind | "legal" | null>(null);
  const history = trpc.hub.admin.wordingHistory.useQuery({ market }, { staleTime: 10_000 });
  const mine = data.items.filter((w) => w.market === market);
  const spec = CARDS.find((c) => c.kind === open) ?? null;

  return (
    <div className="min-w-0">
      <div className={CARD_GRID}>
        {CARDS.map((c) => {
          const rows = mine.filter((w) => w.kind === c.kind);
          const last = history.data?.history.find((h) => h.kind === c.kind);
          return (
            <CardShell
              key={c.kind}
              onClick={() => setOpen(c.kind)}
              accent={c.accent}
              icon={c.icon}
              tag={t(c.tag[0], c.tag[1])}
              name={t(c.name[0], c.name[1])}
              measure={t(c.measure[0], c.measure[1])}
              measureLabel={null}
              clampMeasure={3}
              detail={
                last ? (
                  <span>
                    {t(
                      `last changed by ${last.actor} on ${new Date(last.createdAt).toLocaleDateString()}`,
                      `最後由 ${last.actor} 於 ${new Date(last.createdAt).toLocaleDateString()} 變更`,
                    )}
                  </span>
                ) : (
                  <span>{t("no changes recorded yet", "還沒有變更紀錄")}</span>
                )
              }
              action={t("Open and edit", "打開編輯")}
            >
              <div className="text-[32px] font-bold leading-none tabular-nums text-stone-900">{rows.length}</div>
              <div className="mt-1.5 text-center text-[11px] leading-tight text-stone-500">
                {t(rows.length === 1 ? "word" : "words", "個詞")}
              </div>
            </CardShell>
          );
        })}
        <LegalCard data={data} market={market} onOpen={() => setOpen("legal")} />
      </div>

      {spec ? (
        <WordingModal
          spec={spec}
          market={market}
          data={data}
          actions={actions}
          onClose={() => setOpen(null)}
          onChanged={() => void history.refetch()}
        />
      ) : null}
      {open === "legal" ? <LegalModal data={data} market={market} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/**
 * 第四張卡：法規禁用。**唯讀**。
 *
 * 這一層本來在舊的禁用詞分頁上，合併的時候差一點被我弄丟。它不能丟：行銷部
 * 自己加的字跟法規擋的字，在貼文被退回的時候是完全不同的對話——一個是
 *「我們決定不這樣講」，一個是「公平會說不能這樣講」。而且它解釋了為什麼
 * 行銷部的清單看起來這麼短：真正危險的那些字已經被程式碼裡的政策包擋掉了。
 */
function LegalCard({ data, market, onOpen }: { data: WordingData; market: Market; onOpen: () => void }) {
  const t = useT();
  const rules = data.legal[market] ?? [];
  return (
    <CardShell
      onClick={onOpen}
      accent="#171717"
      icon={Lock}
      tag={t("LAW", "法規")}
      name={t("Legal claim rules", "法規禁用")}
      measure={t(
        "Defined by the market's policy pack, in code. Checked on every post like the list beside it — but not editable here, and not by marketing.",
        "由市場的政策包定義，寫在程式碼裡。跟旁邊那份清單一樣每篇都檢查，但這一頁改不了，行銷部也改不了。",
      )}
      measureLabel={null}
      clampMeasure={3}
      detail={<span>{t("maintained with the policy pack", "隨政策包維護")}</span>}
      action={t("See what it blocks", "看它擋什麼")}
    >
      <div className="text-[32px] font-bold leading-none tabular-nums text-stone-900">{rules.length}</div>
      <div className="mt-1.5 text-center text-[11px] leading-tight text-stone-500">
        {t(rules.length === 1 ? "pattern" : "patterns", "條規則")}
      </div>
    </CardShell>
  );
}

function LegalModal({ data, market, onClose }: { data: WordingData; market: Market; onClose: () => void }) {
  const t = useT();
  const rules = data.legal[market] ?? [];
  return (
    <Modal isOpen size="2xl" scrollBehavior="inside" onClose={onClose}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span className="text-[16px] font-semibold">{t("Legal claim rules", "法規禁用")}</span>
          <span className="text-[12px] font-normal leading-relaxed text-neutral-500">
            {t(
              "These live in the market's policy pack, in code. Changing them is a release, not a setting — which is the point.",
              "這些寫在市場的政策包裡，屬於程式碼。要改它得發一次版，不是改個設定——那正是重點。",
            )}
          </span>
        </ModalHeader>
        <ModalBody>
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
            {rules.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                <span className="text-[13px] text-stone-500 line-through decoration-stone-300">
                  {humanizePattern(r.pattern)}
                </span>
                {r.replacement ? (
                  <>
                    <span className="text-neutral-400" aria-hidden>→</span>
                    <span className="text-[13px] font-medium text-neutral-900">{r.replacement}</span>
                  </>
                ) : (
                  <span className="text-[12px] italic text-neutral-500">{t("(removed)", "（整個拿掉）")}</span>
                )}
              </li>
            ))}
          </ul>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] text-neutral-700"
          >
            {t("Close", "關閉")}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function WordingModal({
  spec, market, data, actions, onClose, onChanged,
}: {
  spec: CardSpec;
  market: Market;
  data: WordingData;
  actions: TrayActions;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const rows = data.items.filter((w) => w.market === market && w.kind === spec.kind);
  const [showLog, setShowLog] = useState(false);
  const [term, setTerm] = useState("");
  const [replacement, setReplacement] = useState("");

  const history = trpc.hub.admin.wordingHistory.useQuery({ market }, { staleTime: 10_000 });
  const mineLog = (history.data?.history ?? []).filter((h) => h.kind === spec.kind);

  const measuredHere = (data.measured.byMarket[market] ?? 0) > 0;
  const ready = term.trim() && (!spec.hasReplacement || spec.kind !== "swap" || replacement.trim());

  const add = async () => {
    const ok = await actions.add({
      market, kind: spec.kind, term,
      replacement: spec.hasReplacement ? replacement : undefined,
    });
    if (ok) {
      setTerm("");
      setReplacement("");
      onChanged();
      void history.refetch();
    }
  };

  return (
    <Modal isOpen size="2xl" scrollBehavior="inside" onClose={onClose}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span className="text-[16px] font-semibold">{t(spec.name[0], spec.name[1])}</span>
          <span className="text-[12px] font-normal leading-relaxed text-neutral-500">
            {t(spec.measure[0], spec.measure[1])}
          </span>
        </ModalHeader>

        <ModalBody>
          <div className="text-[11.5px] text-neutral-500">
            <MeasuredNote measured={data.measured} market={market} />
          </div>

          {rows.length ? (
            <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
              {rows.map((w) => (
                <WordingRow
                  key={w.id}
                  w={w}
                  spec={spec}
                  usage={measuredHere ? data.measured.usage[w.id] : undefined}
                  actions={actions}
                  onChanged={() => { onChanged(); void history.refetch(); }}
                />
              ))}
            </ul>
          ) : (
            <p className="text-[13px] italic text-neutral-500">
              {t("Nothing here yet.", "這裡還沒有東西。")}
            </p>
          )}

          <div className="mt-3 rounded-lg border border-neutral-200 p-3">
            <div className="text-[12px] font-semibold text-neutral-700">{t("Add a word", "新增一個詞")}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && ready) void add(); }}
                placeholder={t("The word", "詞")}
                className="min-w-[140px] flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-orange-500"
              />
              {spec.hasReplacement ? (
                <input
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && ready) void add(); }}
                  placeholder={spec.kind === "swap" ? t("say this instead", "改說") : t("say this instead (optional)", "改說（選填）")}
                  className="min-w-[140px] flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-orange-500"
                />
              ) : null}
              <button
                type="button"
                disabled={!ready || actions.addingKind === spec.kind}
                onClick={() => void add()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {actions.addingKind === spec.kind ? t("Adding…", "新增中…") : t("Add", "新增")}
              </button>
            </div>
            {spec.kind === "banned" ? (
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-neutral-500">
                {t(
                  "Leave the replacement empty and the word is simply removed — which can leave the sentence broken.",
                  "「改說」留空的話，那個字會被整個拿掉——句子可能會因此斷掉。",
                )}
              </p>
            ) : null}
            <ErrorNote error={actions.errorFor(spec.kind)} />
          </div>

          {/* 沒有理由欄，所以紀錄就是理由。它不是附屬功能。 */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowLog((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-neutral-600 hover:text-neutral-900"
            >
              <History className="h-3.5 w-3.5" aria-hidden />
              {showLog
                ? t("Hide change record", "收起變更紀錄")
                : t("Change record — who changed what, when", "變更紀錄——誰在什麼時候改了什麼")}
            </button>
            {showLog ? <WordingLog rows={mineLog} /> : null}
          </div>
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-[13px] text-neutral-700"
          >
            {t("Close", "關閉")}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function WordingRow({
  w, spec, usage, actions, onChanged,
}: {
  w: WordingItem;
  spec: CardSpec;
  usage: WordingData["measured"]["usage"][number] | undefined;
  actions: TrayActions;
  onChanged: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [term, setTerm] = useState(w.term);
  const [replacement, setReplacement] = useState(w.replacement ?? "");
  const edit = trpc.hub.admin.editWording.useMutation();

  const save = async () => {
    await edit.mutateAsync({ id: w.id, term, replacement: spec.hasReplacement ? replacement : undefined });
    setEditing(false);
    onChanged();
  };

  if (editing) {
    return (
      <li className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="min-w-[120px] flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-[13px] outline-none focus:border-orange-500"
          />
          {spec.hasReplacement ? (
            <input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder={t("say this instead", "改說")}
              className="min-w-[120px] flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-[13px] outline-none focus:border-orange-500"
            />
          ) : null}
          <button
            type="button"
            disabled={!term.trim() || edit.isPending}
            onClick={() => void save()}
            className="rounded-lg bg-neutral-900 px-2 py-1 text-[12px] font-medium text-white disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setTerm(w.term); setReplacement(w.replacement ?? ""); edit.reset(); }}
            className="rounded-lg border border-neutral-300 px-2 py-1 text-[12px] text-neutral-600"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <ErrorNote error={edit.error} />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
      <span className={spec.kind === "banned" || spec.kind === "swap" ? "text-[13px] text-stone-500 line-through decoration-stone-300" : "text-[13px] text-neutral-800"}>
        {w.term}
      </span>
      {spec.hasReplacement && w.replacement ? (
        <>
          <span className="text-neutral-400" aria-hidden>→</span>
          <span className="text-[13px] font-medium text-neutral-900">{w.replacement}</span>
        </>
      ) : null}
      <span className="ml-auto flex items-center gap-1.5">
        <UsageChip usage={usage} kind={spec.kind} />
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={t(`Edit ${w.term}`, `編輯 ${w.term}`)}
          className="rounded p-0.5 text-neutral-500 hover:text-neutral-900"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => { actions.remove(w.id); onChanged(); }}
          disabled={actions.removingId === w.id}
          title={t(`Remove ${w.term}`, `移除 ${w.term}`)}
          className="rounded p-0.5 text-neutral-500 hover:text-red-700 disabled:cursor-wait disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </span>
    </li>
  );
}

function WordingLog({ rows }: { rows: Array<any> }) {
  const t = useT();
  if (!rows.length) {
    return <p className="mt-2 text-[13px] text-neutral-500">{t("No changes recorded yet.", "還沒有任何變更紀錄。")}</p>;
  }
  const verb = (a: string) =>
    ({
      added: t("added", "新增"),
      edited: t("changed", "修改"),
      removed: t("removed", "移除"),
    } as Record<string, string>)[a] ?? a;

  return (
    <ul className="mt-2 divide-y divide-neutral-100 rounded-lg border border-neutral-200">
      {rows.map((h) => (
        <li key={h.id} className="px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
            <span className="font-medium text-neutral-800">{h.actor}</span>
            <span className="text-neutral-600">{verb(h.action)}</span>
            <span className="text-neutral-900">{h.term}</span>
            <span className="ml-auto tabular-nums text-[11.5px] text-neutral-400">
              {new Date(h.createdAt).toLocaleString()}
            </span>
          </div>
          {(h.changes ?? []).map((c: any, i: number) => (
            <div key={i} className="mt-0.5 text-[12px] leading-relaxed">
              <span className="text-red-600 line-through">{c.from || t("(empty)", "（空白）")}</span>
              <span className="mx-1 text-neutral-400">→</span>
              <span className="text-green-700">{c.to || t("(empty)", "（空白）")}</span>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );
}
