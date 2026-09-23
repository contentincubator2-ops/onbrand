/**
 * 編輯一個既有產品——卡片與 modal 上看得到的每個欄位都在這裡。
 *
 * 2026-09-23 (CJ「編輯的功能，要可以編輯產品現在呈現的每個欄位」)。
 *
 * ── 價格為什麼要單獨一個編輯器，而不是一個 textarea ──────────────────
 * 價格是合規引擎唯一認的數字：核准了什麼，業務就只能講什麼。用純文字框讓人
 * 自己打格式，一個打錯的逗號就會變成一個「核准過」的錯價。所以做成逐列的
 * 欄位，金額是數字輸入，計費方式是下拉。
 *
 * 還有一個規則刻意寫死在這裡：**選了「客製化報價」金額就清成空的**。
 * 0 進了核准金額清單，業務寫「$0」就會通過價格檢查——這個坑在蒐集 AltaBots
 * 官網資料的時候已經擋過一次，不要從編輯介面再開一個口。
 */
import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { ErrorNote } from "../ui";
import { useT } from "../lang";
import type { Solution } from "./strat-shared";
import { ProfileEditor, type SolutionProfile } from "./product-profile";

const BILLINGS = ["month", "year", "one_time", "quote"] as const;
type Billing = (typeof BILLINGS)[number];

const BILLING_LABEL: Record<Billing, [en: string, zh: string]> = {
  month: ["per month", "每月"],
  year: ["per year", "每年"],
  one_time: ["one-time", "一次性"],
  quote: ["custom quote", "客製化報價"],
};

interface FeatureRow { en: string; zh: string }
interface PriceRow { planEn: string; planZh: string; amount: number | null; billing: Billing; startsFrom: boolean }

const camel = (k: string) => k.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());

const sameFeatures = (a: FeatureRow[], b: FeatureRow[]) =>
  JSON.stringify(a.map((r) => [r.en.trim(), r.zh.trim()])) === JSON.stringify(b.map((r) => [r.en.trim(), r.zh.trim()]));

const samePrices = (a: PriceRow[], b: PriceRow[]) =>
  JSON.stringify(a.map((r) => [r.planEn.trim(), r.planZh.trim(), r.amount, r.billing, r.startsFrom])) ===
  JSON.stringify(b.map((r) => [r.planEn.trim(), r.planZh.trim(), r.amount, r.billing, r.startsFrom]));

