/**
 * 七個平台 pill 分類對照表的防漂移測試。
 *
 * 2026-08-23 (CJ「要跟著做」) —— FB 先做，這次擴到全部 7 個平台。
 *
 * 這些手抄表漂過兩次，而且都沒人發現：
 *   · FB：90s 退役後 11 個 key 指向不存在的任務、16 張 fb-99 沒被分類。
 *     使用者看到的是「貼文 pill 只有 3 張」和兩個 pill 整個不出現。
 *   · IG：3 個 key 指向被 99s allowlist 濾掉、根本不會出現的任務。
 *
 * 比對基準是 taskCatalogIndex.ts —— **quickTaskRouter.listFB 用的同一份**
 * 平台推斷與 99s allowlist。不是第二份手抄清單，否則就是在複製這個 bug。
 *
 * 為什麼放在 server 側：scripts/check-client-server-boundary.sh 禁止 client
 * 對 server 的 value import，而這裡必須真的呼叫 buildTaskCatalogIndex()。
 * 先例：viralSourceGuard.parity.test.ts。
 */
import { describe, it, expect } from "vitest";
import { buildTaskCatalogIndex, type CatalogPlatform } from "./taskCatalogIndex";
import {
  FB_FORMAT_TABS, FB_TASK_FORMAT_MAP, FB_UNMAPPED_BY_DESIGN,
  IG_FORMAT_TABS, IG_TASK_FORMAT_MAP, IG_UNMAPPED_BY_DESIGN,
  LI_FORMAT_TABS, LI_TASK_FORMAT_MAP, LI_UNMAPPED_BY_DESIGN,
  YT_FORMAT_TABS, YT_TASK_FORMAT_MAP, YT_UNMAPPED_BY_DESIGN,
  TT_FORMAT_TABS, TT_TASK_FORMAT_MAP, TT_UNMAPPED_BY_DESIGN,
  EM_FORMAT_TABS, EM_TASK_FORMAT_MAP, EM_UNMAPPED_BY_DESIGN,
  PR_FORMAT_TABS, PR_TASK_FORMAT_MAP, PR_UNMAPPED_BY_DESIGN,
} from "../../client/src/v2/lib/taskFormats";

interface PlatformSpec {
  platform: CatalogPlatform;
  name: string;
  tabs: { id: string }[];
  map: Record<string, string>;
  byDesign: Set<string>;
}

const SPECS: PlatformSpec[] = [
  { platform: "facebook",  name: "FB", tabs: FB_FORMAT_TABS, map: FB_TASK_FORMAT_MAP, byDesign: FB_UNMAPPED_BY_DESIGN },
  { platform: "instagram", name: "IG", tabs: IG_FORMAT_TABS, map: IG_TASK_FORMAT_MAP, byDesign: IG_UNMAPPED_BY_DESIGN },
  { platform: "linkedin",  name: "LI", tabs: LI_FORMAT_TABS, map: LI_TASK_FORMAT_MAP, byDesign: LI_UNMAPPED_BY_DESIGN },
  { platform: "youtube",   name: "YT", tabs: YT_FORMAT_TABS, map: YT_TASK_FORMAT_MAP, byDesign: YT_UNMAPPED_BY_DESIGN },
  { platform: "tiktok",    name: "TT", tabs: TT_FORMAT_TABS, map: TT_TASK_FORMAT_MAP, byDesign: TT_UNMAPPED_BY_DESIGN },
  { platform: "email",     name: "EM", tabs: EM_FORMAT_TABS, map: EM_TASK_FORMAT_MAP, byDesign: EM_UNMAPPED_BY_DESIGN },
  { platform: "pr",        name: "PR", tabs: PR_FORMAT_TABS, map: PR_TASK_FORMAT_MAP, byDesign: PR_UNMAPPED_BY_DESIGN },
];

const INDEX = buildTaskCatalogIndex();

