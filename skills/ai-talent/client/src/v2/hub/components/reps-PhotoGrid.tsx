/**
 * 業務名單的人像牆（CJ 2026-10-04「銷售的列表，每個人都是一張 avatar 照片，
 * 點進去有履歷」）。
 *
 * 一張卡回答總部看名單時的三個問題：這是誰（照片、職稱、一句話介紹）、
 * 他的 AI 認不認得他（人設完整度）、他進來了沒有（LINE 已連線／待加入）。
 */
import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, MapPin, QrCode } from "lucide-react";
import { DemoTag, RepPhoto, cx, fmt } from "../ui";
import { useT } from "../lang";
import type { RepRow } from "./reps-HermesTokens";

function Completeness({ value }: { value: number }) {
  const t = useT();
  const tone = value >= 75 ? "bg-emerald-500" : value >= 40 ? "bg-amber-500" : "bg-stone-300";
  return (
    <div title={t("How much of this rep's voice and story the AI can use", "AI 能用上多少這位業務的語氣與故事")}>
      <div className="flex items-center justify-between text-[11px] text-stone-500">
        <span>{t("Persona", "人設")}</span>
        <span className="tabular-nums text-stone-700">{value}%</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-stone-100">
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function RepPhotoGrid({ reps }: { reps: RepRow[] }) {
  const t = useT();
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {reps.map((r) => (
        <li key={r.id} className="min-w-0">
          <Link
            to={`/hub/reps/${r.id}`}
            className="group flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            <div className="relative aspect-square overflow-hidden bg-stone-100">
              <RepPhoto
                name={String(r.name)}
                seed={r.avatarSeed ? String(r.avatarSeed) : undefined}
                photoUrl={r.photoUrl}
                rounded=""
                className="transition duration-300 group-hover:scale-[1.03]"
              />
              <span className="absolute left-2 top-2 rounded border border-white/70 bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700 backdrop-blur">
                {r.market}
              </span>
              <span
                className={cx(
                  "absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur",
                  r.lineBound ? "bg-emerald-600/90 text-white" : "bg-white/85 text-stone-700",
                )}
              >
                {r.lineBound ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <QrCode className="h-3 w-3" aria-hidden />}
                {r.lineBound ? t("Connected", "已連線") : t("Awaiting access", "待加入")}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-3">
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-stone-900 group-hover:text-orange-700">{r.name}</div>
                <div className="truncate text-[12px] text-stone-500">{r.title}</div>
              </div>
              {r.headline ? (
                <p className="line-clamp-2 text-[12px] leading-snug text-stone-700">{r.headline}</p>
              ) : (
                <p className="text-[12px] italic leading-snug text-stone-400">{t("No profile yet", "還沒有履歷")}</p>
              )}
              {r.location ? (
                <div className="flex items-center gap-1 truncate text-[11px] text-stone-500">
                  <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{r.location}</span>
                </div>
              ) : null}
              <div className="mt-auto space-y-2 pt-1">
                <Completeness value={r.completeness} />
                <div className="flex items-center justify-between text-[11px] text-stone-500">
                  <span>
                    <span className="font-semibold tabular-nums text-stone-800">{fmt(r.posts)}</span> {t("posts", "篇")}
                  </span>
                  <span>
                    <span className="font-semibold tabular-nums text-stone-800">{fmt(r.clicks)}</span> {t("clicks", "次點擊")}
                  </span>
                </div>
                {r.isDemo ? <DemoTag /> : null}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
