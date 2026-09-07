/**
 * promptTemplateRouter — serves the Nano-Banana prompt library (MIT,
 * 175 prompts across 10 categories) to the 改圖 picker UI.
 *
 * 2026-05-12 (CJ「Phase 1 — prompt library 整合」). Sourced from
 * github.com/devanshug2307/Awesome-Nano-Banana-Prompts, parsed at build
 * time into skills/ai-talent/data/nano-banana-prompts.json.
 *
 * Read-only public router (no auth) — templates aren't sensitive.
 */
import { z } from "zod";
import { router, publicProcedure } from "../../platform/core/trpc";
import promptsData from "../../../data/nano-banana-prompts.json" with { type: "json" };

interface PromptTemplate {
  category: string;
  title: string;
  prompt: string;
  tags?: string[];
}
interface CategoryMeta {
  key: string;
  label_en: string;
  label_zh: string;
}
interface PromptsFile {
  source: string;
  license: string;
  fetchedAt: string;
  categories: CategoryMeta[];
  prompts: PromptTemplate[];
}
const data = promptsData as PromptsFile;

export const promptTemplateRouter = router({
  /** Categories with counts — for the dropdown selector. */
  categories: publicProcedure.query(() => {
    const counts = new Map<string, number>();
    for (const p of data.prompts) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    return data.categories.map((c) => ({
      ...c,
      count: counts.get(c.key) ?? 0,
    }));
  }),

  /** Prompts filtered by category. Templates are NOT translated — Flux/GPT
   *  respond better to English prompts. The UI shows the title + first
   *  line as preview; user picks one to fill the textarea. */
  list: publicProcedure
    .input(z.object({
      category: z.string().min(1).max(64).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(({ input }) => {
      const all = data.prompts;
      const filtered = input.category
        ? all.filter((p) => p.category === input.category)
        : all;
      // Return up to `limit`, preserving JSON order (curation order from source)
      return filtered.slice(0, input.limit).map((p) => ({
        category: p.category,
        title: p.title.slice(0, 120),
        // Trim prompt body for UI list view (the full prompt is still sent
        // when the user clicks — see promptTemplate.detail below)
        preview: p.prompt.slice(0, 200),
        // Hash-based stable id so the client can key list items
        id: `${p.category}::${p.title.slice(0, 40)}`,
      }));
    }),

  /** Full prompt body for a chosen template — used when user clicks "use". */
  detail: publicProcedure
    .input(z.object({
      id: z.string().min(1).max(200),
    }))
    .query(({ input }) => {
      const target = data.prompts.find(
        (p) => `${p.category}::${p.title.slice(0, 40)}` === input.id,
      );
      if (!target) {
        return null;
      }
      return {
        category: target.category,
        title: target.title,
        prompt: target.prompt,
        tags: target.tags ?? [],
      };
    }),
});
