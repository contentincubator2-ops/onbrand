/**
 * Anthropic Claude Skills source.
 *
 * Pulls SKILL.md files from github.com/anthropics/claude-skills via the
 * GitHub raw API. No auth needed for public repo (5K req/h limit is plenty).
 *
 * Each subdirectory under root containing a SKILL.md becomes one skill.
 */

import { scan } from "../securityCheck";
import type { NormalizedSkill, SourceFetcher } from "../types";

const REPO = "anthropics/claude-skills";
const BRANCH = "main";

interface GhTreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

async function ghJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = { "Accept": "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GitHub ${url} → ${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

async function ghRaw(path: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`raw ${url} → ${r.status}`);
  return r.text();
}

function parseSkillMd(md: string): { name: string; description: string; manifest: any } {
  // Anthropic SKILL.md uses YAML front-matter:
  //   ---
  //   name: skill-name
  //   description: ...
  //   ---
  //   <body>
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  let yaml = "", body = md;
  if (m) { yaml = m[1]!; body = m[2]!; }

  const fields: Record<string, string> = {};
  for (const line of yaml.split("\n")) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (kv) fields[kv[1]!] = kv[2]!.replace(/^["']|["']$/g, "");
  }

  return {
    name: fields.name ?? "(unnamed)",
    description: fields.description ?? body.slice(0, 280).trim(),
    manifest: { ...fields, body: body.trim().slice(0, 8000) },
  };
}

function classifyMarketingLayer(name: string, desc: string): NormalizedSkill["strategyLayer"] {
  const t = `${name} ${desc}`.toLowerCase();
  if (/brand|positioning|archetype|identity/.test(t)) return "L1";
  if (/product|feature|launch.*plan|gtm/.test(t)) return "L2";
  if (/audience|persona|segment|icp|targeting/.test(t)) return "L3";
  if (/social|facebook|instagram|youtube|linkedin|email|seo|ad copy|content/.test(t)) return "L4";
  if (/campaign|launch|promotion|event|activation/.test(t)) return "L5";
  if (/audit|analytics|measure|kpi|attribution|review/.test(t)) return "L6";
  return null;  // generic / non-marketing skill
}

export const anthropicClaudeSkills: SourceFetcher = {
  id: "anthropic-claude-skills",
  label: "Anthropic Claude Skills",
  originModel: "claude",

  async fetch({ limit }) {
    console.log(`[${this.id}] fetching tree …`);
    const tree = await ghJson<{ tree: GhTreeEntry[] }>(
      `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`
    );

    const skillFiles = tree.tree.filter(
      (e) => e.type === "blob" && /(^|\/)SKILL\.md$/i.test(e.path)
    );
    console.log(`[${this.id}] found ${skillFiles.length} SKILL.md files`);

    const out: NormalizedSkill[] = [];
    let i = 0;
    for (const f of skillFiles) {
      if (limit && i >= limit) break;
      i++;
      try {
        const md = await ghRaw(f.path);
        const { name, description, manifest } = parseSkillMd(md);
        const dirSlug = f.path.replace(/\/SKILL\.md$/i, "").split("/").pop() || `skill-${i}`;
        const slug = `claude-${dirSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
        const sec = scan(md);
        out.push({
          slug,
          name,
          category: manifest?.category ?? null,
          strategyLayer: classifyMarketingLayer(name, description),
          source: this.id,
          sourceUrl: `https://github.com/${REPO}/blob/${BRANCH}/${f.path}`,
          description,
          manifest,
          originModel: this.originModel,
          testedModels: ["claude"],
          qualityScore: sec.passed ? 8.5 : 4.0,    // Anthropic-curated baseline
          securityCheck: sec,
        });
      } catch (e: any) {
        console.warn(`[${this.id}] skip ${f.path}: ${e.message}`);
      }
    }
    return out;
  },
};
