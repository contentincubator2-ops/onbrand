/**
 * quickTaskRouter — single-shot Canva-Magic-style AI tasks.
 *
 * Each task is a pre-written prompt template. Client passes
 * `taskId` + `inputs` (a key→value map matching the template's
 * placeholders). Server fills the prompt, calls callModel, returns
 * structured output.
 *
 * No mission, no squad, no workflow — 30-second utility tools.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { callModel, type ModelProvider } from "../_core/multiModelRouter";

type TaskDef = {
  id: string;
  label: string;
  /** Markdown system prompt — sets persona / output format. */
  system: string;
  /** Plain-text user template. {{var}} placeholders fill from inputs. */
  userTemplate: string;
  /** Field schema — pure metadata for client form generation. */
  fields: Array<{
    key: string;
    label: string;
    kind: "text" | "longtext" | "url" | "select" | "number";
    placeholder?: string;
    options?: string[];
    required?: boolean;
    default?: string | number;
  }>;
  preferredProvider?: ModelProvider;
};

const TASKS: Record<string, TaskDef> = {
  "ig-hooks": {
    id: "ig-hooks",
    label: "生 IG Hook",
    system:
      "你是熟悉繁體中文社群文化的 IG 行銷專家。你寫的 hook 短、有畫面、能止滑。輸出純列表，不要解釋。",
    userTemplate: `請依下列素材，生成 {{count}} 個 Instagram 貼文 hook。
語氣：{{tone}}
素材：
{{material}}

格式：每個 hook 一行，前面加編號 ①②③...，每行不超過 30 字。`,
    fields: [
      { key: "material", label: "文章 / 素材", kind: "longtext", placeholder: "貼一篇文章、產品描述或活動主題…", required: true },
      { key: "tone", label: "語氣", kind: "select", options: ["幽默", "專業", "煽動", "溫暖", "犀利"], default: "煽動" },
      { key: "count", label: "數量", kind: "number", default: 5 },
    ],
    preferredProvider: "openai",
  },

  "linkedin-summary": {
    id: "linkedin-summary",
    label: "LinkedIn 摘要",
    system:
      "你是 B2B 行銷專家，擅長把長文濃縮成有觀點的 LinkedIn 短摘要。輸出只給文字，不加解釋。",
    userTemplate: `把下面這段內容濃縮成 3 句適合 LinkedIn 的中文摘要，第 3 句要帶觀點或行動呼籲。

內容：
{{material}}`,
    fields: [
      { key: "material", label: "原文 / PDF 內容", kind: "longtext", placeholder: "貼上一段研究報告、產業文章或會議紀錄…", required: true },
    ],
  },

  "rewrite-copy": {
    id: "rewrite-copy",
    label: "改寫文案",
    system:
      "你是廣告文案高手，擅長把平庸文案改成有張力的版本。輸出 3 個改寫版本，標明各自的策略。",
    userTemplate: `原文案：
{{material}}

目標讀者：{{audience}}
想要達成的效果：{{goal}}

請給我 3 個改寫版本，每版前面標註它的策略名（例如：訴諸恐懼／用反差／用具體數字）。`,
    fields: [
      { key: "material", label: "原文案", kind: "longtext", required: true },
      { key: "audience", label: "目標讀者", kind: "text", placeholder: "例：30-40 歲新手媽媽" },
      { key: "goal", label: "想達成的效果", kind: "text", placeholder: "例：提高點擊率、降低退訂" },
    ],
  },

  "competitor-diff": {
    id: "competitor-diff",
    label: "競品差異化",
    system:
      "你是品牌定位顧問，擅長一頁式競品差異化分析。輸出結構化 markdown，不要冗長。",
    userTemplate: `我的品牌：{{myBrand}}
競品：{{competitor}}
產品類別：{{category}}

請輸出：
## 競品定位
（一句話）
## 我的可能差異化（3 個方向）
1. ...
2. ...
3. ...
## 我建議的差異化主張
（一句話 + 3 句佐證）`,
    fields: [
      { key: "myBrand", label: "我的品牌", kind: "text", required: true },
      { key: "competitor", label: "競品（名字或官網）", kind: "text", required: true },
      { key: "category", label: "產品類別", kind: "text", placeholder: "例：精品咖啡、SaaS 工具" },
    ],
  },

  "hero-image-prompt": {
    id: "hero-image-prompt",
    label: "Hero 圖 Prompt",
    system:
      "你是 AI 圖像 prompt 工程師，擅長把產品描述轉成 Midjourney / DALL·E 高品質 prompt。輸出 3 個風格各異的版本，每個含主提示 + 風格描述 + 鏡頭設定。",
    userTemplate: `產品 / 場景：
{{material}}

風格偏好：{{style}}

輸出 3 個英文 prompt，格式：
**版本 1 · {style}**
prompt：...
camera：...
lighting：...

**版本 2 · ...** ...`,
    fields: [
      { key: "material", label: "產品 / 場景描述", kind: "longtext", required: true },
      { key: "style", label: "風格偏好", kind: "select", options: ["極簡攝影", "電影感", "復古插畫", "賽博龐克", "日系雜誌"], default: "電影感" },
    ],
    preferredProvider: "openai",
  },

  "audience-persona": {
    id: "audience-persona",
    label: "受眾 Persona",
    system:
      "你是用戶研究員，擅長從產品描述快速產出 persona。輸出 markdown，含人口屬性、價值觀、痛點、媒體習慣。",
    userTemplate: `產品 / 服務：
{{material}}

請產出 1 個典型用戶 persona：
## 姓名 + 一句話 tagline
## 人口屬性 (年齡/職業/地點/收入)
## 心理屬性 (價值觀/興趣/恐懼)
## 痛點 (3 個)
## 平台習慣 (常用 3 個)
## 我能怎麼打動他 (一句話)`,
    fields: [
      { key: "material", label: "產品 / 服務", kind: "longtext", required: true },
    ],
  },

  "tagline": {
    id: "tagline",
    label: "Slogan / Tagline",
    system: "你是品牌標語大師，擅長簡短有力的 slogan。輸出純列表。",
    userTemplate: `品牌：{{brand}}
品牌精神：{{spirit}}

請給 8 個中文 tagline，每個不超過 15 字，前 4 個感性、後 4 個理性。`,
    fields: [
      { key: "brand", label: "品牌名", kind: "text", required: true },
      { key: "spirit", label: "品牌精神 / 想傳達的", kind: "longtext", required: true },
    ],
  },

  "swot": {
    id: "swot",
    label: "SWOT 分析",
    system: "你是品牌策略顧問，擅長快速 SWOT。輸出 4 象限 markdown table。",
    userTemplate: `對象：{{material}}

請輸出 SWOT，每象限 3 點，最後加 1 段 80 字內的策略建議。`,
    fields: [
      { key: "material", label: "品牌 / 產品 / 情境", kind: "longtext", required: true },
    ],
  },

  "campaign-idea": {
    id: "campaign-idea",
    label: "活動企劃 (3 案)",
    system:
      "你是創意總監，擅長把模糊 brief 轉成 3 個對比鮮明的 campaign 提案。每案結構：核心概念、執行重點、預期效益、風險。",
    userTemplate: `Brief：
{{material}}

預算等級：{{budget}}

請給 3 個對比鮮明的 campaign 提案，主題分別走「保守安全」/「中等創意」/「大膽 PR 戰」。`,
    fields: [
      { key: "material", label: "Brief", kind: "longtext", required: true },
      { key: "budget", label: "預算等級", kind: "select", options: ["小 (< 30 萬)", "中 (30-200 萬)", "大 (> 200 萬)"], default: "中 (30-200 萬)" },
    ],
  },

  "translate-localize": {
    id: "translate-localize",
    label: "在地化翻譯",
    system:
      "你是文案翻譯，擅長在地化（不只是翻字、要轉文化）。輸出含原意保留說明。",
    userTemplate: `原文 ({{from}})：
{{material}}

請翻成 {{to}}，並另外給「直譯版」與「在地化版」兩種。在地化版要解釋你動了什麼。`,
    fields: [
      { key: "material", label: "原文", kind: "longtext", required: true },
      { key: "from", label: "原文語言", kind: "text", default: "英文" },
      { key: "to", label: "翻譯目標", kind: "text", default: "繁體中文（台灣）" },
    ],
  },

  "name-it": {
    id: "name-it",
    label: "命名 (品牌/產品)",
    system:
      "你是命名顧問。輸出 10 個候選，每個含中文 + 英文 + 一句話寓意。",
    userTemplate: `要命名的對象：{{material}}
風格偏好：{{style}}

輸出 10 個候選，列表格式：
1. 中文｜English｜寓意
2. ...`,
    fields: [
      { key: "material", label: "對象描述", kind: "longtext", required: true },
      { key: "style", label: "風格偏好", kind: "select", options: ["科技感", "文青", "家庭親切", "高端奢華", "玩味諧音"], default: "文青" },
    ],
  },

  "social-listening-prompt": {
    id: "social-listening-prompt",
    label: "社群洞察提問",
    system:
      "你是社群研究員，擅長設計訪談 / 焦點團體題綱。輸出 12 題分 3 階段 (暖身/核心/決策)。",
    userTemplate: `研究主題：
{{material}}

目標受眾：{{audience}}
研究目的：{{goal}}

輸出 12 題訪談題綱，分 3 階段，每階段 4 題。`,
    fields: [
      { key: "material", label: "研究主題", kind: "longtext", required: true },
      { key: "audience", label: "受訪者輪廓", kind: "text" },
      { key: "goal", label: "研究目的", kind: "text" },
    ],
  },
};

function fillTemplate(tpl: string, inputs: Record<string, string | number | undefined>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = inputs[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

export const quickTaskRouter = router({
  /** Catalog — client uses to render the menu. */
  list: protectedProcedure.query(() => {
    return Object.values(TASKS).map((t) => ({
      id: t.id,
      label: t.label,
      fields: t.fields,
    }));
  }),

  /** Run a task. */
  run: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        inputs: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const def = TASKS[input.taskId];
      if (!def) throw new Error(`Unknown taskId: ${input.taskId}`);

      const filled = fillTemplate(def.userTemplate, input.inputs ?? {});
      const messages = [
        { role: "system" as const, content: def.system },
        { role: "user" as const, content: filled },
      ];

      const result = await callModel(messages, undefined, def.preferredProvider);
      return {
        taskId: def.id,
        label: def.label,
        output: result.content,
        provider: result.provider,
        model: result.model,
      };
    }),
});
