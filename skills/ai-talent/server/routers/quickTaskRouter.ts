/**
 * quickTaskRouter — 30 秒產出 · 多 agent 並行調度
 *
 * 每個 task 拆成 1–3 個 agent，client 對每個 agent 各打一發 mutation，
 * 看著三個視窗從 queued → working → delivered 串流回來。
 *
 * 三招：
 *   1. fan-out：同一 task 多 model 並行（IG hook / tagline / rewrite-copy）
 *   2. brandId？→ 注入 brand_brain 為 system prefix（"你正在為 {brand} 工作…"）
 *   3. 結構化：部分 task 回 JSON（color-palette / swot / persona）讓前端渲染
 *
 * 篩選原則：必須能在 30 秒內交付。剔除 competitor-diff / campaign-idea /
 * social-listening-prompt（皆 30s+），新增 color-palette。
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { callModel, type ModelProvider } from "../_core/multiModelRouter";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

type FieldDef = {
  key: string;
  label: string;
  kind: "text" | "longtext" | "url" | "select" | "number";
  placeholder?: string;
  options?: string[];
  required?: boolean;
  default?: string | number;
};

type AgentDef = {
  id: string;            // unique within task, e.g. "煽動派"
  name: string;          // 顯示名
  role: string;          // 一句角色描述
  provider: ModelProvider;
  system: string;
  /** Plain-text user template. {{var}} fills from inputs. */
  userTemplate: string;
};

type TaskDef = {
  id: string;
  label: string;
  /** 30 秒承諾：每個 task 都要 < 30s。寫實際估計給前端顯示。 */
  etaSeconds: number;
  /** 結構化渲染類型：客端依此決定怎麼畫。 */
  outputKind:
    | "text"
    | "chips"
    | "swot"
    | "persona-card"
    | "swatches"
    | "name-cards"
    | "compare-2col"
    | "rewrite-3col";
  fields: FieldDef[];
  agents: AgentDef[];
};

/* ──────────────────────────── TASK CATALOG ─────────────────────────────── */

