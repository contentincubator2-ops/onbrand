export type PublishProvider = "zernio";

/** 2026-10-08：Pipedream／bundle.social 已移除。保留單一供應商切換點；
 * 舊環境變數 PUBLISH_PROVIDER / PUBLISH_PROVIDER_<PLATFORM> 的任何值都忽略。 */
export function getPublishProvider(_platform: string, _env: NodeJS.ProcessEnv = process.env): PublishProvider {
  return "zernio";
}
