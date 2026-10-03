/**
 * gen-task-card-dates — 每張任務卡的「上架日」＝它的 id 第一次出現在 git 歷史的日期。
 *
 * 2026-09-08 (CJ「加上日期，亮出節奏」)
 *
 * ── 為什麼從 git 算而不是手填 ─────────────────────────────────────────
 * 249 張卡分散在 17 個目錄檔，手填日期第一天就會有人忘記，之後每一張新卡
 * 都是一次「記得填嗎」。git 不會忘：一張卡什麼時候進 repo 就是它什麼時候
 * 上架。這也讓日期無法造假 —— 卡片上寫 9 月上架，歷史裡就一定查得到。
 *
 * 走法：列出所有曾經叫 quickTask*.ts／brandPacks/*.ts 的路徑（含 2026-09-08
 * 搬家前的 server/_core/），依時間正序讀每個版本的內容，抓 `id: "…"`，
 * 第一次看到就記下那個 commit 的日期。同一個 blob 只讀一次。
 *
 * 用法（在 skills/ai-talent 下）：npm run cards:dates
 * 輸出：server/content/core/catalog/taskCardDates.ts（請整份 commit，drift test 會對目錄核對）。
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });

const PATHSPECS = ["*quickTask*.ts", "*brandPacks/*.ts"];
const log = git("log", "--format=%H %as", "--name-only", "--reverse", "--", ...PATHSPECS);

const first = new Map<string, string>();
const seenBlobs = new Set<string>();
const ID_RE = /^\s*id:\s*"([a-z0-9][a-z0-9-]+)"/gm;

let commit = "";
let date = "";
for (const raw of log.split("\n")) {
  const head = /^([0-9a-f]{40}) (\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (head) { commit = head[1]!; date = head[2]!; continue; }
  const p = raw.trim();
  if (!p || !p.endsWith(".ts") || p.endsWith(".test.ts")) continue;
  if (!/quickTask|brandPacks\//.test(p)) continue;
  let blob = "";
  try { blob = git("rev-parse", `${commit}:${p}`).trim(); } catch { continue; }
  if (!blob || seenBlobs.has(blob)) continue;
  seenBlobs.add(blob);
  let src = "";
  try { src = git("show", `${commit}:${p}`); } catch { continue; }
  for (const m of src.matchAll(ID_RE)) {
    const id = m[1]!;
    if (!first.has(id)) first.set(id, date);
  }
}

const sorted = [...first.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const body = sorted.map(([id, d]) => `  "${id}": "${d}",`).join("\n");
const out = `/**
 * taskCardDates — 每張任務卡的上架日（id 第一次進 git 的日期）。
 *
 * 由 scripts/gen-task-card-dates.ts 產生，不要手改。新卡上架後跑
 * \`npm run cards:dates\` 重新產生並一起 commit；taskCardDates.test.ts 會確認
 * 目錄裡每一張卡都查得到日期。
 *
 * 產生時間：${new Date().toISOString().slice(0, 10)}，${sorted.length} 個 id。
 */
export const TASK_CARD_DATES: Record<string, string> = {
${body}
};

/** 這張卡的上架日（YYYY-MM-DD）；查不到回 null（例如用戶自建卡）。 */
export function taskCardAddedAt(id: string): string | null {
  return TASK_CARD_DATES[id] ?? null;
}
`;
writeFileSync(join(ROOT, "server/content/core/catalog/taskCardDates.ts"), out, "utf-8");
console.log(`taskCardDates.ts：${sorted.length} 個 id，${seenBlobs.size} 個版本`);
