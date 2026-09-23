/**
 * AiPromptLibraryPage — 「AI 指令庫」獨立任務匣（mission tray）。
 *
 * 2026-09-23（CJ「武器化工具裡面，我只需要留下AI指令庫，其他都不需要。
 * AI指令庫，做成另一個mission tray」）：原本是品牌定位頁「武器化工具」
 * 底下的一張卡片（點進去看 PromptLibrary 的靜態指令範本），現在升格成
 * 跟 /tasks/fb、/tasks/instagram 平起平坐的獨立頂層目的地——左側 rail
 * 直接有自己的圖示，不用先進品牌定位頁再點卡片。
 *
 * 沿用 PlatformTaskPage.tsx 讀當前品牌 scope 的同一套做法（ShellOutletCtx，
 * 不自己重新發明 brand 解析邏輯）；渲染內容完全重用既有的 PromptLibrary
 * 元件（靜態指令範本 + 品牌變數自動代入 + 複製到 ChatGPT/Claude/Gemini/
 * Midjourney），只是換一層獨立頁面的外殼。
 *
 * 目前只做品牌 scope（跟 toolsBlock 舊卡片行為一致：「AI 指令庫」inherits
 * from the brand）；沒有像品牌定位頁那樣的 product/event 切換 UI，需要的話
 * 之後再加。
 */
import React from "react";
import { useOutletContext } from "react-router-dom";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import type { ShellOutletCtx } from "../../app/shell/ShellLayout";
import PromptLibrary from "../components/positioning/PromptLibrary";

export default function AiPromptLibraryPage() {
  const { lang } = useLang();
  const en = lang === "en";
  const ctx = useOutletContext<ShellOutletCtx>();
  const brandId = ctx?.brandId ?? null;
  const brandName = ctx?.brands?.find((b: any) => b.id === brandId)?.name ?? "";

  const q = (trpc as any).scope?.active?.useQuery
    ? (trpc as any).scope.active.useQuery(
        { brandId: brandId ?? 0, productId: null, eventId: null },
        { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 30_000 },
      )
    : { data: null, isLoading: false };
  const positioning = (q.data as any)?.brand?.positioning ?? {};

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-10">
      <div className="mb-6">
        <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-neutral-500 mb-2">
          {en ? "AI PROMPTS" : "AI 指令庫"}
        </p>
        <h1 className="text-[1.9rem] font-bold tracking-tight text-neutral-900">
          {en ? "AI Prompt Library" : "AI 指令庫"}
        </h1>
        <p className="mt-2 text-[13.5px] text-neutral-500 max-w-[560px]">
          {en
            ? "Ready-to-copy prompts for ChatGPT / Claude / Gemini / Midjourney, auto-filled from this brand's positioning."
            : "現成的指令範本，變數已經用這個品牌的定位自動代入——複製貼上就能丟給 ChatGPT / Claude / Gemini / Midjourney。"}
        </p>
      </div>

      {!brandId ? (
        <div className="rounded-xl border border-neutral-200 bg-white px-5 py-6 text-[13.5px] text-neutral-500">
          {en ? "Pick a brand from the switcher above first." : "請先在上方選一個品牌。"}
        </div>
      ) : q.isLoading ? (
        <div className="rounded-xl border border-neutral-200 bg-white px-5 py-6 text-[13.5px] text-neutral-500">
          {en ? "Loading…" : "載入中…"}
        </div>
      ) : (
        <PromptLibrary scopeMode="brand" scopeName={brandName} data={positioning} />
      )}
    </div>
  );
}
