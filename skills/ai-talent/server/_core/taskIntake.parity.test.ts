/**
 * 鏡像防漂移 — server/_core/taskIntake.ts 與 client/src/v2/lib/taskIntake.ts
 * 必須給出一模一樣的答案。
 *
 * 漂移的後果很具體：modal 照 client 那份渲染、server 照自己那份驗 required。
 * 兩份不一致 = 「畫面上沒有那一格，但送出時說它必填」，使用者完全無解。
 *
 * 順便把真實目錄鎖住：2026-09-02 之前 intake 只送 primary 一格，225 張卡裡
 * 有 7 張宣告了 required 卻沒有 UI 可以填，模型只好自己編。
 */
import { describe, it, expect } from "vitest";
import {
  intakeExtraFields as serverExtra,
  intakePrimaryRequired as serverPrimaryRequired,
  missingRequiredInputs as serverMissing,
  assertIntakeComplete,
} from "./taskIntake";
import {
  intakeExtraFields as clientExtra,
  intakePrimaryRequired as clientPrimaryRequired,
  missingRequiredInputs as clientMissing,
} from "../../client/src/v2/lib/taskIntake";
import { resolveTaskTemplateSync } from "./taskRegistry";

const CASES: any[] = [
  null,
  undefined,
  {},
  { inputs: [] },
  { primary_input: { key: "topic" }, inputs: [{ key: "topic", label: "主題", type: "textarea", required: true }] },
  { primary_input: { key: "topic" }, inputs: [
    { key: "topic", label: "主題", type: "textarea", required: true },
    { key: "tone", label: "語氣", type: "text" },
  ] },
  // 沒有 primary 宣告時，inputs 全部都是額外欄位
  { inputs: [{ key: "a", label: "A", type: "text", required: true }] },
  // 殘缺宣告：沒 key / 沒 label / 重複 key
  { primary_input: { key: "topic" }, inputs: [
    { key: "", label: "空 key", type: "text" },
    { key: "dup", label: "第一個", type: "text" },
    { key: "dup", label: "第二個", type: "text" },
    { key: "nolabel", label: "   ", type: "text" },
  ] },
  // primary 明確標成非必填
  { primary_input: { key: "topic" }, inputs: [{ key: "topic", label: "主題", type: "text", required: false }] },
];

const INPUT_BAGS: Record<string, string>[] = [
  {}, { topic: "x" }, { tone: "  " }, { a: "有值" }, { dup: "1", nolabel: "2" },
];

describe("taskIntake parity (server ↔ client mirror)", () => {
  it.each(CASES.map((c, i) => [i, c]))("case %i — 額外欄位一致", (_i, tpl) => {
    expect(clientExtra(tpl)).toEqual(serverExtra(tpl));
  });

  it.each(CASES.map((c, i) => [i, c]))("case %i — primary 必填判斷一致", (_i, tpl) => {
    expect(clientPrimaryRequired(tpl)).toEqual(serverPrimaryRequired(tpl));
  });

  it("缺漏清單在所有輸入組合下都一致", () => {
    for (const tpl of CASES) {
      for (const bag of INPUT_BAGS) {
        expect(clientMissing(tpl, bag)).toEqual(serverMissing(tpl, bag));
      }
    }
  });
});

describe("殘缺宣告不會渲染成無標籤空框", () => {
  const tpl = CASES[7];
  it("空 key / 空 label 被丟掉，重複 key 只留第一個", () => {
    expect(serverExtra(tpl).map((f) => f.key)).toEqual(["dup"]);
    expect(serverExtra(tpl)[0]!.label).toBe("第一個");
  });
});

describe("真實目錄：7 張卡的 required 欄位現在問得到了", () => {
  const EXPECTED: Record<string, string[]> = {
    "fb-60-link-full":        ["context"],
    "fb-60-countdown-5day":   ["key_offer"],
    "fb-60-launch-kit":       ["event_when", "event_why"],
    "fb-60-live-suite":       ["key_points"],
    "ig-60-countdown-5day":   ["key_offer"],
    "fb-99-launch-toolkit":   ["event_when", "event_why"],
    "fb-99-livestream-9seg":  ["key_points"],
  };

  it.each(Object.entries(EXPECTED))("%s 的必填欄位會被渲染出來", (taskId, keys) => {
    const tpl = resolveTaskTemplateSync(taskId);
    expect(tpl, `${taskId} 解析不到`).toBeTruthy();
    const required = serverExtra(tpl as any).filter((f) => f.required).map((f) => f.key);
    expect(required.sort()).toEqual([...keys].sort());
  });

  it("沒填必填時 server 擋得下來，而且訊息說得出是哪一格", () => {
    const tpl = resolveTaskTemplateSync("fb-60-launch-kit")!;
    expect(() => assertIntakeComplete(tpl as any, { topic: "新品上市" }))
      .toThrow(/還缺必填欄位/);
    // 訊息用 label 不用 key —— 使用者看不懂 event_when
    try { assertIntakeComplete(tpl as any, {}); } catch (e: any) {
      expect(e.message).not.toContain("event_when");
    }
  });

  it("填齊之後就放行", () => {
    const tpl = resolveTaskTemplateSync("fb-60-launch-kit")!;
    const keys = serverExtra(tpl as any).filter((f) => f.required).map((f) => f.key);
    const bag = Object.fromEntries(keys.map((k) => [k, "有填"]));
    expect(() => assertIntakeComplete(tpl as any, bag)).not.toThrow();
  });
});

describe("驗證範圍等於 UI 範圍", () => {
  it("不會出現「必填但渲染不出來」的死結", () => {
    // 這是整支檔案存在的理由：missingRequiredInputs 只從 intakeExtraFields
    // 取欄位，所以任何被擋下來的必填，畫面上一定有對應的輸入框。
    for (const tpl of CASES) {
      const rendered = new Set(serverExtra(tpl).map((f) => f.key));
      for (const m of serverMissing(tpl, {})) {
        expect(rendered.has(m.key)).toBe(true);
      }
    }
  });
});
