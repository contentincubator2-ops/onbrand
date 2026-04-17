/**
 * audit-methodology-squads.ts
 * 全面審計所有 active squads：
 *  1. 命名是否為方法論型（非模板型）
 *  2. 所有關鍵欄位是否完整
 *  3. 各 workspace 覆蓋狀況
 *  4. 輸出需要補強的 squads 清單
 *
 * Usage: npm run db:audit-methodology
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

// 已知的方法論型前綴（白名單）
const METHODOLOGY_PREFIXES = [
  "fb-", "ig-", "yt-", "li-", "tw-",        // 社群平台
  "sv-",                                       // 短影音
  "pr-", "kol-",                               // 公關/KOL
  "seo-",                                      // SEO
  "cm-",                                       // 內容行銷
  "em-",                                       // Email 行銷
  "brand-", "pos-", "brand-arch-",             // 品牌
  "mon-", "an-", "ana-",                       // 監測/分析
  "ev-",                                       // 活動
  "is-",                                       // 實體零售
  "slogan-",                                   // 標語
  "ai-",                                       // AI 行銷
];

// 已知的模板型前綴（黑名單）
const TEMPLATE_PREFIXES = [
  "sq-", "squad-",
];

// 10 個標準 workspace 值
const CANONICAL_WORKSPACES = [
  "strategy", "facebook", "linkedin", "youtube",
  "pr", "event", "website", "monitoring", "analytics", "instore",
];

interface SquadRow {
  id: number;
  slug: string;
  name: string;
  methodology: string | null;
  workspace: string | null;
  agents: string | null;
  tags: string | null;
  use_cases: string | null;
  output_formats: string | null;
  showcases: string | null;
  token: number;
  is_active: number;
}

function parseJson(val: string | null): any[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isMethodologySlug(slug: string): boolean {
  return METHODOLOGY_PREFIXES.some(p => slug.startsWith(p));
}

function isTemplateSlug(slug: string): boolean {
  return TEMPLATE_PREFIXES.some(p => slug.startsWith(p));
}

async function main() {
  const pool = createPool({
    host: process.env.DB_HOST!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
    ssl: { rejectUnauthorized: false },
    charset: "utf8mb4",
  });

  const conn = await pool.getConnection();

  try {
    const [rows] = await conn.execute(
      `SELECT id, slug, name, methodology, workspace, agents, tags,
              use_cases, output_formats, showcases, token, is_active
       FROM agent_squads
       WHERE is_active = 1
       ORDER BY slug ASC`
    ) as any[];

    const squads = rows as SquadRow[];
    console.log(`\n📊 審計開始 — 共 ${squads.length} 個 active squads\n`);

    // ── 1. 命名分析 ─────────────────────────────────────────────────────
    const methodologySquads: SquadRow[] = [];
    const templateSquads: SquadRow[] = [];
    const unknownSquads: SquadRow[] = [];

    for (const s of squads) {
      if (isTemplateSlug(s.slug)) templateSquads.push(s);
      else if (isMethodologySlug(s.slug)) methodologySquads.push(s);
      else unknownSquads.push(s);
    }

    console.log("═══════════════════════════════════════════════════════");
    console.log("  一、命名類型分析");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`  ✅ 方法論型 squads：${methodologySquads.length}`);
    console.log(`  ❌ 模板型 squads（應已停用）：${templateSquads.length}`);
    console.log(`  ⚠️  未知前綴 squads：${unknownSquads.length}`);

    if (templateSquads.length > 0) {
      console.log(`\n  ❌ 仍為 active 的模板型 squads（需停用）：`);
      for (const s of templateSquads.slice(0, 20)) {
        console.log(`     [${s.id}] ${s.slug}`);
      }
      if (templateSquads.length > 20) {
        console.log(`     ... 及另外 ${templateSquads.length - 20} 個`);
      }
    }

    if (unknownSquads.length > 0) {
      console.log(`\n  ⚠️  未識別前綴（請確認是否應存在）：`);
      for (const s of unknownSquads) {
        console.log(`     [${s.id}] ${s.slug}`);
      }
    }

    // ── 2. Workspace 覆蓋分析 ────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  二、Workspace 覆蓋分析（方法論型 squads）");
    console.log("═══════════════════════════════════════════════════════");

    const wsCounts: Record<string, number> = {};
    const wsUnknown: Record<string, number> = {};

    for (const s of methodologySquads) {
      const wsArr = parseJson(s.workspace);
      if (wsArr.length === 0) {
        wsCounts["(no workspace)"] = (wsCounts["(no workspace)"] || 0) + 1;
      } else {
        for (const ws of wsArr) {
          const key = typeof ws === "string" ? ws : String(ws);
          if (CANONICAL_WORKSPACES.includes(key)) {
            wsCounts[key] = (wsCounts[key] || 0) + 1;
          } else {
            wsUnknown[key] = (wsUnknown[key] || 0) + 1;
          }
        }
      }
    }

    console.log("\n  標準 workspace 覆蓋：");
    for (const ws of CANONICAL_WORKSPACES) {
      const count = wsCounts[ws] || 0;
      const bar = "█".repeat(Math.min(count, 30));
      const status = count >= 5 ? "✅" : count > 0 ? "⚠️ " : "❌";
      console.log(`  ${status}  ${ws.padEnd(12)} ${String(count).padStart(3)} squads  ${bar}`);
    }

    if (Object.keys(wsUnknown).length > 0) {
      console.log("\n  非標準 workspace 值（需確認）：");
      for (const [ws, count] of Object.entries(wsUnknown)) {
        console.log(`  ⚠️   ${ws.padEnd(20)} ${count} squads`);
      }
    }

    // ── 3. 欄位完整性審計 ───────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  三、欄位完整性審計（方法論型 squads）");
    console.log("═══════════════════════════════════════════════════════");

    const issues: Array<{ slug: string; problems: string[] }> = [];

    for (const s of methodologySquads) {
      const problems: string[] = [];

      // methodology
      if (!s.methodology || s.methodology.trim() === "") {
        problems.push("缺少 methodology");
      }

      // workspace
      const ws = parseJson(s.workspace);
      if (ws.length === 0) {
        problems.push("workspace 為空");
      }

      // agents
      const agents = parseJson(s.agents);
      if (agents.length === 0) {
        problems.push("agents 為空（0 個 agent）");
      } else if (agents.length < 2) {
        problems.push(`agents 只有 ${agents.length} 個（建議 ≥ 2）`);
      }

      // check lead agent
      const hasLead = agents.some((a: any) => a.is_lead === 1 || a.is_lead === true);
      if (agents.length > 0 && !hasLead) {
        problems.push("沒有 lead agent");
      }

      // tags
      const tags = parseJson(s.tags);
      if (tags.length < 3) {
        problems.push(`tags 只有 ${tags.length} 個（建議 ≥ 3）`);
      }

      // use_cases
      const useCases = parseJson(s.use_cases);
      if (useCases.length === 0) {
        problems.push("use_cases 為空");
      }

      // output_formats
      const outputFormats = parseJson(s.output_formats);
      if (outputFormats.length === 0) {
        problems.push("output_formats 為空");
      }

      // showcases
      const showcases = parseJson(s.showcases);
      if (showcases.length === 0) {
        problems.push("showcases 為空");
      }

      // token
      if (!s.token || s.token < 1000) {
        problems.push(`token 異常（${s.token}）`);
      }

      if (problems.length > 0) {
        issues.push({ slug: s.slug, problems });
      }
    }

    if (issues.length === 0) {
      console.log("\n  ✅ 所有方法論型 squads 欄位完整！");
    } else {
      console.log(`\n  ⚠️  共有 ${issues.length} 個 squads 有欄位問題：`);
      for (const issue of issues) {
        console.log(`\n  [${issue.slug}]`);
        for (const p of issue.problems) {
          console.log(`    • ${p}`);
        }
      }
    }

    // ── 4. 各 workspace 的前綴分布 ──────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  四、各 Workspace 的方法論 Squad 清單");
    console.log("═══════════════════════════════════════════════════════");

    const wsSlugs: Record<string, string[]> = {};
    for (const s of methodologySquads) {
      const wsArr = parseJson(s.workspace);
      const primaryWs = wsArr[0] ?? "(none)";
      const key = typeof primaryWs === "string" ? primaryWs : "(none)";
      if (!wsSlugs[key]) wsSlugs[key] = [];
      wsSlugs[key].push(s.slug);
    }

    const sortedWs = Object.keys(wsSlugs).sort((a, b) => {
      const ai = CANONICAL_WORKSPACES.indexOf(a);
      const bi = CANONICAL_WORKSPACES.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    for (const ws of sortedWs) {
      const slugList = wsSlugs[ws];
      const canonical = CANONICAL_WORKSPACES.includes(ws) ? "" : " ⚠️ 非標準";
      console.log(`\n  [${ws}]${canonical} — ${slugList.length} squads`);
      for (const slug of slugList) {
        console.log(`    • ${slug}`);
      }
    }

    // ── 5. 摘要 ─────────────────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════════");
    console.log("  五、審計摘要");
    console.log("═══════════════════════════════════════════════════════");
    console.log(`  Active squads 總數       : ${squads.length}`);
    console.log(`  方法論型（正常）         : ${methodologySquads.length}`);
    console.log(`  模板型（應停用）         : ${templateSquads.length}`);
    console.log(`  未知前綴（需確認）       : ${unknownSquads.length}`);
    console.log(`  有欄位問題的方法論 squads: ${issues.length}`);

    const emptyWorkspaces = CANONICAL_WORKSPACES.filter(ws => !wsCounts[ws]);
    if (emptyWorkspaces.length > 0) {
      console.log(`  ❌ 無 squads 的 workspace : ${emptyWorkspaces.join(", ")}`);
    } else {
      console.log(`  ✅ 所有 10 個標準 workspace 均有覆蓋`);
    }

    if (templateSquads.length === 0 && issues.length === 0 && unknownSquads.length === 0) {
      console.log("\n  🎉 審計通過！所有 squads 命名規範、欄位完整、workspace 全覆蓋。");
    } else {
      console.log("\n  ⚠️  審計發現問題，請依上述報告修正。");
    }

  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("[audit-methodology] ERROR:", err.message ?? err);
  process.exit(1);
});
