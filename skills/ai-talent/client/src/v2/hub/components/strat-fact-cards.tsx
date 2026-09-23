/**
 * 市場數據的卡片牆 —— 一則消息一張卡。
 *
 * 2026-09-23 (CJ「對業務的客戶有幫助的資訊…例如補助案等等，可以主動推播給
 * 業務，所以每個市場消息，應該要匹配到公司的客戶行業標籤，這樣才能推播給
 * 對應的業務，讓業務轉給客戶」)。
 *
 * ── 色塊裡放什麼 ─────────────────────────────────────────────────────
 * 這一頁的問題從「我們有幾筆資料」變成「**這則消息會到誰手上**」。所以色塊放
 * 收得到的業務人數；有截止日的放剩餘天數，因為那才是業務要採取行動的理由。
 *
 * 一個人都到不了的消息會變紅。那不是「沒人適合」，那是**標籤錯了**——市場消息
 * 的預設是 all_industries，會落到零，多半是產業 id 打錯或那個市場沒有業務。
 *
 * ── 可引用 ≠ 可轉發 ──────────────────────────────────────────────────
 * 同一批資料有兩種用途，要求不一樣：可引用的是「有查證、有數字」（合規引擎的
 * 白名單），可轉發的是「對客戶有用、還沒過期」。台灣中小企業家數是好的引用
 * 素材但不值得推播；補助截止日是好的推播素材但沒有人會在貼文裡引用它。
 * 卡片上兩個標記分開顯示，不要讓人以為是同一件事。
 */
import React, { useState } from "react";
import { AlertTriangle, BadgeCheck, CalendarClock, ExternalLink, Quote, Send, Users } from "lucide-react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { trpc } from "../../../lib/trpc";
import { ErrorNote } from "../ui";
import CardShell, { CARD_GRID } from "./card-shell";
import { StrategyEditButton, StrategyLog, StrategyPendingPanel, type EditField } from "./strategy-editor";
import { useT, useHubLang } from "../lang";

const FACT_FIELDS: EditField[] = [
  { name: "statement_zh", label: ["Statement (ZH)", "內容（中）"], multiline: true },
  { name: "statement_en", label: ["Statement (EN)", "內容（英）"], multiline: true },
  { name: "source_name", label: ["Source", "出處名稱"] },
  { name: "source_url", label: ["Source URL", "出處網址"] },
  {
    name: "expires_on", label: ["Deadline", "截止日"], date: true,
    hint: [
      "Once it passes, this stops being pushed to anyone — sending an expired subsidy is worse than sending nothing.",
      "過了這一天就不再推給任何人——推送過期的補助比不推更糟。",
    ],
  },
  {
    name: "confidence", label: ["Verification", "查證狀態"],
    options: [
      { value: "official", label: ["Official source", "官方來源"] },
      { value: "secondary", label: ["Secondary source", "次級來源"] },
      { value: "needs_verification", label: ["Not verified yet", "尚未查證"] },
    ],
    hint: [
      "Not verified means it is neither pushed to reps nor accepted by the compliance check.",
      "標成「尚未查證」代表它既不推播，合規檢查也不會接受它的數字。",
    ],
  },
];

const FACT_FIELD_LABELS: Record<string, [string, string]> = {
  statement_zh: ["Statement (ZH)", "內容（中）"], statement_en: ["Statement (EN)", "內容（英）"],
  source_name: ["Source", "出處名稱"], source_url: ["Source URL", "出處網址"],
  expires_on: ["Deadline", "截止日"], confidence: ["Verification", "查證狀態"],
  industries: ["Customer industries", "客戶產業"],
  push_cadence: ["Push frequency", "推播頻率"], push_audience: ["Push recipients", "推播對象"],
};

export const KIND_LABELS: Record<string, [string, string]> = {
  market: ["Market", "市場統計"],
  subsidy: ["Subsidy", "補助方案"],
  platform: ["Platform", "平台事實"],
  competitor: ["Competitor", "競品情報"],
  regulation: ["Regulation", "法規"],
};

const INDUSTRY_LABELS: Record<string, [string, string]> = {
  all_industries: ["All industries", "不分產業"],
  manufacturing: ["Manufacturing", "製造業"],
  retail_ecommerce: ["Retail & e-commerce", "零售與電商"],
  food_beverage: ["Food & beverage", "餐飲"],
  retail_lifestyle_services: ["Lifestyle & services", "生活服務業"],
};

export function industryLabel(t: (en: string, zh: string) => string, id: string): string {
  const l = INDUSTRY_LABELS[id];
  return l ? t(l[0], l[1]) : id;
}