export default function EditSolutionModal({
  s, onClose, onSaved,
}: { s: Solution; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const edit = trpc.hub.admin.editSolution.useMutation();

  const original = {
    name_en: s.nameEn ?? "", name_zh: s.nameZh ?? "",
    vendor: s.vendor ?? "", category: s.category ?? "",
    summary_en: s.summaryEn ?? "", summary_zh: s.summaryZh ?? "",
    audience_en: s.audienceEn ?? "", audience_zh: s.audienceZh ?? "",
    source_url: s.sourceUrl ?? "", featured: s.featured ? "1" : "0",
  };
  const originalFeatures: FeatureRow[] = (s.features ?? []).map((f: any) => ({ en: f.en ?? "", zh: f.zh ?? "" }));
  const originalPrices: PriceRow[] = (s.prices ?? []).map((p: any) => ({
    planEn: p.planEn ?? "", planZh: p.planZh ?? "",
    amount: p.amount ?? null, billing: (p.billing ?? "month") as Billing, startsFrom: Boolean(p.startsFrom),
  }));

  const [draft, setDraft] = useState(original);
  const [features, setFeatures] = useState<FeatureRow[]>(originalFeatures);
  const [prices, setPrices] = useState<PriceRow[]>(originalPrices);
  const originalProfile: SolutionProfile = (s.profile ?? {}) as SolutionProfile;
  const [profile, setProfile] = useState<SolutionProfile>(originalProfile);
  const [note, setNote] = useState("");

  const dirty =
    Object.entries(draft).some(([k, v]) => String(v).trim() !== String((original as any)[k]).trim()) ||
    !sameFeatures(features, originalFeatures) ||
    !samePrices(prices, originalPrices) ||
    JSON.stringify(profile) !== JSON.stringify(originalProfile);

  const set = (k: keyof typeof draft, v: string) => setDraft({ ...draft, [k]: v });

  return (
    <Modal isOpen size="3xl" scrollBehavior="inside" onClose={() => !edit.isPending && onClose()}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5">
          <span className="text-[16px] font-semibold">{t("Edit product", "編輯產品")}</span>
          <span className="text-[12px] font-normal text-neutral-500">
            {t(
              "Nothing goes live until someone else approves it. A price change closes the old price and starts a new one today — the old one stays in the record.",
              "在別人核准之前都不會生效。改價格是把舊價收起來、今天開始用新價——舊價會留在紀錄裡。",
            )}
          </span>
        </ModalHeader>

        <ModalBody>
          <Section title={t("Identity", "基本資料")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Name (EN)", "名稱（英）")} value={draft.name_en} onChange={(v) => set("name_en", v)} />
              <Field label={t("Name (ZH)", "名稱（中）")} value={draft.name_zh} onChange={(v) => set("name_zh", v)} />
              <Field label={t("Vendor", "供應商")} value={draft.vendor} onChange={(v) => set("vendor", v)} />
              <Field label={t("Category", "分類")} value={draft.category} onChange={(v) => set("category", v)} />
              <Field wide label={t("Source URL", "資料來源網址")} value={draft.source_url} onChange={(v) => set("source_url", v)} />
              <label className="flex items-center gap-2 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={draft.featured === "1"}
                  onChange={(e) => set("featured", e.target.checked ? "1" : "0")}
                  className="h-4 w-4 accent-orange-500"
                />
                <span className="text-[13px] text-neutral-700">
                  {t("Featured — shown first in the rep's picker", "精選——在業務的挑選器裡排最前面")}
                </span>
              </label>
            </div>
          </Section>

          <Section title={t("Description", "描述")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field wide rows={4} label={t("Summary (EN)", "簡介（英）")} value={draft.summary_en} onChange={(v) => set("summary_en", v)} />
              <Field wide rows={4} label={t("Summary (ZH)", "簡介（中）")} value={draft.summary_zh} onChange={(v) => set("summary_zh", v)} />
              <Field label={t("Best for (EN)", "適合（英）")} value={draft.audience_en} onChange={(v) => set("audience_en", v)} />
              <Field label={t("Best for (ZH)", "適合（中）")} value={draft.audience_zh} onChange={(v) => set("audience_zh", v)} />
            </div>
          </Section>

          <Section
            title={t("Features", "方案特色")}
            hint={t("These go into the writing prompt for every post.", "這幾條會進到每一篇貼文的寫作指令。")}
          >
            {features.map((f, i) => (
              <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  type="text" value={f.en} placeholder="EN"
                  onChange={(e) => setFeatures(features.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)))}
                  className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-orange-500"
                />
                <input
                  type="text" value={f.zh} placeholder="中文"
                  onChange={(e) => setFeatures(features.map((x, j) => (j === i ? { ...x, zh: e.target.value } : x)))}
                  className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-orange-500"
                />
                <button
                  type="button" aria-label={t("Remove", "刪除")}
                  onClick={() => setFeatures(features.filter((_, j) => j !== i))}
                  className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            ))}
            <AddRow label={t("Add a feature", "新增一條特色")} onClick={() => setFeatures([...features, { en: "", zh: "" }])} />
          </Section>

          <Section
            title={t("Prices", "價格")}
            hint={t(
              "This list is the only thing a rep may quote. Anything else is removed from the post.",
              "這張表是業務唯一能引用的東西，其他數字會從貼文裡被拿掉。",
            )}
          >
            {prices.map((p, i) => {
              const upd = (patch: Partial<PriceRow>) => setPrices(prices.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="mb-2 rounded-lg border border-neutral-200 p-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="text" value={p.planEn} placeholder={t("Plan name (EN)", "方案名稱（英）")}
                      onChange={(e) => upd({ planEn: e.target.value })}
                      className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-orange-500"
                    />
                    <input
                      type="text" value={p.planZh} placeholder={t("Plan name (ZH)", "方案名稱（中）")}
                      onChange={(e) => upd({ planZh: e.target.value })}
                      className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-orange-500"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[12px] text-neutral-500">NT$</span>
                    <input
                      type="number" min={1} value={p.amount ?? ""} disabled={p.billing === "quote"}
                      placeholder={p.billing === "quote" ? t("no number", "沒有數字") : "1000"}
                      onChange={(e) => upd({ amount: e.target.value ? Number(e.target.value) : null })}
                      className="w-28 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] tabular-nums outline-none focus:border-orange-500 disabled:bg-neutral-100"
                    />
                    <select
                      value={p.billing}
                      // 選了客製化報價就把金額清空 —— 0 或殘留的舊數字進了核准清單，
                      // 業務就能拿它去通過價格檢查。
                      onChange={(e) => {
                        const billing = e.target.value as Billing;
                        upd({ billing, amount: billing === "quote" ? null : p.amount });
                      }}
                      className="rounded-lg border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-orange-500"
                    >
                      {BILLINGS.map((b) => (
                        <option key={b} value={b}>{t(BILLING_LABEL[b][0], BILLING_LABEL[b][1])}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-[12.5px] text-neutral-600">
                      <input
                        type="checkbox" checked={p.startsFrom} disabled={p.billing === "quote"}
                        onChange={(e) => upd({ startsFrom: e.target.checked })}
                        className="h-3.5 w-3.5 accent-orange-500"
                      />
                      {t("starting at", "起")}
                    </label>
                    <button
                      type="button" aria-label={t("Remove", "刪除")}
                      onClick={() => setPrices(prices.filter((_, j) => j !== i))}
                      className="ml-auto rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
            <AddRow
              label={t("Add a price", "新增一個價格")}
              onClick={() => setPrices([...prices, { planEn: "", planZh: "", amount: null, billing: "month", startsFrom: false }])}
            />
            {!prices.length ? (
              <p className="mt-1 text-[12px] text-neutral-500">
                {t("With no price, a rep can't quote one at all.", "沒有價格，業務就完全報不了價。")}
              </p>
            ) : null}
          </Section>

          <Section
            title={t("Product profile", "產品資料")}
            hint={t(
              "Four groups a technical buyer works through. Fields marked internal-only never reach a post — the reason is on each one.",
              "技術決策者會逐項確認的四組。標示「僅供內部」的欄位永遠不會進貼文，每一欄都寫了理由。",
            )}
          >
            <ProfileEditor solutionId={s.id} profile={profile} onChange={setProfile} />
          </Section>

          <Field
            wide
            label={t("Why (goes in the record)", "修改原因（會留在紀錄裡）")}
            value={note}
            onChange={setNote}
          />
          <ErrorNote error={edit.error} />
        </ModalBody>

        <ModalFooter>
          <button type="button" onClick={onClose} disabled={edit.isPending} className="rounded-lg px-3 py-2 text-[13px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-50">
            {t("Cancel", "取消")}
          </button>
          <button
            type="button"
            disabled={!dirty || edit.isPending}
            onClick={async () => {
              await edit.mutateAsync({
                solutionId: s.id,
                fields: draft,
                features: features.filter((f) => f.en.trim() || f.zh.trim()),
                prices: prices
                  .filter((p) => p.planEn.trim() || p.planZh.trim())
                  .map((p) => ({ ...p, amount: p.billing === "quote" ? null : p.amount })),
                profile,
                note: note.trim() || undefined,
              });
              onSaved();
            }}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            style={{ background: "#F97316" }}
          >
            {edit.isPending ? t("Sending…", "送出中…") : t("Send for approval", "送出審核")}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2">
        <div className="text-[12px] font-semibold text-neutral-700">{title}</div>
        {hint ? <div className="text-[11.5px] leading-relaxed text-neutral-500">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-dashed border-neutral-300 px-2.5 py-1.5 text-[12.5px] text-neutral-600 hover:border-neutral-500 hover:text-neutral-900"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

function Field({
  label, value, onChange, wide, rows,
}: { label: string; value: string; onChange: (v: string) => void; wide?: boolean; rows?: number }) {
  return (
    <label className={wide ? "block sm:col-span-2" : "block"}>
      <span className="mb-1 block text-[12px] text-neutral-500">{label}</span>
      {rows ? (
        <textarea
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 p-2 text-[13px] outline-none focus:border-orange-500"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-orange-500"
        />
      )}
    </label>
  );
}
