/**
 * playbookLoader.ts — read step-level playbook markdown files.
 *
 * Playbooks live at server/_core/playbooks/{slug}.md
 *
 * In Lead-solo architecture, each squads.steps[].skill points to a playbook
 * slug. The Lead's system prompt embeds the playbook content for that step.
 *
 * Cached in memory on first load; re-reads on cache miss only.
 * No hot-reload (VM restarts on deploy anyway).
 */

import * as fs from "node:fs";
import * as path from "node:path";

const PLAYBOOK_DIR = path.resolve(__dirname, "playbooks");
const cache = new Map<string, string>();

export function loadPlaybook(slug: string): string | null {
  if (!slug) return null;
  if (cache.has(slug)) return cache.get(slug)!;

  const filePath = path.join(PLAYBOOK_DIR, `${slug}.md`);
  try {
    const content = fs.readFileSync(filePath, "utf8");
    cache.set(slug, content);
    return content;
  } catch (err: any) {
    console.warn(`[playbook] missing: ${slug}.md (${err.code ?? err.message})`);
    return null;
  }
}

export function clearCache() {
  cache.clear();
}

export function listAvailablePlaybooks(): string[] {
  try {
    return fs.readdirSync(PLAYBOOK_DIR)
      .filter(f => f.endsWith(".md"))
      .map(f => f.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}
