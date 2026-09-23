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
import CardShell, { CARD_GRID } from "./card-shell";
import { useT, useHubLang } from "../lang";

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
}: {
  facts: Fact[];
  routing: Record<number, Routing>;
  reps: RepRow[];
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
  fact, routing, reps, onClose,
}: {
  fact: Fact;
  routing?: Routing;
  reps: RepRow[];
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
