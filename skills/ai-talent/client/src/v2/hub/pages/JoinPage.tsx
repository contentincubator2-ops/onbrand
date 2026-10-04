/**
 * /join/:code — 業務掃了自己的「品牌大腦 Access」QR 之後落在這裡。
 *
 * 公開頁面，網址裡的一次性綁定碼就是身分。業務在手機上看到的是：這是你、
 * 這是你的 AI 團隊知道的東西、按一個鈕就開始。按鈕打開 LINE 並把綁定碼
 * 填好，他只需要按送出。拿不到 LINE 帳號 ID 時，退回顯示綁定碼讓他手動輸入。
 *
 * 語言跟著業務的市場走（台灣中文、美國英文），不跟著瀏覽器——這是寫給他的頁面。
 */
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BookOpenCheck, Circle, Info, MessageCircle, PenLine, ShieldCheck, Sparkles } from "lucide-react";
import { RepPhoto } from "../ui";
import { CopyButton } from "../components/reps-CopyButton";

interface JoinCard {
  rep: { name: string; title: string; team: string; market: "TW" | "US"; photoUrl: string | null };
  voice: { tone: string; headline: string; stories: number };
  org: { name: string; disclaimer: string };
  brain: { solutions: number; skills: number; wording: number; policy: string };
  code: string;
  line: { basicId: string; url: string } | null;
}

type State = { status: "loading" } | { status: "missing" } | { status: "error"; message: string } | { status: "done"; card: JoinCard };

