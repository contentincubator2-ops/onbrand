/**
 * f/awesome-chatgpt-prompts source — the canonical 200+ prompt CSV.
 *
 * Repo: https://github.com/f/awesome-chatgpt-prompts
 * File: prompts.csv  (columns: act, prompt)
 *
 * These are cross-model: written for ChatGPT but proven to run on
 * Claude / Gemini / etc. We tag origin_model="cross".
 */

import { scan } from "../securityCheck";
import type { NormalizedSkill, SourceFetcher } from "../types";

const CSV_URL = "https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv";

// Tiny CSV parser that handles quoted fields with commas + newlines.
function parseCsv(text: string): Array<{ act: string; prompt: string }> {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; continue; }
      if (c === '"') { inQuotes = false; continue; }
      field += c;
    } else {
      if (c === '"') { inQuotes = true; continue; }
      if (c === ",") { cur.push(field); field = ""; continue; }
      if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; continue; }
      if (c === "\r") continue;
      field += c;
    }
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }

  if (rows.length === 0) return [];
  const header = rows[0]!.map((s) => s.trim().toLowerCase());
  const aIdx = header.indexOf("act");
  const pIdx = header.indexOf("prompt");
  if (aIdx < 0 || pIdx < 0) return [];

  const out: Array<{ act: string; prompt: string }> = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]!;
    const act = (r[aIdx] ?? "").trim();
    const prompt = (r[pIdx] ?? "").trim();
    if (act && prompt) out.push({ act, prompt });
  }
  return out;
}

function classifyMarketingLayer(name: string, desc: string): NormalizedSkill["strategyLayer"] {
  const t = `${name} ${desc}`.toLowerCase();
  if (/brand|positioning|archetype|identity|logo/.test(t)) return "L1";
  if (/product|feature|gtm|launch.*plan/.test(t)) return "L2";
  if (/audience|persona|segment|icp|customer/.test(t)) return "L3";
  if (/social|facebook|instagram|youtube|linkedin|email|seo|content|ad copy|copywrit|blog|advertis/.test(t)) return "L4";
  if (/campaign|launch|promotion|event|marketing|growth/.test(t)) return "L5";
  if (/audit|analytics|measure|kpi|review|stat/.test(t)) return "L6";
  return null;
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/^act as (an?|the) /i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export const awesomeChatgptPrompts: SourceFetcher = {
  id: "awesome-chatgpt-prompts",
  label: "f/awesome-chatgpt-prompts (200+ classic prompts)",
  originModel: "cross",

  async fetch({ limit }) {
    console.log(`[${this.id}] fetching CSV …`);
    const r = await fetch(CSV_URL);
    if (!r.ok) throw new Error(`CSV fetch failed: ${r.status}`);
    const text = await r.text();
    const rows = parseCsv(text);
    console.log(`[${this.id}] parsed ${rows.length} prompts`);

    const out: NormalizedSkill[] = [];
    let i = 0;
    for (const row of rows) {
      if (limit && i >= limit) break;
      i++;
      const slug = `acp-${slugify(row.act)}`.slice(0, 188);
      const sec = scan(row.prompt);
      out.push({
        slug,
        name: row.act,
        category: null,
        strategyLayer: classifyMarketingLayer(row.act, row.prompt),
        source: this.id,
        sourceUrl: "https://github.com/f/awesome-chatgpt-prompts",
        description: row.prompt.slice(0, 280),
        manifest: { act: row.act, prompt: row.prompt },
        originModel: this.originModel,
        testedModels: ["openai", "claude", "gemini"],
        qualityScore: sec.passed ? 6.5 : 3.5,  // Crowd-sourced, lower baseline
        securityCheck: sec,
      });
    }
    return out;
  },
};
