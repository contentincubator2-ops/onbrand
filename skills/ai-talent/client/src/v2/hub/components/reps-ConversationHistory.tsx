/**
 * 業務個人頁的「對話紀錄」卡。一列一段對話（中間超過 45 分鐘沒講話就分段），
 * 點下去用 WhatsApp 的樣子重播。
 */
import React, { useState } from "react";
import { ChevronRight, MessageCircle, Monitor, PlayCircle } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { Card, ErrorNote, Loading, SectionTitle, cx, timeAgo } from "../ui";
import { useHubLang, useT } from "../lang";
import WhatsAppReplay from "./reps-WhatsAppReplay";

const CHANNEL: Record<string, { en: string; zh: string; dot: string; Icon: React.ComponentType<{ className?: string }> }> = {
  whatsapp: { en: "WhatsApp", zh: "WhatsApp", dot: "bg-[#25d366]", Icon: MessageCircle },
  line: { en: "LINE", zh: "LINE", dot: "bg-[#06c755]", Icon: MessageCircle },
  simulator: { en: "HQ simulator", zh: "總部模擬器", dot: "bg-stone-400", Icon: Monitor },
};

export default function ConversationHistory({ repId, firstName }: { repId: number; firstName: string }) {
  const t = useT();
  const { lang } = useHubLang();
  const data = trpc.hub.admin.repConversations.useQuery({ repId });
  const [open, setOpen] = useState<number | null>(null);
  const sessions = data.data?.sessions ?? [];

  return (
    <Card>
      <SectionTitle
        title={t("Conversation history", "對話紀錄")}
        hint={t(
          `What ${firstName} asked their AI team, and what it answered. Tap one to replay it as WhatsApp.`,
          `${firstName} 問了 AI 團隊什麼、它怎麼回。點一段，用 WhatsApp 的樣子重播。`,
        )}
      />
      <ErrorNote error={data.error} />
      {data.isLoading ? (
        <Loading label={t("Loading conversations…", "載入對話…")} />
      ) : sessions.length ? (
        <ul className="divide-y divide-stone-100">
          {sessions.map((s, i) => {
            const ch = CHANNEL[s.channel] ?? CHANNEL.whatsapp!;
            const started = new Date(s.startedAt);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpen(i)}
                  className="group flex w-full items-center gap-3 py-3 text-left hover:bg-stone-50/80"
                >
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500">
                    <ch.Icon className="h-5 w-5" />
                    <span className={cx("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white", ch.dot)} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium text-stone-900">
                        {lang === "zh" ? ch.zh : ch.en}
                        <span className="font-normal text-stone-500">
                          {" · "}
                          {started.toLocaleDateString(lang === "zh" ? "zh-TW" : "en-US", { month: "short", day: "numeric" })}{" "}
                          {started.toLocaleTimeString(lang === "zh" ? "zh-TW" : "en-US", { hour: "numeric", minute: "2-digit" })}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-stone-400">{timeAgo(s.endedAt)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[12.5px] text-stone-600">{s.preview}</span>
                      <span className="shrink-0 rounded-full bg-stone-100 px-1.5 text-[11px] tabular-nums text-stone-600">
                        {t(`${s.count} msgs`, `${s.count} 則`)}
                      </span>
                    </span>
                  </span>
                  <PlayCircle className="h-5 w-5 shrink-0 text-stone-300 group-hover:text-[#008069]" aria-hidden />
                  <ChevronRight className="hidden h-4 w-4 shrink-0 text-stone-300 sm:block" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] italic text-stone-400">
          {t(
            "No conversations yet. They appear here once the rep messages the bot, or when you try the HQ phone simulator as them.",
            "還沒有對話。業務跟 bot 講過話，或總部用手機模擬器以他的身分試過，就會出現在這裡。",
          )}
        </p>
      )}

      {open != null && sessions[open] ? (
        <WhatsAppReplay
          sessions={sessions}
          index={open}
          onIndex={(i) => setOpen(Math.max(0, Math.min(sessions.length - 1, i)))}
          orgName={data.data?.orgName ?? "ExpertHub"}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </Card>
  );
}
