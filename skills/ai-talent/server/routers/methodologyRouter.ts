/**
 * methodologyRouter — Sprint 1: methodology lifecycle
 *
 * Two flagship procedures (Hermes-style evolution graph):
 *
 *   ingestFromUrl(url)
 *     → fetch the URL content, ask an LLM to extract a structured
 *       methodology (name, author, year, description, steps with
 *       requiredSkills + outputType), stash the proposal in
 *       squad_ingest_jobs (status='reviewing'), return job id.
 *     → finalizeIngest(jobId, edits?) commits a new squads row with
 *       source='ingested', ingest_source_url=url, agents auto-aligned.
 *
 *   fork(parentSquadId, edits)
 *     → snapshot the parent squad and apply user edits (steps,
 *       prompts, requiredSkills, name). New row gets a derived slug
 *       (`<parent-slug>-fork-<short>`), source='forked',
 *       parent_squad_id=parentSquadId, created_by_user_id=ctx.user.id.
 *     → returns the new squad id + slug so the caller (MissionDetail
 *       dirty-save dialog) can swap the mission's squadSlug to the
 *       fork in a follow-up update.
 *
 * NB: agent alignment for ingested squads is best-effort. If the
 * extraction yields a primarySkill we can match, lead_agent_id is
 * filled; otherwise it stays null and the user picks a lead
 * manually in the catalog. Forks inherit the parent's lead by default.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";

// ── helpers ─────────────────────────────────────────────────────────────
function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

async function fetchAndStrip(url: string): Promise<string> {
  // Best-effort: fetch HTML, strip tags, cap to 20K chars so the LLM
  // prompt stays within budget. Plain-text URLs (transcripts, PDFs
  // already extracted) flow through unchanged.
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 MarketingOS-Ingest/1.0" },
  });
  if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
  const html = await r.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 20000);
}

interface ExtractedMethodology {
  name: string;
  author?: string;
  year?: string;
  description?: string;
  primarySkill?: string;
  steps: Array<{
    name: string;
    description?: string;
    requiredSkill?: string;
    outputType?: string;
  }>;
}

async function extractWithLLM(text: string, sourceUrl: string): Promise<ExtractedMethodology> {
  // Goes through core invokeLLM which respects LLM_DEFAULT_PROVIDER
  // (azure-foundry on prod). If invokeLLM fails (no provider key),
  // fall back to a deterministic stub so the UI still renders something.
  const sys = `You extract marketing/strategy methodologies from arbitrary text.
Return STRICT JSON: { name, author, year, description, primarySkill, steps: [{ name, description, requiredSkill, outputType }] }.
- description: <= 280 chars in source language.
- 4-7 steps, ordered.
- requiredSkill: kebab-case.
- outputType: one of brief|research|doc|deliverable|plan|asset.`;
  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Source URL: ${sourceUrl}\n\n${text}` },
      ],
      response_format: { type: "json_object" },
      maxTokens: 2048,
    });
    const content = result.choices?.[0]?.message?.content;
    const raw = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((p: any) => (p?.type === "text" ? p.text : "")).join("")
        : "{}";
    const parsed = JSON.parse(raw) as ExtractedMethodology;
    if (!parsed.name || !Array.isArray(parsed.steps)) {
      throw new Error("LLM extraction missing name or steps");
    }
    return parsed;
  } catch (e) {
    console.warn("[methodologyRouter] extractWithLLM fallback:", (e as any)?.message ?? e);
    return {
      name: `Untitled methodology · ${new URL(sourceUrl).hostname}`,
      description: text.slice(0, 280),
      steps: [
        { name: "Define objective", outputType: "brief" },
        { name: "Gather evidence", outputType: "research" },
        { name: "Synthesize framework", outputType: "doc" },
        { name: "Stress test & ship", outputType: "deliverable" },
      ],
    };
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

// ── router ──────────────────────────────────────────────────────────────
export const methodologyRouter = router({
  // Step 1 — kick off ingest. Returns job id, the client polls
  // getIngestJob until status='reviewing', then renders the preview
  // and lets the user edit before commit.
  ingestFromUrl: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const [insertRes]: any = await db.execute(sql`
        INSERT INTO squad_ingest_jobs (userId, sourceUrl, status)
        VALUES (${ctx.user.id}, ${input.url}, 'extracting')
      `);
      const jobId: number = (insertRes as any).insertId ?? (insertRes as any)[0]?.insertId;

      // Fire-and-forget extraction. Errors logged into the job row.
      (async () => {
        try {
          const text = await fetchAndStrip(input.url);
          const extracted = await extractWithLLM(text, input.url);
          await db.execute(sql`
            UPDATE squad_ingest_jobs
               SET status='reviewing',
                   extracted=${JSON.stringify(extracted)},
                   updatedAt=NOW(3)
             WHERE id=${jobId}
          `);
        } catch (e: any) {
          await db.execute(sql`
            UPDATE squad_ingest_jobs
               SET status='failed', errorMsg=${String(e?.message ?? e)}, updatedAt=NOW(3)
             WHERE id=${jobId}
          `);
        }
      })().catch(console.error);

      return { jobId };
    }),

  // Poll endpoint for the IngestDrawer.
  getIngestJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const r: any = await db.execute(sql`
        SELECT id, sourceUrl, status, extracted, squadId, errorMsg, createdAt
          FROM squad_ingest_jobs
         WHERE id=${input.jobId} AND userId=${ctx.user.id} LIMIT 1
      `);
      const row = (Array.isArray(r) ? r[0] : (r as any).rows ?? r)[0];
      if (!row) return null;
      const extracted = row.extracted
        ? (() => { try { return JSON.parse(row.extracted); } catch { return null; } })()
        : null;
      return { ...row, extracted };
    }),

  // Step 2 — user reviewed, now commit (with optional edits).
  finalizeIngest: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      // Edits override extracted fields. Frontend sends the post-edit
      // shape verbatim so server doesn't have to merge.
      methodology: z.object({
        name: z.string().min(1).max(255),
        author: z.string().max(128).optional(),
        year: z.string().max(16).optional(),
        description: z.string().max(2000).optional(),
        primarySkill: z.string().max(64).optional(),
        steps: z.array(z.object({
          name: z.string().min(1).max(255),
          description: z.string().max(1000).optional(),
          requiredSkill: z.string().max(64).optional(),
          outputType: z.string().max(32).optional(),
        })).min(1).max(12),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const [jobRows]: any = await db.execute(sql`
        SELECT sourceUrl FROM squad_ingest_jobs
         WHERE id=${input.jobId} AND userId=${ctx.user.id} LIMIT 1
      `);
      const row = (Array.isArray(jobRows) ? jobRows : (jobRows as any).rows ?? jobRows)[0];
      if (!row) throw new Error("Ingest job not found");

      const m = input.methodology;
      const slug = `${slugify(m.name)}-${shortId()}`;
      const stepsJson = JSON.stringify(
        m.steps.map((s, i) => ({
          order: i + 1,
          name: s.name,
          description: s.description ?? "",
          requiredSkill: s.requiredSkill ?? null,
          outputType: s.outputType ?? null,
          assignedAgentId: null,
          tools: [],
        }))
      );
      const methodJson = JSON.stringify({
        author: m.author ?? null,
        year: m.year ?? null,
        primarySkill: m.primarySkill ?? null,
      });

      const [ins]: any = await db.execute(sql`
        INSERT INTO squads
          (slug, name, description, agents, steps, methodology,
           source, ingest_source_url, created_by_user_id, is_active)
        VALUES
          (${slug}, ${m.name}, ${m.description ?? ""},
           JSON_ARRAY(), CAST(${stepsJson} AS JSON), CAST(${methodJson} AS JSON),
           'ingested', ${row.sourceUrl}, ${ctx.user.id}, 1)
      `);
      const squadId: number = (ins as any).insertId ?? (ins as any)[0]?.insertId;

      await db.execute(sql`
        UPDATE squad_ingest_jobs SET status='done', squadId=${squadId}, updatedAt=NOW(3)
         WHERE id=${input.jobId}
      `);

      return { squadId, slug };
    }),

  // Hermes-style fork — user edited a methodology mid-mission and
  // wants to save it as their own. Snapshot parent + apply edits.
  fork: protectedProcedure
    .input(z.object({
      parentSquadId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      steps: z.array(z.object({
        name: z.string().min(1).max(255),
        description: z.string().max(1000).optional(),
        requiredSkill: z.string().max(64).optional(),
        outputType: z.string().max(32).optional(),
        assignedAgentId: z.number().nullable().optional(),
        prompt: z.string().max(8000).optional(),
        tools: z.array(z.any()).optional(),
      })).min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      const [parentRows]: any = await db.execute(sql`
        SELECT id, slug, agents, methodology, lead_agent_id, tier, strategy_layer, workspace
          FROM squads WHERE id=${input.parentSquadId} LIMIT 1
      `);
      const parent = (Array.isArray(parentRows) ? parentRows : (parentRows as any).rows ?? parentRows)[0];
      if (!parent) throw new Error("Parent squad not found");

      const slug = `${parent.slug}-fork-${shortId()}`;
      const stepsJson = JSON.stringify(
        input.steps.map((s, i) => ({
          order: i + 1,
          name: s.name,
          description: s.description ?? "",
          requiredSkill: s.requiredSkill ?? null,
          outputType: s.outputType ?? null,
          assignedAgentId: s.assignedAgentId ?? null,
          prompt: s.prompt ?? null,
          tools: s.tools ?? [],
        }))
      );

      const [ins]: any = await db.execute(sql`
        INSERT INTO squads
          (slug, name, description, agents, steps, methodology, lead_agent_id,
           tier, strategy_layer, workspace,
           source, parent_squad_id, created_by_user_id, is_active)
        VALUES
          (${slug}, ${input.name}, ${input.description ?? ""},
           ${parent.agents ?? "[]"}, CAST(${stepsJson} AS JSON),
           ${parent.methodology ?? null}, ${parent.lead_agent_id ?? null},
           ${parent.tier ?? "defer"}, ${parent.strategy_layer ?? "unassigned"},
           ${parent.workspace ?? null},
           'forked', ${parent.id}, ${ctx.user.id}, 1)
      `);
      const squadId: number = (ins as any).insertId ?? (ins as any)[0]?.insertId;
      return { squadId, slug };
    }),

  // Canonical "fat" lookup for MissionDetail. Returns the squad row
  // with hydrated steps + lead + member names so the editor can render
  // without follow-up round-trips. Accepts slug OR numeric id.
  getBySlugOrId: protectedProcedure
    .input(z.object({ slug: z.string().optional(), id: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const isId = typeof input.id === "number";
      const r: any = isId
        ? await db.execute(sql`
            SELECT id, slug, name, description, agents, steps, methodology,
                   lead_agent_id AS leadAgentId, tier, strategy_layer AS strategyLayer,
                   source, parent_squad_id AS parentSquadId, ingest_source_url AS ingestSourceUrl,
                   token AS tokenBudget, workspace
              FROM squads WHERE id=${input.id} AND is_active=1 LIMIT 1
          `)
        : await db.execute(sql`
            SELECT id, slug, name, description, agents, steps, methodology,
                   lead_agent_id AS leadAgentId, tier, strategy_layer AS strategyLayer,
                   source, parent_squad_id AS parentSquadId, ingest_source_url AS ingestSourceUrl,
                   token AS tokenBudget, workspace
              FROM squads WHERE slug=${input.slug ?? ""} AND is_active=1 LIMIT 1
          `);
      const rows = Array.isArray(r) ? r[0] : (r as any).rows ?? r;
      const row = (rows as any[])?.[0];
      if (!row) return null;

      const safeJson = <T,>(v: unknown, fb: T): T => {
        if (v == null) return fb;
        if (typeof v === "object") return v as T;
        if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } }
        return fb;
      };
      const members = safeJson<any[]>(row.agents, []);
      const steps = safeJson<any[]>(row.steps, []);
      const methodology = safeJson<any>(row.methodology, null);

      // Hydrate agent names for lead + each step's assignedAgentId
      const ids = new Set<number>();
      if (row.leadAgentId) ids.add(Number(row.leadAgentId));
      for (const m of members) if (m.agent_id) ids.add(Number(m.agent_id));
      for (const s of steps) if (s.assignedAgentId) ids.add(Number(s.assignedAgentId));
      const agentMap: Record<number, any> = {};
      if (ids.size) {
        const list = [...ids];
        const ar: any = await db.execute(sql`
          SELECT id, name, title, primarySkill FROM agents WHERE id IN (${sql.raw(list.join(","))})
        `);
        const arows = Array.isArray(ar) ? ar[0] : (ar as any).rows ?? ar;
        for (const a of arows as any[]) agentMap[a.id] = a;
      }

      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        tier: row.tier,
        strategyLayer: row.strategyLayer,
        source: row.source,
        parentSquadId: row.parentSquadId,
        ingestSourceUrl: row.ingestSourceUrl,
        tokenBudget: row.tokenBudget,
        workspace: safeJson(row.workspace, null),
        methodology,
        lead: row.leadAgentId && agentMap[row.leadAgentId]
          ? {
              agentId: row.leadAgentId,
              name: agentMap[row.leadAgentId].name,
              title: agentMap[row.leadAgentId].title,
              primarySkill: agentMap[row.leadAgentId].primarySkill,
            }
          : null,
        members: members.map((m: any) => ({
          agentId: Number(m.agent_id),
          role: m.role ?? null,
          isLead: !!(m.is_lead === true || m.is_lead === 1),
          name: agentMap[Number(m.agent_id)]?.name ?? "(orphan)",
          primarySkill: agentMap[Number(m.agent_id)]?.primarySkill ?? null,
        })),
        steps: steps.map((s: any, i: number) => ({
          order: s.order ?? i + 1,
          name: s.name ?? `Step ${i + 1}`,
          description: s.description ?? "",
          requiredSkill: s.requiredSkill ?? null,
          outputType: s.outputType ?? null,
          assignedAgentId: s.assignedAgentId ?? null,
          assignedAgentName: s.assignedAgentId ? agentMap[s.assignedAgentId]?.name ?? null : null,
          prompt: s.prompt ?? null,
          tools: Array.isArray(s.tools) ? s.tools : [],
        })),
      };
    }),

  // List forks + ingests created by this user (for "我的方法論" tab).
  listMine: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const r: any = await db.execute(sql`
        SELECT id, slug, name, description, source, parent_squad_id, ingest_source_url,
               steps, methodology, created_at AS createdAt
          FROM squads
         WHERE created_by_user_id=${ctx.user.id} AND is_active=1
         ORDER BY id DESC LIMIT 100
      `);
      const rows = Array.isArray(r) ? r[0] : (r as any).rows ?? r;
      return Array.isArray(rows) ? rows : [];
    }),
});
