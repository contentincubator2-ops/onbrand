/**
 * quickTaskRouter — 30 秒產出 · 多 Agent 分工合作管線
 *
 * 架構（這次徹底改）：
 *   每個 task = 一條管線 (stages[])
 *   每個 stage = 多位 agent 並行（同時動工）
 *   stage 之間 sequential — 後面 stage 收前面 stage 的產出當素材
 *   最後一個 stage 通常是 orchestrator（總編輯）→ 把所有草稿打磨成最終交付
 *
 * 視覺敘事：
 *   stage 1: 偵察兵 / 解碼師 並行抽情報
 *   stage 2: 草稿手 並行寫初稿
 *   stage 3: 主編 整合 → 一份完整產出
 *
 * 三招（保留）：
 *   1. 多 agent 多 skill 同時動工（pipeline parallel within stage）
 *   2. brandId → brand_brain 自動注入 system prefix
 *   3. 結構化 task 回 JSON（最後 orchestrator stage 才負責結構化）
 *
 * Provider 容錯：
 *   每個 agent 有 preferredProvider，但失敗 → 自動 fallback 到 forge（SoWork
 *   統一閘道）。錯誤的 openai/google/cohere key 不會炸整條管線。
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
  id: string;
  name: string;
  /** 一句話角色描述（顯示在卡片副標） */
  role: string;
  /** 主技能標籤 — 顯示在卡片右上 */
  skill: string;
  preferredProvider: ModelProvider;
  system: string;
  /** 用戶 brief 模板 — {{var}} 從 inputs 填入 */
  userTemplate: string;
};

type StageDef = {
  id: string;
  label: string;
  /** 一句話描述這個 stage 在做什麼 */
  description: string;
  /** Stage 內的所有 agent 並行執行 */
  agents: AgentDef[];
  /** 是否為最後 orchestrator 收尾 stage（影響視覺呈現） */
  isOrchestrator?: boolean;
};

type TaskDef = {
  id: string;
  label: string;
  etaSeconds: number;
  /** 結構化輸出類型 — 最後一個 stage 的最後一個 agent 必須回對應 JSON */
  finalKind:
    | "text"
    | "swot"
    | "persona-card"
    | "swatches"
    | "name-cards"
    | "rich-text";
  fields: FieldDef[];
  stages: StageDef[];
};

/* ──────────────────────────── TASK CATALOG ─────────────────────────────── */

/** Helper：標準化 stage system prefix — 讓 orchestrator stage 都能讀前面 context */
const STAGE_USE_CONTEXT_NOTE = "（如果上方有「前一階段同事產出」段落，請以此為素材，不要重做。）";