describe("taskCatalogIndex", () => {
  it("目錄不是空的（基準壞掉要先紅在這裡，而不是讓下面全部假通過）", () => {
    expect(INDEX.length).toBeGreaterThan(100);
  });

  it("沒有重複 id", () => {
    const ids = INDEX.map((t) => t.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it("每個有 pill 的平台都有任務", () => {
    for (const s of SPECS) {
      expect(INDEX.filter((t) => t.platform === s.platform).length, s.name).toBeGreaterThan(0);
    }
  });
});

describe.each(SPECS)("$name pill 分類", (spec) => {
  const tasks = INDEX.filter((t) => t.platform === spec.platform);
  const ids = new Set(tasks.map((t) => t.id));
  const tabIds = new Set(spec.tabs.map((t) => t.id));

  it("① 沒有死 key —— 每個 key 都對得到真的列得出來的任務", () => {
    const dead = Object.keys(spec.map).filter((id) => !ids.has(id));
    expect(
      dead,
      "這些 key 指向不存在、或被 99s allowlist 濾掉不會出現的任務。\n" +
        "  死 key 不報錯，只會讓對照表看起來有涵蓋、實際上沒有：\n" +
        dead.join("\n"),
    ).toEqual([]);
  });

  it("② 每張卡都被分類，或明確列為不分類", () => {
    const undecided = tasks
      .map((t) => t.id)
      .filter((id) => !(id in spec.map) && !spec.byDesign.has(id));
    expect(
      undecided,
      "新任務卡沒有決定要不要進 pill 分類。二選一：\n" +
        `  · 進分類 → 在 ${spec.name}_TASK_FORMAT_MAP 補一行\n` +
        `  · 不進（只在「全部」出現）→ 加進 ${spec.name}_UNMAPPED_BY_DESIGN\n` +
        undecided.join("\n"),
    ).toEqual([]);
  });

  it("③ 每個 pill 至少一張卡（count===0 的 pill 在 UI 上不渲染）", () => {
    const used = new Set(
      Object.entries(spec.map).filter(([id]) => ids.has(id)).map(([, fmt]) => fmt),
    );
    const empty = spec.tabs
      .map((t) => t.id)
      .filter((id) => id !== "all" && !used.has(id));
    expect(
      empty,
      "這些 pill 沒有任何卡，使用者根本看不到它存在。要嘛補卡，要嘛拿掉 pill：\n" +
        empty.join("\n"),
    ).toEqual([]);
  });

  it("④ 每個分類值都是真實存在的 pill", () => {
    const bogus = Object.entries(spec.map)
      .filter(([, fmt]) => !tabIds.has(fmt))
      .map(([id, fmt]) => `${id} → 「${fmt}」`);
    expect(bogus).toEqual([]);
  });

  it("⑤ byDesign 裡的 id 也必須真的列得出來", () => {
    // 否則這個集合會變成第二個死 key 的溫床
    const phantom = Array.from(spec.byDesign).filter((id) => !ids.has(id));
    expect(phantom).toEqual([]);
  });

  it("⑥ 沒有任務同時被分類又被列為不分類", () => {
    const both = Object.keys(spec.map).filter((id) => spec.byDesign.has(id));
    expect(both).toEqual([]);
  });

  it("⑦ 沒有退役的 -90- 殘留", () => {
    const legacy = [...Object.keys(spec.map), ...spec.byDesign].filter((id) => /^[a-z]+-90-/.test(id));
    expect(legacy).toEqual([]);
  });
});

describe("FB 迴歸案例（這次修的核心）", () => {
  it("改寫類三張在貼文 pill 底下", () => {
    for (const id of ["fb-99-viral-rewrite", "fb-99-testimonial-rewrite", "fb-99-trend-rewrite"]) {
      expect(FB_TASK_FORMAT_MAP[id], id).toBe("貼文");
    }
  });

  it("跨平台的 cw-* 工具落在 FB 頁時有分類（不然只在「全部」看得到）", () => {
    // platformOfTaskId 對未知前綴 fallback 成 facebook，與 router 一致
    for (const id of ["cw-60-crosspost-4platform", "cw-60-ab-variants"]) {
      expect(FB_TASK_FORMAT_MAP[id], id).toBeTruthy();
    }
  });
});
