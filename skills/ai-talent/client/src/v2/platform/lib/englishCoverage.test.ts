/**
 * 英文介面不得露出中文 — 輕量守衛。
 *
 * 英文評審會用英文介面操作整個產品。這支測試對一份「新用戶最早會看到」的
 * 精選檔案掃描：任何含中日韓字元的程式行（非註解），必須落在 en/zh 分支裡
 * （附近幾行出現 en／isEn／lang／tr(／L(／t(／zh 等標記），否則就是只有中文
 * 的硬編碼字串，英文介面會直接顯示中文。
 *
 * 這是行級啟發式（不是 AST）：寧可偶爾放過、不要誤擋；要加新檔案就加進
 * CRITICAL_FILES。確實不需翻譯的行（法定公司名、符合規則用的正則等）請
 * 加進 ALLOW。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../../.."); // client/src

/** 新用戶最早會看到的元件／頁面（相對 client/src）。 */
export const CRITICAL_FILES = [
  "main.tsx",
  "lib/trpc.ts",
  "v2/app/AppV2.tsx",
  "v2/app/RequireAuthV2.tsx",
  "v2/app/MissionRedirect.tsx",
  "v2/app/shell/RouteErrorBoundary.tsx",
  "v2/app/shell/IconBar.tsx",
  "v2/app/shell/ShellLayout.tsx",
  "v2/platform/pages/LandingPage.tsx",
  "v2/platform/pages/PricingPage.tsx",
  "v2/platform/pages/AccountPage.tsx",
  "v2/platform/pages/PlanExpiredPage.tsx",
  "v2/platform/pages/WorkspaceSettingsPage.tsx",
  "v2/platform/pages/auth/LoginPage.tsx",
  "v2/platform/pages/auth/RegisterPage.tsx",
  "v2/platform/components/PricingInfoModal.tsx",
  "v2/platform/components/ScopeSwitchOverlay.tsx",
  "v2/platform/components/SupportDrawer.tsx",
  "v2/platform/components/plan/ChannelPicker.tsx",
  "v2/content/components/PerfTagPicker.tsx",
  "v2/content/pages/ImageCardPage.tsx",
  "v2/content/pages/platformTask/PlatformPageErrorBoundary.tsx",
  "v2/content/lib/taskContextResolver.ts",
  "v2/strategy/pages/BrandsPage.tsx",
  "v2/strategy/pages/brands/PositioningGrid.tsx",
  "v2/strategy/pages/brands/PositioningTopRow.tsx",
];

/** 檔案 -> 允許保留中文的行內片段（法定名稱、比對用正則等）。 */
const ALLOW: Record<string, RegExp[]> = {
  // 已與英文表成對的中文表／分支（距離 en 標記太遠，行級啟發式看不到）
  "v2/content/lib/taskContextResolver.ts": [/^\s*"brand\.[A-Za-z.]+":\s*"/],
  "v2/content/pages/ImageCardPage.tsx": [/email: "電子報"/, /\["暖一點"|\["光線更明亮"/],
  "v2/platform/components/plan/ChannelPicker.tsx": [/email: "電子報"|website: "官網"|pr: "新聞稿"/],
  "v2/platform/pages/WorkspaceSettingsPage.tsx": [/viewer: "Viewer \(僅查看\)"/],
  "v2/strategy/pages/BrandsPage.tsx": [/ASSET_LABEL|視覺規範|圖表風格|console\.warn/],
  "v2/platform/pages/LandingPage.tsx": [/摘星社群行銷顧問股份有限公司/, /^\s*(q|a): [`"]/], // 中文 FAQ 分支
  "v2/app/shell/IconBar.tsx": [/>中<\/span>/], // 語言切換鈕上的「中」
  "main.tsx": [/伺服器忙碌\|ECONNRESET/], // 比對伺服器訊息的正則
  "lib/trpc.ts": [/伺服器忙碌|網路連線失敗|伺服器錯誤/], // 已包在 tr(en, zh) 裡
};

const CJK = /[㐀-鿿]/;
const MARKER = /\ben\b|isEn|\bisZh\b|\blang\b|\btr\(|\bL\(|\bt\(|\bzh\b|labelEn|locale/;
const WINDOW = 40;

export function findUncoveredCjk(file: string, source: string): string[] {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  let inBlock = false;
  lines.forEach((raw, i) => {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) return;
      inBlock = false;
      line = line.slice(end + 2);
    }
    // 去掉區塊註解與行註解（含 JSX 的 {/* */}）
    line = line.replace(/\/\*.*?\*\//g, "");
    const open = line.indexOf("/*");
    if (open !== -1) {
      inBlock = true;
      line = line.slice(0, open);
    }
    line = line.replace(/(^|[^:"'`])\/\/.*$/, "$1");
    if (!CJK.test(line)) return;
    if ((ALLOW[file] ?? []).some((re) => re.test(line))) return;
    const ctx = lines.slice(Math.max(0, i - WINDOW), i + 1).join("\n");
    if (MARKER.test(ctx)) return;
    out.push(`${file}:${i + 1}: ${raw.trim().slice(0, 100)}`);
  });
  return out;
}

describe("English coverage guard (critical components)", () => {
  for (const file of CRITICAL_FILES) {
    it(`${file} has no Chinese-only literals`, () => {
      const full = path.join(SRC, file);
      expect(fs.existsSync(full), `${file} missing — update CRITICAL_FILES`).toBe(true);
      const bad = findUncoveredCjk(file, fs.readFileSync(full, "utf8"));
      expect(bad, `Chinese-only text would show in English UI:\n${bad.join("\n")}`).toEqual([]);
    });
  }

  it("the heuristic itself flags a Chinese-only literal and accepts a ternary", () => {
    expect(findUncoveredCjk("x.tsx", `const a = "純中文";\n`).length).toBe(1);
    expect(findUncoveredCjk("x.tsx", `const a = lang === "en" ? "Hi" : "你好";\n`)).toEqual([]);
    expect(findUncoveredCjk("x.tsx", `// 中文註解\n/* 區塊 */\nconst a = 1;\n`)).toEqual([]);
  });

  it("zh-TW and en locale files define the same keys", () => {
    const keys = (f: string) =>
      new Set(
        [...fs.readFileSync(path.join(SRC, "locales", f), "utf8").matchAll(/^\s*(?:"([^"]+)"|([A-Za-z0-9_.]+))\s*:\s*["`']/gm)].map(
          (m) => m[1] ?? m[2],
        ),
      );
    const zh = keys("zh-TW.ts");
    const en = keys("en.ts");
    expect([...zh].filter((k) => !en.has(k))).toEqual([]);
    expect([...en].filter((k) => !zh.has(k))).toEqual([]);
  });
});
