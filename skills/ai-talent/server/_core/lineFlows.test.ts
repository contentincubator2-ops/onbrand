import { describe, it, expect } from "vitest";
import {
  FLOWS, QUICK_REPLY_LABEL_MAX,
  findFlowByTrigger, findFlowById, stepOf, startFlow, advanceFlow,
  menuChoices, menuText,
} from "./lineFlows";

describe("流程定義的硬規格", () => {
  it("觸發語不重複，否則按鈕會指到錯的流程", () => {
    const triggers = FLOWS.map((f) => f.trigger);
    expect(new Set(triggers).size).toBe(triggers.length);
  });

  it("沒有觸發語是另一個的前綴 —— 會讓比對出現歧義", () => {
    for (const a of FLOWS) {
      for (const b of FLOWS) {
        if (a === b) continue;
        expect(b.trigger.startsWith(a.trigger)).toBe(false);
      }
    }
  });

  it("每個流程至少一步，且步驟 id 在流程內唯一", () => {
    for (const f of FLOWS) {
      expect(f.steps.length).toBeGreaterThan(0);
      const ids = f.steps.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("每一步的 prompt 都真的在引導，不是一句「請輸入」", () => {
    // 引導的價值就在這句話。太短等於沒引導，使用者不知道要貼什麼。
    for (const f of FLOWS) {
      for (const s of f.steps) {
        expect(s.prompt.length).toBeGreaterThan(20);
      }
    }
  });

  it("quick reply 標籤不超過 20 字（hermes 慣例）", () => {
    for (const f of FLOWS) {
      for (const s of f.steps) {
        for (const c of s.choices ?? []) {
          expect(c.label.length).toBeLessThanOrEqual(QUICK_REPLY_LABEL_MAX);
        }
      }
    }
    for (const c of menuChoices()) {
      expect(c.label.length).toBeLessThanOrEqual(QUICK_REPLY_LABEL_MAX);
    }
  });

  it("quick reply 送出的是完整觸發語，不是片段", () => {
    // hermes：「the sent text must be a complete next-step trigger」。
    // 選單的每個按鈕送出去之後，都必須能被重新認出來。
    for (const c of menuChoices()) {
      expect(findFlowByTrigger(c.send)).not.toBeNull();
    }
  });

  it("選單文字列出了每一個流程", () => {
    const t = menuText();
    for (const f of FLOWS) expect(t).toContain(f.trigger);
  });
});

describe("選單上已有、流程未完成的格子", () => {
  it("四格待辦的觸發語都認得出來 —— 否則按下去會收到莫名其妙的選單", async () => {
    const { PENDING_TRIGGERS, findPendingTrigger } = await import("./lineFlows");
    for (const p of PENDING_TRIGGERS) {
      expect(findPendingTrigger(p.trigger)?.trigger).toBe(p.trigger);
    }
  });

  it("待辦觸發語不跟已上線的流程重複", async () => {
    const { PENDING_TRIGGERS } = await import("./lineFlows");
    for (const p of PENDING_TRIGGERS) {
      expect(findFlowByTrigger(p.trigger), `${p.trigger} 同時是流程又是待辦`).toBeNull();
    }
  });

  it("每格待辦都說得出「在做什麼」，不是一句「敬請期待」", async () => {
    const { PENDING_TRIGGERS } = await import("./lineFlows");
    for (const p of PENDING_TRIGGERS) {
      expect(p.note.length).toBeGreaterThan(10);
    }
  });

  it("選單圖上的六格文字，每一格都有去處", async () => {
    // 選單圖是 CJ 做的，文字逐字寫在這裡。少一格＝那顆按鈕按下去沒反應。
    const { PENDING_TRIGGERS } = await import("./lineFlows");
    const onMenu = ["蹭熱點", "FB文案", "IG文案", "活動宣傳", "LINE推播", "故事推廣"];
    for (const label of onMenu) {
      const handled =
        findFlowByTrigger(label) !== null ||
        PENDING_TRIGGERS.some((p) => p.trigger === label);
      expect(handled, `選單上的「${label}」沒有對應的流程或待辦說明`).toBe(true);
    }
  });
});

describe("findFlowByTrigger", () => {
  it("認得完全相符的觸發語", () => {
    expect(findFlowByTrigger("FB文案")?.id).toBe("fb-copy");
    expect(findFlowByTrigger("IG文案")?.id).toBe("ig-copy");
  });

  it("容忍前後空白（手機輸入法常帶）", () => {
    expect(findFlowByTrigger("  FB文案 ")?.id).toBe("fb-copy");
  });

  it("不認得夾在句子裡的觸發語 —— 那是閒聊不是指令", () => {
    expect(findFlowByTrigger("我想要一篇 FB文案 可以嗎")).toBeNull();
  });

  it("空白與未知訊息回 null，交給選單處理", () => {
    expect(findFlowByTrigger("")).toBeNull();
    expect(findFlowByTrigger("   ")).toBeNull();
    expect(findFlowByTrigger("你好")).toBeNull();
  });
});

describe("startFlow", () => {
  it("停在第一步並問出引導句", () => {
    const f = findFlowById("fb-copy")!;
    const a = startFlow(f);
    expect(a.kind).toBe("ask");
    if (a.kind !== "ask") return;
    expect(a.nextStep).toBe(f.steps[0]!.id);
    expect(a.prompt).toContain("貼上來");
  });
});

describe("advanceFlow", () => {
  const fb = () => findFlowById("fb-copy")!;

  it("收到足夠的素材就去跑任務，並帶上正確的任務卡與 tier", () => {
    const a = advanceFlow(fb(), "material", "中元普渡到底要怎麼跟孩子解釋才不會嚇到他", {});
    expect(a.kind).toBe("run");
    if (a.kind !== "run") return;
    expect(a.taskId).toBe("fb-30-caption-short");
    expect(a.tier).toBe("30s");
    expect(a.inputs.topic).toContain("中元普渡");
  });

  it("空白回覆重問同一步，不會拿去跑任務", () => {
    const a = advanceFlow(fb(), "material", "   ", {});
    expect(a.kind).toBe("retry");
    if (a.kind !== "retry") return;
    expect(a.step).toBe("material");
  });

  it("敷衍的短回覆也擋下來 —— 餵進去模型會自己編一個主題", () => {
    const a = advanceFlow(fb(), "material", "好", {});
    expect(a.kind).toBe("retry");
    if (a.kind !== "retry") return;
    // 重問時要說清楚為什麼被擋，不然她只會再打一次「好」
    expect(a.prompt).toContain("至少");
  });

  it("修剪前後空白後才判斷長度", () => {
    const a = advanceFlow(fb(), "material", "        好        ", {});
    expect(a.kind).toBe("retry");
  });

  it("session 指到不存在的步驟時重新開始，不是永遠卡住", () => {
    // 改版後舊 session 會停在已經刪掉的步驟上。
    const a = advanceFlow(fb(), "this-step-was-removed", "隨便什麼內容都可以", {});
    expect(a.kind).toBe("ask");
    if (a.kind !== "ask") return;
    expect(a.nextStep).toBe("material");
  });

  it("帶著已收集的欄位推進，不會弄丟前面幾步的答案", () => {
    const multi = {
      id: "t", trigger: "測試", taskId: "x", tier: "30s" as const,
      steps: [
        { id: "s1", collect: "a", prompt: "第一步請給我一段夠長的說明內容" },
        { id: "s2", collect: "b", prompt: "第二步請給我另一段夠長的說明內容" },
      ],
      toInputs: (d: Record<string, string>) => ({ joined: `${d.a}|${d.b}` }),
    };
    const first = advanceFlow(multi, "s1", "前面的答案", {});
    expect(first.kind).toBe("ask");
    const second = advanceFlow(multi, "s2", "後面的答案", { a: "前面的答案" });
    expect(second.kind).toBe("run");
    if (second.kind !== "run") return;
    expect(second.inputs.joined).toBe("前面的答案|後面的答案");
  });
});
