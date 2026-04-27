/**
 * wshobson-agents source — community-curated Claude agent definitions
 * (~70 specialized agents stored as markdown files with YAML front-matter).
 *
 * Repo: https://github.com/wshobson/agents
 * Path: agents/*.md
 */

import { scan } from "../securityCheck";
import type { NormalizedSkill, SourceFetcher } from "../types";

const REPO = "wshobson/agents";
const BRANCH = "main";

interface GhTreeEntry { path: string; type: "blob" | "tree"; sha: string; }

async function ghJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = { "Accept": "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`GitHub ${url} → ${r.status} ${r.statusText}`);
  return r.json() as Promise<T>;
}

async function ghRaw(path: string): Promise<string> {
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path}`);
  if (!r.ok) throw new Error(`raw ${path} → ${r.status}`);
  return r.text();
}

function parseAgentMd(md: string): { name: string; description: string; manifest: any } {
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
  if (/product|feature|gtm|launch.*plan/.test(t)) return "L2";
  if (/audience|persona|segment|icp|targeting|customer.*research/.test(t)) return "L3";
  if (/social|facebook|instagram|youtube|linkedin|email|seo|content.*market|ad.*copy/.test(t)) return "L4";
  if (/campaign|launch|promotion|event|growth/.test(t)) return "L5";
  if (/audit|analytics|measure|kpi|attribution|review|data.*analy/.test(t)) return "L6";
  return null;
}

export const wshobsonAgents: SourceFetcher = {
  id: "wshobson-agents",
  label: "wshobson/agents (community Claude agents)",
  originModel: "claude",

  async fetch({ limit }) {
    console.log(`[${this.id}] fetching tree …`);
    const tree = await ghJson<{ tree: GhTreeEntry[] }>(
      `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`
    );
    const files = tree.tree.filter(
      (e) => e.type === "blob" && /^agents\/[^/]+\.md$/.test(e.path)
    );
    console.log(`[${this.id}] found ${files.length} agent .md files`);

    const out: NormalizedSkill[] = [];
    let i = 0;
    for (const f of files) {
      if (limit && i >= limit) break;
      i++;
      try {
        const md = await ghRaw(f.path);
        const { name, description, manifest } = parseAgentMd(md);
        const fileSlug = f.path.replace(/^agents\//, "").replace(/\.md$/, "");
        const slug = `wshobson-${fileSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`.slice(0, 188);
        const sec = scan(md);
        out.push({
          slug,
          name,
          category: null,
          strategyLayer: classifyMarketingLayer(name, description),
          source: this.id,
          sourceUrl: `https://github.com/${REPO}/blob/${BRANCH}/${f.path}`,
          description,
          manifest,
          originModel: this.originModel,
          testedModels: ["claude"],
          qualityScore: sec.passed ? 7.5 : 4.0,
          securityCheck: sec,
        });
      } catch (e: any) {
        console.warn(`[${this.id}] skip ${f.path}: ${e.message}`);
      }
    }
    return out;
  },
};
