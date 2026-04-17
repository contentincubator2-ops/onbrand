/**
 * audit-squad-fields.ts
 * 精確統計所有 active squads 各欄位的 NULL / EMPTY 數量
 *
 * 輸出格式：
 *   Squad 欄位完整性審計結果
 *   總計 N 個 active squads，✅ 完整：X，⚠️ 有問題：Y
 *
 *   欄位                NULL (完全沒有)   EMPTY (空值/空陣列)
 *   methodology         X                X
 *   workspace           X                X
 *   ...
 *
 * Usage: npm run db:audit-fields
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

interface SquadRow {
  id: number;
  slug: string;
  missionType: string | null;
  methodology: string | null;
  workspace: string | null;
  agents: string | null;
  tags: string | null;
  use_cases: string | null;
  output_formats: string | null;
  required_integrations: string | null;
  showcases: string | null;
  description: string | null;
  token: number | null;
}

function parseJsonArray(val: string | null): any[] {
  if (val === null || val === undefined) return [];
  const trimmed = val.trim();
  if (trimmed === "" || trimmed === "null") return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isNullField(val: string | null): boolean {
  return val === null || val === undefined;
}

function isEmptyString(val: string | null): boolean {
  if (val === null || val === undefined) return false;
  return val.trim() === "" || val.trim() === "null";
}

function isEmptyJsonArray(val: string | null): boolean {
  if (val === null || val === undefined) return false;
  const trimmed = val.trim();
  if (trimmed === "" || trimmed === "null") return false; // already counted as empty string
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) && parsed.length === 0;
  } catch {
    return false;
  }
}

interface FieldStats {
  nullCount: number;      // IS NULL
  emptyCount: number;     // 空字串 / 空陣列 []
  belowMinCount: number;  // 有值但數量不足（僅用於 tags / agents）
  minThreshold?: number;  // 最低數量要求
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
      `SELECT id, slug, missionType, methodology, workspace, agents, tags,
              use_cases, output_formats, required_integrations, showcases,
              description, token
       FROM agent_squads
       WHERE is_active = 1
       ORDER BY slug ASC`
    ) as any[];

    const squads = rows as SquadRow[];
    const total = squads.length;

    // ── 統計各欄位 ────────────────────────────────────────────────────────
    const stats: Record<string, FieldStats> = {
      missionType:            { nullCount: 0, emptyCount: 0, belowMinCount: 0 },
      methodology:            { nullCount: 0, emptyCount: 0, belowMinCount: 0 },
      description:            { nullCount: 0, emptyCount: 0, belowMinCount: 0 },
      workspace:              { nullCount: 0, emptyCount: 0, belowMinCount: 0 },
      agents:                 { nullCount: 0, emptyCount: 0, belowMinCount: 0, minThreshold: 2 },
      "agents (no lead)":     { nullCount: 0, emptyCount: 0, belowMinCount: 0 },
      tags:                   { nullCount: 0, emptyCount: 0, belowMinCount: 0, minThreshold: 3 },
      use_cases:              { nullCount: 0, emptyCount: 0, belowMinCount: 0 },
      output_formats:         { nullCount: 0, emptyCount: 0, belowMinCount: 0 },
      required_integrations:  { nullCount: 0, emptyCount: 0, belowMinCount: 0 },
      showcases:              { nullCount: 0, emptyCount: 0, belowMinCount: 0 },
      token:                  { nullCount: 0, emptyCount: 0, belowMinCount: 0 },
    };

    // 每個 squad 最終是否「完整」（無任何必填欄位問題）
    let completeCount = 0;

    for (const s of squads) {
      let hasIssue = false;

      // missionType (string)
      if (isNullField(s.missionType)) {
        stats.missionType.nullCount++; hasIssue = true;
      } else if (isEmptyString(s.missionType)) {
        stats.missionType.emptyCount++; hasIssue = true;
      }

      // methodology (string)
      if (isNullField(s.methodology)) {
        stats.methodology.nullCount++; hasIssue = true;
      } else if (isEmptyString(s.methodology)) {
        stats.methodology.emptyCount++; hasIssue = true;
      }

      // description (string)
      if (isNullField(s.description)) {
        stats.description.nullCount++; hasIssue = true;
      } else if (isEmptyString(s.description)) {
        stats.description.emptyCount++; hasIssue = true;
      }

      // workspace (JSON array)
      if (isNullField(s.workspace)) {
        stats.workspace.nullCount++; hasIssue = true;
      } else if (isEmptyString(s.workspace) || isEmptyJsonArray(s.workspace)) {
        stats.workspace.emptyCount++; hasIssue = true;
      }

      // agents (JSON array)
      if (isNullField(s.agents)) {
        stats.agents.nullCount++; hasIssue = true;
      } else if (isEmptyString(s.agents) || isEmptyJsonArray(s.agents)) {
        stats.agents.emptyCount++; hasIssue = true;
      } else {
        const agentArr = parseJsonArray(s.agents);
        if (agentArr.length < 2) {
          stats.agents.belowMinCount++; hasIssue = true;
        }
        const hasLead = agentArr.some((a: any) => a.is_lead === 1 || a.is_lead === true);
        if (!hasLead) {
          stats["agents (no lead)"].belowMinCount++; hasIssue = true;
        }
      }

      // tags (JSON array, min 3)
      if (isNullField(s.tags)) {
        stats.tags.nullCount++; hasIssue = true;
      } else if (isEmptyString(s.tags) || isEmptyJsonArray(s.tags)) {
        stats.tags.emptyCount++; hasIssue = true;
      } else {
        const tagArr = parseJsonArray(s.tags);
        if (tagArr.length < 3) {
          stats.tags.belowMinCount++; hasIssue = true;
        }
      }

      // use_cases (JSON array)
      if (isNullField(s.use_cases)) {
        stats.use_cases.nullCount++; hasIssue = true;
      } else if (isEmptyString(s.use_cases) || isEmptyJsonArray(s.use_cases)) {
        stats.use_cases.emptyCount++; hasIssue = true;
      }

      // output_formats (JSON array)
      if (isNullField(s.output_formats)) {
        stats.output_formats.nullCount++; hasIssue = true;
      } else if (isEmptyString(s.output_formats) || isEmptyJsonArray(s.output_formats)) {
        stats.output_formats.emptyCount++; hasIssue = true;
      }

      // required_integrations (JSON array — 允許空，不計入問題)
      if (isNullField(s.required_integrations)) {
        stats.required_integrations.nullCount++;
        // 不 hasIssue，required_integrations 可以為 null/空
      } else if (isEmptyString(s.required_integrations) || isEmptyJsonArray(s.required_integrations)) {
        stats.required_integrations.emptyCount++;
      }

      // showcases (JSON array)
      if (isNullField(s.showcases)) {
        stats.showcases.nullCount++; hasIssue = true;
      } else if (isEmptyString(s.showcases) || isEmptyJsonArray(s.showcases)) {
        stats.showcases.emptyCount++; hasIssue = true;
      }

      // token
      if (s.token === null || s.token === undefined) {
        stats.token.nullCount++; hasIssue = true;
      } else if (s.token < 1000) {
        stats.token.belowMinCount++; hasIssue = true;
      }

      if (!hasIssue) completeCount++;
    }

    const problemCount = total - completeCount;

    // ── 輸出報告 ─────────────────────────────────────────────────────────
    console.log("\n");
    console.log("╔═══════════════════════════════════════════════════════════════╗");
    console.log("║         Squad 欄位完整性審計結果                              ║");
    console.log("╚═══════════════════════════════════════════════════════════════╝");
    console.log(`\n  總計 ${total} 個 active squads，✅ 完整：${completeCount}，⚠️  有問題：${problemCount}\n`);

    // Table header
    const COL_FIELD  = 26;
    const COL_NULL   = 18;
    const COL_EMPTY  = 20;
    const COL_BELOW  = 20;

    console.log(
      "  " +
      "欄位".padEnd(COL_FIELD) +
      "NULL (完全沒有)".padEnd(COL_NULL) +
      "EMPTY (空值/空陣列)".padEnd(COL_EMPTY) +
      "數量不足"
    );
    console.log("  " + "─".repeat(COL_FIELD + COL_NULL + COL_EMPTY + COL_BELOW));

    const fieldOrder = [
      "methodology",
      "missionType",
      "description",
      "workspace",
      "agents",
      "agents (no lead)",
      "tags",
      "use_cases",
      "output_formats",
      "required_integrations",
      "showcases",
      "token",
    ];

    for (const field of fieldOrder) {
      const s = stats[field];
      const nullStr  = s.nullCount      > 0 ? String(s.nullCount)      : "-";
      const emptyStr = s.emptyCount     > 0 ? String(s.emptyCount)     : "-";
      const belowStr = s.belowMinCount  > 0
        ? (s.minThreshold ? `${s.belowMinCount} (< ${s.minThreshold}個)` : String(s.belowMinCount))
        : "-";

      const hasAny = s.nullCount > 0 || s.emptyCount > 0 || s.belowMinCount > 0;
      const marker = hasAny ? "⚠️  " : "✅  ";

      // required_integrations: don't mark as warning
      const isOptional = field === "required_integrations";
      const prefix = isOptional ? "ℹ️  " : marker;

      console.log(
        "  " + prefix +
        field.padEnd(COL_FIELD - 4) +
        nullStr.padEnd(COL_NULL) +
        emptyStr.padEnd(COL_EMPTY) +
        belowStr
      );
    }

    // ── 拆分 workspace 覆蓋 ───────────────────────────────────────────────
    const CANONICAL_WORKSPACES = [
      "strategy", "facebook", "instagram", "linkedin", "youtube",
      "pr", "event", "website", "monitoring", "analytics", "instore",
    ];

    const wsCoverage: Record<string, number> = {};
    const wsNonCanonical: Record<string, number> = {};

    for (const s of squads) {
      const wsArr = parseJsonArray(s.workspace);
      for (const ws of wsArr) {
        const key = typeof ws === "string" ? ws : String(ws);
        if (CANONICAL_WORKSPACES.includes(key)) {
          wsCoverage[key] = (wsCoverage[key] || 0) + 1;
        } else {
          wsNonCanonical[key] = (wsNonCanonical[key] || 0) + 1;
        }
      }
    }

    console.log("\n");
    console.log("  ── Workspace 覆蓋（各標準 workspace 的 squad 數量） ──────────");
    for (const ws of CANONICAL_WORKSPACES) {
      const count = wsCoverage[ws] || 0;
      const bar = "█".repeat(Math.min(count, 40));
      const status = count >= 5 ? "✅" : count > 0 ? "⚠️ " : "❌";
      console.log(`  ${status}  ${ws.padEnd(14)} ${String(count).padStart(3)} squads  ${bar}`);
    }

    if (Object.keys(wsNonCanonical).length > 0) {
      console.log("\n  ── 非標準 workspace 值（需修正） ─────────────────────────");
      for (const [ws, count] of Object.entries(wsNonCanonical).sort((a, b) => b[1] - a[1])) {
        console.log(`  ⚠️   ${ws.padEnd(22)} ${count} squads`);
      }
    } else {
      console.log("\n  ✅ 所有 workspace 值均為標準值，無需修正。");
    }

    // ── 詳細：有問題的 squads 清單（最多顯示 30 個）────────────────────
    console.log("\n");
    console.log("  ── 有欄位問題的 squads（前 30 個） ───────────────────────────");

    const issueList: Array<{ slug: string; problems: string[] }> = [];

    for (const s of squads) {
      const problems: string[] = [];

      if (!s.missionType || isEmptyString(s.missionType))  problems.push("missionType 空");
      if (!s.methodology  || isEmptyString(s.methodology))  problems.push("methodology 空");
      if (!s.description  || isEmptyString(s.description))  problems.push("description 空");
      if (!s.workspace || isEmptyJsonArray(s.workspace) || parseJsonArray(s.workspace).length === 0) problems.push("workspace 空");

      const agentArr = parseJsonArray(s.agents);
      if (agentArr.length === 0) problems.push("agents 空");
      else if (agentArr.length < 2) problems.push(`agents 只有 ${agentArr.length} 個`);
      const hasLead = agentArr.some((a: any) => a.is_lead === 1 || a.is_lead === true);
      if (agentArr.length > 0 && !hasLead) problems.push("無 lead agent");

      const tagArr = parseJsonArray(s.tags);
      if (tagArr.length === 0) problems.push("tags 空");
      else if (tagArr.length < 3) problems.push(`tags ${tagArr.length} 個（< 3）`);

      if (parseJsonArray(s.use_cases).length === 0)     problems.push("use_cases 空");
      if (parseJsonArray(s.output_formats).length === 0) problems.push("output_formats 空");
      if (parseJsonArray(s.showcases).length === 0)      problems.push("showcases 空");
      if (!s.token || s.token < 1000)                    problems.push(`token=${s.token}`);

      if (problems.length > 0) issueList.push({ slug: s.slug, problems });
    }

    const displayed = issueList.slice(0, 30);
    for (const item of displayed) {
      console.log(`\n  [${item.slug}]`);
      for (const p of item.problems) {
        console.log(`    • ${p}`);
      }
    }
    if (issueList.length > 30) {
      console.log(`\n  ... 及另外 ${issueList.length - 30} 個 squads 有問題（未顯示）`);
    }

    // ── 最終摘要 ────────────────────────────────────────────────────────
    console.log("\n");
    console.log("╔═══════════════════════════════════════════════════════════════╗");
    console.log("║  審計摘要                                                     ║");
    console.log("╚═══════════════════════════════════════════════════════════════╝");
    console.log(`  Active squads 總數  : ${total}`);
    console.log(`  完整無問題          : ${completeCount} (${(completeCount / total * 100).toFixed(1)}%)`);
    console.log(`  有欄位問題          : ${problemCount} (${(problemCount / total * 100).toFixed(1)}%)`);

    const emptyWs = CANONICAL_WORKSPACES.filter(ws => !(wsCoverage[ws] > 0));
    if (emptyWs.length > 0) {
      console.log(`  缺少 squads 的 ws   : ${emptyWs.join(", ")}`);
    } else {
      console.log(`  Workspace 覆蓋      : 全 ${CANONICAL_WORKSPACES.length} 個均有 squads ✅`);
    }

    if (completeCount === total) {
      console.log("\n  🎉 審計通過！所有欄位完整。\n");
    } else {
      console.log("\n  ⚠️  請依上述報告補齊缺失欄位。\n");
    }

  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("[audit-fields] ERROR:", err.message ?? err);
  process.exit(1);
});
