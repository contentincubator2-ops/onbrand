/**
 * crewAI-examples source — agent role/goal/backstory definitions from
 * the official CrewAI examples repo.
 *
 * Repo: github.com/crewAIInc/crewAI-examples
 * Files: */agents.yaml across crews/* and integrations/*
 *
 * One file declares N agents (typically 3–5). We split each top-level
 * key into its own NormalizedSkill (category="agent-template"), so
 * downstream UI can show them as agent personas.
 *
 * origin_model = "cross" (CrewAI is framework-agnostic; works with
 * any LLM). tested_models defaults to ["openai", "claude"] which is
 * what CrewAI demos use.
 */

import { scan } from "../securityCheck";
import type { NormalizedSkill, SourceFetcher } from "../types";

const REPO = "crewAIInc/crewAI-examples";
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
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/${path.split("/").map(encodeURIComponent).join("/")}`);
  if (!r.ok) throw new Error(`raw ${path} → ${r.status}`);
  return r.text();
}

/** Tiny YAML parser specialised for the CrewAI agents.yaml shape:
 *    role_key:
 *      role: >
 *        "..."
 *      goal: >
 *        "..."
 *      backstory: >
 *        "..."
 *  Returns one entry per top-level role_key.
 */
interface ParsedAgent { id: string; role: string; goal: string; backstory: string; raw: string; }
function parseAgentsYaml(text: string): ParsedAgent[] {
  const lines = text.split("\n");
  const out: ParsedAgent[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const top = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*$/);
    if (top) {
      const id = top[1]!;
      i++;
      const fields: Record<string, string> = {};
      let raw = `${id}:\n`;
      while (i < lines.length && (/^\s+/.test(lines[i]!) || lines[i]!.trim() === "")) {
        raw += lines[i] + "\n";
        const f = lines[i]!.match(/^\s+([a-z_]+):\s*(>|>-)?\s*(.*)$/);
        if (f) {
          const key = f[1]!;
          const block = f[2]; // > or >-
          let val = (f[3] ?? "").trim();
          if (block) {
            // collect indented continuation lines
            i++;
            const buf: string[] = [];
            while (i < lines.length && /^\s{4,}/.test(lines[i]!)) {
              buf.push(lines[i]!.trim());
              raw += lines[i] + "\n";
              i++;
            }
            val = buf.join(" ");
            i--;
          }
          fields[key] = val.replace(/^["']|["']$/g, "").trim();
        }
        i++;
      }
      out.push({
        id,
        role: fields.role ?? id,
        goal: fields.goal ?? "",
        backstory: fields.backstory ?? "",
        raw: raw.trim(),
      });
    } else {
      i++;
    }
  }
  return out;
}

function classifyMarketingLayer(role: string, body: string): NormalizedSkill["strategyLayer"] {
  const t = `${role} ${body}`.toLowerCase();
  if (/brand|positioning|archetype|identity/.test(t)) return "L1";
  if (/product|gtm|launch|pricing/.test(t)) return "L2";
  if (/audience|persona|segment|icp|customer.*research|jtbd/.test(t)) return "L3";
  if (/social|facebook|instagram|youtube|linkedin|tiktok|email|seo|content|ad copy|copywrit|blog|advertis/.test(t)) return "L4";
  if (/campaign|launch.*strategy|promotion|growth|marketing/.test(t)) return "L5";
  if (/audit|analytics|measure|kpi|attribution|review|data.*analy/.test(t)) return "L6";
  return null;
}

export const crewaiExamples: SourceFetcher = {
  id: "crewai-examples",
  label: "crewAI-examples (agent.yaml roles)",
  originModel: "cross",

  async fetch({ limit }) {
    console.log(`[${this.id}] fetching tree …`);
    const tree = await ghJson<{ tree: GhTreeEntry[] }>(
      `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`
    );
    const yamlFiles = tree.tree.filter(
      (e) => e.type === "blob" && /(^|\/)agents\.ya?ml$/.test(e.path)
    );
    console.log(`[${this.id}] found ${yamlFiles.length} agents.yaml files`);

    const out: NormalizedSkill[] = [];
    let count = 0;
    outer: for (const f of yamlFiles) {
      try {
        const text = await ghRaw(f.path);
        const parsed = parseAgentsYaml(text);
        // Crew name = ancestor dir like "landing_page_generator" / "instagram_post"
        const m = f.path.match(/(?:^|\/)([^/]+)\/(?:src\/[^/]+\/)?config\/agents\.ya?ml$/) ||
                  f.path.match(/^([^/]+)\/agents\.ya?ml$/);
        const crew = (m?.[1] ?? "crew").toLowerCase().replace(/[^a-z0-9-]/g, "-");
        for (const a of parsed) {
          if (limit && count >= limit) break outer;
          count++;
          const slug = `crewai-${crew}-${a.id.replace(/_/g, "-")}`.slice(0, 188);
          const description = (a.role || a.goal || "").trim().slice(0, 280);
          const sec = scan(a.raw);
          out.push({
            slug,
            name: a.role || a.id,
            category: "agent-template",
            strategyLayer: classifyMarketingLayer(a.role, `${a.goal} ${a.backstory}`),
            source: this.id,
            sourceUrl: `https://github.com/${REPO}/blob/${BRANCH}/${f.path}`,
            description,
            manifest: { id: a.id, crew, role: a.role, goal: a.goal, backstory: a.backstory, raw: a.raw.slice(0, 8000) },
            originModel: this.originModel,
            testedModels: ["openai", "claude"],
            qualityScore: sec.passed ? 7.5 : 4.0,
            securityCheck: sec,
          });
        }
      } catch (e: any) {
        console.warn(`[${this.id}] skip ${f.path}: ${e.message}`);
      }
    }
    return out;
  },
};
