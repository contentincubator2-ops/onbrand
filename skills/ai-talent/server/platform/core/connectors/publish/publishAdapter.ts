import type { PublishProvider } from "./publishProvider";
import type { PublishConnection } from "./connectionStore";

export const NOT_CONNECTED_MESSAGE = "此品牌尚未連接此平台，請先到品牌設定完成連接。";

export type PublishInput = {
  scheduledPostId: number;
  attempt?: number;
  brandId: number;
  platform: string;
  caption: string;
  imageUrls: string[];
  videoUrl?: string | null;
  now?: Date;
};
export type PublishResult = { postId: string | null; permalink: string | null };
export class PublishUserError extends Error {
  constructor(message: string) { super(message); this.name = "PublishUserError"; }
}
export interface PublishProviderAdapter {
  readonly provider: PublishProvider;
  getConnectUrl(i: { brandId: number; platform: string; redirectUrl: string; mode?: "connect" | "reconnect" | "replace" }): Promise<{ url: string }>;
  syncConnection(i: { brandId: number; platform: string }): Promise<PublishConnection | null>;
  disconnect(i: { brandId: number; platform: string }): Promise<void>;
  disconnectAll(i: { brandId: number }): Promise<{ disconnected: number; failed: number }>;
  publish(i: PublishInput): Promise<PublishResult>;
}
