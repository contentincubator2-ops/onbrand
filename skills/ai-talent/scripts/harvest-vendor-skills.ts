/**
 * harvest-vendor-skills.ts
 *
 * Pulls SKILL.md files from open vendor repos (Anthropic, Google) that
 * follow the agentskills.io open standard published 2025-12-18:
 *
 *   ---
 *   name: my-skill-name           # lowercase-hyphens, ≤64 char
 *   description: ...              # ≤1024 char, third-person
 *   ---
 *   <markdown body>
 *
 * Sources:
 *   - https://github.com/anthropics/skills/tree/main/skills
 *   - https://github.com/google/skills/tree/main/skills
 *
 * Each harvested SKILL.md becomes a row in skill_catalog with:
 *   slug          = vendor-prefix + name        e.g. anthropic-pdf-creation
 *   name          = original name (or capitalized)
 *   description   = SKILL.md description
 *   category      = vendor (anthropic | google | community)
 *   boundProvider = "any" (universal — Claude/Gemini Skills work anywhere)
 *   tags          = [vendor, source-path]
 *   source_repo   = repo URL (NEW column)
 *   source_path   = path/to/SKILL.md
 *
 * Idempotent. Pass --dry-run to print plan only.
 */

import * as dotenv from "dotenv";
import { getPool, closePool } from "./squad-builder/db.js";

dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");

interface Vendor {
  prefix: string;
  repo: string;       // owner/repo
  ref: string;        // branch
  paths: string[];    // skill directories (relative to repo root)
}

const VENDORS: Vendor[] = [
  {
    prefix: "anthropic",
    repo: "anthropics/skills",
    ref: "main",
    paths: ["skills"],
  },
  {
    prefix: "google",
    repo: "google/skills",
    ref: "main",
    paths: ["skills/cloud", "skills"],
  },
];

interface SkillFile {
  vendor: string;
  path: string;
  name: string;
  description: string;
}

async function ghApi(url: string): Promise<any> {
  const headers: Record<string, string> = { "Accept": "application/vnd.github+json" };
  if (process.env.GH_TOKEN) headers["Authorization"] = `Bearer ${process.env.GH_TOKEN}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

async function ghRaw(repo: string, ref: string, path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${repo}/${ref}/${path}`;
  const r = await fetch(url);
  if (!r.ok) return "";
  return r.text();
}

function parseFrontmatter(md: string): { name?: string; description?: string } {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return {};
  const body = m[1];
  const out: any = {};
  for (const line of body.split("\n")) {
    const mm = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (mm) out[mm[1]] = mm[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function listSkillDirs(vendor: Vendor): Promise<string[]> {
  const found: string[] = [];
  for (const root of vendor.paths) {
    try {
      const items = await ghApi(`https://api.github.com/repos/${vendor.repo}/contents/${root}?ref=${vendor.ref}`);
      if (!Array.isArray(items)) continue;
      for (const it of items) {
        if (it.type === "dir") found.push(`${root}/${it.name}`);
      }
    } catch (e: any) {
      console.warn(`  (skip ${vendor.repo}/${root}: ${e.message})`);
    }
  }
  return found;
}

async function harvestVendor(vendor: Vendor): Promise<SkillFile[]> {
  const dirs = await listSkillDirs(vendor);
  console.log(`  ${vendor.repo}: ${dirs.length} skill dirs`);
  const out: SkillFile[] = [];
  for (const d of dirs) {
    const md = await ghRaw(vendor.repo, vendor.ref, `${d}/SKILL.md`);
    if (!md) continue;
    const fm = parseFrontmatter(md);
    if (!fm.name) continue;
    out.push({
      vendor: vendor.prefix,
      path: `${d}/SKILL.md`,
      name: fm.name,
      description: fm.description || "",
    });
  }
  return out;
}

async function main() {
  const pool = getPool();

  // Ensure schema columns exist
  console.log("▼ ensuring schema columns");
  if (!DRY_RUN) {
    for (const sql of [
      `ALTER TABLE skill_catalog ADD COLUMN description TEXT NULL`,
      `ALTER TABLE skill_catalog ADD COLUMN source_repo VARCHAR(255) NULL`,
      `ALTER TABLE skill_catalog ADD COLUMN source_path VARCHAR(500) NULL`,
    ]) {
      try { await pool.query(sql); console.log(`  applied: ${sql.split(" ADD ")[0].split(" ").pop()} ${sql.match(/COLUMN \w+/)?.[0]}`); }
      catch (e: any) {
        if (e.code !== "ER_DUP_FIELDNAME") console.log(`  ${e.code || e.message}`);
      }
    }
  }

  console.log("\n▼ harvesting from vendors");
  const all: SkillFile[] = [];
  for (const v of VENDORS) {
    const r = await harvestVendor(v);
    all.push(...r);
  }
  console.log(`\n▼ collected ${all.length} SKILL.md files`);

  let inserted = 0, updated = 0;
  for (const s of all) {
    const slug = `${s.vendor}-${s.name}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 80);
    const tags = JSON.stringify([s.vendor, "agentskills-standard"]);
    const repoUrl = `https://github.com/${VENDORS.find(v => v.prefix === s.vendor)!.repo}`;
    if (DRY_RUN) { inserted++; continue; }
    const [r]: any = await pool.execute(
      `INSERT INTO skill_catalog (slug, name, category, boundProvider, tags, description, source_repo, source_path)
       VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name=VALUES(name), description=VALUES(description),
         source_repo=VALUES(source_repo), source_path=VALUES(source_path)`,
      [slug, s.name, s.vendor, "any", tags, s.description.slice(0, 1024), repoUrl, s.path],
    );
    if (r.affectedRows === 1) inserted++;
    else if (r.affectedRows === 2) updated++;
  }
  console.log(`\n✅ vendor skills: +${inserted} inserted, ~${updated} updated`);

  await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
