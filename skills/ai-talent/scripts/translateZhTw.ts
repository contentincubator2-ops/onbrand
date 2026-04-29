/**
 * translateZhTw.ts — populate localized zh-TW columns on skills + agents.
 *
 * Reads rows where the *_zh column is NULL, sends batched payloads to
 * Azure Foundry gpt-4o-mini, parses JSON, writes back. Also normalizes
 * 簡中 → 繁中 (e.g., 渠道→管道, 网→網) and removes mid-sentence English
 * fragments per the design rule that zh-TW UI shouldn't mix raw English.
 *
 * Targets:
 *   skills.name           → skills.name_zh           (≤ 16 chars, terse)
 *   skills.description    → skills.description_zh   (≤ 80 chars)
 *   agents.name           → agents.name_zh          (中文名 / 音譯)
 *   agents.title          → agents.title_zh         (≤ 20 chars)
 *   agents.bio            → agents.bio_zh           (≤ 100 chars)
 *
 * Flags:
 *   --target=skills|agents|all   (default: all)
 *   --limit N
 *   --batch N      rows per LLM call (default 20)
 *   --apply        write back (else dry-run prints first 5)
 *   --reuse        skip rows that already have *_zh set
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const args = process.argv.slice(2);
const arg = (n: string) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=").slice(1).join("=") : undefined;
};
const TARGET = (arg("target") ?? "all") as "skills" | "agents" | "squads" | "all";
const LIMIT = arg("limit") ? parseInt(arg("limit")!, 10) : 0;
const BATCH = arg("batch") ? parseInt(arg("batch")!, 10) : 20;
const APPLY = args.includes("--apply");
const REUSE = args.includes("--reuse"); // default: only NULLs; --reuse same as default

const AZURE_KEY = process.env.AZURE_FOUNDRY_API_KEY ?? process.env.AZURE_AI_API_KEY ?? "";
const AZURE_ENDPOINT = (
  process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT ??
  process.env.AZURE_AI_ENDPOINT ??
  "https://proj-claude-sweden-resource.services.ai.azure.com"
).replace(/\/+$/, "");
const AZURE_DEPLOYMENT = process.env.AZURE_FOUNDRY_MODEL ?? "gpt-4o-mini";

if (!AZURE_KEY) { console.error("Missing AZURE_FOUNDRY_API_KEY"); process.exit(2); }

const IS_AZURE_OPENAI = AZURE_ENDPOINT.includes("openai.azure.com");
const URL_PATH = IS_AZURE_OPENAI
  ? `/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=2024-10-01-preview`
  : `/openai/v1/chat/completions`;

const SYSTEM_PROMPT = `You are a localization editor for a Taiwanese SaaS marketing platform.
Translate input rows into clean **繁體中文 (zh-TW)** suitable for Taiwan users.

Rules:
- Output Traditional Chinese only — convert any 简体 (e.g., 渠道→管道, 网→網, 视频→影片, 优化→最佳化, 数据→數據, 内容→內容).
- Keep widely-known English terms untranslated: FB, IG, LinkedIn, YouTube, TikTok, SEO, B2B, B2C, KPI, ROI, JTBD, STP, AARRR, OKR, GPT, AI, ML, API, SaaS, CRM, KOL, UGC, PR, OMO. Otherwise translate.
- Be concise. Do not pad. Do not add quotes / brackets. Do not echo the input.
- Maintain the requested character limit for each field.
- For names of fictional people (agents), produce a natural Chinese name or a clean 音譯 — pick whichever reads more naturally; do NOT include both.

Return ONLY a JSON object: { "results": [{ "id": <int>, "<field1>": "...", "<field2>": "...", ... }] }
Skip the row entirely if a field already reads as natural zh-TW.`;

interface SkillRow { id: number; name: string; description: string | null; }
interface AgentRow { id: number; name: string; title: string | null; bio: string | null; }

async function callAzure(
  systemPrompt: string,
  rows: any[],
  fields: string[],
): Promise<Record<string, string>[]> {
  const url = `${AZURE_ENDPOINT}${URL_PATH}`;
  const body: any = {
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          `Localize ${rows.length} rows. Fields to produce per row: ${fields.join(", ")}.\n` +
          `Input:\n${JSON.stringify(rows)}`,
      },
    ],
    max_tokens: 4000,
    temperature: 0.2,
    response_format: { type: "json_object" },
  };
  if (!IS_AZURE_OPENAI) body.model = AZURE_DEPLOYMENT;

  const MAX_RETRIES = 4;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "api-key": AZURE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.status === 429 || resp.status === 503) {
      const wait = 10000 * (attempt + 1);
      process.stdout.write(`(${resp.status}, retry ${wait/1000}s) `);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`Azure ${resp.status}: ${t.slice(0, 300)}`);
    }
    const data: any = await resp.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    let parsed: any;
    try { parsed = JSON.parse(text); } catch (e) {
      throw new Error(`JSON parse: ${text.slice(0, 300)}`);
    }
    const out = Array.isArray(parsed?.results) ? parsed.results : Array.isArray(parsed) ? parsed : [];
    return out as Record<string, string>[];
  }
  throw new Error(`Azure 429/503 after ${MAX_RETRIES} retries`);
}

async function translateSkills(pool: any) {
  const where = "is_active = 1 AND (name_zh IS NULL OR name_zh = '')";
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : "";
  const [rows]: any = await pool.execute(
    `SELECT id, name, description FROM skills WHERE ${where} ORDER BY id ASC ${limitSql}`
  );
  const all: SkillRow[] = rows;
  console.log(`[skills] ${all.length} rows to localize`);
  if (all.length === 0) return;

  let ok = 0, fail = 0;
  for (let i = 0; i < all.length; i += BATCH) {
    const chunk = all.slice(i, i + BATCH).map((r) => ({
      id: r.id,
      name: r.name,
      description: (r.description ?? "").slice(0, 240),
    }));
    process.stdout.write(`[skills] ${i + 1}-${i + chunk.length}/${all.length} ... `);
    let results: Record<string, string>[];
    try {
      results = await callAzure(
        SYSTEM_PROMPT,
        chunk,
        ["name_zh (≤16 chars)", "description_zh (≤80 chars)"],
      );
    } catch (e: any) {
      console.log(`FAIL ${e.message}`);
      fail += chunk.length;
      continue;
    }
    if (!APPLY) {
      console.log(`[dry] sample:`, results.slice(0, 2));
      ok += chunk.length;
      continue;
    }
    for (const r of results) {
      const id = Number(r.id);
      if (!id) continue;
      try {
        await pool.execute(
          `UPDATE skills SET name_zh = ?, description_zh = ? WHERE id = ?`,
          [(r as any).name_zh ?? null, (r as any).description_zh ?? null, id]
        );
        ok++;
      } catch (e: any) { fail++; }
    }
    console.log(`ok ${ok} / fail ${fail}`);
  }
  console.log(`[skills] done: ${ok} ok, ${fail} fail`);
}

async function translateAgents(pool: any) {
  const where = "isAvailable = 1 AND (name_zh IS NULL OR name_zh = '')";
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : "";
  const [rows]: any = await pool.execute(
    `SELECT id, name, title, bio FROM agents WHERE ${where} ORDER BY id ASC ${limitSql}`
  );
  const all: AgentRow[] = rows;
  console.log(`[agents] ${all.length} rows to localize`);
  if (all.length === 0) return;

  let ok = 0, fail = 0;
  for (let i = 0; i < all.length; i += BATCH) {
    const chunk = all.slice(i, i + BATCH).map((r) => ({
      id: r.id,
      name: r.name,
      title: (r.title ?? "").slice(0, 120),
      bio: (r.bio ?? "").slice(0, 240),
    }));
    process.stdout.write(`[agents] ${i + 1}-${i + chunk.length}/${all.length} ... `);
    let results: Record<string, string>[];
    try {
      results = await callAzure(
        SYSTEM_PROMPT,
        chunk,
        ["name_zh", "title_zh (≤20 chars)", "bio_zh (≤100 chars)"],
      );
    } catch (e: any) {
      console.log(`FAIL ${e.message}`);
      fail += chunk.length;
      continue;
    }
    if (!APPLY) {
      console.log(`[dry] sample:`, results.slice(0, 2));
      ok += chunk.length;
      continue;
    }
    for (const r of results) {
      const id = Number(r.id);
      if (!id) continue;
      try {
        await pool.execute(
          `UPDATE agents SET name_zh = ?, title_zh = ?, bio_zh = ? WHERE id = ?`,
          [(r as any).name_zh ?? null, (r as any).title_zh ?? null, (r as any).bio_zh ?? null, id]
        );
        ok++;
      } catch (e: any) { fail++; }
    }
    console.log(`ok ${ok} / fail ${fail}`);
  }
  console.log(`[agents] done: ${ok} ok, ${fail} fail`);
}

async function translateSquads(pool: any) {
  const where = "is_active = 1 AND (name_zh IS NULL OR name_zh = '' OR description_zh IS NULL OR description_zh = '')";
  const limitSql = LIMIT ? `LIMIT ${LIMIT}` : "";
  const [rows]: any = await pool.execute(
    `SELECT id, name, description FROM squads WHERE ${where} ORDER BY id ASC ${limitSql}`
  );
  const all: { id: number; name: string; description: string | null }[] = rows;
  console.log(`[squads] ${all.length} rows to localize`);
  if (all.length === 0) return;

  let ok = 0, fail = 0;
  for (let i = 0; i < all.length; i += BATCH) {
    const chunk = all.slice(i, i + BATCH).map((r) => ({
      id: r.id,
      name: r.name,
      description: (r.description ?? "").slice(0, 360),
    }));
    process.stdout.write(`[squads] ${i + 1}-${i + chunk.length}/${all.length} ... `);
    let results: Record<string, string>[];
    try {
      results = await callAzure(
        SYSTEM_PROMPT,
        chunk,
        ["name_zh (≤24 chars)", "description_zh (≤120 chars)"],
      );
    } catch (e: any) {
      console.log(`FAIL ${e.message}`);
      fail += chunk.length;
      continue;
    }
    if (!APPLY) {
      console.log(`[dry] sample:`, results.slice(0, 2));
      ok += chunk.length;
      continue;
    }
    for (const r of results) {
      const id = Number(r.id);
      if (!id) continue;
      try {
        await pool.execute(
          `UPDATE squads SET name_zh = ?, description_zh = ? WHERE id = ?`,
          [(r as any).name_zh ?? null, (r as any).description_zh ?? null, id]
        );
        ok++;
      } catch (e: any) { fail++; }
    }
    console.log(`ok ${ok} / fail ${fail}`);
  }
  console.log(`[squads] done: ${ok} ok, ${fail} fail`);
}

async function main() {
  const pool = getPool();
  console.log(`===== translateZhTw =====`);
  console.log(`endpoint: ${AZURE_ENDPOINT}`);
  console.log(`model:    ${AZURE_DEPLOYMENT}`);
  console.log(`target:   ${TARGET}`);
  console.log(`apply:    ${APPLY}`);
  console.log(`batch:    ${BATCH}\n`);

  if (TARGET === "skills" || TARGET === "all") await translateSkills(pool);
  if (TARGET === "squads" || TARGET === "all") await translateSquads(pool);
  if (TARGET === "agents" || TARGET === "all") {
    // sowork_db is on a different connection — translateAgents needs its own pool
    // Use the same pool here only if both tables live in the same DB. In our setup
    // agents lives in sowork_db. Skip with a notice if pool can't see it.
    try {
      await translateAgents(pool);
    } catch (e: any) {
      console.warn(`[agents] skipped: ${e.message}`);
    }
  }
  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