const TASKS: Record<string, TaskDef> = {
  /* ── 1. IG Hook · 三派並行 ─────────────────────────────────────────── */
  "ig-hooks": {
    id: "ig-hooks",
    label: "IG Hook",
    etaSeconds: 12,
    outputKind: "rewrite-3col",
    fields: [
      { key: "material", label: "素材", kind: "longtext", required: true,
        placeholder: "貼一段文章、產品描述或活動主題…" },
    ],
    agents: [
      {
        id: "煽動派", name: "煽動派 · Hook 手", role: "止滑為王，情緒拉滿",
        provider: "openai",
        system: "你是 IG 煽動派 hook 手，用情緒、衝突、好奇心讓人停下手指。輸出 5 個編號 hook，每個不超過 30 字。只給 hook，不解釋。",
        userTemplate: "素材：\n{{material}}",
      },
      {
        id: "文青派", name: "文青派 · 詩意手", role: "畫面感、留白、詩感",
        provider: "google",
        system: "你是 IG 文青派 hook 手，重畫面感、留白、詩感。輸出 5 個編號 hook，每個不超過 30 字。只給 hook，不解釋。",
        userTemplate: "素材：\n{{material}}",
      },
      {
        id: "犀利派", name: "犀利派 · 反骨手", role: "反共識、嗆問句、找痛點",
        provider: "cohere",
        system: "你是 IG 犀利派 hook 手，敢嗆、敢反共識、用問句戳痛點。輸出 5 個編號 hook，每個不超過 30 字。只給 hook，不解釋。",
        userTemplate: "素材：\n{{material}}",
      },
    ],
  },

  /* ── 2. Tagline · 三派並行 ─────────────────────────────────────────── */
  "tagline": {
    id: "tagline",
    label: "Tagline / Slogan",
    etaSeconds: 10,
    outputKind: "rewrite-3col",
    fields: [
      { key: "brand", label: "品牌名", kind: "text", required: true },
      { key: "spirit", label: "品牌精神", kind: "longtext", required: true,
        placeholder: "想傳達的價值、性格、世界觀…" },
    ],
    agents: [
      {
        id: "感性", name: "感性派", role: "情緒、詩意、可記住",
        provider: "qwen",
        system: "你是品牌標語大師感性派。輸出 5 個中文 tagline，每個不超過 12 字，純列表編號。",
        userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
      },
      {
        id: "理性", name: "理性派", role: "明確利益、能背、能跑廣告",
        provider: "openai",
        system: "你是品牌標語大師理性派。輸出 5 個中文 tagline，每個不超過 12 字，要點出實用利益，純列表編號。",
        userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
      },
      {
        id: "雙關", name: "雙關派", role: "玩字、諧音、令人會心一笑",
        provider: "google",
        system: "你是品牌標語大師雙關派，擅長中文諧音、玩字、留尾韻。輸出 5 個 tagline，每個不超過 12 字，純列表編號。",
        userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
      },
    ],
  },

  /* ── 3. 改寫文案 · 三策略並行 ──────────────────────────────────────── */
  "rewrite-copy": {
    id: "rewrite-copy",
    label: "改寫文案",
    etaSeconds: 14,
    outputKind: "rewrite-3col",
    fields: [
      { key: "material", label: "原文案", kind: "longtext", required: true },
      { key: "audience", label: "目標讀者", kind: "text", placeholder: "例：30-40 歲新手媽媽" },
    ],
    agents: [
      {
        id: "訴諸恐懼", name: "恐懼派", role: "點出失去什麼、不做會怎樣",
        provider: "openai",
        system: "你是廣告文案高手，擅長用恐懼訴求改寫。給 1 個改寫版本，先 1 行版本，再 1 行 30 字內策略註解。",
        userTemplate: "原文案：\n{{material}}\n讀者：{{audience}}",
      },
      {
        id: "用反差", name: "反差派", role: "對比落差、出乎意料",
        provider: "google",
        system: "你是廣告文案高手，擅長用反差/對比改寫。給 1 個改寫版本，先 1 行版本，再 1 行 30 字內策略註解。",
        userTemplate: "原文案：\n{{material}}\n讀者：{{audience}}",
      },
      {
        id: "用具體數字", name: "數字派", role: "用具體數據建立可信度",
        provider: "cohere",
        system: "你是廣告文案高手，擅長用具體數字/百分比改寫。給 1 個改寫版本，先 1 行版本，再 1 行 30 字內策略註解。",
        userTemplate: "原文案：\n{{material}}\n讀者：{{audience}}",
      },
    ],
  },

  /* ── 4. LinkedIn 摘要 · 單 agent ───────────────────────────────────── */
  "linkedin-summary": {
    id: "linkedin-summary",
    label: "LinkedIn 摘要",
    etaSeconds: 12,
    outputKind: "text",
    fields: [
      { key: "material", label: "原文 / 內容", kind: "longtext", required: true,
        placeholder: "貼上一段研究、產業文章或會議紀錄…" },
    ],
    agents: [
      {
        id: "B2B 編輯", name: "B2B 編輯", role: "把長文濃縮成有觀點的 3 句話",
        provider: "openai",
        system: "你是 B2B 行銷編輯，擅長濃縮成有觀點的 LinkedIn 摘要。輸出 3 句中文，第 3 句要帶觀點或 CTA。只給文字。",
        userTemplate: "內容：\n{{material}}",
      },
    ],
  },

  /* ── 5. SWOT · 結構化 2x2 ─────────────────────────────────────────── */
  "swot": {
    id: "swot",
    label: "SWOT 分析",
    etaSeconds: 18,
    outputKind: "swot",
    fields: [
      { key: "material", label: "品牌 / 產品 / 情境", kind: "longtext", required: true },
    ],
    agents: [
      {
        id: "策略顧問", name: "策略顧問", role: "4 象限拆解 + 一段策略建議",
        provider: "google",
        system: `你是品牌策略顧問。輸出嚴格 JSON（不要 markdown 圍欄不要解釋）：
{
  "strengths": ["…", "…", "…"],
  "weaknesses": ["…", "…", "…"],
  "opportunities": ["…", "…", "…"],
  "threats": ["…", "…", "…"],
  "advice": "80 字內中文策略建議"
}`,
        userTemplate: "對象：\n{{material}}",
      },
    ],
  },

  /* ── 6. Persona 名片 · 結構化 ─────────────────────────────────────── */
  "audience-persona": {
    id: "audience-persona",
    label: "受眾 Persona",
    etaSeconds: 16,
    outputKind: "persona-card",
    fields: [
      { key: "material", label: "產品 / 服務", kind: "longtext", required: true },
    ],
    agents: [
      {
        id: "用戶研究員", name: "用戶研究員", role: "從產品快速產出 persona 名片",
        provider: "openai",
        system: `你是用戶研究員。輸出嚴格 JSON（不要 markdown 圍欄不要解釋）：
{
  "name": "中文姓名",
  "tagline": "一句話概括這個人",
  "demographics": { "age": "32", "occupation": "…", "location": "…", "income": "…" },
  "values": ["…", "…", "…"],
  "painPoints": ["…", "…", "…"],
  "platforms": ["IG", "…", "…"],
  "hookLine": "一句話 — 我能怎麼打動他"
}`,
        userTemplate: "產品 / 服務：\n{{material}}",
      },
    ],
  },

  /* ── 7. 命名 · 雙派 ────────────────────────────────────────────────── */
  "name-it": {
    id: "name-it",
    label: "命名",
    etaSeconds: 14,
    outputKind: "name-cards",
    fields: [
      { key: "material", label: "對象描述", kind: "longtext", required: true },
      { key: "style", label: "風格", kind: "select",
        options: ["科技感", "文青", "家庭親切", "高端奢華", "玩味諧音"], default: "文青" },
    ],
    agents: [
      {
        id: "中文派", name: "中文派", role: "純中文、有文化底蘊",
        provider: "qwen",
        system: `你是中文命名顧問。輸出嚴格 JSON 陣列（不要 markdown 圍欄）：
[{"chinese":"…","english":"…","meaning":"一句話寓意"}, …]
共 5 個。`,
        userTemplate: "對象：\n{{material}}\n風格：{{style}}",
      },
      {
        id: "雙語派", name: "雙語派", role: "中英並行、好記好搜",
        provider: "openai",
        system: `你是雙語命名顧問。輸出嚴格 JSON 陣列（不要 markdown 圍欄）：
[{"chinese":"…","english":"…","meaning":"一句話寓意"}, …]
共 5 個，english 須好記好搜。`,
        userTemplate: "對象：\n{{material}}\n風格：{{style}}",
      },
    ],
  },

  /* ── 8. 在地化翻譯 · 雙版對照 ──────────────────────────────────────── */
  "translate-localize": {
    id: "translate-localize",
    label: "在地化翻譯",
    etaSeconds: 14,
    outputKind: "compare-2col",
    fields: [
      { key: "material", label: "原文", kind: "longtext", required: true },
      { key: "from", label: "原文語言", kind: "text", default: "英文" },
      { key: "to", label: "翻譯目標", kind: "text", default: "繁體中文（台灣）" },
    ],
    agents: [
      {
        id: "直譯", name: "直譯派", role: "保留原意、不動用詞",
        provider: "google",
        system: "你是專業翻譯，做忠實直譯。輸出 1 段譯文，不要解釋。",
        userTemplate: "從 {{from}} 翻成 {{to}}：\n{{material}}",
      },
      {
        id: "在地化", name: "在地化派", role: "在地語感、轉文化",
        provider: "qwen",
        system: "你是在地化文案高手。輸出 1 段在地化譯文，**最後一行**用括號加一句 30 字內中文註解：你做了什麼在地化動作。",
        userTemplate: "從 {{from}} 翻成 {{to}}：\n{{material}}",
      },
    ],
  },

  /* ── 9. Hero 圖 prompt · 單 agent ──────────────────────────────────── */
  "hero-image-prompt": {
    id: "hero-image-prompt",
    label: "Hero 圖 Prompt",
    etaSeconds: 12,
    outputKind: "text",
    fields: [
      { key: "material", label: "產品 / 場景描述", kind: "longtext", required: true },
      { key: "style", label: "風格偏好", kind: "select",
        options: ["極簡攝影", "電影感", "復古插畫", "賽博龐克", "日系雜誌"], default: "電影感" },
    ],
    agents: [
      {
        id: "Prompt 工程師", name: "Prompt 工程師", role: "生 3 個英文 Midjourney prompt",
        provider: "openai",
        system: "你是 Midjourney prompt 工程師。輸出 3 個版本，每個含 prompt / camera / lighting 三行，標明版本編號。英文。",
        userTemplate: "產品/場景：{{material}}\n風格偏好：{{style}}",
      },
    ],
  },

  /* ── 10. 色票生成 · 結構化視覺 ─────────────────────────────────────── */
  "color-palette": {
    id: "color-palette",
    label: "品牌色票",
    etaSeconds: 9,
    outputKind: "swatches",
    fields: [
      { key: "brand", label: "品牌名", kind: "text", required: true },
      { key: "spirit", label: "品牌精神", kind: "longtext", required: true,
        placeholder: "想傳達的氣質、產業類別…" },
    ],
    agents: [
      {
        id: "色彩策略師", name: "色彩策略師", role: "5 色品牌色票 + 用法",
        provider: "google",
        system: `你是品牌色彩策略師。輸出嚴格 JSON 陣列（不要 markdown 圍欄）：
[{"hex":"#A12B3C","name":"…","role":"primary|secondary|accent|neutral|highlight","usage":"一句話用法建議"}, …]
共 5 色，第一色為 primary。`,
        userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
      },
    ],
  },
};

