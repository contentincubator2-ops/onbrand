/**
 * personaAgentRouter — 人設 Agent (persona-agent) CRUD + background training.
 *
 * 2026-08-21 (CJ「加一個人設的task tray...用戶可以自己新創agent，自己命名，
 * 並且決定這個Agent語調的應用範圍要在那些內容的任務...用戶可以加入特定人的
 * 影音、講話、文字等內容後，我們會產出2200字以上的人設和SKILL，訓練過程
 * 顯示進度條，然後，用戶可以按不同的AGENT試寫看看品牌的文案」):
 *
 * A brand can create any number of named persona agents. Each is trained
 * from user-supplied grounding material — pasted text, article links,
 * video links (YouTube-style transcript fetch, caption-only), and now
 * (2026-08-21, CJ「怎麼覺得還是不踏實，因為很多人，影音就是放在google drive,
 * one drive or youtube上面」) a connected Google Drive / OneDrive video or
 * audio file, run through real ASR (server/_core/transcription.ts) — into a
 * generated persona (who this voice is) + skill (concrete, checkable
 * writing rules), combined ≥2200 characters. Each agent is scoped to a
 * subset of the content platforms ("應用範圍"). Sources aren't a
 * one-shot snapshot either — `addSources` lets an already-trained agent
 * keep absorbing more material and retrain from the merged set (same idea
 * as Delphi's "keeps evolving as you add content", CJ「Delphi.ai 請直接
 * 學習它的流程」).
 *
 * Persisted at brands.positioning._personaAgents[] — same per-brand JSON
 * pattern as _workbench. Every write here is a
 * fresh SELECT → modify → UPDATE (never a blind overwrite of a
 * client-cached `positioning` object) — training runs in the background
 * over tens of seconds, so a stale client write racing a server-side
 * progress update is a real risk, not a theoretical one.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../platform/core/trpc";
import localPool from "../../localDb";
import { invokeLLM } from "../../platform/core/llm/llm";
import { buildBrandPrefix } from "../core/brand/brandContext";
import { assertUrlSafe } from "../../platform/core/web/urlGuard";
import { getValidAccessToken, CloudNotConnectedError, type CloudProvider } from "../../platform/core/connectors/cloudTokens";
import { getCloudFileMeta, downloadCloudFile } from "../../platform/core/connectors/cloudDriveClient";
import { transcribeBuffer, TRANSCRIBE_SIZE_LIMIT_BYTES, TranscribeTooLargeError } from "../../platform/core/media/transcription";

export const PERSONA_PLATFORMS = [
  "facebook", "instagram", "youtube", "threads", "tiktok", "linkedin", "email", "press",
] as const;
export type PersonaPlatform = typeof PERSONA_PLATFORMS[number];

const PLATFORM_LABEL: Record<PersonaPlatform, string> = {
  facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", threads: "Threads",
  tiktok: "TikTok", linkedin: "LinkedIn", email: "EDM 電子報", press: "新聞稿",
};

export type PersonaAgentStatus = "training" | "ready" | "failed";

export interface PersonaAgent {
  id: string;
  name: string;
  status: PersonaAgentStatus;
  currentStep: number;
  totalSteps: number;
  lastError: string | null;
  sources: {
    texts: string[]; articleUrls: string[]; videoUrls: string[];
    cloudFiles: { provider: CloudProvider; fileId: string; name: string }[];
  };
  sourceSummary: string;
  persona: string;
  skill: string;
  scope: PersonaPlatform[];
  createdAt: string;
  createdBy: number;
  updatedAt: string;
}

const TRAIN_STEPS = 3; // 1 抓取素材 → 2 生成人設 → 3 生成 SKILL

async function loadPositioning(brandId: number, userId: number): Promise<{ pos: any; ownerUserId: number } | null> {
  const [rows]: any = await localPool.execute(
    `SELECT userId, positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
    [brandId, userId],
  );
  const row = (rows as any[])[0];
  if (!row) return null;
  let pos: any = row.positioning;
  if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { pos = {}; } }
  return { pos: pos ?? {}, ownerUserId: row.userId };
}

function getAgents(pos: any): PersonaAgent[] {
  return Array.isArray(pos._personaAgents) ? pos._personaAgents : [];
}

/** Safe read-modify-write for a single agent. `patcher` returns the next
 *  agent object (or null to delete it). Re-reads positioning fresh every
 *  call — never trusts a caller-held copy across the async gap. */
