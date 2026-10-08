/**
 * ConnectionsPanel — 成效層的「資料來源」卡片。
 *
 * 2026-09-07 (CJ「成效層最麻煩的，就是要如何跟他實際發文還有廣告後台串接，
 * 這我還不知道用戶體驗怎麼做」)。
 *
 * 設計的答案是：**不做一個「串接」大按鈕，而是三張卡各自誠實。**
 *   粉專貼文 —— 多數品牌其實已經連了（發布時做的 OAuth 早就含貼文洞察），
 *              這張卡讓他發現「原來這一段不用再做什麼」。
 *   廣告帳號 —— 要另一個授權與選帳號，寫明「導入時與你一起設定」。
 *   電商後台 —— 每家平台憑證不同，寫明這是 NT$48,000 建置的主體。
 *
 * 狀態由 server（performance.connections）從 brand_integrations 查，不是寫死。
 * 上方一律有「示意資料」說明：這頁的數字在串接前都是 mock，
 * 不能讓任何人截圖進客戶簡報當真數字。
 *
 * 單色、13–14px，照全站紀律。
 */
import React from "react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { HelpTip } from "../../platform/components/HelpTip";
import { CampaignIcon, DoneIcon, DotIcon, SetupBySoWorkIcon, ShopIcon, TextIcon } from "../../platform/components/icons";

type Conn = {
  id: "meta_page" | "meta_ads" | "commerce";
  status: "connected" | "not_connected" | "needs_setup";
  label: string | null;
  connectedAt: string | null;
  howZh: string;
  howEn: string;
  selfServe: boolean;
};

const META: Record<Conn["id"], { zh: string; en: string; icon: React.ReactNode }> = {
  meta_page: { zh: "社群貼文成效", en: "Social post performance", icon: <TextIcon size={16} /> },
  meta_ads:  { zh: "廣告帳號（Meta Ads）",             en: "Ad account (Meta Ads)",             icon: <CampaignIcon size={16} /> },
  commerce:  { zh: "電商後台（SHOPLINE / 91APP / Shopify）", en: "Commerce backend (SHOPLINE / 91APP / Shopify)", icon: <ShopIcon size={16} /> },
};

export default function ConnectionsPanel({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const isEn = lang === "en";
  const utils = trpc.useUtils();
  const sync = trpc.performance.syncSocial.useMutation({
    onSuccess: () => {
      void utils.performance.connections.invalidate();
      void utils.performance.workspace.invalidate();
      void utils.performance.report.invalidate();
      void utils.performance.campaignReport.invalidate();
    },
  });
  React.useEffect(() => { sync.reset(); }, [brandId]);
  const q = (trpc as any).performance?.connections?.useQuery
    ? (trpc as any).performance.connections.useQuery({ brandId: brandId ?? 0 }, { enabled: !!brandId, refetchOnWindowFocus: false })
    : { data: undefined };
  const conns = (q.data ?? []) as Conn[];
  const connected = conns.filter((c) => c.status === "connected").length;

  return (
    <section className="mb-5 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[15px] font-semibold text-neutral-900 flex items-center gap-1.5">
          {isEn ? "Data sources" : "資料來源"}
          <HelpTip>
            {isEn
              ? "Each source below is reported from what is actually linked. Numbers on this page switch from sample to live per source as it connects."
              : "下面每一項都是照實際串接狀態顯示。哪一項接上了，這頁對應的數字就從示意換成真的。"}
          </HelpTip>
        </h2>
        <span className="text-[13px] text-neutral-500">
          {isEn ? `${connected} / 3 connected` : `已串接 ${connected} ／ 3`}
        </span>
        <span className="ml-auto rounded-md border border-neutral-300 px-2 py-0.5 text-[12px] font-medium text-neutral-700">
          {isEn ? "Sample data until connected" : "串接前，本頁數字皆為示意資料"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {(conns.length ? conns : (["meta_page", "meta_ads", "commerce"] as Conn["id"][]).map((id) => ({
          id, status: "not_connected" as const, label: null, connectedAt: null, howZh: "", howEn: "", selfServe: false,
        }))).map((c) => {
          const on = c.status === "connected";
          return (
            <div key={c.id} className={`rounded-lg border p-3 ${on ? "border-neutral-900" : "border-neutral-200"}`}>
              <div className="flex items-center gap-2">
                <span className="text-neutral-700">{META[c.id].icon}</span>
                <span className="text-[14px] font-medium text-neutral-900">{isEn ? META[c.id].en : META[c.id].zh}</span>
              </div>
              {c.id === "meta_page" && <p className="mt-1 text-[12px] text-neutral-500">Facebook / Instagram / Threads / LinkedIn</p>}
              <div className="mt-2 flex items-center gap-1.5 text-[13px]">
                {on
                  ? <><DoneIcon size={14} className="text-neutral-900" /><span className="font-medium text-neutral-900">{isEn ? "Connected" : "已連結"}</span></>
                  : <><DotIcon size={14} className="text-neutral-400" /><span className="text-neutral-500">{isEn ? "Not connected" : "尚未串接"}</span></>}
                {c.label && <span className="ml-1 truncate text-neutral-500">· {c.label}</span>}
              </div>
              <p className="mt-2 text-[13px] leading-5 text-neutral-600">{isEn ? c.howEn : c.howZh}</p>
              {c.id === "meta_page" && on && brandId && (
                <>
                  <button type="button" disabled={sync.isPending}
                    onClick={() => sync.mutate({ brandId })}
                    className="mt-2 rounded-md border border-neutral-300 px-2 py-1 text-[13px] text-neutral-700 disabled:opacity-50">
                    {sync.isPending ? (isEn ? "Syncing…" : "同步中…") : (isEn ? "Sync performance" : "同步成效")}
                  </button>
                  {sync.error && <p role="alert" className="mt-2 text-[13px] text-neutral-600">{sync.error.message}</p>}
                  {sync.data && <p role="status" className="mt-2 text-[13px] text-neutral-600">
                    {isEn ? `Backfilled ${sync.data.platforms.reduce((n, p) => n + p.posts, 0)} posts.` : `已回填 ${sync.data.platforms.reduce((n, p) => n + p.posts, 0)} 篇貼文。`}
                    {sync.data.platforms.filter(p => p.error).map(p => <span key={p.platform} className="block">{p.platform}: {p.error}</span>)}
                    {!sync.data.platforms.length && (isEn ? " Connect a social account in brand settings first." : " 請先到品牌設定連接社群帳號。")}
                  </p>}
                </>
              )}
              {!on && !c.selfServe && (
                <p className="mt-2 inline-flex items-center gap-1 text-[12px] text-neutral-500">
                  <SetupBySoWorkIcon size={12} />
                  {isEn ? "Set up with SoWork during onboarding" : "導入時由 SoWork 設定"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
