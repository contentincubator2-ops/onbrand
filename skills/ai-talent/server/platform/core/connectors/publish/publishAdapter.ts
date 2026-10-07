import type { PublishProvider } from "./publishProvider";
import type { PublishConnection } from "./connectionStore";

export type PublishInput = {
  scheduledPostId: number;
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
  getConnectUrl(i: { brandId: number; platform: string; redirectUrl: string }): Promise<{ url: string }>;
  syncConnections(i: { brandId: number; platform: string }): Promise<PublishConnection[]>;
  disconnect(i: { brandId: number; platform: string; accountId: string }): Promise<void>;
  publish(i: PublishInput): Promise<PublishResult>;
}
