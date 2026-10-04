import type { TaskEn, TaskEnMap, VariantLabelEnMap } from "./types";
import * as fb from "./fb";
import * as ig from "./ig";
import * as tiktok from "./tiktok";
import * as yt from "./yt";
import * as c100 from "./c100";
import * as email from "./email";
import * as misc from "./misc";

export type { TaskEn, TaskEnMap, VariantLabelEnMap } from "./types";

const PARTS = [fb, ig, tiktok, yt, c100, email, misc];

export const TASK_EN_ALL: TaskEnMap = Object.assign({}, ...PARTS.map((p) => p.TASK_EN));
export const VARIANT_LABEL_EN_ALL: VariantLabelEnMap = Object.assign({}, ...PARTS.map((p) => p.VARIANT_LABEL_EN));

export function taskEnFor(id: string): TaskEn | null {
  return TASK_EN_ALL[id] ?? null;
}
