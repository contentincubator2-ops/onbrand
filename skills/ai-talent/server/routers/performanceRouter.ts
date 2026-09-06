/**
 * performanceRouter — 成效層的「資料來源狀態」。
 *
 * 2026-09-07 (CJ「屆時會客製化製作，請你隱藏市場數據層，但用模擬數據，
 * 為每個品牌製作成效層」)。
 *
 * 成效層的畫面本身是前端既有的模擬資料（mockPerformance / perfMockData，
 * 強制顯示「⚠ 模擬資料」橫幅）。這支只負責一件事：**誠實回報每一個資料
 * 來源現在串接到什麼程度**，讓串接卡片不用猜。
 *
 * 三個來源，三種真實狀態：
 *   meta_page   粉專貼文 —— brand_integrations 裡真的有 FB 連結就是 connected。
 *               發布用的 OAuth 早就要了 pages_read_engagement，貼文 insights
 *               不需要再授權一次，差的只是回填的 job（屆時導入時做）。
 *   meta_ads    廣告帳號 —— 需要 ads_read 與選廣告帳號，目前沒有這種整合，
 *               一律 not_connected。
 *   commerce    電商後台 —— SHOPLINE / 91APP / Shopify 各自要商家憑證，
 *               或用匯出檔備援。是 NT$48,000 建置的主體，一律 not_connected。
 *
 * 不做的事：不在這裡回任何成效數字。真數字要等回填 job；假數字只能從
 * 前端那份標了橫幅的 mock 來，絕不從 API 端出去 —— API 回的數字沒有橫幅。
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";

export type SourceStatus = "connected" | "not_connected" | "needs_setup";

export interface SourceConnection {
  id: "meta_page" | "meta_ads" | "commerce";
  status: SourceStatus;
  /** 已連結時的顯示名稱（粉專名稱／帳號 id）。 */
  label: string | null;
  connectedAt: string | null;
  /** 這個來源要怎麼接上 —— 給串接卡片的一句話。 */
  howZh: string;
  howEn: string;
  /** true = 可以由用戶自助完成；false = 屬於導入時由我們設定。 */
  selfServe: boolean;
}

export const performanceRouter = router({
  /** 這個品牌三個資料來源的真實狀態。 */
  connections: protectedProcedure
    .input(z.object({ brandId: z.number() }))
    .query(async ({ ctx, input }): Promise<SourceConnection[]> => {
      let fb: { status: string; selectedResourceId: string | null; connectedAt: any; authorizedResources: any } | null = null;
      try {
        const { default: localPool } = await import("../localDb");
        const [rows]: any = await localPool.execute(
          `SELECT status, selectedResourceId, connectedAt, authorizedResources
             FROM brand_integrations
            WHERE brandId = ? AND userId = ? AND integrationType = 'facebook_pages'
            ORDER BY id DESC LIMIT 1`,
          [input.brandId, ctx.user!.id],
        );
        fb = (rows as any[])[0] ?? null;
      } catch { fb = null; /* 讀不到就當沒連，不要讓成效頁掛掉 */ }

      // 已選粉專的名稱：authorizedResources 是 JSON 清單，用 selectedResourceId 對回去
      let pageLabel: string | null = null;
      if (fb?.selectedResourceId) {
        try {
          const list = typeof fb.authorizedResources === "string"
            ? JSON.parse(fb.authorizedResources) : fb.authorizedResources;
          const hit = Array.isArray(list)
            ? list.find((r: any) => String(r?.id) === String(fb!.selectedResourceId)) : null;
          pageLabel = hit?.name ?? String(fb.selectedResourceId);
        } catch { pageLabel = String(fb.selectedResourceId); }
      }
      // status enum 是 connected | disconnected | error（drizzle schema），沒有 'active'。
      const fbConnected = !!fb && fb.status === "connected" && !!fb.selectedResourceId;

      return [
        {
          id: "meta_page",
          status: fbConnected ? "connected" : "not_connected",
          label: fbConnected ? pageLabel : null,
          connectedAt: fbConnected && fb?.connectedAt ? new Date(fb.connectedAt).toISOString() : null,
          howZh: fbConnected
            ? "粉專已連結。發布時要的權限已含貼文洞察，成效回填在導入時開啟。"
            : "到日曆頁連結 Facebook 粉專。發布用的授權同時涵蓋貼文洞察，不必再授權一次。",
          howEn: fbConnected
            ? "Page connected. The publishing grant already covers post insights; backfill is enabled during onboarding."
            : "Connect your Facebook Page from the Calendar page. The publishing grant already covers post insights.",
          selfServe: true,
        },
        {
          id: "meta_ads",
          status: "not_connected",
          label: null,
          connectedAt: null,
          howZh: "需要廣告帳號的讀取授權並選擇帳號，由 SoWork 在導入時與你一起設定。",
          howEn: "Requires ad-account read access and account selection; set up with SoWork during onboarding.",
          selfServe: false,
        },
        {
          id: "commerce",
          status: "not_connected",
          label: null,
          connectedAt: null,
          howZh: "SHOPLINE／91APP／Shopify 各需商家 API 憑證；沒有 API 的用每日匯出檔備援。屬於電商營運報告建置範圍。",
          howEn: "SHOPLINE / 91APP / Shopify each need merchant API credentials; daily export files as fallback. Part of the e-commerce reporting build.",
          selfServe: false,
        },
      ];
    }),
});