/* ──────────────────────────── HELPERS ──────────────────────────────────── */

function fillTemplate(tpl: string, inputs: Record<string, string | number | undefined>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = inputs[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

/** 從 brand_brain 抓品牌記憶 → 拼成 system prefix。失敗回空字串。 */
async function buildBrandContext(brandId: number | undefined): Promise<string> {
  if (!brandId) return "";
  const db = await getDb();
  if (!db) return "";
  try {
    const [rows] = await db.execute(
      sql`
        SELECT category, title, content
        FROM brand_brain
        WHERE brand_id = ${brandId}
        ORDER BY category, updated_at DESC
        LIMIT 24
      `
    ) as any;
    if (!rows?.length) return "";
    const lines = (rows as any[]).map((r) => `- [${r.category}] ${r.title}：${r.content}`);
    return `\n\n你正在為品牌服務，這是品牌大腦中的關鍵記憶（請在輸出中體現品牌個性）：\n${lines.join("\n")}\n`;
  } catch {
    return "";
  }
}

/** 嘗試解析 JSON。先剝掉 ```json``` 圍欄。失敗回 null。 */
function tryParseJson(s: string): any | null {
  if (!s) return null;
  let t = s.trim();
  // strip code fences
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  // find first { or [
  const start = t.search(/[{\[]/);
  if (start > 0) t = t.slice(start);
  const lastBrace = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (lastBrace >= 0) t = t.slice(0, lastBrace + 1);
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/* ──────────────────────────── ROUTER ───────────────────────────────────── */

export const quickTaskRouter = router({
  /** Catalog — client renders menu and per-task agent rail. */
  list: protectedProcedure.query(() => {
    return Object.values(TASKS).map((t) => ({
      id: t.id,
      label: t.label,
      etaSeconds: t.etaSeconds,
      outputKind: t.outputKind,
      fields: t.fields,
      agents: t.agents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        provider: a.provider,
      })),
    }));
  }),

  /**
   * 跑單一 agent。client 對每個 agent 各打一發 → 看著三個視窗依序回來。
   * 結構化 task 會多回 structured 欄位（已 parse 過的 JSON）。
   */
  runAgent: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        agentId: z.string(),
        inputs: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
        brandId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const def = TASKS[input.taskId];
      if (!def) throw new Error(`Unknown taskId: ${input.taskId}`);
      const agent = def.agents.find((a) => a.id === input.agentId);
      if (!agent) throw new Error(`Unknown agentId: ${input.agentId} in task ${input.taskId}`);

      const brandPrefix = await buildBrandContext(input.brandId);
      const filled = fillTemplate(agent.userTemplate, input.inputs ?? {});
      const messages = [
        { role: "system" as const, content: agent.system + brandPrefix },
        { role: "user" as const, content: filled },
      ];

      const startedAt = Date.now();
      const result = await callModel(messages, undefined, agent.provider);
      const tookMs = Date.now() - startedAt;

      const isStructured =
        def.outputKind === "swot" ||
        def.outputKind === "persona-card" ||
        def.outputKind === "swatches" ||
        def.outputKind === "name-cards";

      return {
        taskId: def.id,
        agentId: agent.id,
        agentName: agent.name,
        agentRole: agent.role,
        output: result.content,
        structured: isStructured ? tryParseJson(result.content) : null,
        provider: result.provider,
        model: result.model,
        tookMs,
        brandInjected: brandPrefix.length > 0,
      };
    }),

  /**
   * 自由輸入路由：用戶在大對話框打字 → 用最便宜 model 分類 → 回 (taskId, prefilled).
   * 失敗或低信心 → 回 null，前端 fallback 到 tile 選單。
   */
  route: protectedProcedure
    .input(z.object({ text: z.string().min(2) }))
    .mutation(async ({ input }) => {
      const catalog = Object.values(TASKS).map((t) => {
        const fieldKeys = t.fields.map((f) => f.key).join(",");
        return `- ${t.id}（${t.label}）needs: [${fieldKeys}]`;
      }).join("\n");

      const system = `你是路由器。從以下任務清單挑出最匹配用戶意圖的一個 taskId，並從用戶輸入中抽出對應欄位值。

任務清單：
${catalog}

輸出嚴格 JSON（不要 markdown 圍欄）：
{"taskId": "…", "inputs": {"key1": "value1", …}, "confidence": 0.0-1.0}

如果用戶輸入跟所有任務都不匹配，回 {"taskId": null, "confidence": 0}。`;

      try {
        const r = await callModel(
          [
            { role: "system", content: system },
            { role: "user", content: input.text },
          ],
          undefined,
          "google"
        );
        const parsed = tryParseJson(r.content);
        if (!parsed || !parsed.taskId || !TASKS[parsed.taskId]) {
          return { taskId: null as string | null, inputs: {}, confidence: 0 };
        }
        return {
          taskId: parsed.taskId as string,
          inputs: (parsed.inputs ?? {}) as Record<string, string>,
          confidence: Number(parsed.confidence ?? 0.5),
        };
      } catch {
        return { taskId: null as string | null, inputs: {}, confidence: 0 };
      }
    }),
});
