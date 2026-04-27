/**
 * linexjlin/GPTs source — leaked OpenAI Custom GPT system prompts.
 *
 * Repo: https://github.com/linexjlin/GPTs
 * Path: prompts/*.md  (filename = GPT name; body = system prompt)
 *
 * Tagged origin_model="openai" because each prompt is shaped for the
 * GPT Store environment (tools, web browsing, code interpreter refs).
 * Runtime can still try them on Claude / Gemini — that's the value.
 */

import { scan } from "../securityCheck";
import type { NormalizedSkill, SourceFetcher } from "../types";

const REPO = "linexjlin/GPTs";
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
  const r = await fetch(
    `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path.split("/").map(encodeURIComponent).join("/")}`
  );
  if (!r.ok) throw new Error(`raw ${path} → ${r.status}`);
  return r.text();
}

function classifyMarketingLayer(name: string, body: string): NormalizedSkill["strategyLayer"] {
  const t = `${name} ${body.slice(0, 1500)}`.toLowerCase();
  if (/brand|positioning|archetype|identity|logo|name.*generat/.test(t)) return "L1";
  if (/product|gtm|launch.*plan|pricing|feature/.test(t)) return "L2";
  if (/audience|persona|segment|icp|customer.*research|jtbd/.test(t)) return "L3";
  if (/social|facebook|instagram|youtube|linkedin|tiktok|email|seo|content|ad copy|copywrit|blog|advertis/.test(t)) return "L4";
  if (/campaign|launch|promotion|growth|marketing.*plan/.test(t)) return "L5";
  if (/audit|analytics|measure|kpi|attribution|review/.test(t)) return "L6";
  return null;
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[()[\]{}.,!?]/g, "")
    .replace(/[^a-z0-9一-鿿-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export const linexjlinGpts: SourceFetcher = {
  id: "linexjlin-gpts",
  label: "linexjlin/GPTs (leaked OpenAI Custom GPT prompts)",
  originModel: "openai",

  async fetch({ limit }) {
    console.log(`[${this.id}] fetching tree …`);
    const tree = await ghJson<{ tree: GhTreeEntry[] }>(
      `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`
    );
    const files = tree.tree.filter(
      (e) => e.type === "blob" && /^prompts\/[^/]+\.md$/.test(e.path)
    );
    console.log(`[${this.id}] found ${files.length} GPT prompt files`);

    const out: NormalizedSkill[] = [];
    let i = 0;
    for (const f of files) {
      if (limit && i >= limit) break;
      i++;
      try {
        const body = await ghRaw(f.path);
        const filename = f.path.replace(/^prompts\//, "").replace(/\.md$/, "");
        const name = filename.trim();
        const slug = `gpt-${slugify(name)}`.slice(0, 188);
        const sec = scan(body);
        out.push({
          slug,
          name,
          category: null,
          strategyLayer: classifyMarketingLayer(name, body),
          source: this.id,
          sourceUrl: `https://github.com/${REPO}/blob/${BRANCH}/${f.path}`,
          description: body.slice(0, 280).replace(/\s+/g, " ").trim(),
          manifest: { name, body: body.slice(0, 8000) },
          originModel: this.originModel,
          testedModels: ["openai"],
          qualityScore: sec.passed ? 7.0 : 4.0,
          securityCheck: sec,
        });
      } catch (e: any) {
        console.warn(`[${this.id}] skip ${f.path}: ${e.message}`);
      }
    }
    return out;
  },
};