const TASKS: Record<string, TaskDef> = {
  /* ─── 1. IG Hook · 三階段管線 ─────────────────────────────────────── */
  "ig-hooks": {
    id: "ig-hooks",
    label: "IG Hook",
    etaSeconds: 26,
    finalKind: "text",
    fields: [
      { key: "material", label: "素材", kind: "longtext", required: true,
        placeholder: "貼一段文章、產品描述或活動主題…" },
    ],
    stages: [
      {
        id: "recon",
        label: "情境拆解",
        description: "兩位偵察兵讀素材，抽出受眾與情緒鉤點",
        agents: [
          {
            id: "audience-decoder",
            name: "受眾解碼師",
            role: "鎖定誰會被打動",
            skill: "受眾分析",
            preferredProvider: "qwen",
            system: "你是受眾解碼師。讀素材後，輸出 3 個關鍵受眾標籤（職業/生活情境/價值觀，各一），每個標籤一行，純列表。不超過 60 字。",
            userTemplate: "素材：\n{{material}}",
          },
          {
            id: "emotion-spotter",
            name: "情緒偵察員",
            role: "找出可下手的情緒鉤點",
            skill: "情緒分析",
            preferredProvider: "zhipu",
            system: "你是情緒偵察員。讀素材後，輸出 3 個可被下手的情緒鉤點（如：焦慮、嚮往、憤怒、療癒…），每個附 8 字內具體場景，純列表。不超過 60 字。",
            userTemplate: "素材：\n{{material}}",
          },
        ],
      },
      {
        id: "drafts",
        label: "草稿並行",
        description: "兩位 hook 手用偵察情報各寫 5 句草稿",
        agents: [
          {
            id: "hook-pungent",
            name: "煽動派 Hook 手",
            role: "情緒拉滿、止滑為王",
            skill: "煽動文案",
            preferredProvider: "openai",
            system: `你是煽動派 IG hook 手。基於上方偵察情報，寫 5 個煽動 hook，編號，每個不超過 30 字。${STAGE_USE_CONTEXT_NOTE}`,
            userTemplate: "原素材：\n{{material}}",
          },
          {
            id: "hook-poetic",
            name: "文青派 Hook 手",
            role: "畫面感、留白、詩感",
            skill: "詩意文案",
            preferredProvider: "google",
            system: `你是文青派 IG hook 手。基於上方偵察情報，寫 5 個有畫面感的 hook，編號，每個不超過 30 字。${STAGE_USE_CONTEXT_NOTE}`,
            userTemplate: "原素材：\n{{material}}",
          },
        ],
      },
      {
        id: "finalize",
        label: "總編輯收尾",
        description: "Hook 主編從 10 個草稿挑出最強的 5 個，統一語氣",
        isOrchestrator: true,
        agents: [
          {
            id: "hook-editor",
            name: "Hook 主編",
            role: "選稿 + 統一語氣 + 最終交付",
            skill: "編輯統籌",
            preferredProvider: "openai",
            system: `你是 IG hook 主編。上方有兩位同事各 5 個草稿（共 10 個），請從中挑出最強的 5 個，可微調用詞讓語氣一致。輸出格式：
編號 1-5，每行一句 hook（不超過 30 字），最後一行用括號附「（選稿說明：你選了哪 5 個、為何拒絕另 5 個 — 30 字內）」。
不要解釋方法論，直接交稿。`,
            userTemplate: "原素材：\n{{material}}",
          },
        ],
      },
    ],
  },

  /* ─── 2. Tagline · 三階段 ─────────────────────────────────────────── */
  "tagline": {
    id: "tagline",
    label: "Tagline",
    etaSeconds: 24,
    finalKind: "text",
    fields: [
      { key: "brand", label: "品牌名", kind: "text", required: true },
      { key: "spirit", label: "品牌精神", kind: "longtext", required: true },
    ],
    stages: [
      {
        id: "essence",
        label: "精神萃取",
        description: "兩位策略師抽出品牌核心",
        agents: [
          {
            id: "essence-archetype",
            name: "原型策略師",
            role: "用 12 原型定位",
            skill: "原型分析",
            preferredProvider: "qwen",
            system: "你是品牌原型策略師。從品牌精神中辨認最像哪個 Pearson 12 原型（英雄/智者/創造者/反叛者/照顧者…），輸出 1 行原型名 + 1 行 30 字內理由。",
            userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
          },
          {
            id: "essence-keywords",
            name: "關鍵字煉金師",
            role: "抽 5 個核心關鍵字",
            skill: "詞彙煉金",
            preferredProvider: "zhipu",
            system: "你是品牌關鍵字煉金師。從品牌精神中提煉 5 個最有張力的中文關鍵字（單字或雙字），純列表。",
            userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
          },
        ],
      },
      {
        id: "drafts",
        label: "雙派草稿",
        description: "兩位文案手用上方素材各寫 5 句草稿",
        agents: [
          {
            id: "tag-emotional",
            name: "感性派",
            role: "詩意、可記住",
            skill: "感性文案",
            preferredProvider: "google",
            system: `你是感性派 tagline 寫手。基於原型 + 關鍵字，寫 5 個 tagline，每個不超過 12 字，純列表編號。${STAGE_USE_CONTEXT_NOTE}`,
            userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
          },
          {
            id: "tag-rational",
            name: "理性派",
            role: "明確利益、能跑廣告",
            skill: "理性文案",
            preferredProvider: "openai",
            system: `你是理性派 tagline 寫手。基於原型 + 關鍵字，寫 5 個 tagline，每個不超過 12 字，要點明利益，純列表編號。${STAGE_USE_CONTEXT_NOTE}`,
            userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
          },
        ],
      },
      {
        id: "finalize",
        label: "主編收尾",
        description: "從 10 個草稿挑 5 個最佳",
        isOrchestrator: true,
        agents: [
          {
            id: "tag-editor",
            name: "Tagline 主編",
            role: "選稿 + 排序 + 最終交付",
            skill: "編輯統籌",
            preferredProvider: "openai",
            system: `你是 tagline 主編。從上方 10 個草稿中挑 5 個最強的，可微調讓語氣一致。輸出：
編號 1-5（一行一句，每句不超過 12 字）
最後加一行：「（主推：第 X 句，30 字內推薦理由）」`,
            userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
          },
        ],
      },
    ],
  },

  /* ─── 3. 改寫文案 · 三階段 ────────────────────────────────────────── */
  "rewrite-copy": {
    id: "rewrite-copy",
    label: "改寫文案",
    etaSeconds: 26,
    finalKind: "text",
    fields: [
      { key: "material", label: "原文案", kind: "longtext", required: true },
      { key: "audience", label: "目標讀者", kind: "text", placeholder: "例：30-40 歲新手媽媽" },
    ],
    stages: [
      {
        id: "diagnose",
        label: "病因診斷",
        description: "診斷原文案的問題與機會",
        agents: [
          {
            id: "diagnose-weakness",
            name: "弱點診斷師",
            role: "點出 3 個失血點",
            skill: "文案診斷",
            preferredProvider: "qwen",
            system: "你是文案診斷師。讀原文案，輸出 3 個失血點（如：太抽象/沒利益/沒急迫感），每點一行 20 字內。",
            userTemplate: "原文案：\n{{material}}\n讀者：{{audience}}",
          },
          {
            id: "diagnose-strength",
            name: "亮點挖掘師",
            role: "找出可放大的優點",
            skill: "亮點分析",
            preferredProvider: "zhipu",
            system: "你是文案亮點挖掘師。讀原文案，輸出 2 個值得保留放大的優點，每點一行 20 字內。",
            userTemplate: "原文案：\n{{material}}\n讀者：{{audience}}",
          },
        ],
      },
      {
        id: "drafts",
        label: "三策略草稿",
        description: "三位 copywriter 同時試三種策略",
        agents: [
          {
            id: "draft-fear",
            name: "恐懼派",
            role: "點出失去什麼",
            skill: "恐懼訴求",
            preferredProvider: "openai",
            system: `你是恐懼派 copywriter。修補診斷出的失血點，寫 1 個改寫版本。${STAGE_USE_CONTEXT_NOTE}`,
            userTemplate: "原文案：\n{{material}}\n讀者：{{audience}}",
          },
          {
            id: "draft-contrast",
            name: "反差派",
            role: "對比落差、出乎意料",
            skill: "反差敘事",
            preferredProvider: "google",
            system: `你是反差派 copywriter。修補診斷出的失血點，寫 1 個改寫版本。${STAGE_USE_CONTEXT_NOTE}`,
            userTemplate: "原文案：\n{{material}}\n讀者：{{audience}}",
          },
          {
            id: "draft-numbers",
            name: "數字派",
            role: "用具體數據建立可信度",
            skill: "數據文案",
            preferredProvider: "cohere",
            system: `你是數字派 copywriter。修補診斷出的失血點，寫 1 個改寫版本（含具體數字）。${STAGE_USE_CONTEXT_NOTE}`,
            userTemplate: "原文案：\n{{material}}\n讀者：{{audience}}",
          },
        ],
      },
      {
        id: "finalize",
        label: "資深 CD 收尾",
        description: "資深 Creative Director 挑最佳並打磨",
        isOrchestrator: true,
        agents: [
          {
            id: "rewrite-editor",
            name: "Creative Director",
            role: "選稿 + 打磨 + 加 CTA",
            skill: "創意總監",
            preferredProvider: "openai",
            system: `你是資深 Creative Director。從上方三個改寫草稿挑 1 個最強，必要時微調並加上一行 CTA。輸出：
**選用策略**：（恐懼/反差/數字）
**最終文案**：（修改後完整版）
**CTA**：（一行）
**選稿理由**：（30 字內）`,
            userTemplate: "原文案：\n{{material}}",
          },
        ],
      },
    ],
  },

  /* ─── 4. SWOT · 兩階段 ────────────────────────────────────────────── */
  "swot": {
    id: "swot",
    label: "SWOT 分析",
    etaSeconds: 22,
    finalKind: "swot",
    fields: [
      { key: "material", label: "品牌 / 產品 / 情境", kind: "longtext", required: true },
    ],
    stages: [
      {
        id: "scan",
        label: "情報並行",
        description: "內外部分析師同時掃描",
        agents: [
          {
            id: "internal-analyst",
            name: "內部分析師",
            role: "扫 Strengths + Weaknesses",
            skill: "內部診斷",
            preferredProvider: "qwen",
            system: "你是企業內部分析師。輸出 3 個優勢 (S) 與 3 個弱點 (W)，純列表，標 S1-S3 / W1-W3，每點一行 20 字內。",
            userTemplate: "對象：\n{{material}}",
          },
          {
            id: "external-analyst",
            name: "外部分析師",
            role: "扫 Opportunities + Threats",
            skill: "外部掃描",
            preferredProvider: "google",
            system: "你是市場外部分析師。輸出 3 個機會 (O) 與 3 個威脅 (T)，純列表，標 O1-O3 / T1-T3，每點一行 20 字內。",
            userTemplate: "對象：\n{{material}}",
          },
        ],
      },
      {
        id: "synthesize",
        label: "策略主編收尾",
        description: "整合 4 象限 + 80 字策略建議",
        isOrchestrator: true,
        agents: [
          {
            id: "swot-editor",
            name: "策略主編",
            role: "整合 4 象限 + 給策略",
            skill: "策略整合",
            preferredProvider: "openai",
            system: `你是品牌策略主編。整合上方內外部分析師的情報，輸出嚴格 JSON（不要 markdown 圍欄不要解釋）：
{
  "strengths": ["...", "...", "..."],
  "weaknesses": ["...", "...", "..."],
  "opportunities": ["...", "...", "..."],
  "threats": ["...", "...", "..."],
  "advice": "80 字內中文策略建議，要點明 SO/ST/WO/WT 四種策略中你建議走哪一條"
}`,
            userTemplate: "對象：\n{{material}}",
          },
        ],
      },
    ],
  },

  /* ─── 5. Persona · 兩階段 ─────────────────────────────────────────── */
  "audience-persona": {
    id: "audience-persona",
    label: "受眾 Persona",
    etaSeconds: 22,
    finalKind: "persona-card",
    fields: [
      { key: "material", label: "產品 / 服務", kind: "longtext", required: true },
    ],
    stages: [
      {
        id: "research",
        label: "資料收集",
        description: "兩位研究員同時調人口與心理",
        agents: [
          {
            id: "demo-researcher",
            name: "人口屬性研究員",
            role: "年齡/職業/收入/地點",
            skill: "Demographics",
            preferredProvider: "qwen",
            system: "你是人口屬性研究員。產品的目標 persona 的人口輪廓，輸出純列表：年齡 / 職業 / 地點 / 收入 / 婚姻，每行一個。",
            userTemplate: "產品：\n{{material}}",
          },
          {
            id: "psycho-researcher",
            name: "心理屬性研究員",
            role: "價值觀/痛點/平台習慣",
            skill: "Psychographics",
            preferredProvider: "zhipu",
            system: "你是心理屬性研究員。輸出：3 個價值觀 / 3 個痛點 / 3 個常用平台，分段純列表。",
            userTemplate: "產品：\n{{material}}",
          },
        ],
      },
      {
        id: "synthesize",
        label: "Persona 主編收尾",
        description: "整合成名片",
        isOrchestrator: true,
        agents: [
          {
            id: "persona-editor",
            name: "Persona 主編",
            role: "整合成一張可用名片",
            skill: "Persona 整合",
            preferredProvider: "openai",
            system: `你是用戶研究主編。整合上方研究員的情報，輸出嚴格 JSON（不要 markdown 圍欄）：
{
  "name": "中文姓名",
  "tagline": "一句話概括",
  "demographics": { "age": "32", "occupation": "...", "location": "...", "income": "..." },
  "values": ["...", "...", "..."],
  "painPoints": ["...", "...", "..."],
  "platforms": ["...", "...", "..."],
  "hookLine": "一句話 — 我能怎麼打動他"
}`,
            userTemplate: "產品：\n{{material}}",
          },
        ],
      },
    ],
  },

  /* ─── 6. 命名 · 兩階段 ────────────────────────────────────────────── */
  "name-it": {
    id: "name-it",
    label: "命名",
    etaSeconds: 20,
    finalKind: "name-cards",
    fields: [
      { key: "material", label: "對象描述", kind: "longtext", required: true },
      { key: "style", label: "風格", kind: "select",
        options: ["科技感", "文青", "家庭親切", "高端奢華", "玩味諧音"], default: "文青" },
    ],
    stages: [
      {
        id: "drafts",
        label: "雙派起名",
        description: "中文派與雙語派同時提案",
        agents: [
          {
            id: "name-zh",
            name: "中文派命名師",
            role: "純中文、有底蘊",
            skill: "中文命名",
            preferredProvider: "qwen",
            system: "你是中文命名師。提 8 個中文候選名（純中文，2-4 字），純列表編號。",
            userTemplate: "對象：\n{{material}}\n風格：{{style}}",
          },
          {
            id: "name-en",
            name: "雙語派命名師",
            role: "中英並行、好搜",
            skill: "雙語命名",
            preferredProvider: "openai",
            system: "你是雙語命名師。提 8 個英文候選名（單字或合成字），純列表編號。",
            userTemplate: "對象：\n{{material}}\n風格：{{style}}",
          },
        ],
      },
      {
        id: "finalize",
        label: "命名主編收尾",
        description: "從中英 16 個草稿挑 5 個並寫寓意",
        isOrchestrator: true,
        agents: [
          {
            id: "name-editor",
            name: "命名主編",
            role: "選稿 + 配中英 + 寫寓意",
            skill: "命名統籌",
            preferredProvider: "openai",
            system: `你是命名主編。從上方中文 8 個 + 英文 8 個草稿中，挑 5 組最佳並配對成中英組合（也可微調）。輸出嚴格 JSON 陣列（不要 markdown 圍欄）：
[{"chinese":"...","english":"...","meaning":"一句話寓意"}, ...]
共 5 個。`,
            userTemplate: "對象：\n{{material}}",
          },
        ],
      },
    ],
  },

  /* ─── 7. 在地化翻譯 · 兩階段 ──────────────────────────────────────── */
  "translate-localize": {
    id: "translate-localize",
    label: "在地化翻譯",
    etaSeconds: 18,
    finalKind: "text",
    fields: [
      { key: "material", label: "原文", kind: "longtext", required: true },
      { key: "from", label: "原文語言", kind: "text", default: "英文" },
      { key: "to", label: "翻譯目標", kind: "text", default: "繁體中文（台灣）" },
    ],
    stages: [
      {
        id: "literal",
        label: "直譯",
        description: "翻譯員忠實翻一遍",
        agents: [
          {
            id: "translator",
            name: "直譯員",
            role: "保留原意",
            skill: "忠實翻譯",
            preferredProvider: "google",
            system: "你是專業翻譯，做忠實直譯。輸出 1 段譯文，不要解釋。",
            userTemplate: "從 {{from}} 翻成 {{to}}：\n{{material}}",
          },
        ],
      },
      {
        id: "localize",
        label: "在地化主編收尾",
        description: "在地化專家潤飾",
        isOrchestrator: true,
        agents: [
          {
            id: "localizer",
            name: "在地化主編",
            role: "轉文化、加在地語感",
            skill: "在地化",
            preferredProvider: "qwen",
            system: `你是在地化主編。基於上方直譯版，輸出在地化版。格式：
**在地化版**：
（譯文）

**動了什麼**：（30 字內，列出最關鍵的在地化動作）`,
            userTemplate: "原文：\n{{material}}\n目標：{{to}}",
          },
        ],
      },
    ],
  },

  /* ─── 8. Hero 圖 Prompt · 兩階段 ──────────────────────────────────── */
  "hero-image-prompt": {
    id: "hero-image-prompt",
    label: "Hero 圖 Prompt",
    etaSeconds: 18,
    finalKind: "text",
    fields: [
      { key: "material", label: "產品 / 場景", kind: "longtext", required: true },
      { key: "style", label: "風格", kind: "select",
        options: ["極簡攝影", "電影感", "復古插畫", "賽博龐克", "日系雜誌"], default: "電影感" },
    ],
    stages: [
      {
        id: "scene",
        label: "場景拆解",
        description: "美術指導拆解構圖、色調",
        agents: [
          {
            id: "art-director",
            name: "美術指導",
            role: "構圖、色調、視覺重點",
            skill: "美術指導",
            preferredProvider: "qwen",
            system: "你是視覺美術指導。輸出 3 行（純文字）：構圖 / 色調 / 主視覺重點。",
            userTemplate: "場景：\n{{material}}\n風格：{{style}}",
          },
        ],
      },
      {
        id: "prompt-craft",
        label: "Prompt 主編收尾",
        description: "把美指轉成 3 個英文 prompt",
        isOrchestrator: true,
        agents: [
          {
            id: "prompt-engineer",
            name: "Prompt 工程師",
            role: "出 3 版 Midjourney/DALL·E prompt",
            skill: "Prompt 工程",
            preferredProvider: "openai",
            system: `你是 Midjourney/DALL·E prompt 工程師。基於上方美指方向，輸出 3 個英文 prompt 版本，每個格式：
**版本 N**
prompt: ...
camera: ...
lighting: ...`,
            userTemplate: "場景：\n{{material}}\n風格：{{style}}",
          },
        ],
      },
    ],
  },

  /* ─── 9. LinkedIn 摘要 · 單階段 ───────────────────────────────────── */
  "linkedin-summary": {
    id: "linkedin-summary",
    label: "LinkedIn 摘要",
    etaSeconds: 12,
    finalKind: "text",
    fields: [
      { key: "material", label: "原文 / 內容", kind: "longtext", required: true },
    ],
    stages: [
      {
        id: "write",
        label: "B2B 編輯收尾",
        description: "B2B 編輯一次完成",
        isOrchestrator: true,
        agents: [
          {
            id: "b2b-editor",
            name: "B2B 編輯",
            role: "濃縮成 3 句有觀點摘要",
            skill: "B2B 編輯",
            preferredProvider: "openai",
            system: "你是 B2B 編輯，擅長濃縮長文成 LinkedIn 摘要。輸出 3 句中文，第 3 句帶觀點或 CTA。只給文字。",
            userTemplate: "內容：\n{{material}}",
          },
        ],
      },
    ],
  },

  /* ─── 10. 品牌色票 · 三階段 ───────────────────────────────────────── */
  "color-palette": {
    id: "color-palette",
    label: "品牌色票",
    etaSeconds: 22,
    finalKind: "swatches",
    fields: [
      { key: "brand", label: "品牌名", kind: "text", required: true },
      { key: "spirit", label: "品牌精神", kind: "longtext", required: true },
    ],
    stages: [
      {
        id: "mood",
        label: "情緒調色",
        description: "兩位顧問同時讀情緒",
        agents: [
          {
            id: "mood-reader",
            name: "情緒解碼師",
            role: "從品牌精神讀出 mood 字",
            skill: "情緒解讀",
            preferredProvider: "qwen",
            system: "你是品牌情緒解碼師。輸出 5 個 mood 形容詞（中文，如：沉穩/雀躍/銳利…），純列表。",
            userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
          },
          {
            id: "ref-spotter",
            name: "色彩參考師",
            role: "對標 3 個視覺參考",
            skill: "色彩參考",
            preferredProvider: "zhipu",
            system: "你是色彩參考師。輸出 3 個視覺參考領域（如：北歐極簡/賽博龐克/日式茶道），每行一個。",
            userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
          },
        ],
      },
      {
        id: "synthesize",
        label: "色彩主編收尾",
        description: "把 mood + ref 變成 5 色 swatches",
        isOrchestrator: true,
        agents: [
          {
            id: "color-editor",
            name: "色彩策略主編",
            role: "出 5 色 + role + 用法",
            skill: "色彩策略",
            preferredProvider: "google",
            system: `你是品牌色彩策略主編。基於 mood 與參考，輸出嚴格 JSON 陣列（不要 markdown 圍欄）：
[{"hex":"#A12B3C","name":"...","role":"primary|secondary|accent|neutral|highlight","usage":"一句話用法建議"}, ...]
共 5 色，第一色為 primary。`,
            userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
          },
        ],
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
    return `\n\n[品牌大腦記憶]（請在輸出中體現品牌個性）\n${lines.join("\n")}\n`;
  } catch {
    return "";
  }
}

function tryParseJson(s: string): any | null {
  if (!s) return null;
  let t = s.trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const start = t.search(/[{\[]/);
  if (start > 0) t = t.slice(start);
  const lastBrace = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (lastBrace >= 0) t = t.slice(0, lastBrace + 1);
  try { return JSON.parse(t); } catch { return null; }
}

/** 包一層自動 fallback 到 forge — 容錯 openai/google/cohere 壞 key */
async function callWithFallback(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  preferred: ModelProvider
): Promise<{ content: string; provider: ModelProvider; model: string; fellBack: boolean }> {
  try {
    const r = await callModel(messages, undefined, preferred);
    return { ...r, fellBack: false };
  } catch (e) {
    if (preferred === "forge") throw e;
    try {
      const r = await callModel(messages, undefined, "forge");
      return { ...r, fellBack: true };
    } catch {
      throw e; // throw original error
    }
  }
}

/** 把上一階段的多個 agent 產出組成 context 段落 */
function buildPriorContext(
  prior: Array<{ stageLabel: string; agentName: string; output: string }>
): string {
  if (!prior.length) return "";
  const grouped: Record<string, Array<{ agentName: string; output: string }>> = {};
  for (const p of prior) {
    (grouped[p.stageLabel] ??= []).push({ agentName: p.agentName, output: p.output });
  }
  const sections: string[] = [];
  for (const [stage, items] of Object.entries(grouped)) {
    sections.push(`【前一階段：${stage}】`);
    for (const it of items) {
      sections.push(`◆ ${it.agentName}：\n${it.output}`);
    }
  }
  return `\n\n[前一階段同事產出]\n${sections.join("\n\n")}\n`;
}

/* ──────────────────────────── ROUTER ───────────────────────────────────── */

export const quickTaskRouter = router({
  /** Catalog — 客端用來渲染 menu + stage 軌道 */
  list: protectedProcedure.query(() => {
    return Object.values(TASKS).map((t) => ({
      id: t.id,
      label: t.label,
      etaSeconds: t.etaSeconds,
      finalKind: t.finalKind,
      fields: t.fields,
      stages: t.stages.map((s) => ({
        id: s.id,
        label: s.label,
        description: s.description,
        isOrchestrator: !!s.isOrchestrator,
        agents: s.agents.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          skill: a.skill,
          provider: a.preferredProvider,
        })),
      })),
    }));
  }),

  /**
   * 跑單一 agent。客端依 stage 順序：先平行打完 stage 1 的所有 agent，
   * 把結果組成 prior 傳進 stage 2 的 runAgent，依此類推。
   *
   * prior 格式：[{ stageLabel, agentName, output }, ...]
   */
  runAgent: protectedProcedure
    .input(
      z.object({
        taskId: z.string(),
        stageId: z.string(),
        agentId: z.string(),
        inputs: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
        brandId: z.number().optional(),
        prior: z.array(z.object({
          stageLabel: z.string(),
          agentName: z.string(),
          output: z.string(),
        })).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const def = TASKS[input.taskId];
      if (!def) throw new Error(`Unknown taskId: ${input.taskId}`);
      const stage = def.stages.find((s) => s.id === input.stageId);
      if (!stage) throw new Error(`Unknown stageId: ${input.stageId}`);
      const agent = stage.agents.find((a) => a.id === input.agentId);
      if (!agent) throw new Error(`Unknown agentId: ${input.agentId}`);

      const brandPrefix = await buildBrandContext(input.brandId);
      const priorContext = buildPriorContext(input.prior ?? []);
      const filledUser = fillTemplate(agent.userTemplate, input.inputs ?? {});

      // Prior context goes BEFORE the original brief so agent reads handoff first
      const userMsg = priorContext + (priorContext ? "\n\n[原始 brief]\n" : "") + filledUser;

      const messages = [
        { role: "system" as const, content: agent.system + brandPrefix },
        { role: "user" as const, content: userMsg },
      ];

      const startedAt = Date.now();
      const result = await callWithFallback(messages, agent.preferredProvider);
      const tookMs = Date.now() - startedAt;

      const isFinalStructured =
        !!stage.isOrchestrator &&
        (def.finalKind === "swot" ||
         def.finalKind === "persona-card" ||
         def.finalKind === "swatches" ||
         def.finalKind === "name-cards");

      return {
        taskId: def.id,
        stageId: stage.id,
        stageLabel: stage.label,
        agentId: agent.id,
        agentName: agent.name,
        agentRole: agent.role,
        agentSkill: agent.skill,
        output: result.content,
        structured: isFinalStructured ? tryParseJson(result.content) : null,
        provider: result.provider,
        model: result.model,
        fellBack: result.fellBack,
        tookMs,
        brandInjected: brandPrefix.length > 0,
      };
    }),

  /** 自由輸入路由（不變）— 文字 → taskId + 預填欄位 */
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
{"taskId": "...", "inputs": {"key1": "value1", ...}, "confidence": 0.0-1.0}

不匹配時回 {"taskId": null, "confidence": 0}。`;

      try {
        const r = await callWithFallback(
          [
            { role: "system", content: system },
            { role: "user", content: input.text },
          ],
          "forge" // route 用最便宜可靠的
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
