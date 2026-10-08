/**
 * 替內建任務卡批次產插畫（gpt-image-2），結果進 repo：
 *   client/public/task-illustrations/<id>.webp        圖（480×320）
 *   client/src/v2/platform/components/taskIllustrationIds.json   有圖的卡 id（前端靠它決定要不要載圖）
 *   scripts/data/task-illustration-concepts.json      每張卡的畫面概念（重畫時沿用，要改就改這裡）
 *
 * 平常不在本機跑——要 OPENAI_API_KEY（有額度的那把）和 ANTHROPIC_API_KEY，
 * 由 .github/workflows/ops-gen-task-illustrations.yml 在 runner 上跑。
 *
 * 環境變數：
 *   LIMIT=8        只畫前 N 張還沒有圖的卡（試畫風用）
 *   IDS=a,b,c      只畫這幾張
 *   FORCE=1        已經有圖也重畫（配 IDS 用）
 *   RECONCEPT=1    連概念都重寫（預設沿用 concepts.json 裡已有的）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { buildTaskCatalogIndex } from "../server/content/core/catalog/taskCatalogIndex";
import { resolveTaskTemplateSync } from "../server/content/core/catalog/taskRegistry";
import { readCoverBytes } from "../server/platform/core/media/mediaGen";
import {
  drawIllustration, shrinkToWebp, writeIllustrationConcepts, type IllustrationCardInput,
} from "../server/content/core/image/taskIllustration";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMG_DIR = join(ROOT, "client/public/task-illustrations");
const IDS_FILE = join(ROOT, "client/src/v2/platform/components/taskIllustrationIds.json");
const CONCEPTS_FILE = join(ROOT, "scripts/data/task-illustration-concepts.json");
const COVERS_DIR = process.env.COVERS_DIR ?? "/tmp/covers";
const SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/i;

function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") return (v as any).zh ?? (v as any).en ?? "";
  return "";
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

async function main(): Promise<void> {
  mkdirSync(IMG_DIR, { recursive: true });
  mkdirSync(COVERS_DIR, { recursive: true });
  mkdirSync(join(ROOT, "scripts/data"), { recursive: true });

  const concepts = readJson<Record<string, string>>(CONCEPTS_FILE, {});
  const only = (process.env.IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const force = process.env.FORCE === "1";
  const limit = Number(process.env.LIMIT ?? 0) || Infinity;

  const all: IllustrationCardInput[] = [];
  const seen = new Set<string>();
  for (const t of buildTaskCatalogIndex()) {
    if (seen.has(t.id) || !SAFE_ID.test(t.id)) continue;
    seen.add(t.id);
    const tpl: any = resolveTaskTemplateSync(t.id);
    all.push({
      id: t.id,
      label: t.labelZh || t.labelEn,
      question: tpl?.primary_question ?? null,
      description: textOf(tpl?.description) || null,
    });
  }

  let todo = all.filter((c) => (only.length ? only.includes(c.id) : true))
    .filter((c) => force || !existsSync(join(IMG_DIR, `${c.id}.webp`)));
  todo = todo.slice(0, limit);
  console.log(`[illus] catalog=${all.length} todo=${todo.length}`);

  // 1. 概念：沒有的（或要求重寫的）二十張一批去問。
  const needConcept = todo.filter((c) => process.env.RECONCEPT === "1" || !concepts[c.id]);
  for (let i = 0; i < needConcept.length; i += 20) {
    const batch = needConcept.slice(i, i + 20);
    const others = Object.entries(concepts).filter(([id]) => !batch.some((b) => b.id === id)).map(([, v]) => v);
    for (let attempt = 0; attempt < 2; attempt++) {
      const missing = batch.filter((c) => !concepts[c.id] || (process.env.RECONCEPT === "1" && attempt === 0));
      if (missing.length === 0) break;
      try {
        Object.assign(concepts, await writeIllustrationConcepts(missing, others));
      } catch (e: any) {
        console.log(`[illus] concept batch failed: ${e?.message ?? e}`);
      }
    }
    writeFileSync(CONCEPTS_FILE, JSON.stringify(concepts, null, 2) + "\n");
    console.log(`[illus] concepts ${Math.min(i + 20, needConcept.length)}/${needConcept.length}`);
  }

  // 2. 畫圖：四張並行。一張失敗不影響其他張，最後列出來。
  const failed: string[] = [];
  let done = 0;
  await pool(todo, 4, async (c) => {
    const concept = concepts[c.id];
    if (!concept) { failed.push(`${c.id} (no concept)`); return; }
    const r = await drawIllustration(concept);
    if ("error" in r) { failed.push(`${c.id} (${r.error.slice(0, 120)})`); return; }
    const png = await readCoverBytes(r.url);
    if (!png) { failed.push(`${c.id} (unexpected url ${r.url})`); return; }
    writeFileSync(join(IMG_DIR, `${c.id}.webp`), await shrinkToWebp(png));
    done++;
    console.log(`[illus] ${done}/${todo.length} ${c.id} — ${concept}`);
  });

  // 3. 清單＝磁碟上實際有圖的卡，而且那張卡還在目錄裡。
  const ids = all.map((c) => c.id).filter((id) => existsSync(join(IMG_DIR, `${id}.webp`))).sort();
  writeFileSync(IDS_FILE, JSON.stringify(ids, null, 0) + "\n");
  console.log(`[illus] drew=${done} failed=${failed.length} total-with-image=${ids.length}/${all.length}`);
  for (const f of failed) console.log(`[illus] FAILED ${f}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
