/**
 * ChannelPicker — 選這個品牌要開哪幾個通路。
 *
 * 2026-09-06。後端 `quickTask.setChannels` 能換了，但沒有這個畫面的話用戶
 * 被鎖在方案預設值上（基礎 FB+IG），「11 個通路選 2 個、每月可更換一次」
 * 那句賣點等於不存在。
 *
 * 兩個規則直接顯示在畫面上，不藏在錯誤訊息裡：
 *   還能選幾個  —— 選滿了其餘就變成不可點，而不是點下去才說不行
 *   還剩幾天    —— 冷卻中就整區唯讀，並寫出還要等幾天
 *
 * 無限方案（企業版）不顯示這一區：沒有東西要選。
 */
import { useEffect, useState } from "react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { showToastGlobal } from "../Toast";
import { toastWithUpgrade } from "../../lib/upgradeToast";
import { CheckIcon, LockIcon, RegenerateIcon } from "../icons";

// 2026-09-29 CJ：內容通路只留 FB／IG／Threads／LINE／TikTok／電子報／官網（server 端 setChannels 也擋下架的）。
const LABEL_ZH: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram",
  threads: "Threads", line: "LINE",
  tiktok: "TikTok", email: "電子報",
  website: "AI 搜尋",
  // 2026-10-10：新聞稿開回來（YouTube 仍下架）。
  pr: "新聞稿",
};
const LABEL_EN: Record<string, string> = { ...LABEL_ZH, email: "Email", website: "AI search", pr: "Press" };
const ALL = Object.keys(LABEL_ZH);

export default function ChannelPicker({ brandId }: { brandId: number }) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const [draft, setDraft] = useState<string[] | null>(null);

  const q = (trpc as any).quickTask?.channels?.useQuery
    ? (trpc as any).quickTask.channels.useQuery({ brandId }, { enabled: !!brandId })
    : { data: undefined, refetch: () => {} };

  const mut = (trpc as any).quickTask?.setChannels?.useMutation?.({
    onSuccess: () => {
      showToastGlobal(isEn ? "Channels updated" : "通路已更新");
      setDraft(null);
      q.refetch?.();
    },
    onError: (e: any) => toastWithUpgrade(e?.message ?? (isEn ? "Failed" : "更新失敗"), isEn),
  });

  const data = q.data as
    | { platforms: string[]; limit: number; daysUntilSwap: number; canSwapNow: boolean }
    | undefined;

  useEffect(() => { setDraft(null); }, [brandId]);

  // 無限方案沒有東西要選；資料還沒到也不要先閃一塊空的出來。
  if (!data || data.limit === -1) return null;

  // 存過的清單可能還有已不列出的通路（品牌／受眾／KOL、或下架的四個）——不算進已選。
  const current = (draft ?? data.platforms).filter((p) => ALL.includes(p));
  const saved = data.platforms.filter((p) => ALL.includes(p));
  const dirty = draft !== null
    && (draft.length !== saved.length
      || draft.some((p) => !saved.includes(p)));
  const full = current.length >= data.limit;
  const locked = !data.canSwapNow;

  const toggle = (p: string) => {
    if (locked) return;
    setDraft((d) => {
      const base = d ?? saved;
      if (base.includes(p)) return base.filter((x) => x !== p);
      if (base.length >= data.limit) return base;   // 選滿了就不再加
      return [...base, p];
    });
  };

  return (
    <div className="mb-4 rounded-xl border border-default-200 bg-default-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-semibold text-default-800">
          {isEn ? "Active channels" : "已開通路"}
        </span>
        <span className="text-[13px] text-default-500">
          {current.length} / {data.limit}
        </span>
        {locked && (
          <span className="inline-flex items-center gap-1 text-[13px] text-default-500">
            <LockIcon size={13} />
            {isEn
              ? `Can change again in ${data.daysUntilSwap} days`
              : `還要 ${data.daysUntilSwap} 天才能再更換`}
          </span>
        )}
        {dirty && !locked && (
          <button
            onClick={() => mut?.mutate?.({ brandId, platforms: current })}
            disabled={mut?.isPending || current.length === 0}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-default-900 px-3 py-1.5 text-[14px] font-medium text-white disabled:opacity-40"
          >
            <RegenerateIcon size={14} />
            {isEn ? "Save channels" : "儲存變更"}
          </button>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {ALL.map((p) => {
          const on = current.includes(p);
          const disabled = locked || (!on && full);
          return (
            <button
              key={p}
              onClick={() => toggle(p)}
              disabled={disabled}
              title={disabled && !on && full
                ? (isEn
                  ? `Your plan allows ${data.limit} channels — deselect one first.`
                  : `你的方案最多 ${data.limit} 個通路，請先取消一個。`)
                : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition ${
                on
                  ? "border-default-900 bg-default-900 text-white"
                  : disabled
                    ? "border-default-200 bg-white text-default-300 cursor-not-allowed"
                    : "border-default-300 bg-white text-default-700 hover:border-default-500"
              }`}
            >
              {on && <CheckIcon size={13} />}
              {(lang === "en" ? LABEL_EN : LABEL_ZH)[p] ?? p}
            </button>
          );
        })}
      </div>

      {/* 2026-09-07 自建卡額度。建到第 4 張才被擋是死路，事前就要看得到。
          數字由 server 算（全品牌）；前台那條 ownCardsQuery 是單一通路的，
          拿它對全品牌的上限會算錯。 */}
      {(data as any)?.ownCards && (data as any).ownCards.limit !== -1 && (
        <p className="mt-2 text-[13px] text-default-500">
          {isEn
            ? `Custom task cards: ${(data as any).ownCards.used} / ${(data as any).ownCards.limit} used.`
            : `自建任務卡已用 ${(data as any).ownCards.used} ／ ${(data as any).ownCards.limit} 張。`}
        </p>
      )}
      <p className="mt-2 text-[13px] text-default-500">
        {isEn
          ? "Channels can be swapped once a month. Tasks from channels you haven't enabled are hidden."
          : "通路每月可更換一次。沒開的通路，任務卡不會出現在清單裡。"}
      </p>
    </div>
  );
}
