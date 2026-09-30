/**
 * 2026-09-29（CJ「完整在程式碼當中，移除 AI 指令庫，不要殘存」）：品牌 AI 指令
 * （positioning._aiPrompts、語調鎖定 _voiceLock、各平台指令產生器）與內容層的
 * AI 指令庫範本頁都已刪除。這支測試守著不讓它們悄悄長回來。
 *
 * 生圖流程第二步送給圖片模型的內容，2026-09-30 起在畫面上叫「畫面描述」
 * （原本叫「AI 指令」，會跟指令庫混淆）。
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const DIRS = ["server", "client/src", "scripts"];
const FORBIDDEN = /_aiPrompts|aiPrompts|AIPromptsEditor|PromptLibrary|generateAiPromptForPlatform|suggestAIPrompts|_voiceLock|VoiceLock|AI ?指令庫|ai_prompts|\/ai-prompts/;
const SELF = path.resolve(__filename);

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) yield p;
  }
}

describe("AI 指令庫已從程式碼完整移除", () => {
  it("server／client／scripts 沒有任何殘留", () => {
    const hits: string[] = [];
    for (const d of DIRS) {
      for (const f of walk(path.join(ROOT, d))) {
        if (path.resolve(f) === SELF) continue;
        const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
        lines.forEach((l, i) => { if (FORBIDDEN.test(l)) hits.push(`${path.relative(ROOT, f)}:${i + 1}`); });
      }
    }
    expect(hits, `殘留：\n${hits.join("\n")}`).toEqual([]);
  });
});
