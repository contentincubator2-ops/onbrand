/**
 * campaignPostStatus — 活動企劃上一篇的狀態，畫面這一側只管「怎麼叫、什麼顏色」。
 *
 * 狀態本身由伺服器算（server/content/core/campaign/campaignPostStatus.ts，campaign.itemThumbs 回
 * state）；client 不得 value-import server，所以這裡只鏡像那五個值，外加「還沒寫」。
 *
 * 2026-10-02（CJ 定案）：狀態由系統走，不是四顆按鈕；「修改中」不是狀態；團隊版才有送審。
 * 顏色照設計系統只給狀態：待審 warning、退回 danger、核准／發布 success。
 */

export type CampaignPostState = "unwritten" | "draft" | "in_review" | "revision" | "approved" | "published";

export const POST_STATES: readonly CampaignPostState[] = ["unwritten", "draft", "in_review", "revision", "approved", "published"];

export function postStateLabel(s: CampaignPostState, en: boolean): string {
  switch (s) {
    case "unwritten": return en ? "Not written" : "未產出";
    case "draft":     return en ? "Draft" : "草稿";
    case "in_review": return en ? "In review" : "待審核";
    case "revision":  return en ? "Sent back" : "退回修改";
    case "approved":  return en ? "Approved" : "已核准";
    case "published": return en ? "Published" : "已發布";
  }
}

/** HeroUI Chip 的 color／variant。 */
export function postStateChip(s: CampaignPostState): { color: "default" | "warning" | "danger" | "success"; variant: "flat" | "solid" | "bordered" } {
  switch (s) {
    case "unwritten": return { color: "default", variant: "bordered" };
    case "draft":     return { color: "default", variant: "flat" };
    case "in_review": return { color: "warning", variant: "flat" };
    case "revision":  return { color: "danger", variant: "flat" };
    case "approved":  return { color: "success", variant: "flat" };
    case "published": return { color: "success", variant: "solid" };
  }
}

/** 企劃卡左邊那條線的顏色（Tailwind class）。 */
export function postStateBorder(s: CampaignPostState): string {
  switch (s) {
    case "unwritten": return "border-foreground";
    case "draft":     return "border-default-400";
    case "in_review": return "border-warning";
    case "revision":  return "border-danger";
    case "approved":
    case "published": return "border-success";
  }
}

/** 伺服器回的 state（可能缺、可能是舊版沒有這欄）→ 這一篇的狀態。 */
export function postStateOf(outputId: number | null | undefined, serverState: string | null | undefined): CampaignPostState {
  if (!outputId) return "unwritten";
  return (POST_STATES as readonly string[]).includes(serverState ?? "") && serverState !== "unwritten"
    ? (serverState as CampaignPostState)
    : "draft";
}

/** 算「完成」的狀態：核准或發布。期別標題的「3／5 已完成」用這個。 */
export const isPostDone = (s: CampaignPostState) => s === "approved" || s === "published";