async function updateAgent(
  brandId: number, userId: number, agentId: string,
  patcher: (agent: PersonaAgent) => PersonaAgent | null,
): Promise<PersonaAgent | null> {
  const loaded = await loadPositioning(brandId, userId);
  if (!loaded) return null;
  const agents = getAgents(loaded.pos);
  const idx = agents.findIndex((a) => a.id === agentId);
  if (idx < 0) return null;
  const next = patcher(agents[idx]!);
  const nextAgents = next
    ? agents.map((a, i) => (i === idx ? next : a))
    : agents.filter((_, i) => i !== idx);
  const nextPos = { ...loaded.pos, _personaAgents: nextAgents };
  await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ? AND userId = ?`, [JSON.stringify(nextPos), brandId, userId]);
  return next;
}

async function appendAgent(brandId: number, userId: number, agent: PersonaAgent): Promise<void> {
  const loaded = await loadPositioning(brandId, userId);
  if (!loaded) throw new TRPCError({ code: "NOT_FOUND", message: "brand not found" });
  const agents = getAgents(loaded.pos);
  const nextPos = { ...loaded.pos, _personaAgents: [...agents, agent] };
  await localPool.execute(`UPDATE brands SET positioning = ? WHERE id = ? AND userId = ?`, [JSON.stringify(nextPos), brandId, userId]);
}

/** Article-link fetch — same SSRF-guarded manual-redirect + tag-strip
 *  pattern as scopeRouter.ts's disambiguate.tryFetch, capped for a
 *  grounding-material budget rather than a metadata excerpt. */
async function fetchArticleText(rawUrl: string): Promise<{ url: string; title: string; text: string } | null> {
  let url = rawUrl.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    let current = url;
    let resp: Response;
    for (let hop = 0; ; hop++) {
      await assertUrlSafe(current);
      resp = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: { "User-Agent": "Mozilla/5.0 SoWork-PersonaAgent/1.0" },
      });
      if (resp.status >= 300 && resp.status < 400 && resp.headers.get("location")) {
        if (hop >= 5) return null;
        current = new URL(resp.headers.get("location")!, current).toString();
        continue;
      }
      break;
    }
    if (!resp.ok) return null;
    const html = await resp.text();
    const pick = (re: RegExp): string => html.match(re)?.[1]?.trim() ?? "";
    const title = pick(/<title[^>]*>([^<]+)<\/title>/i) || url;
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 30) return null;
    return { url, title, text: text.slice(0, 6000) };
  } catch {
    return null;
  }
}

async function fetchVideoTranscript(rawUrl: string): Promise<{ url: string; title: string; text: string } | null> {
  try {
    const { fetchYouTubeContext } = await import("../../platform/core/web/youtubeContext");
    const ctx = await fetchYouTubeContext(rawUrl);
    if (!ctx) return null;
    const text = ctx.transcript || ctx.description || "";
    if (!text.trim()) return null;
    return { url: ctx.url, title: ctx.title ?? ctx.url, text: text.slice(0, 6000) };
  } catch {
    return null;
  }
}

/** Downloads a connected Drive/OneDrive file and runs it through real ASR
 *  (gpt-4o-mini-transcribe). `tooLarge` lets the caller give a specific
 *  "檔案過大" message instead of lumping it in with generic failures —
 *  unlike a dead link, this is an expected, actionable outcome given the
 *  ~24MB provider cap on a raw phone-recorded video. */
async function fetchCloudFileTranscript(
  userId: number, brandId: number, provider: CloudProvider, fileId: string, name: string,
): Promise<{ url: string; title: string; text: string } | null | { tooLarge: true; name: string }> {
  try {
    const accessToken = await getValidAccessToken(userId, brandId, provider);
    const meta = await getCloudFileMeta(provider, accessToken, fileId);
    if (meta.sizeBytes > TRANSCRIBE_SIZE_LIMIT_BYTES) return { tooLarge: true, name: meta.name || name };
    const buffer = await downloadCloudFile(provider, accessToken, fileId);
    const text = await transcribeBuffer(buffer, meta.name || name, meta.mimeType);
    if (!text?.trim()) return null;
    return { url: `${provider}:${fileId}`, title: meta.name || name, text: text.slice(0, 6000) };
  } catch (e) {
    if (e instanceof TranscribeTooLargeError) return { tooLarge: true, name };
    if (e instanceof CloudNotConnectedError) return null;
    return null;
  }
}

/**
 * Background training run — fired detached (never awaited by the caller).
 * Every step re-reads positioning fresh via updateAgent so a slow LLM call
 * mid-run can't clobber unrelated concurrent edits to this brand.
 */
async function runTraining(brandId: number, userId: number, agentId: string): Promise<void> {
  try {
    // Step 1 — gather sources (best-effort per link; a dead link doesn't
    // fail the whole run, it's just dropped from the grounding material).
    const started = await updateAgent(brandId, userId, agentId, (a) => ({ ...a, currentStep: 1 }));
    if (!started) return; // agent was deleted before training started
    const { texts, articleUrls, videoUrls, cloudFiles } = started.sources;

    const [articles, videos, cloudResults] = await Promise.all([
      Promise.all(articleUrls.map(fetchArticleText)),
      Promise.all(videoUrls.map(fetchVideoTranscript)),
      Promise.all((cloudFiles ?? []).map((f) => fetchCloudFileTranscript(userId, brandId, f.provider, f.fileId, f.name))),
    ]);
    const articleBlocks = articles.filter((x): x is NonNullable<typeof x> => !!x)
      .map((a, i) => `【文章素材 ${i + 1}：${a.title}】(${a.url})\n${a.text}`);
    const videoBlocks = videos.filter((x): x is NonNullable<typeof x> => !!x)
      .map((v, i) => `【影音素材 ${i + 1}：${v.title}】(${v.url})\n${v.text}`);
    const cloudOk = cloudResults.filter((x): x is { url: string; title: string; text: string } => !!x && !("tooLarge" in x));
    const cloudTooLarge = cloudResults.filter((x): x is { tooLarge: true; name: string } => !!x && "tooLarge" in x);
    const cloudBlocks = cloudOk.map((c, i) => `【雲端影音素材 ${i + 1}：${c.title}】\n${c.text}`);
    const textBlocks = texts.map((t, i) => `【文字素材 ${i + 1}】\n${t}`);
    const failedLinks = articleUrls.length - articles.filter(Boolean).length + videoUrls.length - videos.filter(Boolean).length;
    const materials = [...textBlocks, ...articleBlocks, ...videoBlocks, ...cloudBlocks].join("\n\n");
    if (!materials.trim()) {
      const sizeNote = cloudTooLarge.length ? `；${cloudTooLarge.length} 個雲端檔案過大無法轉錄（上限約 24MB，建議先壓縮或轉純音檔）` : "";
      await updateAgent(brandId, userId, agentId, (a) => ({
        ...a, status: "failed", lastError: `沒有可用的素材——文字為空，且所有連結/檔案都抓取失敗（文章連結需可公開讀取；YouTube 連結需有字幕；雲端檔案需先連接帳號且在大小上限內）${sizeNote}。`,
        updatedAt: new Date().toISOString(),
      }));
      return;
    }

    // Step 2+3 — one LLM call producing BOTH 人設 (persona narrative) and
    // SKILL (checkable writing rules), combined ≥2200 chars. Single call
    // (not two) because the skill section needs to reference concrete
    // details already established in the persona section (name, habits) —
    // splitting into two calls risks them describing two different people.
    await updateAgent(brandId, userId, agentId, (a) => ({ ...a, currentStep: 2 }));
    const brandPrefix = await buildBrandPrefix(brandId).catch(() => "");
    const sys = `你是人設訓練師，繁體中文。任務：根據下方使用者提供的真實素材（這個人實際說過/寫過的話），為「${started.name}」建立一個可被其他 LLM 扮演的完整人設，讓後續產出的文案讀起來就是這個人在寫。

【重要】人設與 SKILL 必須緊扣素材中真實出現的內容——用詞習慣、句子節奏、觀點立場、反覆出現的比喻或口頭禪——不可套用空泛形容詞（溫暖/專業/親切）帶過。素材沒提到的細節可以合理延伸，但語氣核心必須有素材佐證。

輸出 JSON：
{
  "persona": "≥1200 字的完整人設敘事：這個人是誰、背景與資歷、性格與價值觀、說話習慣（含至少 2-3 個從素材中觀察到的具體口頭禪/句型/立場）、對讀者的態度、寫作時最在意的事。",
  "skill": "≥1000 字的具體可執行寫作規則：句子長度與節奏、開場方式、標點與 emoji 習慣、常用/避免的詞彙、觀點表達方式、結尾收束方式——每一條都要能被逐字檢查是否遵守，不要寫抽象形容詞。"
}
persona 與 skill 合計不可少於 2200 字。直接輸出 JSON，第一字元就是 {。
${brandPrefix}`;
    const r = await Promise.race([
      invokeLLM({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: materials.slice(0, 40_000) },
        ],
        maxTokens: 4000,
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), 90_000)),
    ]);
    const raw = r.choices[0]?.message?.content;
    const text = typeof raw === "string" ? raw : "";
    try {
      const inTok = r.usage?.prompt_tokens ?? 0;
      const outTok = r.usage?.completion_tokens ?? 0;
      await localPool.execute(
        `INSERT INTO usage_log (userId, entityKind, entityId, kind, model, inputTokens, outputTokens, costUsd)
              VALUES (?, 'brand', ?, 'persona_agent_train', ?, ?, ?, ?)`,
        [userId, brandId, r.model || "anthropic/claude-sonnet-5", inTok, outTok, (inTok * 1.0 + outTok * 5.0) / 1_000_000],
      );
    } catch { /* non-fatal */ }

    await updateAgent(brandId, userId, agentId, (a) => ({ ...a, currentStep: 3 }));
    const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonText = m ? m[1]!.trim() : text.trim();
    let parsed: any = null;
    try { parsed = JSON.parse(jsonText); } catch {
      const s = jsonText.indexOf("{");
      if (s >= 0) { try { parsed = JSON.parse(jsonText.slice(s)); } catch {} }
    }
    const persona = String(parsed?.persona ?? "").trim();
    const skill = String(parsed?.skill ?? "").trim();
    if (!persona || !skill || persona.length + skill.length < 800) {
      await updateAgent(brandId, userId, agentId, (a) => ({
        ...a, status: "failed", lastError: "生成結果解析失敗或內容過短，請再試一次",
        updatedAt: new Date().toISOString(),
      }));
      return;
    }
    const sourceSummary = [
      texts.length ? `${texts.length} 段文字` : null,
      articles.filter(Boolean).length ? `${articles.filter(Boolean).length} 篇文章` : null,
      videos.filter(Boolean).length ? `${videos.filter(Boolean).length} 段影音逐字稿` : null,
      cloudOk.length ? `${cloudOk.length} 個雲端檔案語音轉文字` : null,
      failedLinks > 0 ? `${failedLinks} 個連結抓取失敗（已略過）` : null,
      cloudTooLarge.length ? `${cloudTooLarge.length} 個雲端檔案過大略過` : null,
    ].filter(Boolean).join("、");
    await updateAgent(brandId, userId, agentId, (a) => ({
      ...a,
      status: "ready", currentStep: TRAIN_STEPS, lastError: null,
      persona, skill, sourceSummary,
      updatedAt: new Date().toISOString(),
    }));
  } catch (e: any) {
    await updateAgent(brandId, userId, agentId, (a) => ({
      ...a, status: "failed", lastError: String(e?.message ?? e).slice(0, 300),
      updatedAt: new Date().toISOString(),
    })).catch(() => {});
  }
}

const sourcesSchema = z.object({
  texts: z.array(z.string().min(5).max(20_000)).max(10).default([]),
  articleUrls: z.array(z.string().min(3).max(2000)).max(10).default([]),
  videoUrls: z.array(z.string().min(3).max(2000)).max(10).default([]),
  cloudFiles: z.array(z.object({
    provider: z.enum(["google_drive", "onedrive"]),
    fileId: z.string().min(1).max(500),
    name: z.string().max(300),
  })).max(10).default([]),
});

export const personaAgentRouter = router({
  list: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const loaded = await loadPositioning(input.brandId, ctx.user!.id);
      if (!loaded) return [] as PersonaAgent[];
      return getAgents(loaded.pos);
    }),

  create: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      name: z.string().min(1).max(40),
      sources: sourcesSchema,
      scope: z.array(z.enum(PERSONA_PLATFORMS)).max(8).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const hasSource = input.sources.texts.length > 0 || input.sources.articleUrls.length > 0
        || input.sources.videoUrls.length > 0 || input.sources.cloudFiles.length > 0;
      if (!hasSource) return { ok: false as const, error: "請至少提供一段文字、一個文章連結、一個影音連結，或一個雲端檔案" };
      const now = new Date().toISOString();
      const agent: PersonaAgent = {
        id: `pa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        name: input.name.trim(),
        status: "training",
        currentStep: 0,
        totalSteps: TRAIN_STEPS,
        lastError: null,
        sources: input.sources,
        sourceSummary: "",
        persona: "",
        skill: "",
        scope: input.scope,
        createdAt: now,
        createdBy: userId,
        updatedAt: now,
      };
      await appendAgent(input.brandId, userId, agent);
      // Fire-and-forget — client polls `list` for progress.
      setImmediate(() => { runTraining(input.brandId, userId, agent.id).catch(() => {}); });
      return { ok: true as const, id: agent.id };
    }),

  update: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      id: z.string().min(1),
      name: z.string().min(1).max(40).optional(),
      scope: z.array(z.enum(PERSONA_PLATFORMS)).max(8).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const next = await updateAgent(input.brandId, ctx.user!.id, input.id, (a) => ({
        ...a,
        name: input.name !== undefined ? input.name.trim() : a.name,
        scope: input.scope !== undefined ? input.scope : a.scope,
        updatedAt: new Date().toISOString(),
      }));
      if (!next) return { ok: false as const, error: "找不到這個人設 Agent" };
      return { ok: true as const, agent: next };
    }),

  remove: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await updateAgent(input.brandId, ctx.user!.id, input.id, () => null);
      return { ok: true as const };
    }),

  retrain: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const next = await updateAgent(input.brandId, userId, input.id, (a) => ({
        ...a, status: "training", currentStep: 0, lastError: null, updatedAt: new Date().toISOString(),
      }));
      if (!next) return { ok: false as const, error: "找不到這個人設 Agent" };
      setImmediate(() => { runTraining(input.brandId, userId, input.id).catch(() => {}); });
      return { ok: true as const };
    }),

  /** 加入更多素材 — a trained agent isn't a one-shot snapshot; the user can
   *  keep feeding it more of the same person's material over time and
   *  retrain from the merged set, same idea as Delphi's "keeps evolving as
   *  you add content" (2026-08-21, CJ「Delphi.ai 請直接學習它的流程」). New
   *  sources are appended, not replaced — dedupes cloud files by
   *  provider+fileId so re-adding the same picked file is a no-op. */
  addSources: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive(), id: z.string().min(1), sources: sourcesSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const hasNew = input.sources.texts.length > 0 || input.sources.articleUrls.length > 0
        || input.sources.videoUrls.length > 0 || input.sources.cloudFiles.length > 0;
      if (!hasNew) return { ok: false as const, error: "請至少提供一筆新素材" };
      const next = await updateAgent(input.brandId, userId, input.id, (a) => {
        const existingCloud = new Set(a.sources.cloudFiles.map((c) => `${c.provider}:${c.fileId}`));
        return {
          ...a,
          sources: {
            texts: [...a.sources.texts, ...input.sources.texts],
            articleUrls: [...a.sources.articleUrls, ...input.sources.articleUrls],
            videoUrls: [...a.sources.videoUrls, ...input.sources.videoUrls],
            cloudFiles: [
              ...a.sources.cloudFiles,
              ...input.sources.cloudFiles.filter((c) => !existingCloud.has(`${c.provider}:${c.fileId}`)),
            ],
          },
          status: "training", currentStep: 0, lastError: null, updatedAt: new Date().toISOString(),
        };
      });
      if (!next) return { ok: false as const, error: "找不到這個人設 Agent" };
      setImmediate(() => { runTraining(input.brandId, userId, input.id).catch(() => {}); });
      return { ok: true as const };
    }),

  /** 試寫 — one-off sample draft using this agent's persona+skill as the
   *  voice, for a chosen platform. Not persisted — ephemeral preview so the
   *  user can judge the trained voice before relying on it, and copy the
   *  result out to use directly. */
  testDraft: protectedProcedure
    .input(z.object({
      brandId: z.number().int().positive(),
      id: z.string().min(1),
      platform: z.enum(PERSONA_PLATFORMS),
      topic: z.string().min(1).max(300),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const loaded = await loadPositioning(input.brandId, userId);
      if (!loaded) return { ok: false as const, error: "brand not found" };
      const agent = getAgents(loaded.pos).find((a) => a.id === input.id);
      if (!agent) return { ok: false as const, error: "找不到這個人設 Agent" };
      if (agent.status !== "ready") return { ok: false as const, error: "這個人設還沒訓練完成" };

      const label = PLATFORM_LABEL[input.platform];
      const brandPrefix = await buildBrandPrefix(input.brandId).catch(() => "");
      const sys = `你現在就是「${agent.name}」本人，用這個人設的第一人稱語氣寫作，繁體中文。

【人設】\n${agent.persona}

【寫作規則 — 逐字遵守】\n${agent.skill}

任務：用這個人設的語氣，為 ${label} 平台寫一篇貼文。只輸出貼文正文，不要加說明或標題。
${brandPrefix}`;
      try {
        const r = await Promise.race([
          invokeLLM({
            messages: [
              { role: "system", content: sys },
              { role: "user", content: input.topic },
            ],
            maxTokens: 1200,
          }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), 30_000)),
        ]);
        const raw = r.choices[0]?.message?.content;
        const draft = (typeof raw === "string" ? raw : "").trim();
        try {
          const inTok = r.usage?.prompt_tokens ?? 0;
          const outTok = r.usage?.completion_tokens ?? 0;
          await localPool.execute(
            `INSERT INTO usage_log (userId, entityKind, entityId, kind, model, inputTokens, outputTokens, costUsd)
                  VALUES (?, 'brand', ?, ?, ?, ?, ?, ?)`,
            [userId, input.brandId, `persona_agent_draft:${input.platform}`, r.model || "anthropic/claude-sonnet-5", inTok, outTok,
             (inTok * 1.0 + outTok * 5.0) / 1_000_000],
          );
        } catch { /* non-fatal */ }
        if (!draft) return { ok: false as const, error: "產出失敗，請再試一次" };
        return { ok: true as const, draft };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message ?? e) };
      }
    }),
});
