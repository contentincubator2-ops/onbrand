/**
 * 推播佇列 —— 總部看過清單再按。
 *
 * 2026-09-23 (CJ「總部看過清單再按」)。刻意不做排程自動送：送出去的訊息收不
 * 回來，展場期間資料還在變，自動送的東西一旦錯了是業務對著客戶收拾。
 *
 * ── 送不到的人也要列出來 ─────────────────────────────────────────────
 * 退訂的、沒綁 LINE 的，都列在清單上並寫明原因。按下送出之後才發現「其實只
 * 送到兩個人」，這個清單就沒有存在的意義了。所以按鈕上的數字是**實際會送到
 * 的人數**，不是收件清單的長度。
 */
import React, { useState } from "react";
import { Send, UserX, Ban, CheckCircle2 } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { ErrorNote } from "../ui";
import { useT, useHubLang } from "../lang";
import { SectionLabel } from "./wording-shared";

export default function PushQueue({ onSent }: { onSent?: () => void }) {
  const t = useT();
  const { lang } = useHubLang();
  const q = trpc.hub.admin.pushQueue.useQuery(undefined, { staleTime: 30_000 });
  const send = trpc.hub.admin.sendPush.useMutation();
  const [picked, setPicked] = useState<number[]>([]);

  const entries = q.data?.entries ?? [];
  const chosen = entries.filter((e) => picked.includes(e.factId));
  const willReach = chosen.reduce((n, e) => n + e.deliverable, 0);

  if (!q.data) return null;

  return (
    <div className="mt-7">
      <SectionLabel
        label={t("Ready to send", "等你按送出")}
        counter={entries.length ? `${entries.length}` : undefined}
        intro={t(
          "Nothing goes out on a schedule. Pick what to send, check who actually receives it, then send. A message cannot be taken back.",
          "沒有任何東西會自動送出。挑要送的、看清楚誰真的收得到，再按送出。訊息送出去就收不回來。",
        )}
      />

      {!entries.length ? (
        <p className="text-[13px] leading-relaxed text-neutral-500">
          {t(
            "Nothing is due today. Items appear here when their push frequency says so and they are still open.",
            "今天沒有該送的。當一則消息的推播頻率到了、而且還沒過期，它就會出現在這裡。",
          )}
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {entries.map((e) => {
              const on = picked.includes(e.factId);
              const blocked = e.recipients.filter((r) => !r.deliverable);
              return (
                <li
                  key={e.factId}
                  className={
                    "rounded-lg border p-3 transition " +
                    (on ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 bg-white")
                  }
                >
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setPicked((p) => (on ? p.filter((x) => x !== e.factId) : [...p, e.factId]))
                      }
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-relaxed text-neutral-900">
                        {lang === "zh" ? e.title.zh : e.title.en}
                      </span>
                      <span className="mt-1 block text-[11.5px] text-neutral-500">
                        {e.market} · {e.reason}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[15px] font-semibold tabular-nums text-neutral-900">
                        {e.deliverable}
                      </span>
                      <span className="block text-[11px] text-neutral-500">{t("will receive", "人收得到")}</span>
                    </span>
                  </label>

                  <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                    {e.recipients.map((r) => (
                      <span
                        key={r.repId}
                        title={
                          r.blockedBy === "opted_out"
                            ? t("Opted out of this category", "已退訂這一類")
                            : r.blockedBy === "no_line_account"
                              ? t("No LINE account linked", "還沒綁定 LINE")
                              : undefined
                        }
                        className={
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] " +
                          (r.deliverable
                            ? "bg-emerald-50 text-emerald-900"
                            : "bg-neutral-100 text-neutral-500 line-through decoration-neutral-400")
                        }
                      >
                        {r.deliverable ? <CheckCircle2 size={10} aria-hidden />
                          : r.blockedBy === "opted_out" ? <Ban size={10} aria-hidden />
                          : <UserX size={10} aria-hidden />}
                        {r.name.split(" ")[0]}
                      </span>
                    ))}
                  </div>

                  {blocked.length ? (
                    <p className="mt-1.5 pl-7 text-[11.5px] text-neutral-500">
                      {t(
                        `${blocked.length} will not receive it: ${blocked.filter((b) => b.blockedBy === "opted_out").length} opted out, ${blocked.filter((b) => b.blockedBy === "no_line_account").length} have no LINE account.`,
                        `${blocked.length} 人收不到：${blocked.filter((b) => b.blockedBy === "opted_out").length} 人已退訂、${blocked.filter((b) => b.blockedBy === "no_line_account").length} 人還沒綁 LINE。`,
                      )}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!willReach || send.isPending}
              onClick={async () => {
                const r = await send.mutateAsync({ factIds: picked });
                setPicked([]);
                await q.refetch();
                onSent?.();
                void r;
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-[13px] font-medium text-white disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
              {send.isPending
                ? t("Sending…", "送出中…")
                : t(`Send to ${willReach} rep${willReach === 1 ? "" : "s"}`, `送給 ${willReach} 位業務`)}
            </button>
            {picked.length && !willReach ? (
              <span className="text-[12px] text-neutral-500">
                {t("Nobody selected can receive these.", "選到的這幾則沒有人收得到。")}
              </span>
            ) : null}
            {send.data ? (
              <span className="text-[12px] text-neutral-600">
                {t(
                  `Sent ${send.data.sent}, failed ${send.data.failed}, skipped ${send.data.skipped}.`,
                  `送出 ${send.data.sent}、失敗 ${send.data.failed}、略過 ${send.data.skipped}。`,
                )}
              </span>
            ) : null}
          </div>
          <ErrorNote error={send.error} />
        </>
      )}

      {q.data.recent.length ? (
        <div className="mt-5">
          <div className="mb-1.5 text-[12px] font-semibold text-neutral-700">
            {t("Recently sent", "最近送出的")}
          </div>
          <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
            {q.data.recent.slice(0, 12).map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-1.5 text-[12px]">
                <span className={r.ok ? "text-emerald-800" : "text-neutral-500"}>
                  {r.ok ? t("sent", "已送") : t("not sent", "沒送")}
                </span>
                <span className="text-neutral-600">#{r.factId} → rep {r.repId}</span>
                {r.detail ? <span className="text-neutral-400">{r.detail}</span> : null}
                <span className="ml-auto tabular-nums text-[11.5px] text-neutral-400">
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
          {/* 失敗也留紀錄，因為「到底有沒有送給他」通常是在出事的時候被問。 */}
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-neutral-500">
            {t(
              "Both sent and not-sent are recorded — the question is always asked after something has gone wrong.",
              "送出與沒送出都會留下紀錄——「到底有沒有送給他」這個問題通常是在出事之後才被問。",
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
