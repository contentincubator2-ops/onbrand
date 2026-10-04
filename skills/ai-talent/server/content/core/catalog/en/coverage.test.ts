/**
 * 任務卡英文旁路的完整度。新增或改文案的任務卡，輸入問題、佔位字、欄位標籤、
 * 來源說明、版本名稱只要有中文就必須在 en/*.ts 有對應英文，否則英文介面會中英混排。
 */
import { describe, expect, it } from "vitest";
import { buildTaskCatalogIndex } from "../taskCatalogIndex";
import { resolveTaskTemplateSync, resolveOrchestraConfig } from "../taskRegistry";
import { TASK_EN_ALL, VARIANT_LABEL_EN_ALL } from "./index";

const cjk = /[\u3400-\u9fff]/;

describe("task card English sidecar", () => {
  it("every catalog card with Chinese intake/source text has English", async () => {
    const missing: string[] = [];
    const missingVariants = new Set<string>();
    for (const { id } of buildTaskCatalogIndex() as Array<{ id: string }>) {
      const t: any = resolveTaskTemplateSync(String(id));
      const e: any = TASK_EN_ALL[String(id)] ?? {};
      if (t) {
        if (t.primary_question && cjk.test(t.primary_question) && !e.question) missing.push(`${id}.question`);
        if (t.primary_input?.placeholder && cjk.test(t.primary_input.placeholder) && !e.placeholder) missing.push(`${id}.placeholder`);
        for (const i of t.inputs ?? []) {
          if (i.label && cjk.test(i.label) && !e.inputs?.[i.key]?.label) missing.push(`${id}.inputs.${i.key}`);
        }
        for (const k of ["short", "metric", "caveat", "takeaway"] as const) {
          if (t.source?.[k] && cjk.test(t.source[k]) && !e.source?.[k]) missing.push(`${id}.source.${k}`);
        }
      }
      const c: any = await resolveOrchestraConfig(String(id)).catch(() => null);
      for (const v of c?.variantLabels ?? []) if (cjk.test(v) && !VARIANT_LABEL_EN_ALL[v]) missingVariants.add(v);
    }
    expect(missing).toEqual([]);
    expect([...missingVariants]).toEqual([]);
  });

  it("English text is never empty or just Chinese", () => {
    // 專有名詞（品牌、人名、作品名）刻意保留中文原名，所以只擋「空字串」與「整句沒有任何英數字」。
    const bad: string[] = [];
    for (const [id, e] of Object.entries(TASK_EN_ALL)) {
      const vals = [e.question, e.placeholder, ...Object.values(e.inputs ?? {}).flatMap((i) => [i.label, i.placeholder]), ...Object.values(e.source ?? {})];
      for (const v of vals) if (v !== undefined && !/[A-Za-z0-9]/.test(v)) bad.push(`${id}: ${v.slice(0, 40)}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
