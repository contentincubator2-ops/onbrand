/**
 * fbTaskFormats 防漂移測試。
 *
 * 這份對照表已經爛過一次而且沒人發現一個月：90s 整層退役後 11 個
 * `fb-90-*` key 全部指向不存在的任務，接手的 16 張 `fb-99-*` 一張都沒補。
 * 使用者看到的是「貼文 pill 只有 3 張」和「兩個 pill 根本不出現」。
 *
 * 手抄表沒有守衛就會再爛一次，所以這裡把兩件事釘死：
 *   ① 表上每個 key 都對得到真實任務（擋死 key）
 *   ② 每張 FB 卡都被分類，或明確列入 UNMAPPED_BY_DESIGN（逼你做決定）
 *
 * 對照基準用 server 的 buildFbCatalog()（postFormatScout.ts）—— 它就是從
 * FB_30S_TASKS / FB_60S_TASKS_V2 / ALL_99S_SQUADS / ALL_99S_TASKS 組出來的
 * 真實目錄，不是另一份手抄清單。
 *
 * 為什麼放在 server 側：scripts/check-client-server-boundary.sh 禁止 client
 * 對 server 的 value import（只允許 import type），而這個測試必須真的叫
 * buildFbCatalog()。同一個問題 viralSourceGuard.parity.test.ts 已經解過：
 * 跨邊界的測試放 server 側，反過來 import client 的模組。
 */
import { describe, it, expect } from "vitest";
import { buildFbCatalog } from "./postFormatScout";
import {
  FORMAT_TABS,
  TASK_FORMAT_MAP,
  UNMAPPED_BY_DESIGN,
} from "../../client/src/v2/lib/fbTaskFormats";

const CATALOG = buildFbCatalog();
const CATALOG_IDS = new Set(CATALOG.map((c) => c.id));
const TAB_IDS = new Set(FORMAT_TABS.map((t) => t.id));

describe("fbTaskFormats 對照表", () => {
  it("目錄本身不是空的（基準壞掉時要先紅在這裡）", () => {
    expect(CATALOG.length).toBeGreaterThan(30);
  });

  it("① 沒有死 key —— 每個 key 都對得到真實 FB 任務", () => {
    const dead = Object.keys(TASK_FORMAT_MAP).filter((id) => !CATALOG_IDS.has(id));
    expect(
      dead,
      "這些 key 指向不存在的任務（任務被改名或退役了）。\n" +
        "  死 key 不會報錯，只會讓那張卡從 pill 底下無聲消失：\n" +
        dead.join("\n"),
    ).toEqual([]);
  });

  it("② 每張 FB 卡都被分類，或明確列為不分類", () => {
    const undecided = CATALOG
      .map((c) => c.id)
      .filter((id) => !(id in TASK_FORMAT_MAP) && !UNMAPPED_BY_DESIGN.has(id));
    expect(
      undecided,
      "新的 FB 任務卡沒有決定要不要進 pill 分類。二選一：\n" +
        "  · 進分類 → 在 TASK_FORMAT_MAP 補一行\n" +
        "  · 不進分類（只在「全部」出現）→ 加進 UNMAPPED_BY_DESIGN\n" +
        undecided.join("\n"),
    ).toEqual([]);
  });

  it("UNMAPPED_BY_DESIGN 裡的 id 也必須真實存在", () => {
    // 否則這個集合會變成第二個死 key 的溫床
    const phantom = Array.from(UNMAPPED_BY_DESIGN).filter((id) => !CATALOG_IDS.has(id));
    expect(phantom).toEqual([]);
  });

  it("沒有任務同時被分類又被列為不分類", () => {
    const both = Object.keys(TASK_FORMAT_MAP).filter((id) => UNMAPPED_BY_DESIGN.has(id));
    expect(both).toEqual([]);
  });

  it("每個分類值都是真實存在的 pill", () => {
    for (const [id, fmt] of Object.entries(TASK_FORMAT_MAP)) {
      expect(TAB_IDS.has(fmt), `${id} 指到不存在的 pill「${fmt}」`).toBe(true);
    }
  });

  it("每個 pill（除了「全部」）都至少有一張卡，否則不會渲染", () => {
    // PlatformTaskPage 有 `if (tab.id !== "all" && count === 0) return null`
    // ——「月曆 / 策略」和「輪播 Carousel」就是這樣整個消失的
    const used = new Set(Object.values(TASK_FORMAT_MAP));
    const empty = FORMAT_TABS.filter((t) => t.id !== "all" && !used.has(t.id)).map((t) => t.id);
    expect(
      empty,
      "這些 pill 沒有任何卡，在 UI 上不會渲染。要嘛補卡，要嘛把 pill 拿掉：\n" +
        empty.join("\n"),
    ).toEqual([]);
  });

  it("退役的 fb-90-* 沒有殘留", () => {
    const legacy = [
      ...Object.keys(TASK_FORMAT_MAP),
      ...Array.from(UNMAPPED_BY_DESIGN),
    ].filter((id) => id.startsWith("fb-90-"));
    expect(legacy).toEqual([]);
  });

  it("貼文 pill 涵蓋改寫類三張（這次修的核心）", () => {
    for (const id of ["fb-99-viral-rewrite", "fb-99-testimonial-rewrite", "fb-99-trend-rewrite"]) {
      expect(TASK_FORMAT_MAP[id], `${id} 應該在貼文 pill 底下`).toBe("貼文");
    }
  });
});
