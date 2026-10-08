/** 品牌的平台授權入口；尚未選品牌時保留分類。 */
export function publishSettingsUrl(brandId: number | null | undefined): string {
  return brandId ? `/brands/edit?b=${brandId}&cat=publish` : "/brands/edit?cat=publish";
}
