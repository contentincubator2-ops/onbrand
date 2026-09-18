import { describe, it, expect } from "vitest";
import { listAgentApiTasks } from "./agentApiTasks";

const MOMDAD = 2964;

describe("listAgentApiTasks", () => {
  it("回傳媽爹選單上的六格，順序與 rich menu 一致", async () => {
    const tasks = await listAgentApiTasks(MOMDAD);
    expect(tasks.map((t) => t.key)).toEqual([
      "蹭熱點", "FB文案", "IG文案", "活動宣傳", "LINE推播", "故事推廣",
    ]);
  });

  it("未授權的品牌拿到空清單，不是別人的任務", async () => {
    // 白名單擋的是「能不能跑」，這裡擋的是「看不看得到」。
    expect(await listAgentApiTasks(999999)).toEqual([]);
  });

  it("ready 的項目一定有 taskId，沒 ready 的一定沒有", async () => {
    // Hermes 拿 taskId 去呼叫 /run；ready 卻沒 taskId 會讓它送出 undefined。
    for (const t of await listAgentApiTasks(MOMDAD)) {
      if (t.ready) expect(t.taskId, `${t.key}`).toBeTruthy();
      else expect(t.taskId, `${t.key}`).toBeNull();
    }
  });

  it("ready 的任務卡都真的解析得出來 —— 這是這支函式的重點", async () => {
    // 任務卡改名或下架時，這裡照舊回報 ready 的話，Hermes 會拿著不存在的
    // taskId 去呼叫，使用者要走完整段對話才會收到失敗。
    const { resolveTaskForRun } = await import("../routers/quickTaskRouter");
    for (const t of await listAgentApiTasks(MOMDAD)) {
      if (!t.ready || !t.taskId) continue;
      const r = await resolveTaskForRun(t.taskId);
      expect(r.template, `${t.key} 的 ${t.taskId}`).toBeTruthy();
    }
  });

  it("每一格都說得出自己在做什麼，Hermes 要能直接講給使用者聽", async () => {
    for (const t of await listAgentApiTasks(MOMDAD)) {
      expect(t.description.length, `${t.key}`).toBeGreaterThan(10);
      expect(t.inputKeys.length, `${t.key}`).toBeGreaterThan(0);
    }
  });

  it("未完成的格子仍然列出來 —— 要能說「還沒開」而不是假裝不存在", async () => {
    const tasks = await listAgentApiTasks(MOMDAD);
    const pending = tasks.filter((t) => !t.ready);
    expect(pending.length).toBeGreaterThan(0);
    for (const t of pending) expect(t.description).not.toMatch(/敬請期待|coming soon/i);
  });
});
