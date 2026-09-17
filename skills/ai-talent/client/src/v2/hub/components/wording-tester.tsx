/** "Try it" box shared by the preferred-wording and banned-words trays. */
import React from "react";
import { FlaskConical } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import CompliancePanel from "../CompliancePanel";
import { ErrorNote } from "../ui";
import { useT } from "../lang";
import { Highlighted, SectionLabel, useMarketRep, usePresetText, type Market } from "./wording-shared";

export default function WordingTester({
  market,
  presets,
  label,
  intro,
  highlight,
}: {
  market: Market;
  presets: Record<Market, string>;
  label: string;
  intro: string;
  /** "swaps" highlights preferred-word replacements; "claims" shows the full check. */
  highlight: "swaps" | "claims";
}) {
  const t = useT();
  const { rep } = useMarketRep(market);
  const [text, setText] = usePresetText(market, presets);
  const check = trpc.hub.rep.checkDraft.useMutation();
  const data = check.data;
  const applied = (data?.compliance.wording ?? []) as Array<{ from: string; to: string }>;

  return (
    <section className="mt-10">
      <SectionLabel label={label} intro={intro} />
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="flex min-w-0 flex-col gap-2 rounded-lg border border-[#D4D4D4] bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (rep && text.trim()) check.mutate({ repId: rep.id, text });
          }}
        >
          <div className="flex items-center gap-2 text-[12px] text-stone-500">
            <FlaskConical size={13} aria-hidden />
            {rep ? t(`Checked as ${rep.name} (${market})`, `以 ${rep.name}（${market}）的身分檢查`) : t("Loading rep…", "載入業務中…")}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            className="w-full resize-y rounded-md border border-stone-200 p-3 text-[16px] leading-relaxed outline-none focus:border-stone-500 sm:text-[14px]"
          />
          <div>
            <button
              type="submit"
              disabled={!rep || !text.trim() || check.isPending}
              className="rounded-full bg-[#171717] px-4 py-1.5 text-[13px] font-medium text-white hover:bg-[#262626] disabled:opacity-50"
            >
              {check.isPending ? t("Checking…", "檢查中…") : t("Check against policy", "依政策檢查")}
            </button>
          </div>
          <ErrorNote error={check.error} />
        </form>

        <div className="min-w-0 rounded-lg border border-[#D4D4D4] bg-white p-4">
          {!data ? (
            <p className="text-[13px] italic text-stone-500">{t("The corrected post appears here.", "修正後的貼文會顯示在這裡。")}</p>
          ) : highlight === "swaps" ? (
            <div className="space-y-3">
              <pre className="whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed text-stone-900">
                <Highlighted text={data.fixed} needles={applied.map((a) => a.to)} />
              </pre>
              {applied.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {applied.map((a) => (
                    <li key={a.from} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-900">
                      {a.from} → {a.to}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-stone-500">{t("No swaps applied to this draft.", "這份草稿沒有需要替換的用詞。")}</p>
              )}
            </div>
          ) : (
            <CompliancePanel report={data.compliance as any} before={data.original} after={data.fixed} compact />
          )}
        </div>
      </div>
    </section>
  );
}