export default function JoinPage() {
  const { code = "" } = useParams<{ code: string }>();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hub/join/${encodeURIComponent(code.slice(0, 6))}`, { credentials: "omit" })
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setState({ status: "missing" });
          return;
        }
        const body = (await res.json().catch(() => null)) as JoinCard | null;
        if (!res.ok || !body) throw new Error(res.status === 429 ? "Too many tries — wait a minute." : `Lookup failed (${res.status})`);
        if (!cancelled) setState({ status: "done", card: body });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", message: String(err?.message ?? err) });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const card = state.status === "done" ? state.card : null;
  const zh = card?.rep.market === "TW";
  const t = (en: string, zhText: string) => (zh ? zhText : en);
  const firstName = card ? (zh ? card.rep.name.split(/\s+/)[0] : card.rep.name.match(/[A-Za-z]+/)?.[0] ?? card.rep.name) : "";

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="bg-gradient-to-b from-orange-100 via-amber-50 to-stone-50 pb-16 pt-6">
        <div className="mx-auto flex max-w-md items-center gap-2.5 px-4">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-900 text-[11px] font-bold text-white" aria-hidden>
            EH
          </div>
          <div className="text-[14px] font-semibold">{card?.org.name ?? "ExpertHub"} · Sales Hub</div>
        </div>
      </div>

      <main className="mx-auto -mt-12 max-w-md space-y-4 px-4 pb-10">
        {state.status === "loading" ? (
          <div className="flex items-center gap-2 rounded-2xl bg-white p-6 text-[14px] text-stone-500 shadow-sm" role="status">
            <Circle className="h-3 w-3 animate-pulse" aria-hidden /> Loading…
          </div>
        ) : null}

        {state.status === "missing" ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
            <div className="text-[16px] font-semibold">This access code isn't active · 這組綁定碼已失效</div>
            <p className="mt-2 text-[13px] leading-relaxed text-stone-600">
              It may already have been used, or HQ issued a new one. Ask HQ for a fresh QR.
              <br />
              可能已經用過，或總部換了新的一組。請向總部索取新的 QR。
            </p>
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-[14px] text-red-800" role="alert">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{state.message}</span>
          </div>
        ) : null}

        {card ? (
          <>
            <section className="rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
              <div className="mx-auto h-28 w-28 overflow-hidden rounded-full border-4 border-white shadow-md ring-1 ring-stone-200">
                <RepPhoto name={card.rep.name} photoUrl={card.rep.photoUrl} />
              </div>
              <h1 className="mt-4 text-[22px] font-semibold leading-tight">{t(`Hi ${firstName} 👋`, `${firstName}，你好 👋`)}</h1>
              <p className="mt-1 text-[13px] text-stone-500">{card.rep.title} · {card.rep.team}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-stone-700">
                {t("Your AI marketing team is ready. It knows the company — and it writes like you.", "你的 AI 行銷團隊準備好了。它懂公司，也會用你的口吻寫。")}
              </p>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-[14px] font-semibold">{t("What's in your brand brain", "你的品牌大腦裡有什麼")}</h2>
              <ul className="mt-3 space-y-3">
                <li className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600"><BookOpenCheck className="h-4 w-4" aria-hidden /></span>
                  <div className="text-[13px]">
                    <div className="font-medium">{t(`${card.brain.solutions} approved solutions`, `${card.brain.solutions} 個核准方案`)}</div>
                    <div className="text-stone-500">{t("With the only prices you're allowed to quote", "附上唯一可以引用的價格")}</div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600"><Sparkles className="h-4 w-4" aria-hidden /></span>
                  <div className="text-[13px]">
                    <div className="font-medium">{t(`${card.brain.skills} writing skills · ${card.brain.wording} wording rules`, `${card.brain.skills} 個寫作技能 · ${card.brain.wording} 條用詞規則`)}</div>
                    <div className="text-stone-500">{t("Marketing keeps these up to date", "由行銷部維護更新")}</div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600"><ShieldCheck className="h-4 w-4" aria-hidden /></span>
                  <div className="text-[13px]">
                    <div className="font-medium">{t("Checked before you share", "分享前先檢查")}</div>
                    <div className="text-stone-500">{card.brain.policy}</div>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600"><PenLine className="h-4 w-4" aria-hidden /></span>
                  <div className="text-[13px]">
                    <div className="font-medium">{t("Your own voice", "你自己的寫法")}</div>
                    <div className="text-stone-500">
                      {card.voice.tone || t("HQ hasn't set your voice yet — you can add it later.", "總部還沒設定你的語氣——之後可以補上。")}
                      {card.voice.stories ? t(` · ${card.voice.stories} of your stories`, ` · ${card.voice.stories} 則你的親身經歷`) : ""}
                    </div>
                  </div>
                </li>
              </ul>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              {card.line ? (
                <>
                  <a
                    href={card.line.url}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#06C755] px-4 py-3 text-[15px] font-semibold text-white shadow-sm hover:brightness-95"
                  >
                    <MessageCircle className="h-5 w-5" aria-hidden /> {t("Open in LINE", "用 LINE 開啟")}
                  </a>
                  <p className="mt-2 text-center text-[12px] text-stone-500">
                    {t("Your code is already typed in — just tap send.", "綁定碼已經幫你填好，按送出就完成。")}
                  </p>
                </>
              ) : (
                <ol className="space-y-2 text-[13px] text-stone-700">
                  <li>1. {t("Add the company's LINE official account.", "加入公司的 LINE 官方帳號。")}</li>
                  <li>2. {t("Send this code in the chat:", "在聊天室送出這組碼：")}</li>
                </ol>
              )}
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-stone-50 px-3 py-2.5">
                <div>
                  <div className="text-[11px] text-stone-500">{t("Your one-time code", "你的一次性綁定碼")}</div>
                  <div className="select-all pl-[0.2em] font-mono text-[22px] font-semibold tracking-[0.2em]">{card.code}</div>
                </div>
                <CopyButton text={card.code} label={t("Copy", "複製")} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
                {t(
                  "Sending the code links your LINE account and records your consent. Connecting other accounts stays your choice, and you see the same numbers HQ sees.",
                  "送出綁定碼會連結你的 LINE 帳號並記錄你的同意。要不要連其他帳號由你決定，你看到的數字跟總部一樣。",
                )}
              </p>
            </section>

            {card.org.disclaimer ? <p className="px-2 text-center text-[11px] leading-relaxed text-stone-400">{card.org.disclaimer}</p> : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
