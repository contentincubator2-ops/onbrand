/**
 * 品牌頁的五張操作性卡片：導流目的地／識別寫法／官方帳號／客戶白名單／緘默期。
 *
 * 2026-09-22 (CJ「都是用卡片方式呈現，一個一個點進去，跳出視窗修改」)。
 *
 * ── 卡片骨架跟總管理同一套 ───────────────────────────────────────────
 * 同樣的圓角、同樣的頭部色塊、同樣的角落徽章、同樣的「口徑：」一行。差別是
 * 這一層的口徑問題不是「數字怎麼算的」，是**誰維護、多久更新、AI 怎麼用它**
 * ——策略層的信任問題是「這些內容哪裡來的」。
 *
 * ── 為什麼一張卡一個 modal，而不是五個分頁 ───────────────────────────
 * 這五類每一類都只有幾筆，各自開一個分頁會讓左側 tray 長出五個幾乎空的頁面。
 * 卡片牆一眼看得完「哪些填了、哪些還空著」，那正是行銷部主管要的視野。
 */
import React, { useState } from "react";
import {
  Building2,
  CalendarClock,
  Link2,
  Share2,
  Trash2,
  Type,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { ErrorNote, Loading } from "../ui";
import { useT } from "../lang";

type Kind = "destination" | "identity" | "account" | "customer" | "quiet";

interface Asset {
  id: number;
  kind: Kind;
  payload: Record<string, any>;
  sortOrder: number;
}

interface FieldSpec {
  key: string;
  label: [en: string, zh: string];
  placeholder: [en: string, zh: string];
  type?: "text" | "textarea" | "date" | "list";
  required?: boolean;
}

interface KindSpec {
  kind: Kind;
  icon: LucideIcon;
  accent: string;
  tag: [en: string, zh: string];
  name: [en: string, zh: string];
  /** 誰維護、多久更新、AI 怎麼用它。 */
  measure: [en: string, zh: string];
  /** 空的時候要講清楚「不填會怎樣」，不是「請新增」。 */
  empty: [en: string, zh: string];
  fields: FieldSpec[];
  /** 卡片上那一行摘要。 */
  summary: (a: Asset) => string;
}

export const BRAND_ASSET_SPECS: KindSpec[] = [
  {
    kind: "destination",
    icon: Link2,
    accent: "#0369A1",
    tag: ["Links", "導流"],
    name: ["Approved destinations", "核准的導流目的地"],
    measure: [
      "Marketing maintains this list; the writer may only link to what's on it. The problem isn't having no URL — it's having fifteen, and a rep pasting last year's campaign page.",
      "行銷部維護，AI 只能從這張清單裡挑連結。問題從來不是沒有網址，是有十五個，而業務隨手貼了去年的活動頁。",
    ],
    empty: [
      "Nothing approved yet — reps will pick their own link, and last year's campaign page still resolves.",
      "還沒有核准任何目的地——業務會自己挑一個連結貼，而去年的活動頁還打得開。",
    ],
    fields: [
      { key: "label", label: ["Name", "名稱"], placeholder: ["Solution page", "方案頁"], required: true },
      { key: "url", label: ["URL", "網址"], placeholder: ["https://…", "https://…"], required: true },
      { key: "useWhen", label: ["Use it when", "什麼情況用"], placeholder: ["Posts about a specific solution", "談到特定方案的貼文"], type: "textarea" },
    ],
    summary: (a) => `${a.payload.label ?? ""} — ${a.payload.url ?? ""}`,
  },
  {
    kind: "identity",
    icon: Type,
    accent: "#7C3AED",
    tag: ["Naming", "寫法"],
    name: ["How to write our name", "公司與產品的寫法"],
    measure: [
      "Every rule here is handed to the writer verbatim before it drafts. It is a prompt-level instruction, not yet a deterministic check — add the same term to Preferred wording if you want it enforced after the fact.",
      "每一條都會在動筆前原樣交給 AI。目前是寫作指令層的要求，**還不是確定性檢查**——要事後也擋，就把同一個詞也加進正面用詞。",
    ],
    empty: [
      "No naming rules yet — expect \"Asus\", \"Expert Hub\" and a missing ® in the field.",
      "還沒有任何寫法規範——外面就會出現 Asus、Expert Hub、以及漏掉的 ®。",
    ],
    fields: [
      { key: "term", label: ["Write it as", "正確寫法"], placeholder: ["ASUS", "ASUS"], required: true },
      { key: "wrong", label: ["Not as", "不要寫成"], placeholder: ["Asus, ASUSTeK", "Asus、ASUSTeK"] },
      { key: "note", label: ["Rule", "規則"], placeholder: ["All caps, every occurrence", "全大寫，每次出現都是"], type: "textarea" },
    ],
    summary: (a) => `${a.payload.term ?? ""}${a.payload.wrong ? ` （不要寫成 ${a.payload.wrong}）` : ""}`,
  },
  {
    kind: "account",
    icon: Share2,
    accent: "#EA580C",
    tag: ["Handles", "官方帳號"],
    name: ["Official accounts", "官方社群帳號"],
    measure: [
      "The handle a rep should tag so the official account can reshare. Tagging a dormant regional account instead is the normal failure.",
      "業務要 tag 到的帳號，官方才轉發得到。tag 到某個沉寂的分公司舊帳號是常態。",
    ],
    empty: [
      "No official handles on file — reps tag whichever account they find first.",
      "還沒有登錄官方帳號——業務會 tag 到他第一個搜到的那個。",
    ],
    fields: [
      { key: "platform", label: ["Platform", "平台"], placeholder: ["LinkedIn", "LinkedIn"], required: true },
      { key: "handle", label: ["Handle", "帳號"], placeholder: ["@asus", "@asus"], required: true },
      { key: "url", label: ["URL", "網址"], placeholder: ["https://…", "https://…"] },
    ],
    summary: (a) => `${a.payload.platform ?? ""} · ${a.payload.handle ?? ""}`,
  },
  {
    kind: "customer",
    icon: Users,
    accent: "#DC2626",
    tag: ["NDA", "客戶"],
    name: ["Customers we may name", "可公開提及的客戶"],
    measure: [
      "A whitelist, same shape as the market facts: only what's listed may be named, and each entry carries the permission it rests on. Naming a customer who never agreed is the highest-cost mistake in this whole system.",
      "白名單，跟市場數據同一個形狀：列出來的才能講，而且每一筆都附授權依據。講到沒同意過的客戶，是整套系統裡代價最高的一個錯。",
    ],
    empty: [
      "Empty means nobody may be named. That's the safe default — leave it empty until legal says otherwise.",
      "空的代表一個客戶都不能提。這是安全的預設值——法務點頭之前就讓它空著。",
    ],
    fields: [
      { key: "name", label: ["Customer", "客戶名稱"], placeholder: ["Acme Manufacturing", "某某製造"], required: true },
      { key: "permission", label: ["Permission rests on", "授權依據"], placeholder: ["Signed case-study consent, 2026-03", "2026-03 簽署的案例使用同意書"], required: true },
      { key: "sourceUrl", label: ["Public reference", "公開出處"], placeholder: ["https://… (published case study)", "https://…（已發布的案例）"] },
    ],
    summary: (a) => `${a.payload.name ?? ""} — ${a.payload.permission ?? ""}`,
  },
  {
    kind: "quiet",
    icon: CalendarClock,
    accent: "#57534E",
    tag: ["Blackout", "緘默期"],
    name: ["Quiet periods", "緘默期"],
    measure: [
      "The one rule the policy pack can't express: the six checks are always on, this one switches on and off by date. Inside a window, the writer is told not to touch these topics.",
      "政策包表達不了的那一條：六道檢查永遠開著，這一條依日期開關。落在區間內，寫作指令就會被加上「不要碰這些題目」。",
    ],
    empty: [
      "No windows set. For a listed company, a rep posting about revenue before earnings is a securities question, not a marketing one.",
      "還沒有設定任何區間。對上市公司來說，業務在財報前談營收是證券法問題，不是行銷問題。",
    ],
    fields: [
      { key: "label", label: ["What it is", "名稱"], placeholder: ["Q3 earnings quiet period", "Q3 財報緘默期"], required: true },
      { key: "startsOn", label: ["Starts", "起"], placeholder: ["2026-10-01", "2026-10-01"], type: "date", required: true },
      { key: "endsOn", label: ["Ends", "迄"], placeholder: ["2026-10-28", "2026-10-28"], type: "date", required: true },
      { key: "topics", label: ["Topics to avoid", "不得提及"], placeholder: ["revenue, growth rate, unannounced deals, forecasts", "營收、成長率、未公開的大單、任何預測"], type: "list" },
    ],
    summary: (a) => `${a.payload.label ?? ""} — ${a.payload.startsOn ?? ""} → ${a.payload.endsOn ?? ""}`,
  },
];

export default function BrandAssetCards() {
  const t = useT();
  const q = trpc.hub.admin.brandAssets.useQuery(undefined, { staleTime: 30_000 });
  const [openKind, setOpenKind] = useState<Kind | null>(null);

  const spec = BRAND_ASSET_SPECS.find((s) => s.kind === openKind) ?? null;
  const items = (q.data?.items ?? []) as Asset[];
  const activeQuiet = q.data?.activeQuiet ?? [];

  return (
    <div className="min-w-0">
      {q.isLoading ? <Loading /> : <ErrorNote error={q.error} />}

      <div className="mb-3 text-[12px] font-medium uppercase tracking-wide text-stone-500">
        {t("What the writer draws on, and who keeps it current", "AI 從哪裡取用，以及誰在維護")}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {BRAND_ASSET_SPECS.map((s) => {
          const mine = items.filter((a) => a.kind === s.kind);
          const Icon = s.icon;
          const live = s.kind === "quiet" && activeQuiet.length > 0;
          return (
            <button
              key={s.kind}
              type="button"
              onClick={() => setOpenKind(s.kind)}
              className="group flex flex-col overflow-hidden rounded-2xl text-left transition hover:scale-[1.02] hover:shadow-lg"
              style={{ border: "1px solid rgba(0,0,0,0.07)", background: "white" }}
            >
              <div
                className="relative flex flex-col items-center justify-center px-3"
                style={{ height: 130, background: "#F5F4F2", borderBottom: "1px solid rgba(0,0,0,0.06)" }}
              >
                <div className="text-[30px] font-bold leading-none tabular-nums text-stone-900">{mine.length}</div>
                <div className="mt-1.5 line-clamp-2 text-center text-[11px] leading-tight text-stone-500">
                  {mine.length === 1 ? t("entry", "筆") : t("entries", "筆")}
                </div>
                <div
                  className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full"
                  style={{ background: s.accent }}
                >
                  <Icon className="h-3 w-3 text-white" aria-hidden />
                </div>
                <span
                  className="absolute right-2 top-2 rounded-full px-2 py-0.5 font-bold text-white shadow-sm"
                  style={{ background: live ? "#DC2626" : s.accent, fontSize: 11, letterSpacing: "0.06em" }}
                >
                  {live ? t("IN EFFECT", "生效中") : t(s.tag[0], s.tag[1])}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <div className="text-small font-semibold text-neutral-900">{t(s.name[0], s.name[1])}</div>
                <p className="text-tiny leading-relaxed text-default-500">
                  <span className="font-medium text-neutral-600">{t("How it's kept: ", "口徑：")}</span>
                  {t(s.measure[0], s.measure[1])}
                </p>
                <div>
                  <span className="inline-flex rounded-lg border px-2 py-1 text-[12px] leading-relaxed text-neutral-600">
                    {mine.length ? s.summary(mine[0]!) : t(s.empty[0], s.empty[1])}
                  </span>
                </div>
                <div className="mt-auto flex items-center gap-2 border-t border-neutral-100 pt-2">
                  <span className="truncate text-[12px] text-neutral-600">{t("Edit", "編輯")}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {spec ? (
        <AssetModal
          spec={spec}
          items={items.filter((a) => a.kind === spec.kind)}
          onClose={() => setOpenKind(null)}
          onChanged={() => q.refetch()}
        />
      ) : null}
    </div>
  );
}

function blankDraft(spec: KindSpec): Record<string, string> {
  return Object.fromEntries(spec.fields.map((f) => [f.key, ""]));
}

function AssetModal({
  spec,
  items,
  onClose,
  onChanged,
}: {
  spec: KindSpec;
  items: Asset[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const save = trpc.hub.admin.saveBrandAsset.useMutation();
  const remove = trpc.hub.admin.removeBrandAsset.useMutation();
  const [draft, setDraft] = useState<Record<string, string>>(() => blankDraft(spec));
  const [editingId, setEditingId] = useState<number | null>(null);

  const missing = spec.fields.filter((f) => f.required && !draft[f.key]?.trim()).length > 0;
  const busy = save.isPending || remove.isPending;

  const submit = async () => {
    const payload: Record<string, any> = {};
    for (const f of spec.fields) {
      const raw = (draft[f.key] ?? "").trim();
      // list 型別在表單上是一行逗號分隔，存成陣列 —— 不然寫作端還要自己剖。
      payload[f.key] = f.type === "list" ? raw.split(/[,、]/).map((x) => x.trim()).filter(Boolean) : raw;
    }
    await save.mutateAsync({ kind: spec.kind, id: editingId, payload });
    setDraft(blankDraft(spec));
    setEditingId(null);
    onChanged();
  };

  const startEdit = (a: Asset) => {
    setEditingId(a.id);
    setDraft(
      Object.fromEntries(
        spec.fields.map((f) => {
          const v = a.payload[f.key];
          return [f.key, Array.isArray(v) ? v.join("、") : String(v ?? "")];
        }),
      ),
    );
  };

  return (
    <Modal isOpen size="2xl" scrollBehavior="inside" onClose={() => !busy && onClose()}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span className="text-[16px] font-semibold">{t(spec.name[0], spec.name[1])}</span>
          <span className="text-[12px] font-normal leading-relaxed text-neutral-500">
            {t(spec.measure[0], spec.measure[1])}
          </span>
        </ModalHeader>

        <ModalBody>
          {items.length ? (
            <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
              {items.map((a) => (
                <li key={a.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    {spec.fields.map((f) => {
                      const v = a.payload[f.key];
                      const text = Array.isArray(v) ? v.join("、") : String(v ?? "");
                      if (!text) return null;
                      return (
                        <div key={f.key} className="text-[13px] leading-relaxed">
                          <span className="text-neutral-400">{t(f.label[0], f.label[1])}: </span>
                          <span className="text-neutral-800">{text}</span>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(a)}
                    className="shrink-0 rounded-md px-2 py-1 text-[12px] text-neutral-600 hover:bg-neutral-100"
                  >
                    {t("Edit", "編輯")}
                  </button>
                  <button
                    type="button"
                    aria-label={t("Remove", "刪除")}
                    disabled={busy}
                    onClick={async () => {
                      await remove.mutateAsync({ id: a.id });
                      onChanged();
                    }}
                    className="shrink-0 rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed border-neutral-300 p-4 text-[13px] leading-relaxed text-neutral-500">
              {t(spec.empty[0], spec.empty[1])}
            </p>
          )}

          <div className="mt-4 rounded-lg border border-neutral-200 p-3">
            <div className="mb-2 text-[12px] font-semibold text-neutral-700">
              {editingId ? t("Edit entry", "修改這一筆") : t("Add an entry", "新增一筆")}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {spec.fields.map((f) => (
                <label key={f.key} className={f.type === "textarea" || f.type === "list" ? "sm:col-span-2" : ""}>
                  <span className="mb-1 block text-[12px] text-neutral-500">
                    {t(f.label[0], f.label[1])}
                    {f.required ? <span className="text-red-500"> *</span> : null}
                  </span>
                  {f.type === "textarea" ? (
                    <textarea
                      value={draft[f.key] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                      rows={2}
                      placeholder={t(f.placeholder[0], f.placeholder[1])}
                      className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-orange-500"
                    />
                  ) : (
                    <input
                      type={f.type === "date" ? "date" : "text"}
                      value={draft[f.key] ?? ""}
                      onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                      placeholder={t(f.placeholder[0], f.placeholder[1])}
                      className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-orange-500"
                    />
                  )}
                </label>
              ))}
            </div>
            <ErrorNote error={save.error ?? remove.error} />
          </div>
        </ModalBody>

        <ModalFooter>
          {editingId ? (
            <button
              type="button"
              onClick={() => { setEditingId(null); setDraft(blankDraft(spec)); }}
              className="rounded-lg px-3 py-2 text-[13px] text-neutral-600 hover:bg-neutral-100"
            >
              {t("Cancel edit", "取消修改")}
            </button>
          ) : null}
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg px-3 py-2 text-[13px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-50">
            {t("Close", "關閉")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={missing || busy}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "#F97316" }}
          >
            {busy ? t("Saving…", "儲存中…") : editingId ? t("Save changes", "儲存修改") : t("Add", "新增")}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
