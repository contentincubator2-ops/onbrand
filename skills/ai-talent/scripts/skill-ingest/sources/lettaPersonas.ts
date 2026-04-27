/**
 * letta-ai/letta personas source.
 *
 * Repo: github.com/letta-ai/letta
 * Files: letta/personas/examples/*.txt  (plain-text persona descriptions)
 *
 * 11 personas — small but each is a polished agent voice/personality.
 * origin_model = "cross" (Letta is model-agnostic).
 */

import { scan } from "../securityCheck";
import type { NormalizedSkill, SourceFetcher } from "../types";

const REPO = "letta-ai/letta";
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

function classifyMarketingLayer(name: string, body: string): NormalizedSkill["strategyLayer"] {
  const t = `${name} ${body.slice(0, 800)}`.toLowerCase();
  if (/brand|positioning|archetype/.test(t)) return "L1";
  if (/product|gtm|launch/.test(t)) return "L2";
  if (/audience|persona|segment|customer/.test(t)) return "L3";
  if (/social|email|seo|content|copywrit/.test(t)) return "L4";
  if (/campaign|growth|marketing/.test(t)) return "L5";
  if (/audit|analytics|measure|review/.test(t)) return "L6";
  return null;
}

export const lettaPersonas: SourceFetcher = {
  id: "letta-personas",
  label: "letta-ai/letta personas",
  originModel: "cross",

  async fetch({ limit }) {
    console.log(`[${this.id}] fetching tree …`);
    const tree = await ghJson<{ tree: GhTreeEntry[] }>(
      `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`
    );
    const files = tree.tree.filter(
      (e) => e.type === "blob" &&
        /^letta\/personas\/examples\/[^/]+\.txt$/.test(e.path)
    );
    console.log(`[${this.id}] found ${files.length} persona .txt files`);

    const out: NormalizedSkill[] = [];
    let i = 0;
    for (const f of files) {
      if (limit && i >= limit) break;
      i++;
      try {
        const body = await ghRaw(f.path);
        const fname = f.path.split("/").pop()!.replace(/\.txt$/, "");
        const name = fname.replace(/_/g, " ");
        const slug = `letta-${fname}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 188);
        const sec = scan(body);
        out.push({
          slug,
          name,
          category: "agent-template",
          strategyLayer: classifyMarketingLayer(name, body),
          source: this.id,
          sourceUrl: `https://github.com/${REPO}/blob/${BRANCH}/${f.path}`,
          description: body.slice(0, 280).replace(/\s+/g, " ").trim(),
          manifest: { name: fname, body: body.trim().slice(0, 8000) },
          originModel: this.originModel,
          testedModels: ["openai", "claude"],
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