export interface Fact {
  id: number;
  kind: string;
  market: string;
  statementEn: string;
  statementZh: string;
  figures: { percents?: Array<{ value: number; anchors: string[] }>; amounts?: number[] };
  sourceName: string;
  sourceUrl: string;
  publishedOn: string | null;
  confidence: string;
  industries: string[];
  expiresOn: string | null;
  quotable: boolean;
  push: { cadence: string; audience: number[]; lastPushedAt: string | null };
  due: { due: boolean; audience: number[]; reason: string };
}

export interface Routing {
  id: number;
  repIds: number[];
  daysLeft: number | null;
  live: boolean;
  forwardable: boolean;
  unknownIndustries: string[];
}

export interface RepRow {
  id: number;
  name: string;
  market: string;
  team: string;
  industries: string[];
}

export default function StratFactCards({
  facts,
  routing,
  reps,
  onChanged,
}: {
  facts: Fact[];
  routing: Record<number, Routing>;
  reps: RepRow[];
  onChanged?: () => void;
}) {
  const t = useT();
  const [openId, setOpenId] = useState<number | null>(null);
  const active = facts.find((f) => f.id === openId) ?? null;

  return (
    <div className="min-w-0">
      <div className={CARD_GRID}>
        {facts.map((f) => {
          const r = routing[f.id];
          const reach = r?.repIds.length ?? 0;
          const expired = r ? !r.live : false;
          const broken = (r?.unknownIndustries.length ?? 0) > 0;
          const orphan = Boolean(r?.live && reach === 0 && r.forwardable === false && f.kind !== "competitor");

          return (
            <CardShell
              key={f.id}
              onClick={() => setOpenId(f.id)}
              accent={
                broken || orphan ? "#B91C1C"
                : expired ? "#525252"
                : r?.daysLeft != null ? "#C2410C"
                : r?.forwardable ? "#0369A1"
                : "#525252"
              }
              icon={broken || orphan ? AlertTriangle : r?.daysLeft != null ? CalendarClock : r?.forwardable ? Send : Quote}
              tag={t(KIND_LABELS[f.kind]?.[0] ?? f.kind, KIND_LABELS[f.kind]?.[1] ?? f.kind)}
              // 標題是消息本身。這一頁沒有「名稱」欄位，句子就是內容。
              name={t(f.statementEn, f.statementZh).slice(0, 110)}
              measure={
                r?.forwardable
                  ? t(
                      `Goes to ${reach} rep${reach === 1 ? "" : "s"} whose customers are in ${f.industries.map((i) => industryLabel(t, i)).join(", ")}.`,
                      `會送到 ${reach} 位業務手上——他們的客戶屬於${f.industries.map((i) => industryLabel(t, i)).join("、")}。`,
                    )
                  : expired
                    ? t("Past its deadline — no longer sent to anyone.", "已過期——不再送給任何人。")
                    : f.kind === "competitor"
                      ? t("HQ only. Useful in conversation, never forwarded to a customer.", "只給總部。談話時用得到，不會轉給客戶。")
                      : f.confidence === "needs_verification"
                        ? t("Not verified yet, so it is not sent and cannot be quoted.", "尚未查證，所以不推送也不能引用。")
                        : t("Reaches nobody — check the industry tags.", "送不到任何人——檢查產業標籤。")
              }
              measureLabel={null}
              clampMeasure={3}
              detail={
                <span>
                  {f.market} · {f.sourceName.slice(0, 42)}
                  {f.quotable ? ` · ${t("quotable", "可引用")}` : ""}
                </span>
              }
              action={t("Open the source", "看出處與細節")}
            >
              <FactBand fact={f} routing={r} reach={reach} />
            </CardShell>
          );
        })}
      </div>

      {active ? (
        <FactModal
          fact={active}
          routing={routing[active.id]}
          reps={reps.filter((r) => routing[active.id]?.repIds.includes(r.id))}
          allReps={reps}
          onChanged={onChanged}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </div>
  );
}

function FactBand({ fact, routing, reach }: { fact: Fact; routing?: Routing; reach: number }) {
  const t = useT();

  // 有截止日的，剩餘天數比人數重要 —— 那是業務要現在行動的理由。
  if (routing?.daysLeft != null && routing.live) {
    return (
      <>
        <div className="text-[30px] font-bold leading-none tabular-nums text-orange-700">{routing.daysLeft}</div>
        <div className="mt-1.5 text-center text-[11px] font-medium leading-tight text-orange-700">
          {routing.daysLeft === 0
            ? t("last day to apply", "今天是最後一天")
            : t(`days left · ${reach} reps`, `天後截止 · ${reach} 位業務`)}
        </div>
      </>
    );
  }

  if (routing && !routing.live) {
    return (
      <>
        <div className="text-[17px] font-bold leading-tight text-stone-500">{t("Closed", "已截止")}</div>
        <div className="mt-1.5 text-center text-[11px] leading-tight text-stone-500">
          {fact.expiresOn ? t(`deadline was ${fact.expiresOn}`, `截止於 ${fact.expiresOn}`) : ""}
        </div>
      </>
    );
  }

  return (
    <>
      <div className={`text-[30px] font-bold leading-none tabular-nums ${reach ? "text-stone-900" : "text-red-700"}`}>
        {reach}
      </div>
      <div className={`mt-1.5 text-center text-[11px] leading-tight ${reach ? "text-stone-500" : "font-medium text-red-700"}`}>
        {reach
          ? t(reach === 1 ? "rep gets this" : "reps get this", "位業務收得到")
          : t("reaches nobody", "送不到任何人")}
      </div>
    </>
  );
}

function FactModal({
  fact, routing, reps, allReps, onChanged, onClose,
}: {
  fact: Fact;
  routing?: Routing;
  reps: RepRow[];
  allReps: RepRow[];
  onChanged?: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const { lang } = useHubLang();
  const percents = fact.figures.percents ?? [];
  const amounts = fact.figures.amounts ?? [];

  return (
    <Modal isOpen size="2xl" scrollBehavior="inside" onClose={onClose}>
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
              {fact.market}
            </span>
            <span className="text-[12px] font-normal text-neutral-500">
              {t(KIND_LABELS[fact.kind]?.[0] ?? fact.kind, KIND_LABELS[fact.kind]?.[1] ?? fact.kind)}
            </span>
            {fact.expiresOn ? (
              <span className="text-[12px] font-normal tabular-nums text-orange-700">
                {t(`deadline ${fact.expiresOn}`, `截止 ${fact.expiresOn}`)}
              </span>
            ) : null}
          </div>
          <span className="text-[15px] font-semibold leading-snug">{lang === "zh" ? fact.statementZh : fact.statementEn}</span>
          <span lang={lang === "zh" ? "en" : "zh-Hant"} className="text-[12.5px] font-normal leading-relaxed text-neutral-500">
            {lang === "zh" ? fact.statementEn : fact.statementZh}
          </span>
        </ModalHeader>

        <ModalBody>
          <StrategyPendingPanel entity="fact" entityId={fact.id} fieldLabel={factFieldLabel(t)} onDone={onChanged} />

          {routing?.unknownIndustries.length ? (
            <Warn>
              {t(
                `These industry tags are not in the vocabulary: ${routing.unknownIndustries.join(", ")}. Nothing matches them.`,
                `這些產業標籤不在字彙表裡：${routing.unknownIndustries.join("、")}，不會比對到任何人。`,
              )}
            </Warn>
          ) : null}

          <div>
            <div className="mb-1.5 text-[12px] font-semibold text-neutral-700">
              {t("Whose customers this is for", "這是給哪些產業的客戶")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(fact.industries.length ? fact.industries : ["all_industries"]).map((i) => (
                <span key={i} className="rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-[12px] text-neutral-700">
                  {industryLabel(t, i)}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-neutral-700">
              <Users size={13} aria-hidden />
              {routing?.forwardable
                ? t(`Reps who would receive it (${reps.length})`, `會收到的業務（${reps.length} 位）`)
                : t("Not sent to anyone", "不會送給任何人")}
            </div>
            {routing?.forwardable && reps.length ? (
              <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                {reps.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-1.5">
                    <span className="text-[13px] text-neutral-800">{r.name}</span>
                    <span className="text-[11.5px] text-neutral-500">
                      {r.team} · {(r.industries.length ? r.industries : ["all_industries"]).map((i) => industryLabel(t, i)).join("、")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] leading-relaxed text-neutral-600">
                {fact.kind === "competitor"
                  ? t(
                      "Competitor intel stays with HQ. A rep may use it in conversation, but it is never pushed out to be forwarded.",
                      "競品情報留在總部。業務談話時用得到，但不會被推送出去讓人轉發。",
                    )
                  : fact.confidence === "needs_verification"
                    ? t(
                        "Still to be verified. It is not pushed to reps and the compliance check will not accept its numbers.",
                        "尚未查證。不會推給業務，合規檢查也不會接受它的數字。",
                      )
                    : routing && !routing.live
                      ? t(
                          "Past its deadline. Sending an expired subsidy is worse than sending nothing — the rep's customer finds out when they try to apply.",
                          "已經過期。推送過期的補助比不推更糟——業務的客戶會在去申請的時候才發現。",
                        )
                      : t("No rep in this market covers these industries.", "這個市場沒有負責這些產業的業務。")}
              </p>
            )}
          </div>

          <PushEditor fact={fact} routing={routing} allReps={allReps} onChanged={onChanged} />

          <StrategyLog entity="fact" entityId={fact.id} fieldLabel={factFieldLabel(t)} />

          <div className="mt-4">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-neutral-700">
              <BadgeCheck size={13} aria-hidden />
              {t("Numbers a post may quote from this", "貼文可以從這裡引用的數字")}
            </div>
            {percents.length || amounts.length ? (
              <>
                <ul className="space-y-1">
                  {percents.map((p, i) => (
                    <li key={`p${i}`} className="text-[13px] text-neutral-800">
                      <span className="font-semibold tabular-nums">{p.value}%</span>
                      <span className="text-neutral-500">
                        {" — "}
                        {t(
                          `only counts as sourced on a line that also mentions: ${p.anchors.join(", ")}`,
                          `只有在同一行也出現「${p.anchors.join("、")}」時才算有出處`,
                        )}
                      </span>
                    </li>
                  ))}
                  {amounts.map((a, i) => (
                    <li key={`a${i}`} className="text-[13px] font-semibold tabular-nums text-neutral-800">
                      {a.toLocaleString("en-US")}
                    </li>
                  ))}
                </ul>
                {/* 錨點是這整套裡最難解釋、也最重要的一件事，所以講清楚。 */}
                <p className="mt-2 text-[11.5px] leading-relaxed text-neutral-500">
                  {t(
                    "The anchor stops a real number being borrowed for a different claim: \"80% of the workforce\" passes, \"80% of our customers doubled revenue\" does not.",
                    "錨點是為了擋住「拿真數字去撐另一個宣稱」：「就業人口占 80%」會過，「我們 80% 的客戶營收翻倍」不會。",
                  )}
                </p>
              </>
            ) : (
              <p className="text-[13px] text-neutral-500">
                {t(
                  "No figures — this one is context for a conversation, not a number for a post.",
                  "沒有數字——這一則是談話的背景，不是貼文可以引用的數據。",
                )}
              </p>
            )}
          </div>
        </ModalBody>

        <ModalFooter className="justify-between">
          <StrategyEditButton
            entity="fact" entityId={fact.id} fields={FACT_FIELDS}
            current={{
              statement_zh: fact.statementZh, statement_en: fact.statementEn,
              source_name: fact.sourceName, source_url: fact.sourceUrl,
              expires_on: fact.expiresOn ?? "", confidence: fact.confidence,
            }}
            title={["Edit this market item", "編輯這則市場消息"]}
            onChanged={onChanged}
          />
          <a
            href={fact.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-neutral-600 underline-offset-2 hover:text-neutral-900 hover:underline"
          >
            {fact.sourceName} <ExternalLink size={12} aria-hidden />
          </a>
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

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[12.5px] leading-relaxed text-amber-900">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

/**
 * 推播設定 —— 建立這則消息的人自己決定送給誰、多久送一次。
 *
 * 2026-09-23 (CJ「由建置該消息的用戶，設定推播的銷售業務員群組還有頻率」)。
 *
 * 指名的名單優先於產業自動比對，但**不能繞過時效**：過期的消息即使指名了也
 * 不送（factPush.dueToday 擋著）。理由跟自動比對那邊一樣——業務轉給客戶、
 * 客戶去申請才發現結束了。
 *
 * 這個設定改的是「誰會收到」，不是「內容講什麼」，而且設錯是可逆的（關掉就
 * 停），所以**不走核准**，但會留紀錄。
 */
const CADENCES: Array<{ id: string; en: string; zh: string }> = [
  { id: "off", en: "Not pushed", zh: "不推播" },
  { id: "once", en: "Once", zh: "推一次" },
  { id: "weekly", en: "Weekly while open", zh: "有效期間每週" },
  { id: "before_deadline", en: "Before the deadline", zh: "接近截止日" },
];

function PushEditor({
  fact, routing, allReps, onChanged,
}: {
  fact: Fact;
  routing?: Routing;
  allReps: RepRow[];
  onChanged?: () => void;
}) {
  const t = useT();
  const save = trpc.hub.admin.setFactPush.useMutation();
  const [cadence, setCadence] = useState(fact.push?.cadence ?? "off");
  const [audience, setAudience] = useState<number[]>(fact.push?.audience ?? []);
  const named = audience.length > 0;
  const auto = routing?.repIds ?? [];
  const effective = named ? audience : auto;
  // 同市場的業務才列得出來 —— 台灣的補助指名給美國的業務是沒有意義的。
  const candidates = allReps.filter((r) => r.market === fact.market);

  const dirty = cadence !== (fact.push?.cadence ?? "off")
    || JSON.stringify([...audience].sort()) !== JSON.stringify([...(fact.push?.audience ?? [])].sort());

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 p-3">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-neutral-700">
        <Send size={13} aria-hidden />
        {t("Push to reps", "推播給業務")}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {CADENCES.map((c) => {
          const on = cadence === c.id;
          const useless = c.id === "before_deadline" && !fact.expiresOn;
          return (
            <button
              key={c.id}
              type="button"
              disabled={useless}
              onClick={() => setCadence(c.id)}
              title={useless ? t("This item has no deadline.", "這則消息沒有截止日。") : undefined}
              className={
                "rounded-full border px-2.5 py-1 text-[12.5px] transition " +
                (on ? "border-neutral-900 bg-neutral-900 text-white"
                   : useless ? "cursor-not-allowed border-neutral-200 text-neutral-300"
                   : "border-neutral-300 text-neutral-700 hover:border-neutral-500")
              }
            >
              {t(c.en, c.zh)}
            </button>
          );
        })}
      </div>

      {cadence !== "off" ? (
        <div className="mt-3">
          <div className="text-[12px] font-medium text-neutral-700">
            {named
              ? t(`Named recipients (${audience.length})`, `指名的業務（${audience.length} 位）`)
              : t(`Automatic by industry (${auto.length})`, `依產業自動比對（${auto.length} 位）`)}
          </div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-neutral-500">
            {t(
              "Leave everyone unticked to keep matching by customer industry. Tick anyone and only they receive it.",
              "全部不勾＝繼續依客戶產業自動比對；只要勾了人，就只有被勾的人收到。",
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {candidates.map((r) => {
              const on = audience.includes(r.id);
              const wouldAuto = auto.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setAudience((prev) => (on ? prev.filter((x) => x !== r.id) : [...prev, r.id]))}
                  className={
                    "rounded-full border px-2.5 py-1 text-[12.5px] transition " +
                    (on ? "border-sky-700 bg-sky-50 text-sky-900"
                       : wouldAuto ? "border-neutral-300 text-neutral-700 hover:border-neutral-500"
                       : "border-dashed border-neutral-300 text-neutral-400 hover:border-neutral-500")
                  }
                  title={wouldAuto ? undefined : t("Not matched by industry — ticking adds them anyway.", "產業沒比對到——勾了就會加進來。")}
                >
                  {r.name.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 設定完之後，直接說今天會不會送、不送的話為什麼。 */}
      <p className="mt-2.5 text-[11.5px] leading-relaxed text-neutral-500">
        {fact.due?.due
          ? t(`Due today — ${effective.length} recipient(s).`, `今天該送——${effective.length} 位收件者。`)
          : t(`Not due today (${fact.due?.reason ?? "off"}).`, `今天不送（${fact.due?.reason ?? "未設定"}）。`)}
      </p>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={!dirty || save.isPending}
          onClick={async () => {
            await save.mutateAsync({ factId: fact.id, cadence: cadence as any, audience });
            onChanged?.();
          }}
          className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-40"
        >
          {save.isPending ? t("Saving…", "儲存中…") : t("Save push settings", "儲存推播設定")}
        </button>
        {dirty ? <span className="text-[11.5px] text-neutral-500">{t("unsaved", "尚未儲存")}</span> : null}
      </div>
      <ErrorNote error={save.error} />

      {/* 誠實：算得出來，還沒接上發送。 */}
      <p className="mt-2 text-[11.5px] leading-relaxed text-amber-800">
        {t(
          "Nothing is actually sent yet. This decides who would receive it and when — delivery needs an opt-out first.",
          "目前還不會真的送出去。這裡決定的是「誰會收到、什麼時候」——實際發送要先有退訂機制。",
        )}
      </p>
    </div>
  );
}

/** 欄位名 → 看得懂的標籤。待審面板與紀錄共用。 */
function factFieldLabel(t: (en: string, zh: string) => string) {
  return (f: string) => {
    const l = FACT_FIELD_LABELS[f];
    return l ? t(l[0], l[1]) : f;
  };
}
