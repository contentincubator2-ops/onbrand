import { describe, it, expect } from "vitest";
import { FLOWS } from "../_core/lineFlows";

/**
 * 這支只鎖「webhook 這一層對流程的假設」。流程邏輯本身在
 * _core/lineFlows.test.ts（純函式、18 個測試）。
 */
describe("webhook 層與流程定義的契約", () => {
  it("每個流程都指向一張真的存在的任務卡", async () => {
    // 打錯 task id 的話，使用者要等到整段對話走完、按下送出、等一分鐘，
    // 才會收到「產出時出了點問題」。在這裡擋住。
    const { resolveTaskForRun } = await import("../routers/quickTaskRouter");
    for (const f of FLOWS) {
      const r = await resolveTaskForRun(f.taskId);
      expect(r.template, `${f.trigger} 的 ${f.taskId} 找不到 template`).toBeTruthy();
      expect(r.config, `${f.trigger} 的 ${f.taskId} 找不到 config`).toBeTruthy();
    }
  });

  it("流程宣告的 tier 與任務卡本身的 tier 一致", async () => {
    // tier 不合會讓 60s 的套組任務用 30s 的預算跑，或反過來浪費預算。
    const { resolveTaskForRun } = await import("../routers/quickTaskRouter");
    for (const f of FLOWS) {
      const { template } = await resolveTaskForRun(f.taskId);
      if (template.tier) {
        expect(template.tier, `${f.trigger}`).toBe(f.tier);
      }
    }
  });

  it("toInputs 產出的 key 對得上任務卡宣告的 input", async () => {
    // orchestra 只會拿 template.inputs 宣告過的 key；名字打錯就是靜默丟掉，
    // 模型收到空白素材後會自己編一個主題。
    const { resolveTaskForRun } = await import("../routers/quickTaskRouter");
    for (const f of FLOWS) {
      const { template } = await resolveTaskForRun(f.taskId);
      const declared = new Set<string>([
        ...((template.inputs ?? []).map((i: any) => i.key)),
        ...(template.primary_input?.key ? [template.primary_input.key] : []),
      ]);
      const produced = Object.keys(f.toInputs({ topic: "x" }));
      for (const k of produced) {
        expect(declared.has(k), `${f.trigger} 送出的 "${k}" 不在 ${f.taskId} 的欄位宣告裡`).toBe(true);
      }
    }
  });
});
