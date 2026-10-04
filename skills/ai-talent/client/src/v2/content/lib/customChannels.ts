/**
 * customChannels（client）— 用戶自己新增的 mission tray（通路）。
 *
 * 2026-10-04（CJ「用戶也可自己增加 mission tray，例如蝦皮、momo、網紅合作」）。
 * server 端定義在 server/content/core/catalog/customChannels.ts；這裡只放前端要用的
 * 型別、id 述詞與讀取 hook。id 形狀與 server/platform/core/customChannelId.ts 同一份
 * （client 不得 value-import server，兩邊一致由 server 側的測試鎖住）。
 */
import { useMemo } from "react";
import { trpc } from "../../../lib/trpc";

export { CUSTOM_CHANNEL_RE, isCustomChannelId } from "./customChannelId";

export type ChannelFormat = "post" | "listing" | "partner";

export interface CustomChannelLite {
  id: string;
  name: string;
  preset: string | null;
  format: ChannelFormat;
}

export interface ChannelPresetLite {
  key: string;
  zh: string;
  en: string;
  group: "marketplace" | "storefront" | "partner" | "custom";
  format: ChannelFormat;
  api: "official" | "partner-key" | "none-found" | "n/a";
  note: { zh: string; en: string };
}

/** 這個品牌自己加的通路。沒選品牌或還沒載入＝空陣列。 */
export function useCustomChannels(brandId: number | null) {
  const q = (trpc as any).customChannel.list.useQuery(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false, staleTime: 60_000 },
  );
  const channels = useMemo<CustomChannelLite[]>(
    () => (Array.isArray(q.data) ? (q.data as CustomChannelLite[]) : []),
    [q.data],
  );
  return { channels, isLoading: !!q.isLoading, refetch: q.refetch as () => Promise<unknown> };
}
