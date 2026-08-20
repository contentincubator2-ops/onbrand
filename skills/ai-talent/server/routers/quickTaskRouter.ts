/**
 * quickTaskRouter — 30 秒產出 · 預製 Squad 接力交付
 *
 * 架構修正（v3）：
 *   每個任務 = 一個「已分工好的 Squad」，成員 skill **完全獨立不重複**。
 *   避免兩個成員都在「寫 hook」這種偽分工。改成像真實 agency：
 *     - 受眾研究員（research skill）
 *     - hook 寫手（writing skill）
 *     - 表現編輯（A/B 變體 skill）
 *   每人做一件別人不會的事，串成接力，最後 orchestrator 整合。
 *
 * Squad 結構：
 *   stages[]：管線階段
 *   每個 stage 1-2 位成員（不再有兩位同 skill 並行）
 *   多人並行只發生在「同一階段需要不同視角」（如內部 vs 外部分析）
 *
 * Provider 容錯：preferred 失敗 → forge fallback（同 v2）
 */
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, singleFlightPerUser } from "../_core/trpc";
import { callModel, type ModelProvider } from "../_core/multiModelRouter";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { ContentKindSchema } from "../_core/outputContentEnvelope";
import {
  assertGenericRegenerationAllowed,
  preserveExistingVariantImage,
  replaceRegeneratedContent,
  selectRegenerationTarget,
} from "../_core/quickTaskRegenerateContent";

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
  /** 一句話角色描述 */
  role: string;
  /** 唯一專長標籤（同 squad 內不重複） */
  skill: string;
  /** 視覺：頭像縮寫（2 字） */
  avatar: string;
  /** 視覺：頭像底色 token — research / write / orchestrate / analyze / craft */
  tone: "research" | "write" | "analyze" | "craft" | "orchestrate";
  preferredProvider: ModelProvider;
  system: string;
  userTemplate: string;
};

type StageDef = {
  id: string;
  label: string;
  description: string;
  agents: AgentDef[]; // 1-2 個，多 agent 時必須 skill 互補
  isOrchestrator?: boolean;
};

type TaskDef = {
  id: string;
  label: string;
  /** Squad 對外的名字 */
  squadName: string;
  /** Squad 一句話定位 */
  squadTagline: string;
  etaSeconds: number;
  finalKind: "text" | "swot" | "persona-card" | "swatches" | "name-cards" | "rich-text";
  fields: FieldDef[];
  stages: StageDef[];
};

/* ──────────────────────────── SQUAD CATALOG ────────────────────────────── */

const TASKS: Record<string, TaskDef> = {
  /* ─── 1. IG Hook Squad ────────────────────────────────────────────── */
  "ig-hooks": {
    id: "ig-hooks",
    label: "IG Hook",
    squadName: "IG Hook Squad",
    squadTagline: "受眾研究 → Hook 創作 → 表現優化 三人接力",
    etaSeconds: 24,
    finalKind: "text",
    fields: [
      { key: "material", label: "素材", kind: "longtext", required: true,
        placeholder: "貼一段文章、產品描述或活動主題…" },
    ],
    stages: [
      {
        id: "research",
        label: "受眾洞察",
        description: "找出這群人此刻最在意什麼",
        agents: [{
          id: "audience-researcher",
          name: "曾雅婷", role: "受眾洞察師", skill: "受眾研究",
          avatar: "雅", tone: "research", preferredProvider: "qwen",
          system: "你是受眾洞察師。讀素材後，輸出 3 個受眾此刻最在意的痛點 / 渴望（不是泛泛的人口屬性，是具體的心理狀態），每個一行 25 字內，純列表。",
          userTemplate: "素材：\n{{material}}",
        }],
      },
      {
        id: "create",
        label: "Hook 創作",
        description: "用洞察寫 8 個 hook 草稿",
        agents: [{
          id: "hook-writer",
          name: "林志豪", role: "資深 IG hook 寫手", skill: "Hook 寫作",
          avatar: "豪", tone: "write", preferredProvider: "forge",
          system: "你是資深 IG hook 寫手。讀上方受眾洞察，寫 8 個 hook 草稿（每個不超過 30 字），編號列表。針對洞察出的痛點下手。",
          userTemplate: "原素材：\n{{material}}",
        }],
      },
      {
        id: "optimize",
        label: "表現優化",
        description: "選 3 個最強並做 A/B 變體",
        isOrchestrator: true,
        agents: [{
          id: "perf-editor",
          name: "Layla Brooks", role: "表現優化編輯", skill: "A/B 優化",
          avatar: "SC", tone: "orchestrate", preferredProvider: "forge",
          system: `你是 IG 表現優化編輯，懂 IG 演算法與 hook 的轉換率。從上方 8 個草稿中選 3 個最強的（用「滑動指數 / 留言觸發 / 收藏潛力」三條評分），並對 #1 多寫 1 個 A/B 變體。輸出格式：

**TOP 3 HOOKS**
1. [hook 內文]（為何選：8 字內）
2. [hook 內文]（為何選：8 字內）
3. [hook 內文]（為何選：8 字內）

**A/B 變體（針對 #1）**
A: [原版]
B: [變體 — 改了什麼，8 字內說明]

直接交稿，不要解釋方法論。`,
          userTemplate: "原素材：\n{{material}}",
        }],
      },
    ],
  },

  /* ─── 2. Tagline Squad ────────────────────────────────────────────── */
  "tagline": {
    id: "tagline",
    label: "Tagline",
    squadName: "Tagline Squad",
    squadTagline: "原型定位 → Tagline 創作 → 主推策略 三人接力",
    etaSeconds: 22,
    finalKind: "text",
    fields: [
      { key: "brand", label: "品牌名", kind: "text", required: true },
      { key: "spirit", label: "品牌精神", kind: "longtext", required: true },
    ],
    stages: [
      {
        id: "archetype",
        label: "原型定位",
        description: "用 12 原型鎖定品牌人格",
        agents: [{
          id: "archetype-strategist",
          name: "周佳穎", role: "品牌原型策略師", skill: "12 原型分析",
          avatar: "穎", tone: "analyze", preferredProvider: "qwen",
          system: "你是 Pearson 12 原型策略師。從品牌精神中辨認最適合的原型（英雄/智者/創造者/反叛者/照顧者/探險家/魔法師/天真者/凡夫/情人/弄臣/統治者）。輸出：1 行原型名 + 1 行 30 字內理由 + 3 個能體現此原型的關鍵字。",
          userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
        }],
      },
      {
        id: "create",
        label: "Tagline 創作",
        description: "依原型寫 10 個 tagline 草稿",
        agents: [{
          id: "tagline-writer",
          name: "陳冠宇", role: "資深 tagline 寫手", skill: "標語創作",
          avatar: "宇", tone: "write", preferredProvider: "forge",
          system: "你是資深品牌標語寫手。基於上方原型與關鍵字，寫 10 個中文 tagline 草稿（每個不超過 12 字），純列表編號。中後段可以更實驗性。",
          userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
        }],
      },
      {
        id: "strategize",
        label: "主推策略",
        description: "選 1 主推 + 3 備案 + 應用情境",
        isOrchestrator: true,
        agents: [{
          id: "campaign-strategist",
          name: "Ryan Torres", role: "Campaign 策略主編", skill: "標語應用策略",
          avatar: "ML", tone: "orchestrate", preferredProvider: "forge",
          system: `你是 campaign 策略主編。從上方 10 個 tagline 中：
1. 挑 1 個「主推」— 最能跑廣告、好記、長壽
2. 挑 3 個「備案」— 用於不同情境（年輕族群 / 嚴肅版 / 短促銷）

輸出格式：
**主推**：[tagline]
應用情境：（30 字內 — 適合用在哪、為什麼）

**備案 A** [tagline] — 用於：（10 字內）
**備案 B** [tagline] — 用於：（10 字內）
**備案 C** [tagline] — 用於：（10 字內）`,
          userTemplate: "品牌：{{brand}}",
        }],
      },
    ],
  },

  /* ─── 3. 改寫文案 Squad ───────────────────────────────────────────── */
  "rewrite-copy": {
    id: "rewrite-copy",
    label: "改寫文案",
    squadName: "Copy Doctor Squad",
    squadTagline: "診斷 → 改寫 → CTA 三人接力",
    etaSeconds: 24,
    finalKind: "text",
    fields: [
      { key: "material", label: "原文案", kind: "longtext", required: true },
      { key: "audience", label: "目標讀者", kind: "text", placeholder: "例：30-40 歲新手媽媽" },
    ],
    stages: [
      {
        id: "diagnose",
        label: "病因診斷",
        description: "找出原文案失血在哪、處方該下什麼",
        agents: [{
          id: "copy-doctor",
          name: "黃詩涵", role: "文案診斷師", skill: "文案診斷",
          avatar: "涵", tone: "analyze", preferredProvider: "qwen",
          system: `你是資深文案診斷師。讀原文案，輸出：

**病因**（3 點，每點 20 字內）
- 例：太抽象 / 沒利益 / 沒急迫

**處方**（1 句指定一個改寫策略）
- 從「恐懼訴求 / 反差敘事 / 數字證據 / 故事帶入 / 反問句」五選一，給後面寫手用。`,
          userTemplate: "原文案：\n{{material}}\n讀者：{{audience}}",
        }],
      },
      {
        id: "rewrite",
        label: "改寫執行",
        description: "依處方寫 1 個改寫版（不再三派競爭）",
        agents: [{
          id: "copywriter",
          name: "張育誠", role: "資深 copywriter", skill: "文案改寫",
          avatar: "誠", tone: "write", preferredProvider: "forge",
          system: "你是資深 copywriter。**嚴格依照診斷師處方指定的策略**改寫，不要自選策略。輸出 1 個完整改寫版本，跟原文案一樣的長度範圍。",
          userTemplate: "原文案：\n{{material}}\n讀者：{{audience}}",
        }],
      },
      {
        id: "cta",
        label: "CTA + 收尾",
        description: "加 CTA、檢查節奏、潤飾交稿",
        isOrchestrator: true,
        agents: [{
          id: "cta-designer",
          name: "Alex Mercer", role: "CTA & 收尾編輯", skill: "CTA 設計",
          avatar: "EW", tone: "orchestrate", preferredProvider: "forge",
          system: `你是 CTA 設計與收尾編輯。讀上方診斷處方與改寫版本，輸出：

**最終文案**
（改寫版微調後，不超過原文案 1.2 倍長度）

**CTA**
（一行，動詞起手，不超過 12 字）

**改了什麼**（30 字內 — 跟原文案差在哪）`,
          userTemplate: "原文案：\n{{material}}",
        }],
      },
    ],
  },

  /* ─── 4. SWOT Squad ───────────────────────────────────────────────── */
  "swot": {
    id: "swot",
    label: "SWOT 分析",
    squadName: "SWOT Squad",
    squadTagline: "內部 + 外部並行掃描 → 策略整合",
    etaSeconds: 20,
    finalKind: "swot",
    fields: [
      { key: "material", label: "品牌 / 產品 / 情境", kind: "longtext", required: true },
    ],
    stages: [
      {
        id: "scan",
        label: "情報並行掃描",
        description: "內外部分析師同時上",
        agents: [
          {
            id: "internal-analyst",
            name: "李宗翰", role: "內部營運分析師", skill: "S + W 掃描",
            avatar: "翰", tone: "analyze", preferredProvider: "qwen",
            system: "你是內部營運分析師。**只負責** Strengths (S) 和 Weaknesses (W)，不要碰外部。輸出 3 個 S 與 3 個 W，純列表 S1-S3 / W1-W3，每點 20 字內。",
            userTemplate: "對象：\n{{material}}",
          },
          {
            id: "external-analyst",
            name: "王芝寧", role: "市場掃描分析師", skill: "O + T 掃描",
            avatar: "寧", tone: "analyze", preferredProvider: "forge",
            system: "你是市場外部分析師。**只負責** Opportunities (O) 和 Threats (T)，不要碰內部。輸出 3 個 O 與 3 個 T，純列表 O1-O3 / T1-T3，每點 20 字內。",
            userTemplate: "對象：\n{{material}}",
          },
        ],
      },
      {
        id: "synthesize",
        label: "策略整合",
        description: "整合 4 象限 + 給出 SO/ST/WO/WT 策略選擇",
        isOrchestrator: true,
        agents: [{
          id: "swot-strategist",
          name: "James Holt", role: "策略整合主編", skill: "策略整合",
          avatar: "JL", tone: "orchestrate", preferredProvider: "forge",
          system: `你是品牌策略主編。整合上方內外部分析師的情報，輸出嚴格 JSON（不要 markdown 圍欄）：
{
  "strengths": ["...", "...", "..."],
  "weaknesses": ["...", "...", "..."],
  "opportunities": ["...", "...", "..."],
  "threats": ["...", "...", "..."],
  "advice": "80 字內中文策略建議，明確指出建議走 SO/ST/WO/WT 哪一條，並給一句具體行動。"
}`,
          userTemplate: "對象：\n{{material}}",
        }],
      },
    ],
  },

  /* ─── 5. Persona Squad ────────────────────────────────────────────── */
  "audience-persona": {
    id: "audience-persona",
    label: "受眾 Persona",
    squadName: "Persona Squad",
    squadTagline: "Demo + Psycho 並行研究 → 名片整合",
    etaSeconds: 20,
    finalKind: "persona-card",
    fields: [
      { key: "material", label: "產品 / 服務", kind: "longtext", required: true },
    ],
    stages: [
      {
        id: "research",
        label: "雙線研究",
        description: "Demographics 與 Psychographics 同時跑",
        agents: [
          {
            id: "demo-researcher",
            name: "蔡佩珊", role: "Demographics 研究員", skill: "人口統計",
            avatar: "珊", tone: "research", preferredProvider: "qwen",
            system: "你是人口統計研究員。輸出該產品最可能的目標 persona 之人口輪廓，純列表：年齡 / 職業 / 地點 / 收入 / 婚姻狀態 / 教育，每行一個。**只負責人口屬性，不要碰心理。**",
            userTemplate: "產品：\n{{material}}",
          },
          {
            id: "psycho-researcher",
            name: "鄭翔安", role: "Psychographics 研究員", skill: "心理輪廓",
            avatar: "安", tone: "research", preferredProvider: "zhipu",
            system: "你是心理輪廓研究員。輸出該產品目標 persona 的心理面：3 個價值觀 / 3 個痛點 / 3 個媒體平台習慣，分段純列表。**只負責心理，不要碰人口屬性。**",
            userTemplate: "產品：\n{{material}}",
          },
        ],
      },
      {
        id: "synthesize",
        label: "名片整合",
        description: "把雙線研究合成一張可用 persona 名片",
        isOrchestrator: true,
        agents: [{
          id: "persona-editor",
          name: "Olivia Park", role: "Persona 整合主編", skill: "Persona 整合",
          avatar: "OP", tone: "orchestrate", preferredProvider: "forge",
          system: `你是用戶研究主編。整合上方雙線研究，輸出嚴格 JSON（不要 markdown 圍欄）：
{
  "name": "中文姓名",
  "tagline": "一句話概括這個人",
  "demographics": { "age": "32", "occupation": "...", "location": "...", "income": "..." },
  "values": ["...", "...", "..."],
  "painPoints": ["...", "...", "..."],
  "platforms": ["...", "...", "..."],
  "hookLine": "一句話 — 我能怎麼打動他"
}`,
          userTemplate: "產品：\n{{material}}",
        }],
      },
    ],
  },

  /* ─── 6. 命名 Squad ───────────────────────────────────────────────── */
  "name-it": {
    id: "name-it",
    label: "命名",
    squadName: "Naming Squad",
    squadTagline: "中文 + 英文並行命名 → 配對成組",
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
        label: "雙語並行命名",
        description: "中文命名師與英文命名師獨立發想（各專所長）",
        agents: [
          {
            id: "zh-namer",
            name: "趙宇恆", role: "中文命名師", skill: "中文命名",
            avatar: "恆", tone: "write", preferredProvider: "qwen",
            system: "你是中文命名師。輸出 8 個純中文候選（2-4 字），考量音、形、意，純列表編號。**只給中文，不要任何英文字母。**",
            userTemplate: "對象：\n{{material}}\n風格：{{style}}",
          },
          {
            id: "en-namer",
            name: "Daniel Cooper", role: "英文命名師", skill: "英文命名",
            avatar: "DC", tone: "write", preferredProvider: "forge",
            system: "You are an English brand naming specialist. Output 8 English candidates (single word or compound), considering memorability, searchability, domain availability. Pure list with numbering. **English only, no Chinese characters.**",
            userTemplate: "Subject:\n{{material}}\nStyle: {{style}}",
          },
        ],
      },
      {
        id: "pair",
        label: "配對主編",
        description: "從中英 16 個候選配 5 組最佳組合",
        isOrchestrator: true,
        agents: [{
          id: "pair-editor",
          name: "Felicia Tang", role: "命名配對主編", skill: "雙語配對",
          avatar: "FT", tone: "orchestrate", preferredProvider: "forge",
          system: `你是命名配對主編。從上方中文 8 個 + 英文 8 個草稿中，挑出 5 組最佳的中英配對（也可微調）。輸出嚴格 JSON 陣列（不要 markdown 圍欄）：
[{"chinese":"...","english":"...","meaning":"一句話寓意"}, ...]
共 5 組。`,
          userTemplate: "對象：\n{{material}}",
        }],
      },
    ],
  },

  /* ─── 7. 在地化翻譯 Squad ─────────────────────────────────────────── */
  "translate-localize": {
    id: "translate-localize",
    label: "在地化翻譯",
    squadName: "Localization Squad",
    squadTagline: "直譯 → 在地化 → 校對 三人接力",
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
        label: "忠實直譯",
        description: "翻譯員先做忠實版本",
        agents: [{
          id: "translator",
          name: "簡建翔", role: "資深翻譯員", skill: "忠實翻譯",
          avatar: "翔", tone: "research", preferredProvider: "forge",
          system: "你是專業翻譯員。做忠實直譯，保留原意與術語。輸出 1 段譯文，不要解釋。",
          userTemplate: "從 {{from}} 翻成 {{to}}：\n{{material}}",
        }],
      },
      {
        id: "localize",
        label: "在地化潤飾",
        description: "在地化文案重寫，加入文化適配",
        agents: [{
          id: "localizer",
          name: "Megumi Yang", role: "在地化文案", skill: "文化在地化",
          avatar: "MY", tone: "write", preferredProvider: "qwen",
          system: "你是在地化文案。基於直譯版，重寫成符合目標市場語感的版本（換成在地慣用語、改文化參照、調節奏）。只輸出在地化版，不要解釋。",
          userTemplate: "原文：\n{{material}}\n目標：{{to}}",
        }],
      },
      {
        id: "qa",
        label: "校對主編",
        description: "比對直譯與在地化，給最終交付 + 動作說明",
        isOrchestrator: true,
        agents: [{
          id: "qa-editor",
          name: "Nathaniel Ho", role: "翻譯校對主編", skill: "QA 校對",
          avatar: "NH", tone: "orchestrate", preferredProvider: "forge",
          system: `你是翻譯校對主編。比對上方直譯版與在地化版，輸出最終交付：

**最終譯文**
（採用在地化版，必要時微調保留直譯的精準度）

**動了什麼**
（30 字內 — 在地化版相對直譯版做了哪些關鍵動作）`,
          userTemplate: "原文：\n{{material}}",
        }],
      },
    ],
  },

  /* ─── 8. Hero Prompt Squad ────────────────────────────────────────── */
  "hero-image-prompt": {
    id: "hero-image-prompt",
    label: "Hero 圖 Prompt",
    squadName: "Visual Prompt Squad",
    squadTagline: "美術指導 → 燈光師 → Prompt 工程師",
    etaSeconds: 20,
    finalKind: "text",
    fields: [
      { key: "material", label: "產品 / 場景", kind: "longtext", required: true },
      { key: "style", label: "風格", kind: "select",
        options: ["極簡攝影", "電影感", "復古插畫", "賽博龐克", "日系雜誌"], default: "電影感" },
    ],
    stages: [
      {
        id: "art",
        label: "美術指導",
        description: "決定構圖與色調",
        agents: [{
          id: "art-director",
          name: "高景明", role: "美術指導", skill: "構圖色調",
          avatar: "明", tone: "analyze", preferredProvider: "qwen",
          system: "你是視覺美術指導。**只負責構圖與色調**（不要碰光線）。輸出 2 行：構圖（鏡位、視角、主視覺重點）/ 色調（主色 2-3 色、調性形容詞）。",
          userTemplate: "場景：\n{{material}}\n風格：{{style}}",
        }],
      },
      {
        id: "light",
        label: "燈光設計",
        description: "決定光線氛圍",
        agents: [{
          id: "lighting-director",
          name: "施品禾", role: "燈光師", skill: "光線氛圍",
          avatar: "禾", tone: "analyze", preferredProvider: "zhipu",
          system: "你是燈光師。**只負責光線氛圍**（不要碰構圖）。輸出 2 行：光源（自然光 / 棚燈 / 街景燈…）/ 氛圍（戲劇 / 柔和 / 神秘 / 俐落…）。",
          userTemplate: "場景：\n{{material}}\n風格：{{style}}",
        }],
      },
      {
        id: "craft",
        label: "Prompt 工程",
        description: "整合美指 + 燈光成 3 個英文 prompt",
        isOrchestrator: true,
        agents: [{
          id: "prompt-engineer",
          name: "Lucas Reyes", role: "Prompt 工程師", skill: "Prompt 工程",
          avatar: "LR", tone: "orchestrate", preferredProvider: "forge",
          system: `你是 Midjourney/DALL·E prompt 工程師。整合上方美術指導（構圖+色調）與燈光師（光線+氛圍）的決策，輸出 3 個英文 prompt 變體：

**Variant 1 — Hero**
prompt: ...
camera: ...
lighting: ...

**Variant 2 — Editorial**
prompt: ...

**Variant 3 — Detail**
prompt: ...`,
          userTemplate: "場景：\n{{material}}\n風格：{{style}}",
        }],
      },
    ],
  },

  /* ─── 9. LinkedIn Squad ───────────────────────────────────────────── */
  "linkedin-summary": {
    id: "linkedin-summary",
    label: "LinkedIn 摘要",
    squadName: "B2B Insight Squad",
    squadTagline: "重點抽取 → 觀點編輯",
    etaSeconds: 14,
    finalKind: "text",
    fields: [
      { key: "material", label: "原文 / 內容", kind: "longtext", required: true },
    ],
    stages: [
      {
        id: "extract",
        label: "重點抽取",
        description: "抽 3 個能成為觀點的事實",
        agents: [{
          id: "extractor",
          name: "邱奕翔", role: "重點抽取分析師", skill: "重點抽取",
          avatar: "翔", tone: "research", preferredProvider: "qwen",
          system: "你是內容分析師。從原文中抽 3 個最有觀點價值的「事實 / 數字 / 反直覺發現」，純列表，每點 25 字內。",
          userTemplate: "內容：\n{{material}}",
        }],
      },
      {
        id: "write",
        label: "B2B 觀點編輯",
        description: "把事實寫成有觀點的 3 句 LinkedIn 摘要",
        isOrchestrator: true,
        agents: [{
          id: "b2b-editor",
          name: "Kelly Wu", role: "B2B 觀點編輯", skill: "觀點寫作",
          avatar: "KW", tone: "orchestrate", preferredProvider: "forge",
          system: "你是 B2B 觀點編輯。基於上方 3 個事實，寫一段 LinkedIn 摘要：3 句中文，第 3 句必須是觀點或 CTA。直接交稿。",
          userTemplate: "內容：\n{{material}}",
        }],
      },
    ],
  },

  /* ─── 10. 色票 Squad ──────────────────────────────────────────────── */
  "color-palette": {
    id: "color-palette",
    label: "品牌色票",
    squadName: "Color Squad",
    squadTagline: "情緒分析 → 色彩工程 → 應用建議",
    etaSeconds: 20,
    finalKind: "swatches",
    fields: [
      { key: "brand", label: "品牌名", kind: "text", required: true },
      { key: "spirit", label: "品牌精神", kind: "longtext", required: true },
    ],
    stages: [
      {
        id: "mood",
        label: "情緒分析",
        description: "從品牌精神抽 mood 形容詞",
        agents: [{
          id: "mood-analyst",
          name: "范靜雅", role: "情緒分析師", skill: "Mood 解讀",
          avatar: "雅", tone: "research", preferredProvider: "qwen",
          system: "你是品牌情緒分析師。輸出 5 個 mood 形容詞（中文），純列表。",
          userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
        }],
      },
      {
        id: "engineer",
        label: "色彩工程",
        description: "把 mood 翻譯成具體 hex",
        agents: [{
          id: "color-engineer",
          name: "Hugo Martín", role: "色彩工程師", skill: "色彩工程",
          avatar: "HM", tone: "craft", preferredProvider: "forge",
          system: `你是色彩工程師。基於 mood，輸出 5 個具體色（hex + 名字），純列表編號（先不寫用法）。每行格式：
1. #A12B3C — 名字`,
          userTemplate: "品牌：{{brand}}\n精神：{{spirit}}",
        }],
      },
      {
        id: "apply",
        label: "應用建議",
        description: "為每色寫角色 + 用法，輸出 swatches JSON",
        isOrchestrator: true,
        agents: [{
          id: "color-applier",
          name: "Priya Anand", role: "色彩應用主編", skill: "色彩應用",
          avatar: "PA", tone: "orchestrate", preferredProvider: "forge",
          system: `你是色彩應用主編。基於上方 5 個 hex 色，為每色補上角色與用法。輸出嚴格 JSON 陣列（不要 markdown 圍欄）：
[{"hex":"#A12B3C","name":"...","role":"primary|secondary|accent|neutral|highlight","usage":"一句話用法建議"}, ...]
共 5 色，第一色為 primary。`,
          userTemplate: "品牌：{{brand}}",
        }],
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

// Brand context now lives in _core/brandContext.ts so every router
// uses the same source of truth + same 1-min cache.
import { buildBrandPrefix as buildBrandContext } from "../_core/brandContext";

/**
 * 2026-08-11: turn a workbench spot reference into the audience label stored
 * alongside the produced content.
 *
 * The client sends only { scenarioId, spotIndex }; the labels are read here
 * from the brand's own positioning._workbench so they always match the
 * scenario that actually produced them, and so a long audience anchor never
 * has to travel through a URL.
 *
 * Best-effort by design: attribution is a nice-to-have on top of the content,
 * never a reason to fail someone's task. Any miss (no ref, brand gone,
 * scenario deleted, index out of range) simply yields an untagged run.
 */
async function resolveAudienceTag(
  userId: number,
  brandId: number | undefined,
  spotRef: { scenarioId: string; spotIndex: number } | null | undefined,
): Promise<{ audience: string; spotTitle: string | null; scenarioId: string; spotIndex: number } | null> {
  if (!spotRef || !brandId) return null;
  try {
    const { default: localPool } = await import("../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT positioning FROM brands WHERE id = ? AND userId = ? LIMIT 1`,
      [brandId, userId],
    );
    let pos: any = (rows as any[])[0]?.positioning;
    if (!pos) return null;
    if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { return null; } }

    const scenarios: any[] = Array.isArray(pos?._workbench?.scenarios) ? pos._workbench.scenarios : [];
    const scn = scenarios.find((s) => s?.id === spotRef.scenarioId);
    if (!scn) return null;

    const audience = String(scn?.selection?.audience ?? "").trim();
    if (!audience) return null;
    const spot = scn?.derived?.spots?.[spotRef.spotIndex];

    return {
      audience: audience.slice(0, 600),
      spotTitle: spot?.title ? String(spot.title).slice(0, 120) : null,
      scenarioId: spotRef.scenarioId,
      spotIndex: spotRef.spotIndex,
    };
  } catch (e) {
    console.warn("[resolveAudienceTag] non-fatal:", (e as Error)?.message);
    return null;
  }
}

// ── English labels for all 30s/60s tasks ────────────────────────────────────
// Primary display locale is zh-TW; this map supplies the EN equivalent used
// when the UI language is switched to English. KOL tasks already use the
// { en, zh } object format so they're handled separately in listFB below.
const TASK_LABEL_EN: Record<string, string> = {
  // Facebook 30s
  "fb-30-caption-short":    "FB Short caption",
  "fb-30-pure-text-hook":   "FB Text-only hooks × 3",
  "fb-30-link-caption":     "FB Link post caption",
  "fb-30-comment-reply":    "FB Comment reply",
  "fb-30-ad-headline":      "FB Ad headlines × 5",
  "fb-30-ad-primary":       "FB Ad primary text × 5",
  "fb-30-ad-cta":           "FB Ad CTAs × 5",
  "fb-30-ad-description":   "FB Link ad descriptions × 5",
  "fb-30-story-text":       "FB Story copy",
  "fb-30-hashtag-set":      "FB Hashtag set",
  "fb-30-countdown-1day":   "FB 1-day countdown hype",
  "fb-30-live-title":       "FB Live title + teaser",
  "fb-30-pinned-short":     "FB Pinned post copy",
  // Instagram 30s
  "ig-30-caption-short":         "IG Short caption",
  "ig-30-pure-text-hook":        "IG Text hooks × 3",
  "ig-30-story-text":            "IG Story copy + sticker ideas",
  "ig-30-reel-hook":             "IG Reel opening hook (first 3s)",
  "ig-30-reel-script-full":      "IG Reel full script (15-30s)",
  "ig-30-carousel-structure":    "IG Carousel 10-slide structure",
  "ig-30-hashtag-set":           "IG Hashtag set × 30",
  "ig-30-bio-rewrite":           "IG Bio rewrite",
  "ig-30-comment-reply":         "IG Comment reply",
  "ig-30-dm-script":             "IG DM auto-reply script",
  "ig-30-live-opening":          "IG Live opening (30s)",
  "ig-30-story-repost-strategy": "IG Story 24h repost strategy",
  "ig-30-threads-cross-post":    "IG → Threads cross-post",
  // YouTube 30s
  "yt-30-title-strategies":  "YT Video title (3 strategies)",
  "yt-30-description-seo":   "YT SEO description (full)",
  "yt-30-thumbnail-text":    "YT Thumbnail copy + visual brief",
  "yt-30-opening-hook":      "YT Opening hook (first 15s)",
  "yt-30-chapter-timeline":  "YT Chapter timestamps ⭐",
  "yt-30-end-cta":           "YT End-screen CTA",
  "yt-30-pinned-comment":    "YT Pinned comment hook",
  "yt-30-comment-reply":     "YT Comment reply",
  "yt-30-shorts-script":     "YT Shorts script (30-60s)",
  "yt-30-community-post":    "YT Community tab post",
  // TikTok 30s
  "tt-30-opening-hook":      "TikTok Opening hook (first 3s)",
  "tt-30-full-script":       "TikTok Full script (30-60s)",
  "tt-30-caption-description":"TikTok Caption (description)",
  "tt-30-caption-rhythm":    "TikTok Caption rhythm (timestamps)",
  "tt-30-hashtag-set":       "TikTok Hashtag set",
  "tt-30-trend-remix":       "TikTok Trend remix",
  "tt-30-duet-angle":        "TikTok Duet angle ideas",
  "tt-30-bio-rewrite":       "TikTok Bio rewrite",
  "tt-30-comment-reply":     "TikTok Comment reply",
  "tt-30-live-opening":      "TikTok Live opening (30s)",
  // LinkedIn 30s
  "li-30-insight-post":  "LI Insight post",
  "li-30-hook-3":        "LI Hooks × 3 (scroll-stopper)",
  "li-30-article-opener":"LI Article opener (first 200 words)",
  "li-30-newsletter":    "LI Newsletter title + intro",
  "li-30-poll":          "LI Poll (question + 4 options)",
  "li-30-document":      "LI Document (8-slide PDF carousel)",
  "li-30-comment":       "LI Comment reply",
  "li-30-dm-intro":      "LI Cold DM intro",
  "li-30-event-invite":  "LI Event invite post",
  "li-30-headline":      "LI Profile headline",
  // Email 30s
  "em-30-subject-line":   "Email subject line",
  "em-30-preview-text":   "Email preview text",
  "em-30-welcome":        "Welcome email",
  "em-30-cold-email":     "Cold email",
  "em-30-drip":           "Drip series (nth email)",
  "em-30-promo":          "Promotional email (limited offer)",
  "em-30-event-invite":   "Event invite email",
  "em-30-abandoned-cart": "Abandoned cart recovery",
  "em-30-re-engagement":  "Re-engagement email",
  "em-30-transactional":  "Transactional notification",
  // PR 30s
  "pr-30-headline":       "Press release headline",
  "pr-30-subhead":        "PR subheadline + lead",
  "pr-30-lead-paragraph": "Inverted pyramid lead paragraph",
  "pr-30-boilerplate":    "Company boilerplate",
  "pr-30-ceo-quote":      "CEO statement (speech)",
  "pr-30-fact-sheet":     "Fact sheet (one-pager)",
  "pr-30-spokesperson-qa":"Spokesperson Q&A (media prep)",
  "pr-30-media-pitch":    "Media pitch email",
  "pr-30-news-hook":      "News story idea generator",
  "pr-30-launch-social":  "Launch PR social post",
  // Facebook 60s
  "fb-60-single-full":      "FB Full post",
  "fb-60-link-full":        "FB Link post (full)",
  "fb-60-album-4":          "FB Photo album × 4",
  "fb-60-countdown-5day":   "FB 5-day countdown series",
  "fb-60-launch-kit":       "FB Event launch kit (4 posts)",
  "fb-60-live-suite":       "FB Live suite (6 pieces)",
  "fb-60-pinned-suite":     "FB Pinned + 3 companion posts",
  "fb-60-ad-pack-3":        "FB Ad pack A/B/C",
  // Instagram 60s
  "ig-60-feed-full":              "IG Full feed post",
  "ig-60-reel-full":              "IG Reel full script",
  "ig-60-carousel-7":             "IG Carousel 7-slide",
  "ig-60-story-3frame":           "IG Story 3-frame set",
  "ig-60-countdown-5day":         "IG 5-day countdown series",
  "ig-60-highlight-suite":        "IG Highlight × 5 (cover + content)",
  "ig-60-live-suite":             "IG Live suite (5 pieces)",
  "ig-60-serial-3":               "IG 3-part narrative series",
  "ig-60-viral-rewrite":          "IG Viral rewrite",
  "ig-60-testimonial-rewrite":    "IG Testimonial rewrite",
  // YouTube 60s
  "yt-60-video-package":   "YT Full video caption package",
  "yt-60-shorts-script":   "YT Shorts full script",
  "yt-60-thumbnail-suite": "YT Thumbnail × 5 styles",
  "yt-60-series-3ep":      "YT 3-episode series",
  "yt-60-community-post":  "YT Community post",
  "yt-60-viral-rewrite":   "YT Viral video rewrite",
  // TikTok 60s
  "tt-60-foryou-full":    "TikTok ForYou full package",
  "tt-60-series-3":       "TikTok 3-episode series",
  "tt-60-viral-rewrite":  "TikTok Viral rewrite",
  // LinkedIn 60s
  "li-60-thought-leader": "LI Thought leadership post (full)",
  "li-60-newsletter":     "LI Newsletter (one issue)",
  "li-60-case-study":     "LI Client case study rewrite",
  // Email 60s
  "em-60-newsletter-full":  "Email Newsletter (full issue)",
  "em-60-promo-sequence":   "Email promo sequence (3 emails)",
  "em-60-onboarding-3":     "Email onboarding sequence (3 emails)",
  // PR 60s
  "pr-60-news-release-full": "Full press release",
  // Brand / Research 60s
  "br-60-tagline-suite":   "Brand tagline × 5 variants",
  "br-60-value-prop":      "Value proposition rewrite",
  "br-60-brand-voice":     "Brand Voice Guideline",
  "rs-60-interview-guide": "User interview guide (full)",
  "rs-60-persona-suite":   "User persona × 5",
  "rs-60-jtbd-suite":      "Jobs-to-be-Done × 5",
  // Facebook 99s
  "fb-99-30day-calendar":         "FB 30-day content calendar",
  "fb-99-monthly-calendar-promo": "FB 30-day promo calendar (multi-product)",
  "fb-99-carousel-5":             "FB Carousel 5-card",
  "fb-99-serial-3":               "FB 3-part narrative series",
  "fb-99-viral-rewrite":          "FB Viral rewrite",
  "fb-99-testimonial-rewrite":    "FB Testimonial rewrite",
  "fb-99-trend-rewrite":          "FB Trending news rewrite",
  "fb-99-14day-countdown":        "FB Countdown series (7 / 14 days)",
  "fb-99-launch-toolkit":         "FB Full launch toolkit (8 posts)",
  "fb-99-livestream-9seg":        "FB Live 9-segment suite",
  "fb-99-crisis-playbook":        "FB Full crisis PR playbook",
  // FB 99s squads
  "fb-99-account-reposition": "FB Account repositioning",
  "fb-99-quarterly-strategy": "FB Quarterly content strategy",
  "fb-99-monthly-analytics":  "FB Monthly performance report",
  "fb-99-carousel-cvo":       "FB Carousel: awareness-to-purchase story",
  "fb-99-offer-first":        "FB Offer-led post",
  "fb-99-magnetic-marketing": "FB Magnetic marketing post",
  "fb-99-mass-control":       "FB Grand launch playbook",
  // Instagram 99s
  "ig-99-30day-calendar":    "IG 30-day content calendar",
  "ig-99-reel-series-6":     "IG Reel 6-episode series",
  "ig-99-account-reposition":"IG Account repositioning full kit",
  // IG 99s squads
  "ig-99-monthly-calendar":       "IG 30-day content calendar",
  "ig-99-youtility":              "IG Utility-first content strategy",
  "ig-99-visual-story":           "IG Visual-consistency brand posts",
  "ig-99-live-first":             "IG Live-first content strategy",
  "ig-99-document":               "IG Documentary-style content",
  "ig-99-radical-transparency":   "IG Radical transparency brand posts",
  "ig-99-save-worthy":            "IG Save-worthy utility posts",
  // YouTube 99s
  "yt-99-series-6ep":         "YT 6-episode full production pack",
  "yt-99-quarterly-strategy": "YT Quarterly channel strategy",
  "yt-99-premiere-kit":       "YT Premiere full kit",
  // TikTok 99s
  "tt-99-30day-foryou":  "TikTok 30-day ForYou formula",
  "tt-99-trend-week":    "TikTok 1-week trending full kit",
  // LinkedIn 99s
  "li-99-30day-thought-leadership": "LI 30-day Thought Leadership calendar",
  "li-99-newsletter-quarterly":     "LI Quarterly newsletter (4 issues)",
  // Email 99s
  "em-99-4week-nurture":    "Email 4-week onboarding nurture",
  "em-99-launch-sequence":  "Email product launch automation sequence",
  // PR 99s
  "pr-99-launch-toolkit": "PR Full launch media toolkit",
  "pr-99-newsjack":        "Newsjacking (trending news hook)",
};
// 2026-05-05 quick-task pivot
import { quickTaskOutputSpec, parseQuickTaskOutput, type QuickTaskOutput } from "../_core/quickTaskOutput";
import { FB_30S_TASKS, FB_90S_TASK_INDEX, listAllFBTasks } from "../_core/quickTaskFB";
import { FB_60S_TASKS_V2, FB_60S_ORCHESTRA, getFB60OrchestraConfig, getFB60Template } from "../_core/quickTaskFB60";
import { IG_60S_TASKS, getIG60OrchestraConfig, getIG60Template } from "../_core/quickTaskIG60";
import { YT_60S_TASKS, getYT60OrchestraConfig, getYT60Template } from "../_core/quickTaskYT60";
import { MULTI_60S_TASKS, getMulti60OrchestraConfig, getMulti60Template } from "../_core/quickTaskMulti60";
import { ALL_99S_TASKS, get99Template, get99OrchestraConfig } from "../_core/quickTask100";
import { ALL_99S_SQUADS } from "../_core/quickTask100Squads";
import { normalizeTaskId, legacyTaskId } from "../_core/tierCompat";
import {
  getIgStrategyExecutionSlug,
  getIgStrategyPublicPolicy,
  getIgStrategyRecordOverrides,
  buildIgStrategyPrivateTerms,
  findIgStrategyInternalLeaks,
  redactIgStrategySynthesisContext,
  sanitizeIgStrategyPublicCaption,
} from "../_core/igStrategyPublicOutput";
import {
  assertPrivateStrategyArtifactsReady,
  assertRedactedStrategyContextReady,
  buildIgStrategyPublicSlots,
  buildIgStrategySynthesisMessages,
  parseIgStrategyPublicVariants,
  runSynthesisBatchesWithDeadline,
  type IgStrategyPrivateArtifact,
} from "../_core/igStrategyPublicSynthesis";
import { snapshot as llmCircuitSnapshot } from "../_core/llmCircuitBreaker";
import { IG_30S_TASKS, getIGOrchestraConfig } from "../_core/quickTaskIG";
import { YT_30S_TASKS, getYTOrchestraConfig } from "../_core/quickTaskYT";
import { TT_30S_TASKS, getTTOrchestraConfig } from "../_core/quickTaskTikTok";
import { LI_30S_TASKS, getLIOrchestraConfig } from "../_core/quickTaskLI";
import { EMAIL_30S_TASKS, getEmailOrchestraConfig } from "../_core/quickTaskEmail";
import { PR_30S_TASKS, getPROrchestraConfig } from "../_core/quickTaskPR";
import { BRAND_30S_TASKS, getBrandOrchestraConfig } from "../_core/quickTaskBrand";
import { RESEARCH_30S_TASKS, getResearchOrchestraConfig } from "../_core/quickTaskResearch";
// 2026-05-12 (CJ「KOL 提供說法不提供名單」)
import { KOL_30S_TASKS, KOL_30S_ORCHESTRA } from "../_core/quickTaskKOL";
function getKOLOrchestraConfig(taskId: string) { return KOL_30S_ORCHESTRA[taskId] ?? null; }
import { findFirstUrl, fetchUrlSummary, formatUrlSummaryForPrompt } from "../_core/urlContext";
import localPool from "../localDb";
// 2026-05-18 (CJ「media to copy」): photo/video/doc media task catalog
import { MEDIA_PHOTO_TASKS, MEDIA_VIDEO_TASKS, MEDIA_DOC_TASKS } from "../_core/quickTaskMedia";

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
      throw e;
    }
  }
}

function buildPriorContext(
  prior: Array<{ stageLabel: string; agentName: string; agentRole: string; output: string }>
): string {
  if (!prior.length) return "";
  const grouped: Record<string, Array<{ agentName: string; agentRole: string; output: string }>> = {};
  for (const p of prior) {
    (grouped[p.stageLabel] ??= []).push({ agentName: p.agentName, agentRole: p.agentRole, output: p.output });
  }
  const sections: string[] = [];
  for (const [stage, items] of Object.entries(grouped)) {
    sections.push(`【上一階段：${stage}】`);
    for (const it of items) {
      sections.push(`◆ ${it.agentName}（${it.agentRole}）的交付：\n${it.output}`);
    }
  }
  return `\n\n[同事的接力交付]\n${sections.join("\n\n")}\n`;
}

/* ──────────────────────────── ROUTER ───────────────────────────────────── */

const runSquadAutoSingleFlight = singleFlightPerUser({
  key: "quickTask.runSquadAuto",
  message: "這個企劃還在產生中，完成後才能再開一個。",
});

export const quickTaskRouter = router({
  list: protectedProcedure.query(() => {
    return Object.values(TASKS).map((t) => ({
      id: t.id,
      label: t.label,
      squadName: t.squadName,
      squadTagline: t.squadTagline,
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
          avatar: a.avatar,
          tone: a.tone,
          provider: a.preferredProvider,
        })),
      })),
    }));
  }),

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
          agentRole: z.string(),
          output: z.string(),
        })).optional(),
      })
    )
    .mutation(async ({ input }) => {
      input = { ...input, taskId: normalizeTaskId(input.taskId) }; // 100s→99s compat
      const def = TASKS[input.taskId];
      if (!def) throw new Error(`Unknown taskId: ${input.taskId}`);
      const stage = def.stages.find((s) => s.id === input.stageId);
      if (!stage) throw new Error(`Unknown stageId: ${input.stageId}`);
      const agent = stage.agents.find((a) => a.id === input.agentId);
      if (!agent) throw new Error(`Unknown agentId: ${input.agentId}`);

      const brandPrefix = await buildBrandContext(input.brandId);
      const priorContext = buildPriorContext(input.prior ?? []);
      const filledUser = fillTemplate(agent.userTemplate, input.inputs ?? {});
      const userMsg = priorContext + (priorContext ? "\n\n[原始企劃摘要]\n" : "") + filledUser;

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
        agentAvatar: agent.avatar,
        agentTone: agent.tone,
        output: result.content,
        structured: isFinalStructured ? tryParseJson(result.content) : null,
        provider: result.provider,
        model: result.model,
        fellBack: result.fellBack,
        tookMs,
        brandInjected: brandPrefix.length > 0,
      };
    }),

  // ─── Quick-task pivot 2026-05-05 ───────────────────────────────────
  // listFB: returns the entire FB task catalog (30s/60s/90s) for the new
  // home page chips. Includes bound agent metadata (avatar/name/title)
  // so cards can render the agent face as the thumbnail.
  listFB: protectedProcedure.query(async () => {
    // Despite the name, this catalog now spans FB + IG (and other channels
    // as they ship). Frontend channel-icon row filters by task.platform /
    // postType prefix.
    const fbTasks = listAllFBTasks();
    const igTasks = IG_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "instagram",
    }));
    const ytTasks = YT_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "youtube",
    }));
    const ttTasks = TT_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "tiktok",
    }));
    const liTasks = LI_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "linkedin",
    }));
    const emTasks = EMAIL_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "email",
    }));
    const prTasks = PR_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "pr",
    }));
    const brTasks = BRAND_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "brand",
    }));
    const rsTasks = RESEARCH_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "audience",
    }));
    // 2026-05-12 — KOL outreach 30s tasks
    const kolTasks = KOL_30S_TASKS.map((t) => ({
      ...t,
      kind: "fast" as const,
      platform: "kol",
    }));
    // 60s production-package tasks (2026-05-06) — multi-agent collab
    const fb60Tasks = FB_60S_TASKS_V2.map((t) => ({ ...t, kind: "fast" as const, platform: "facebook" }));
    const ig60Tasks = IG_60S_TASKS.map((t) => ({ ...t, kind: "fast" as const, platform: "instagram" }));
    const yt60Tasks = YT_60S_TASKS.map((t) => ({ ...t, kind: "fast" as const, platform: "youtube" }));
    // 100s tasks split into:
    //  - SQUAD-based (FB + IG with full multi-step squad infrastructure):
    //    runs via squad.stepExecute → /picker workspace UI
    //  - Orchestra-based fallback (other channels — Phase 2: build squads)
    // Resolve real squad rosters from DB so each card shows its actual lead
    // agent + team members (not generic AI Agent avatar).
    // 100s→99s rename compat: the in-code index uses new "fb-99-…" slugs;
    // the production `squads` table may still hold legacy "fb-100-…" slugs
    // (no DB migration). Query BOTH forms and key the map by the NEW slug
    // so squad cards keep their real lead-agent + team avatars regardless.
    const squadSlugs = ALL_99S_SQUADS.map((s) => s.squad_slug);
    const squadSlugQuery = Array.from(
      new Set(squadSlugs.flatMap((s) => [s, legacyTaskId(s)].filter(Boolean) as string[])),
    );
    const squadAgentMap: Record<string, { leadAgentId: number | null; agentIds: number[] }> = {};
    if (squadSlugQuery.length > 0) {
      try {
        const placeholders = squadSlugQuery.map(() => "?").join(",");
        const [rows]: any = await localPool.execute(
          `SELECT slug, lead_agent_id, agents FROM squads WHERE slug IN (${placeholders})`,
          squadSlugQuery,
        );
        for (const r of rows as any[]) {
          let agentIds: number[] = [];
          try {
            const parsed = typeof r.agents === "string" ? JSON.parse(r.agents) : r.agents;
            if (Array.isArray(parsed)) {
              agentIds = parsed
                .map((a: any) => Number(a?.id ?? a?.agent_id))
                .filter((n: number) => Number.isFinite(n) && n > 0);
            }
          } catch { /* ignore parse errors */ }
          squadAgentMap[normalizeTaskId(r.slug)] = { leadAgentId: r.lead_agent_id ?? null, agentIds };
        }
      } catch { /* squads table query failure non-fatal */ }
    }
    const tasks99Squads = ALL_99S_SQUADS.map((s) => {
      const sq = squadAgentMap[s.squad_slug];
      return {
        id: s.id,
        tier: "99s" as const,
        postType: s.postType,
        platform: s.platform,
        label: s.label,
        description: s.description,
        kind: "squad" as const,
        squad_slug: s.squad_slug,
        methodology: s.methodology,
        // attach lead agent for hero avatar + member ids for team stack
        agent_id: sq?.leadAgentId ?? null,
        squad_member_ids: sq?.agentIds ?? [],
      };
    });
    // Orchestra-based 100s tasks for channels without squads yet (filtered to
    // exclude FB + IG since those now have proper squads above)
    // 2026-05-18 (CJ): fb-99-carousel-5 is the one FB 99s task that runs
    // via the orchestra (multi-card carousel), not a squad — let it
    // through so it appears in the 99s tab; other fb-/ig- stay squad-driven.
    const tasks99Orchestra = ALL_99S_TASKS.filter((t) =>
      t.id === "fb-99-carousel-5" || t.id === "fb-99-serial-3" ||
      t.id === "fb-99-trend-rewrite" || t.id === "fb-99-viral-rewrite" ||
      t.id === "fb-99-testimonial-rewrite" || t.id === "fb-99-30day-calendar" ||
      t.id === "fb-99-monthly-calendar-promo" || t.id === "fb-99-14day-countdown" ||
      (!t.id.startsWith("fb-") && !t.id.startsWith("ig-"))
    ).map((t) => {
      const id = t.id;
      const platform =
        id.startsWith("yt-") ? "youtube"
        : id.startsWith("tt-") ? "tiktok"
        : id.startsWith("li-") ? "linkedin"
        : id.startsWith("em-") ? "email"
        : id.startsWith("pr-") ? "pr"
        : id.startsWith("br-") ? "brand"
        : id.startsWith("rs-") ? "audience"
        // 2026-05-18 (CJ): kl-* (e.g. kl-99-campaign-toolkit) → KOL category
        : id.startsWith("kl-") ? "kol"
        : "facebook";
      return { ...t, kind: "fast" as const, platform };
    });
    const tasks100 = [...tasks99Squads, ...tasks99Orchestra];
    const multi60Tasks = MULTI_60S_TASKS.map((t) => {
      const id = t.id;
      const platform =
        id.startsWith("tt-") ? "tiktok"
        : id.startsWith("li-") ? "linkedin"
        : id.startsWith("em-") ? "email"
        : id.startsWith("pr-") ? "pr"
        : id.startsWith("br-") ? "brand"
        : id.startsWith("rs-") ? "audience"
        // 2026-05-18 (CJ「KOL 完整邀約話術包應在 KOL 類別」): kl-* was
        // missing → fell through to "facebook". Tag it as the KOL category.
        : id.startsWith("kl-") ? "kol"
        : "facebook";
      return { ...t, kind: "fast" as const, platform };
    });
    // 2026-05-18 (CJ「media to copy」): photo/video/doc tasks — isMediaTask:true
    // tells the frontend to route directly to the upload page (ctaPath) instead
    // of opening the standard orchestra modal.
    const mediaTasks = [
      ...MEDIA_PHOTO_TASKS,
      ...MEDIA_VIDEO_TASKS,
      ...MEDIA_DOC_TASKS,
    ].map((t) => ({
      ...t,
      kind: "fast" as const,
      isMediaTask: true as const,
      // 2026-07-20 (CJ QA「任務卡作者顯示 AI Agent」): agent_id now comes
      // from the media task template — was hard-coded null, which made all
      // 9 media cards fall back to the generic "AI Agent" persona.
      squadName: null,
    }));

    const tasks: any[] = [
      ...fbTasks, ...fb60Tasks, ...ig60Tasks, ...yt60Tasks, ...multi60Tasks,
      ...tasks100,
      ...igTasks, ...ytTasks, ...ttTasks, ...liTasks, ...emTasks, ...prTasks, ...brTasks, ...rsTasks, ...kolTasks,
      ...mediaTasks,
    ];
    // 60s production-package universal team agent IDs (used by orchestra)
    // Emma Zhang / Helen Sung / David Wang / Sophie Ho / Jordan Hayes / Mandy / Nancy / Nina / Anna / Zeyu / Nathan
    const UNIVERSAL_60S_IDS = [30005, 180163, 30003, 60012, 239184, 180170, 180157, 180165, 60071, 60062];
    // Resolve 60s orchestra config for each task to get strategist + specialty + image director
    const orchestraLookup = (id: string) =>
      getFB60OrchestraConfig(id) ?? getIG60OrchestraConfig(id) ??
      getYT60OrchestraConfig(id) ?? getMulti60OrchestraConfig(id);
    // Collect unique agent_ids that need lookup (covers both fb + ig + collab team)
    const teamIdsByTask: Record<string, number[]> = {};
    for (const t of tasks) {
      if (t.tier !== "60s") continue;
      const cfg = orchestraLookup(t.id);
      if (!cfg) continue;
      const ids: number[] = [];
      if (t.agent_id) ids.push(t.agent_id);
      if (cfg.imageDirectorId) ids.push(cfg.imageDirectorId);
      if (cfg.strategistAgentId) ids.push(cfg.strategistAgentId);
      if (cfg.specialtyAgentId) ids.push(cfg.specialtyAgentId);
      ids.push(...UNIVERSAL_60S_IDS.slice(0, 5)); // Emma/Helen/David/Sophie/Jordan core 5
      teamIdsByTask[t.id] = Array.from(new Set(ids));
    }
    // Also collect squad team member IDs so each 100s squad card can render
    // a proper team avatar stack (lead + first 4 members).
    const squadTeamIds: number[] = [];
    for (const sq of Object.values(squadAgentMap)) {
      if (sq.leadAgentId) squadTeamIds.push(sq.leadAgentId);
      squadTeamIds.push(...sq.agentIds.slice(0, 5));
    }
    const agentIds: number[] = Array.from(new Set([
      ...tasks.flatMap((t: any) => (t.agent_id ? [Number(t.agent_id)] : [])),
      ...Object.values(teamIdsByTask).flat(),
      ...squadTeamIds,
    ]));
    const agentMap: Record<number, { id: number; name: string; title: string; avatarUrl: string | null }> = {};
    if (agentIds.length > 0) {
      const placeholders = agentIds.map(() => "?").join(",");
      try {
        const [rows]: any = await localPool.execute(
          `SELECT id, name, title, avatarUrl FROM agents WHERE id IN (${placeholders})`,
          agentIds,
        );
        for (const r of (rows as any[])) {
          agentMap[r.id] = { id: r.id, name: r.name, title: r.title, avatarUrl: r.avatarUrl ?? null };
        }
      } catch { /* agent metadata failure non-fatal — UI shows fallback */ }
    }
    return tasks.map((t: any) => {
      // Derive platform: explicit override (IG tasks) wins; else infer from
      // task id prefix (fb-* / ig-*) for back-compat with older FB rows.
      const platform =
        t.platform ??
        (t.id?.startsWith("ig-") ? "instagram"
          : t.id?.startsWith("yt-") ? "youtube"
          : t.id?.startsWith("tt-") ? "tiktok"
          : t.id?.startsWith("li-") ? "linkedin"
          : t.id?.startsWith("em-") ? "email"
          : t.id?.startsWith("pr-") ? "pr"
          : t.id?.startsWith("br-") ? "brand"
          : t.id?.startsWith("rs-") ? "audience"
          : t.id?.startsWith("fb-") ? "facebook"
          : "facebook");
      // 2026-05-11 — label may be a string (legacy) or { en, zh } structured.
      // Frontend chip + modal title only need a single string, so flatten to
      // zh (the primary display locale). Bilingual parts are surfaced
      // separately as label_en / label_zh below so the modal can render
      // "EN · 中文" without manual concatenation drift.
      const labelStr = typeof t.label === "string"
        ? t.label
        : (t.label?.zh ?? t.label?.en ?? t.id);
      // 2026-07-18 多市場: description is bilingual too — flatten to the
      // zh string (legacy field) + surface description_en for the EN UI.
      const descStr = typeof t.description === "string"
        ? t.description
        : (t.description?.zh ?? t.description?.en ?? "");
      const base = {
        id: t.id, tier: t.tier, postType: t.postType, platform,
        label: labelStr, description: descStr, kind: t.kind,
        description_en: typeof t.description === "object" && t.description?.en ? t.description.en : null,
      };
      if (t.kind === "squad") {
        // 100s squad tasks: surface lead agent + team roster + a primary
        // input so user can provide brief context (auto-injected as topic
        // when squad runs inline via runSquadAuto).
        const leadId = t.agent_id ?? null;
        const memberIds: number[] = Array.isArray(t.squad_member_ids) ? t.squad_member_ids : [];
        const team = memberIds.map((id: number) => agentMap[id]).filter(Boolean);
        const squadLabelEn = typeof t.label === "object" && t.label?.en ? t.label.en : (TASK_LABEL_EN[t.id] ?? null);
        return {
          ...base,
          label_en: squadLabelEn,
          label_zh: typeof t.label === "object" && t.label?.zh ? t.label.zh : null,
          squad_slug: t.squad_slug,
          methodology: t.methodology ?? null,
          inputs: [{ key: "topic", label: "本次活動 / 主題 / 重點", type: "textarea", required: true }],
          primary_question: t.primary_question ?? "本次想交付什麼？簡單說明主題、活動、目標即可（AI 專家會自動搜尋節慶、趨勢資料）",
          primary_input: t.primary_input ?? { key: "topic", placeholder: "例：5 月母親節限時優惠 / 新品上市 / 客戶見證輯", type: "textarea" as const },
          agent: leadId ? (agentMap[leadId] ?? null) : null,
          team: team.length > 0 ? team : undefined,
          skill_slug: null,
        };
      }
      // For 60s tasks, surface the full collab team so cards can show
      // "8 位 agent 協作" badge + tooltip with team roster.
      const teamIds = teamIdsByTask[t.id] ?? [];
      const team = teamIds.map((id) => agentMap[id]).filter(Boolean);
      return {
        ...base,
        inputs: t.inputs ?? [],
        eta_seconds: t.tier === "30s" ? 30 : 60,
        preferredModel: t.preferredModel,
        agent_id: t.agent_id ?? null,
        skill_slug: t.skill_slug ?? null,
        primary_question: t.primary_question ?? null,
        primary_input: t.primary_input ?? null,
        // 2026-05-11 — surface bilingual label parts + context wiring so the
        // intake modal can render "EN · 中文" + the "我會用 X 來跑" strip.
        // 2026-05-19 — also look up TASK_LABEL_EN for tasks with plain-string labels.
        label_en: typeof t.label === "object" && t.label?.en ? t.label.en : (TASK_LABEL_EN[t.id] ?? null),
        label_zh: typeof t.label === "object" && t.label?.zh ? t.label.zh : null,
        contextSources: t.contextSources ?? null,
        agent: t.agent_id ? (agentMap[t.agent_id] ?? null) : null,
        team: team.length > 0 ? team : undefined,
      };
    });
  }),

  // runQuick: execute a 30s or 60s FB task with a single LLM call.
  // Returns canonical QuickTaskOutput (see quickTaskOutput.ts). For 90s
  // tasks, frontend should call squad.stepExecute (existing pipeline).
  // ── Plan B 20s orchestra (2026-05-05) ──────────────────────────────
  // Parallel fanout: caption_writer + image_director + N×Flux Schnell.
  // Returns OrchestraResult — variants[] each with {caption, image:{url,status}}.
  // 20s hard budget; per-image 7s; degrades gracefully (timeout chips).
  // 60s tier — same task pool as 30s, but orchestra scales: 5 variants +
  // QA reviewer (Jordan Hayes) + 50s budget. User sees richer output.
  runOrchestra60: protectedProcedure
    .input(z.object({
      taskId: z.string().min(1).max(64),
      inputs: z.record(z.string(), z.string()).default({}),
      brandId: z.number().optional(),
      productId: z.number().optional().nullable(),
      eventId: z.number().optional().nullable(),
      // 2026-05-14 (CJ Bug#2「60s 任務 3/4 持續 502」): 60s tier orchestra
      // sometimes runs past nginx's 60s upstream timeout → 502 even when
      // the backend is still working. Same async-checkpoint pattern as
      // runOrchestra99 fixes this: return after captions+briefs (~30s),
      // run image gen + extras + QA in background, UI polls until done.
      // 2026-08-11: workbench sweet-spot reference for audience attribution.
      spotRef: z.object({
        scenarioId: z.string().min(1).max(40),
        spotIndex: z.number().int().min(0).max(7),
      }).optional().nullable(),
      asyncMode: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      input = { ...input, taskId: normalizeTaskId(input.taskId) }; // 100s→99s compat
      const userId = ctx.user!.id;
      // P0-D pre-flight cost guard
      const { preflightCostCheck } = await import("../llmWithBilling");
      const guard60 = await preflightCostCheck(userId);
      if (!guard60.ok) throw new TRPCError({ code: "FORBIDDEN", message: guard60.reason });
      // 2026-05-14: points-based gating (1 pt = 1 second of task compute)
      const { assertPoints, deductPoints } = await import("../_core/pointsService");
      await assertPoints(userId, "task_60s");
      await deductPoints(userId, "task_60s", { kind: "task", id: null });
      const { runOrchestra } = await import("../_core/quickTaskOrchestra");
      const scope = { productId: input.productId ?? null, eventId: input.eventId ?? null };

      // Pick template + config (same priority chain as before).
      const tier60Template =
        getFB60Template(input.taskId) ?? getIG60Template(input.taskId) ??
        getYT60Template(input.taskId) ?? getMulti60Template(input.taskId);
      const tier60Config =
        getFB60OrchestraConfig(input.taskId) ?? getIG60OrchestraConfig(input.taskId) ??
        getYT60OrchestraConfig(input.taskId) ?? getMulti60OrchestraConfig(input.taskId);
      let template: any = null; let config: any = null;
      if (tier60Template && tier60Config) {
        template = tier60Template; config = tier60Config;
      } else {
        template =
          FB_30S_TASKS.find((t) => t.id === input.taskId) ??
          IG_30S_TASKS.find((t) => t.id === input.taskId) ??
          YT_30S_TASKS.find((t) => t.id === input.taskId) ??
          TT_30S_TASKS.find((t) => t.id === input.taskId) ??
          LI_30S_TASKS.find((t) => t.id === input.taskId) ??
          EMAIL_30S_TASKS.find((t) => t.id === input.taskId) ??
          PR_30S_TASKS.find((t) => t.id === input.taskId) ??
          BRAND_30S_TASKS.find((t) => t.id === input.taskId) ??
          RESEARCH_30S_TASKS.find((t) => t.id === input.taskId) ??
          KOL_30S_TASKS.find((t) => t.id === input.taskId);
        if (!template) throw new Error(`Unknown task id: ${input.taskId}`);
        const { getOrchestraConfig: _getFB } = await import("../_core/quickTaskFB");
        config =
          _getFB(input.taskId) ?? getIGOrchestraConfig(input.taskId) ?? getYTOrchestraConfig(input.taskId) ??
          getTTOrchestraConfig(input.taskId) ?? getLIOrchestraConfig(input.taskId) ?? getEmailOrchestraConfig(input.taskId) ??
          getPROrchestraConfig(input.taskId) ?? getBrandOrchestraConfig(input.taskId) ?? getResearchOrchestraConfig(input.taskId) ?? getKOLOrchestraConfig(input.taskId);
        if (!config) throw new Error(`No config for: ${input.taskId}`);
      }

      // 2026-05-18 (CJ「所有 60s 任務都要：圖完成才展示，非套組降到 2 版」):
      // every 60s task generates images and promised a "complete post".
      // Apply one central rule instead of hand-editing ~47 configs:
      //  - holdForImages=true (UI stays in countdown modal until images done)
      //  - alternative-version tasks (NOT multi-post packs) → clamp to 2
      //    versions so copy+image both finish in the 60s budget.
      //  - multi-post packs (postsCount / postLabels define the deliverable,
      //    e.g. 5-day countdown, launch kit, suites) keep their piece count.
      // Shallow-copy so we never mutate the shared *_60S_ORCHESTRA object.
      if (config && config.runImageGen && (config.images ?? 0) > 0) {
        const isPack = !!(config.extras?.postsCount || (config.postLabels && config.postLabels.length > 0));
        config = {
          ...config,
          holdForImages: true,
          ...(isPack ? {} : {
            variants: Math.min(config.variants ?? 2, 2),
            images: Math.min(config.images ?? 2, 2),
          }),
        };
      }

      const baseArgs = { template, config, inputs: input.inputs, brandId: input.brandId, ...scope, userId, tier: "60s" as const,
        audienceTag: await resolveAudienceTag(userId, input.brandId, input.spotRef) };

      if (!input.asyncMode) {
        return runOrchestra(baseArgs);
      }

      // ── Async path (same as runOrchestra99) ──────────────────────
      let resolvePartial!: (p: any) => void;
      let rejectPartial!: (e: any) => void;
      const partialPromise = new Promise<any>((resolve, reject) => {
        resolvePartial = resolve;
        rejectPartial = reject;
      });
      let checkpointFired = false;
      let capturedOutputId: number | null = null;

      runOrchestra({
        ...baseArgs,
        onCheckpoint: (partial) => {
          checkpointFired = true;
          capturedOutputId = (partial as any).outputId ?? null;
          resolvePartial(partial);
        },
      })
        .then((full) => {
          if (!checkpointFired) resolvePartial(full);
        })
        .catch(async (err) => {
          console.error("[runOrchestra60 async tail] failed:", (err as Error)?.message);
          if (checkpointFired && capturedOutputId) {
            try {
              const { finaliseTaskRun } = await import("../_core/recordTaskRun");
              await finaliseTaskRun({
                outputId: capturedOutputId,
                progress: "failed",
                progressDetail: String((err as Error)?.message ?? err).slice(0, 1000),
              });
            } catch (e2) {
              console.error("[runOrchestra60 async tail] mark failed also failed:", e2);
            }
          } else if (!checkpointFired) {
            rejectPartial(err);
          }
        });

      return await partialPromise;
    }),

  // refineCaption — AI chat-style refinement. User sees the current caption +
  // gives feedback ("更年輕一點" / "把第二段刪掉" / "加入媽媽節情緒"), the
  // agent rewrites it inline. Replaces the old "換語氣 → 跳到 /brands" flow.
  refineCaption: protectedProcedure
    .input(z.object({
      // 2026-07-07: was 5000 — long-form outputs (email sequences, PR
      // toolkits, YT scripts) exceeded it and the rewrite-agent picker
      // failed with a zod error on those tasks.
      currentCaption: z.string().min(1).max(20000),
      userFeedback: z.string().min(1).max(1000),
      agentName: z.string().max(120).optional(),
      agentTitle: z.string().max(200).optional(),
      brandId: z.number().optional(),
      // Conversation history (optional) — last 6 turns
      history: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(3000),
      })).max(12).optional(),
    }))
    .mutation(async ({ input }) => {
      const { callModel } = await import("../_core/multiModelRouter");
      const { buildBrandPrefix } = await import("../_core/brandContext");
      const brandPrefix = await buildBrandPrefix(input.brandId, null, null, "core").catch(() => "");

      const system =
        `你是 ${input.agentName ?? "資深文案"}（${input.agentTitle ?? "Brand Copywriter"}），正在跟用戶討論這篇文案的修改方向。\n` +
        `任務：根據用戶的修改意見，**重寫**整篇文案。輸出格式：\n` +
        `1. 第一段：1-2 句說明你怎麼理解用戶的意見、改了什麼\n` +
        `2. 接著 3 個 newline 分隔\n` +
        `3. 最後是完整的**修改後文案**（不要省略，不要寫 "如下"，直接給完整版）\n\n` +
        `重要：保留原本能用的部分，只動用戶提到的地方。語氣自然口語。\n` +
        brandPrefix;

      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        { role: "system", content: system },
        { role: "user", content: `這是目前的文案：\n\n${input.currentCaption}` },
        ...(input.history ?? []),
        { role: "user", content: input.userFeedback },
      ];
      try {
        // 2026-05-17: was "qwen" (Chinese model, zh-TW policy violation)
        // → anthropic for Taiwan-correct output.
        const r = await callModel(messages, undefined, "anthropic");
        const text = (r.content ?? "").trim();
        // Split on triple newline to separate explanation from rewritten caption
        let parts = text.split(/\n\n\n+/);
        // 2026-07-07 (verified live on /run/2887): models sometimes use a
        // markdown horizontal rule as the separator instead of blank lines —
        // the triple-newline split then fails and the explanation + '---'
        // leak into the published caption. Fall back to splitting on the hr.
        if (parts.length === 1) {
          parts = text.split(/\n+[-—_*]{3,}\s*\n+/);
        }
        const explanation = parts.length > 1 ? (parts[0] ?? "").trim() : "";
        let rewritten = parts.length > 1 ? parts.slice(1).join("\n\n").trim() : text;
        rewritten = rewritten.replace(/^(?:[-—_*]{3,}\s*\n+)+/, "").replace(/\n+(?:[-—_*]{3,}\s*)+$/, "").trim();
        // Brand-rule hard enforcement: an inline rewrite must not
        // reintroduce banned words / skip substitutions.
        try {
          const { enforceBrandRulesOnText } = await import("../_core/brandContext");
          rewritten = await enforceBrandRulesOnText(input.brandId, rewritten);
        } catch { /* fail-safe */ }
        return { explanation, rewritten, ok: true };
      } catch (e: any) {
        return { explanation: "", rewritten: "", ok: false, error: e?.message ?? String(e) };
      }
    }),

  // 2026-05-18 (CJ「建立任務時加 AI 潤稿，潤完直接改寫輸入框」): a
  // conservative, task-aware polish of the user's brief BEFORE it goes
  // to the executing agent. Rewrites in place (client replaces textarea).
  // Hard rule: never fabricate facts — only restructure/clarify what the
  // user wrote and bracket any missing specifics as 「[請補充 …]」.
  polishInput: protectedProcedure
    .input(z.object({
      taskId: z.string().min(1).max(64),
      text: z.string().min(1).max(8000),
      taskLabel: z.string().max(200).optional(),
      primaryQuestion: z.string().max(400).optional(),
      brandId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      // light cost guard — this is a tiny call but still bills tokens
      try {
        const { preflightCostCheck } = await import("../llmWithBilling");
        const g = await preflightCostCheck(userId);
        if (!g.ok) throw new TRPCError({ code: "FORBIDDEN", message: g.reason });
      } catch (e) { if (e instanceof TRPCError) throw e; /* guard optional */ }

      const { callModel } = await import("../_core/multiModelRouter");
      const { buildBrandPrefix } = await import("../_core/brandContext");
      const brandPrefix = await buildBrandPrefix(input.brandId, null, null, "core").catch(() => "");

      // 2026-05-18 (CJ「只填網址時，AI 潤稿也要讀取該網址」): if the user
      // pasted (mostly) a URL, polishing the bare link is useless. Detect
      // + fetch the page and feed its content in, so the polish produces
      // a real brief grounded in the actual page — still no fabrication
      // beyond what the page / user wrote.
      let urlBlock = "";
      let fetchedUrl: string | null = null;
      try {
        const { findFirstUrl, fetchUrlSummary, formatUrlSummaryForPrompt } =
          await import("../_core/urlContext");
        const url = findFirstUrl(input.text);
        if (url) {
          const summary = await fetchUrlSummary(url);
          if (summary) {
            fetchedUrl = url;
            urlBlock = "\n\n" + formatUrlSummaryForPrompt(summary);
          }
        }
      } catch { /* fetch is best-effort — fall back to text only */ }

      const taskHint = input.taskLabel || input.taskId;
      const qHint = input.primaryQuestion ? `（這個任務問用戶的問題是：「${input.primaryQuestion}」）` : "";
      const urlRule = fetchedUrl
        ? `7. 用戶主要只給了一個連結；系統已抓取該頁內容（見下方【已抓取參考連結】）。請以「該頁實際內容」為素材主體整理出 brief，並保留原始連結；不要寫成通用模板，要呼應這篇的具體訊息。仍然只能用頁面上或用戶寫的事實，不可自行新增。\n`
        : "";
      const system =
        `你是資深行銷企劃，負責把用戶填寫的任務素材「潤飾整理」成一份清楚、可直接交給執行 agent 的 brief。\n` +
        `這份素材會被用在任務：「${taskHint}」${qHint}。\n` +
        `嚴格規則：\n` +
        `1. 只整理與澄清用戶寫的內容，**絕對不可以新增、捏造任何事實**（數字、日期、獎項、客戶名、成效都不可自己生）。\n` +
        `2. 用戶提供的具體事實（數字/名稱/時間/連結）**逐字保留**，不要改寫。\n` +
        `3. 把內容整理成有結構、重點清楚、執行 agent 一看就懂的敘述；可分段、可條列。\n` +
        `4. 若缺少這個任務明顯需要的關鍵資訊，用「[請補充：XXX]」標出來，不要自己填。\n` +
        `5. 保持用戶原本的語言（繁體中文）與意圖，不要過度擴寫、不要換掉語氣。\n` +
        `6. 只輸出整理後的素材本身，不要前言、不要解釋、不要 markdown 圍欄。\n` +
        urlRule +
        brandPrefix;

      try {
        const r = await callModel(
          [
            { role: "system", content: system },
            { role: "user", content: input.text + urlBlock },
          ],
          undefined,
          "anthropic",
        );
        const polished = (r.content ?? "").trim();
        if (!polished) return { polished: "", ok: false, error: "empty" };
        return { polished, ok: true };
      } catch (e: any) {
        return { polished: "", ok: false, error: e?.message ?? String(e) };
      }
    }),

  // 2026-05-19 (CJ「想對某個影片 title 產出腳本或分鏡」): inline script
  // generation for a specific YT video title. User picks a title from the
  // yt-99-quarterly-strategy "12 影片 title" tab → modal calls this to
  // get a full shooting script without leaving the RunPage.
  generateVideoScript: protectedProcedure
    .input(z.object({
      /** The chosen video title (e.g. "AI 品牌聲音的 3 大指標") */
      videoTitle: z.string().min(1).max(300),
      /** Full text of the "12 影片 title" tab — provides channel context. */
      titleContext: z.string().max(4000).optional(),
      brandId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      try {
        const { preflightCostCheck } = await import("../llmWithBilling");
        const g = await preflightCostCheck(userId);
        if (!g.ok) throw new TRPCError({ code: "FORBIDDEN", message: g.reason });
      } catch (e) { if (e instanceof TRPCError) throw e; }

      const { callModel } = await import("../_core/multiModelRouter");

      const contextBlock = input.titleContext
        ? `\n\n【頻道本季其他影片方向（供參考，勿直接複製）】\n${input.titleContext}`
        : "";

      const system = `你是資深 YouTube 內容策略師兼腳本撰稿人。
請為以下影片標題撰寫一份完整的拍攝腳本。

【腳本格式】
## 開場 Hook（0–15 秒）
[直接切入，用一句觀察句或反問句抓住注意力；禁止「大家好，歡迎來到…」類介紹腔]

## 主體內容
### 論點 1：[小標題]
[120–200 字完整腳本文字，可直接照念]

### 論點 2：[小標題]
[120–200 字]

### 論點 3：[小標題]
[120–200 字]

（視題目需要可增至 4–5 個論點）

## 收尾（最後 30–45 秒）
[有記憶點的結尾觀點 + 自然的訂閱/留言 CTA，不要爆料腔「快來訂閱」]

【品牌聲音規則】
- 台灣繁體中文，口語自然但具專業感
- 驚嘆號→句號；無 emoji；無主題標籤
- 所有數字必須有來源邏輯（不捏造統計數字）
- 總字數：800–1400 字`;

      const userMsg = `影片標題：${input.videoTitle}${contextBlock}\n\n請產出這支影片的完整拍攝腳本。`;

      try {
        const r = await callModel(
          [
            { role: "system", content: system },
            { role: "user", content: userMsg },
          ],
          undefined,
          "anthropic",
        );
        const script = (r.content ?? "").trim();
        if (!script) return { script: "", ok: false, error: "empty response" };
        return { script, ok: true };
      } catch (e: any) {
        return { script: "", ok: false, error: e?.message ?? String(e) };
      }
    }),

  // 99s squad auto-run. Legacy squads still expose one variant per step.
  // The five explicitly catalogued IG strategy tasks instead keep every step
  // private and run a final public-content synthesis into publishable IG slots.
  runSquadAuto: protectedProcedure
    // 2026-08-19: one runSquadAuto per user at a time. The pipeline below is
    // ~3 minutes of synchronous work; without this, a user who thinks the
    // progress ring is stuck can stack several of them on the single Node
    // fork. See singleFlightPerUser in _core/trpc.ts for why this returns
    // CONFLICT (409 JSON) rather than anything the client reads as a 502.
    .use(runSquadAutoSingleFlight)
    .input(z.object({
      squadSlug: z.string().min(1).max(80),
      topic:     z.string().max(2000).default(""),
      brandId:   z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const routeStartedAt = Date.now();
      const startedAt = routeStartedAt;
      // 1. Load squad + agents + steps.
      // 100s→99s rename compat: the in-code squad index was renamed to the
      // new "fb-99-…" slugs, but the production `squads` table may still
      // hold the legacy "fb-100-…" slug (no DB migration). Match BOTH so
      // the lookup resolves regardless of which form the row has.
      const sqSlugNew = getIgStrategyExecutionSlug(input.squadSlug);
      const sqSlugLegacy = legacyTaskId(sqSlugNew);
      const sqSlugs = sqSlugLegacy ? [sqSlugNew, sqSlugLegacy] : [sqSlugNew];
      // Only five catalogued IG strategy tasks get the private-artifact +
      // final-public-synthesis boundary. Every unlisted squad keeps its variants and
      // persistence fields unchanged.
      const strategyPublicPolicy = getIgStrategyPublicPolicy(sqSlugNew);
      const [sqRows]: any = await localPool.execute(
        `SELECT id, slug, name, agents, steps, methodology, lead_agent_id
           FROM squads WHERE slug IN (${sqSlugs.map(() => "?").join(",")}) AND is_active = 1 LIMIT 1`,
        sqSlugs,
      );
      const squad = (sqRows as any[])?.[0];
      if (!squad) throw new Error(`squad ${input.squadSlug} not found`);
      let stepsRaw: any[] = [];
      try { stepsRaw = typeof squad.steps === "string" ? JSON.parse(squad.steps) : squad.steps; } catch {}
      stepsRaw = Array.isArray(stepsRaw) ? stepsRaw : [];
      if (stepsRaw.length === 0) throw new Error(`squad ${input.squadSlug} has no steps`);

      // 2. Build brand context — runSquadAuto = strategic/long-form
      // squad work → full brand depth (golden circle / story /
      // competition), NOT the lean core digest.
      const { buildBrandPrefix } = await import("../_core/brandContext");
      const brandPrefix = await buildBrandPrefix(input.brandId, null, null, "full").catch(() => "");
      // 2026-07-17 多市場: brand's outputLanguage drives step language +
      // whether the zh-TW deterministic sanitizer may run on step output.
      const { getBrandMarket, DEFAULT_BRAND_MARKET } = await import("../_core/brandMarket");
      const brandMarket = await getBrandMarket(input.brandId).catch(() => DEFAULT_BRAND_MARKET);
      const strategyRecordOverrides = getIgStrategyRecordOverrides(sqSlugNew, brandMarket.outputLanguage);

      // 3. Inject 100s scout data (real-time festivals/trending/news)
      let scoutBlock = "";
      try {
        const { ALL_99S_SQUADS } = await import("../_core/quickTask100Squads");
        const matched = ALL_99S_SQUADS.find((s) => s.squad_slug === sqSlugNew);
        if (matched) {
          const { fetchViralPatterns, formatViralPatternsForPrompt } = await import("../_core/socialListeningScout");
          const kind: "festivals" | "trending" | "news" | "viral" =
            matched.squad_slug.includes("monthly-calendar") || matched.squad_slug.includes("countdown") ? "festivals"
            : matched.squad_slug.includes("crisis") || matched.squad_slug.includes("kern-mass-control") ? "trending"
            : matched.squad_slug.includes("quarterly") || matched.squad_slug.includes("analytics") || matched.squad_slug.includes("reposition") ? "news"
            : "viral";
          const viral = await fetchViralPatterns({
            channel: matched.platform,
            topic: `${typeof matched.label === "string" ? matched.label : matched.label.zh} ${input.topic}`.slice(0, 120),
            brandId: input.brandId,
            kind,
          });
          if (viral && viral.patterns.length > 0) {
            scoutBlock = "\n\n" + formatViralPatternsForPrompt(viral, kind) + "\n\n";
          }
        }
      } catch { /* non-fatal */ }

      // 4. Run each step in sequence. For the five targets these are private
      // reasoning artifacts; legacy squads still collect them as variants.
      const { callModel, callModelStrict } = await import("../_core/multiModelRouter");
      const variants: any[] = [];
      const errors: string[] = [];
      const stages: any[] = [];
      const prevOutputs: string[] = [];
      const planningArtifacts: any[] = [];
      const privateArtifacts: IgStrategyPrivateArtifact[] = [];
      const privateRunId = strategyPublicPolicy ? randomUUID() : null;
      const strategyStepRouting = strategyPublicPolicy
        ? await import("../_core/strategyPublicStepRouting")
        : null;
      const strategyRouteBudget = strategyStepRouting
        ? strategyStepRouting.deriveStrategyRouteBudget({
            // The DB owns the number of steps. For today's four-step squads:
            // 12s scout + (4 * 40s step) + ~4s persistence = ~176s.
            // The admission guard is 220s - 15s finalization reserve = 205s.
            stepCount: stepsRaw.length,
            serverTimeoutMs: strategyStepRouting.STRATEGY_SERVER_TIMEOUT_MS,
          })
        : null;

      // Resolve all unique step agent IDs in one query
      const agentIds = Array.from(new Set(stepsRaw
        .map((s: any) => Number(s.assignedAgentId))
        .filter((n: number) => Number.isFinite(n) && n > 0)));
      const agentMap: Record<number, { name: string; title: string; specialty?: string; methodology?: string; avatarUrl?: string | null }> = {};
      if (agentIds.length > 0) {
        const ph = agentIds.map(() => "?").join(",");
        const [aRows]: any = await localPool.execute(
          `SELECT id, name, title, specialty, methodology, avatarUrl FROM agents WHERE id IN (${ph})`,
          agentIds,
        );
        for (const a of aRows as any[]) {
          agentMap[a.id] = { name: a.name, title: a.title, specialty: a.specialty, methodology: a.methodology, avatarUrl: a.avatarUrl ?? null };
        }
      }

      for (let i = 0; i < stepsRaw.length; i++) {
        const step = stepsRaw[i];
        const stepStartedAt = Date.now();
        const stageStart = Date.now() - startedAt;
        const stageKey = `step${i + 1}`;
        const internalStageLabel = step.name ?? step.title ?? `Step ${i + 1}`;
        const publicStageLabel = strategyPublicPolicy
          ? (brandMarket.isZhTW ? `內容分析 ${i + 1}` : `Content analysis ${i + 1}`)
          : internalStageLabel;
        const aid = Number(step.assignedAgentId);
        const a = agentMap[aid];
        const agentName = a?.name ?? step.assignedAgentName ?? "Squad Agent";
        const agentTitle = a?.title ?? "";

        const persona = a
          ? `你是 ${a.name}，${a.title}。${a.specialty ? `\n專長：${a.specialty}。` : ""}${a.methodology ? `\n方法論：${a.methodology}。` : ""}`
          : `你是 ${agentName}。`;

        // 2026-05-19 (CJ 驗收 IG7「+217% 無來源捏造」、IG2「弱引用無連結/日期」
        // 根因): 此處是所有 squad-pipeline 任務（IG/FB squad 等）共用的 step
        // system prompt——原句「扣回…真實市場數據」反而誘導模型塞入未授權
        // 數字，且全無反捏造守門。植入與 yt-99/li-99 同源的【數字零容忍】
        // 規則，一次根治所有 squad 任務的捏造數字 / 弱引用問題。
        const ZERO_TOLERANCE = `\n══════════════════════════════════════════\n【數字與來源零容忍 — 最高優先，違反直接不合格】\n══════════════════════════════════════════\n▸ 全文任何「百分比 / 倍數 / 次數 / 金額 / 名次 / 比率」數字，必須逐字出現在「任務主題」或下方注入的品牌資訊 / scout 即時資料原文中。找不到 → 刪掉、改成質化描述、或留「[請補充：數據來源]」。\n▸ 媒體 / 機構名稱（Entrepreneur / Adweek / Social Media Today / eMarketer / HubSpot…）**不能**作為數字的授權依據。寫「(Adweek, 2024)」「(Social Media Today)」這種有名稱無連結無日期的弱引用＝視同捏造，一律禁止。\n  ✗ 違反例：「Carousel 互動率 +42%（Entrepreneur, 2024）」「分享率高出 3.8x」「信任指標上升 27%」（輸入無此數字）\n  ✓ 正確：「輪播形式通常比單圖更容易被收藏與分享」（質化、不掛假數字）\n▸ 不得虛構案例 / 客戶：沒在輸入中點名的公司、客戶、導入數，一律不得寫（✗「12 家中小品牌導入後…」）→ 用「[請補充：實際案例]」。\n▸ 自我驗證：寫完後掃全文每個「%／倍／x／+數字」與每個括號引用 → 對照輸入原文 → 找不到就刪改。\n══════════════════════════════════════════`;
        // 2026-05-19 (CJ 驗收 kl-60-pitch-pack v#3 3/14「跨 step 品牌聲音
        // 斷裂 + 場景錯亂」根因): squad-pipeline 每個 step 共用此 prompt，
        // 全無文字衛生與「交付物要對得上 step 名稱」的約束 → 後段 step
        // 退回陌生業配信，且每個 step 都寫成同款邀約信。補兩塊守門。
        // 2026-07-17 多市場: zh-TW 的文字衛生規則（禁驚嘆號/emoji/台灣用語）
        // 是台灣市場語感政策，非中文市場改為「目標市場語言 + 語氣一致」通則。
        const voiceLangRules = brandMarket.isZhTW
          ? `▸ 全文禁句尾與句中驚嘆號（! 與 ！都禁）；禁 emoji；繁體台灣用語（用「管道」非「渠道」，不得簡體字）。\n▸ 禁業配 / 空洞套語：「強大功能」「突破性的功能」「期待你的回音」「期待聽到你的想法」「非常期待與你合作」「讓我們一起創造」「一起創造美好的合作」「管理品牌形象」「在這個數位時代」「更加精彩」「非常契合」等一律不准出現。沉穩、真誠、務實的守護者語氣，5 個 step 語氣必須一致。`
          : `▸ 全文一律使用 ${brandMarket.outputLanguage}（品牌目標市場語言）撰寫，不得混入中文。\n▸ 語氣沉穩、真誠、務實，5 個 step 語氣必須一致；避免浮誇銷售腔、空洞套語與 PR 腔。`;
        const VOICE_GUARD = `\n══════════════════════════════════════════\n【文字衛生與交付物保真 — 違反直接不合格，輸出前逐句自查】\n══════════════════════════════════════════\n${voiceLangRules}\n▸ 收尾用一個對方會想回的具體問句，不要 PR 套語。\n▸ **交付物必須對得上本 step 的名稱與功能，不是每個 step 都寫一封邀約信**：\n  ・名稱含「Brief / 資料包」＝給 KOL 看的品牌資料文件（條列：品牌背景、目標受眾、合作規格、報酬與時程方向、使用方式），**不是邀請信**。\n  ・名稱含「報價回應 / 議價」＝在「KOL 已回覆報價」情境下你方的回信（含可接受 / 需調整兩種談法），**不是群發邀約**。\n  ・名稱含「追蹤 / follow-up」＝未回覆時的短追蹤（不催促，給新切入點）。\n  ・名稱含「感謝 / 結案」＝內容上線後的感謝＋成效回饋詢問＋長期關係。\n  ・名稱含「邀請 / 開場 / 主信」＝完整可寄出的邀約信。\n══════════════════════════════════════════`;
        const promptHeader = strategyPublicPolicy
          ? `【伺服器內部分析，不是公開成品】\nSquad「${squad.name}」步驟「${internalStageLabel}」。\n內部方法：${typeof squad.methodology === "string" ? squad.methodology : (squad.methodology?.author ?? "")}。完整保留分析細節，供最後的公開內容編輯階段使用。`
          : `Squad「${squad.name}」步驟「${internalStageLabel}」負責人。\n方法論：${typeof squad.methodology === "string" ? squad.methodology : (squad.methodology?.author ?? "")}`;
        const expectedOutput = strategyPublicPolicy
          ? step.outputType ?? step.outputKind ?? internalStageLabel
          : step.outputType ?? step.outputKind ?? "(未指定)";
        const system = `${persona}\n${promptHeader}\n步驟說明：${step.description ?? ""}\n預期產出：${expectedOutput}${ZERO_TOLERANCE}${VOICE_GUARD}\n\n${brandMarket.isZhTW ? "用繁體中文（台灣用語，不得簡體字）輸出" : `一律用 ${brandMarket.outputLanguage} 輸出（品牌目標市場語言）`}，扣回品牌語氣；本 step 的交付物形態必須符合「${internalStageLabel}」的定義，不要寫成跟其他 step 一樣的邀約信。只能使用「下方注入的真實資料」中逐字存在的數字，沒有就用質化描述，不要自行補數據。直接給結果，不要前言、不要 markdown 圍籬。`;

        const userMsg = [
          `【任務主題】${input.topic || "(未指定)"}`,
          brandPrefix ? `\n${brandPrefix}` : "",
          scoutBlock,
          prevOutputs.length > 0 ? `\n【上游 step 已產出】\n${prevOutputs.slice(-2).join("\n\n").slice(0, 2000)}` : "",
          `\n請執行此步驟。`,
        ].filter(Boolean).join("\n");

        let stepProvider: "anthropic" | "qwen" = "qwen";
        let stepAttempt: 1 = 1;
        let stepStatus: "done" | "failed" = "failed";
        let stepErrorCode: string | null = null;
        try {
          const messages = [{ role: "system" as const, content: system }, { role: "user" as const, content: userMsg }];
          let r: Awaited<ReturnType<typeof callModel>>;
          if (strategyPublicPolicy && strategyStepRouting && strategyRouteBudget) {
            // Production shows OpenAI cannot complete this strategy workload,
            // while the shared deadline gave a fallback no useful runtime.
            // Let the proven Anthropic path own the complete 40-second budget.
            stepProvider = strategyStepRouting.STRATEGY_STEP_PROVIDER;
            // Background synthesis does not consume the HTTP budget. Before
            // each DB-owned step, require its full 40s to fit before the 205s
            // route guard, preserving 15s of the 220s socket limit for
            // persistence, response work and scheduling jitter.
            if (!strategyStepRouting.hasStrategyStepBudget({
              routeStartedAt,
              now: Date.now(),
              routeLimitMs: strategyRouteBudget.routeLimitMs,
              stepDeadlineMs: strategyRouteBudget.stepDeadlineMs,
            })) {
              throw Object.assign(new Error("strategy route has insufficient budget for another planning step"), {
                strategyErrorCode: "step_route_budget",
                strategyProvider: strategyStepRouting.STRATEGY_STEP_PROVIDER,
                strategyAttempt: 1,
              });
            }
            // TODO: callModel/callModelStrict cannot reliably cancel this route-local
            // deadline. In particular llm.ts's Anthropic branch does not pass a signal
            // (unlike OpenAI), so a timed-out Anthropic call can remain a ghost request.
            // Fixing that requires shared LLM changes and is intentionally outside PR 1.
            const routed = await strategyStepRouting.runAnthropicStrategyStep({
              deadlineAt: stepStartedAt + strategyRouteBudget.stepDeadlineMs,
              execute: () => callModelStrict(messages, strategyStepRouting.STRATEGY_STEP_PROVIDER),
            });
            stepProvider = routed.provider;
            stepAttempt = routed.attempt;
            stepErrorCode = routed.errorCode;
            if (!routed.ok) {
              throw Object.assign(routed.error, {
                strategyErrorCode: routed.errorCode,
                strategyProvider: routed.provider,
                strategyAttempt: routed.attempt,
              });
            }
            r = routed.value;
          } else {
            r = await Promise.race([
              callModel(messages, undefined, "qwen"),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`step ${i+1} timeout`)), 25_000)),
            ]);
          }
          const rawText = (r.content ?? "").trim();
          let text = rawText;
          // 2026-05-19 (CJ 驗收 v#3): deterministic 文字衛生 backstop on
          // squad-step output — guaranteed, independent of model adherence.
          try {
            // 2026-07-17 多市場: zh-TW only — the sanitizer would corrupt
            // non-Chinese output (emoji strip / ！→。 / 簡→繁 rewrites).
            if (text && brandMarket.isZhTW) {
              const { voiceSanitizeZhTW } = await import("../_core/quickTaskOrchestra");
              text = voiceSanitizeZhTW(text);
            } else if (text) {
              // 2026-07-18: Latin-punct markets — clean stray CJK punctuation
              // the model slips in because the step prompt is Chinese.
              const { latinPunctLang, normalizeLatinPunct } = await import("../_core/quickTaskOrchestra");
              if (latinPunctLang(brandMarket.outputLanguage)) text = normalizeLatinPunct(text);
            }
          } catch { /* fail-safe: keep raw text */ }
          if (strategyPublicPolicy) {
            const privateTerms = [
              { value: squad.name, replacement: { zh: "策略團隊", en: "strategy team" } },
              { value: a?.name ?? step.assignedAgentName, replacement: { zh: "策略團隊", en: "strategy team" } },
              { value: a?.title, replacement: { zh: "策略團隊", en: "strategy team" } },
              { value: a?.specialty, replacement: { zh: "內容方法", en: "content approach" } },
              { value: a?.methodology, replacement: { zh: "內容方法", en: "content approach" } },
            ];
            privateArtifacts.push({
              stepOrder: i + 1,
              status: "done",
              internalLabel: String(internalStageLabel),
              outputType: typeof step.outputType === "string" ? step.outputType : null,
              outputKind: typeof step.outputKind === "string" ? step.outputKind : null,
              agentId: Number.isFinite(aid) && aid > 0 ? aid : null,
              agentName: a?.name ?? step.assignedAgentName ?? null,
              rawContent: rawText,
              errorCode: null,
              latencyMs: Date.now() - startedAt - stageStart,
            });
            const planningCaption = redactIgStrategySynthesisContext(
              sqSlugNew,
              text,
              { steps: stepsRaw, outputLanguage: brandMarket.outputLanguage, privateTerms },
            );
            planningArtifacts.push({
              id: `planning-${i + 1}`,
              label: String(internalStageLabel),
              caption: planningCaption || (brandMarket.isZhTW ? "此策略內容已完成。" : "This planning artifact is complete."),
              hashtags: [],
              image: { style: null, url: null, status: "skipped" },
            });
            // Downstream private analysis consumes the full private result,
            // never the sanitized public DTO.
            prevOutputs.push(`【${internalStageLabel}】${text.slice(0, 8_000)}`);
          } else {
            const variant = {
              label: internalStageLabel,
              caption: text,
              hashtags: [],
              image: { style: null, url: null, status: "skipped" },
              agent: a ? { id: aid, name: a.name, title: a.title, avatarUrl: a.avatarUrl } : null,
            };
            prevOutputs.push(`【${variant.label}】${variant.caption.slice(0, 800)}`);
            variants.push(variant);
          }
          stages.push({ key: stageKey, label: publicStageLabel, startedAt: stageStart, completedAt: Date.now() - startedAt, status: "done" });
          stepStatus = "done";
        } catch (e: any) {
          stepProvider = e?.strategyProvider ?? stepProvider;
          stepAttempt = e?.strategyAttempt ?? stepAttempt;
          stepErrorCode = e?.strategyErrorCode
            ?? (/timeout|deadline/i.test(String(e?.message ?? e)) ? "step_timeout" : "step_failed");
          errors.push(`step ${i+1} (${publicStageLabel}): ${e?.message ?? e}`);
          if (strategyPublicPolicy) {
            privateArtifacts.push({
              stepOrder: i + 1,
              status: "failed",
              internalLabel: String(internalStageLabel),
              outputType: typeof step.outputType === "string" ? step.outputType : null,
              outputKind: typeof step.outputKind === "string" ? step.outputKind : null,
              agentId: Number.isFinite(aid) && aid > 0 ? aid : null,
              agentName: a?.name ?? step.assignedAgentName ?? null,
              rawContent: "",
              errorCode: stepErrorCode,
              latencyMs: Date.now() - startedAt - stageStart,
            });
            planningArtifacts.push({
              id: `planning-${i + 1}`,
              label: String(internalStageLabel),
              caption: "",
              hashtags: [],
              image: { style: null, url: null, status: "failed" },
            });
          } else {
            variants.push({
              label: internalStageLabel,
              caption: "",
              hashtags: [],
              image: { style: null, url: null, status: "failed" },
              agent: a ? { id: aid, name: a.name, title: a.title, avatarUrl: a.avatarUrl } : null,
            });
          }
          stages.push({ key: stageKey, label: publicStageLabel, startedAt: stageStart, completedAt: Date.now() - startedAt, status: "failed" });
        } finally {
          if (strategyPublicPolicy) {
            console.info("[runSquadAuto] step", {
              taskId: strategyRecordOverrides?.taskId ?? input.squadSlug,
              stepOrder: i + 1,
              provider: stepProvider,
              attempt: stepAttempt,
              latencyMs: Date.now() - stepStartedAt,
              status: stepStatus,
              errorCode: stepErrorCode,
            });
          }
        }
      }

      // 5. Build the background continuation now, but do not start it until
      // the planning checkpoint has been committed and the HTTP response is
      // ready to return. Per user authorization, Qwen receives only
      // de-identified planning conclusions, brand context and task input.
      const synthesizeStrategyPublicVariants = strategyPublicPolicy ? async () => {
          assertPrivateStrategyArtifactsReady(privateArtifacts, stepsRaw.length);
          const slots = buildIgStrategyPublicSlots(sqSlugNew, input.topic, brandMarket.outputLanguage);
          if (!slots?.length) throw new Error("no public deliverable slots configured");
          const privateTerms = buildIgStrategyPrivateTerms({
            squadName: squad.name,
            methodology: typeof squad.methodology === "string"
              ? squad.methodology
              : squad.methodology?.author,
            steps: stepsRaw,
            artifactAgentNames: privateArtifacts.map((artifact) => artifact.agentName),
            agents: Object.values(agentMap),
          });
          const strategyContext = privateArtifacts.map((artifact) => redactIgStrategySynthesisContext(
              sqSlugNew,
              artifact.rawContent,
              { steps: stepsRaw, outputLanguage: brandMarket.outputLanguage, privateTerms },
            ));
          assertRedactedStrategyContextReady(strategyContext, stepsRaw.length);
          const safeTopic = redactIgStrategySynthesisContext(
            sqSlugNew,
            input.topic,
            { steps: stepsRaw, outputLanguage: brandMarket.outputLanguage, privateTerms },
          );
          const safeBrandContext = redactIgStrategySynthesisContext(
            sqSlugNew,
            brandPrefix,
            { steps: stepsRaw, outputLanguage: brandMarket.outputLanguage, privateTerms },
          );
          const qwenUserPayload = [safeTopic, safeBrandContext, ...strategyContext].filter(Boolean).join("\n\n");
          if (findIgStrategyInternalLeaks(qwenUserPayload, privateTerms).length > 0) {
            throw new Error("Qwen synthesis payload failed private-term validation");
          }
          const { getBrandRuleAssetsWithStatus } = await import("../_core/brandContext");
          const brandRuleLoad = await getBrandRuleAssetsWithStatus(input.brandId);
          if (input.brandId && !brandRuleLoad.loaded) {
            throw new Error("brand rules could not be loaded for public synthesis");
          }
          const brandRules = brandRuleLoad.rules;
          const redactBrandRule = (value: string) => redactIgStrategySynthesisContext(
            sqSlugNew,
            value,
            { steps: stepsRaw, outputLanguage: brandMarket.outputLanguage, privateTerms },
          );
          const qwenBrandRules = {
            banned: brandRules.banned.map(redactBrandRule).filter(Boolean),
            subs: brandRules.subs
              .map((pair) => ({ from: redactBrandRule(pair.from), to: redactBrandRule(pair.to) }))
              .filter((pair) => pair.from && pair.to),
            preferred: brandRules.preferred.map(redactBrandRule).filter(Boolean),
          };
          if (findIgStrategyInternalLeaks(JSON.stringify(qwenBrandRules), privateTerms).length > 0) {
            throw new Error("Qwen brand rules failed private-term validation");
          }
          // Fixed-30 campaigns cannot reliably fit complete captions in one
          // model response. Fan out immutable server slots in bounded batches;
          // every call remains pinned to Qwen and the final order is restored.
          // At three workers, six batches take two 26s waves (52s). A serialized
          // HALF_OPEN probe can use up to 26s, so all remaining attempts share
          // at most 29s; retries and attempt timers are clamped to the unchanged
          // 55s campaign deadline.
          const synthesisBatchTimeoutMs = 26_000;
          const synthesisDeadlineAt = Date.now() + 55_000;
          const slotBatches = Array.from(
            { length: Math.ceil(slots.length / 5) },
            (_, batchIndex) => slots.slice(batchIndex * 5, (batchIndex + 1) * 5),
          );
          const publicBatches: Array<ReturnType<typeof parseIgStrategyPublicVariants>> = new Array(slotBatches.length);
          const executeBatch = async (batchIndex: number, signal: AbortSignal) => {
            const slotBatch = slotBatches[batchIndex]!;
            const messages = buildIgStrategySynthesisMessages({
              idOrSlug: sqSlugNew,
              topic: safeTopic,
              brandContext: safeBrandContext,
              outputLanguage: brandMarket.outputLanguage,
              slots: slotBatch,
              strategyContext,
              brandRules: qwenBrandRules,
            });
            const result = await callModelStrict(messages, "qwen", undefined, {
              signal,
            });
            publicBatches[batchIndex] = parseIgStrategyPublicVariants({
              idOrSlug: sqSlugNew,
              modelText: result.content ?? "",
              outputLanguage: brandMarket.outputLanguage,
              slots: slotBatch,
              steps: stepsRaw,
              privateTerms,
              brandRules,
            });
          };
          // A HALF_OPEN provider admits exactly one recovery probe. Avoid
          // launching sibling batches that would reject and abort that probe.
          const qwenCircuit = llmCircuitSnapshot().find((entry) => entry.provider === "qwen");
          let firstParallelBatch = 0;
          if (qwenCircuit && qwenCircuit.state !== "CLOSED" && slotBatches.length > 0) {
            await runSynthesisBatchesWithDeadline({
              batchIndexes: [0],
              concurrency: 1,
              deadlineAt: synthesisDeadlineAt,
              perAttemptTimeoutMs: synthesisBatchTimeoutMs,
              executeBatch,
            });
            firstParallelBatch = 1;
          }
          await runSynthesisBatchesWithDeadline({
            batchIndexes: slotBatches.map((_, index) => index).slice(firstParallelBatch),
            concurrency: 3,
            deadlineAt: synthesisDeadlineAt,
            perAttemptTimeoutMs: synthesisBatchTimeoutMs,
            executeBatch,
          });
          const publicResults = publicBatches.flat();
          // A batch may independently choose a valid address form; validate
          // the complete campaign again so all posts use one audience voice.
          sanitizeIgStrategyPublicCaption(
            sqSlugNew,
            publicResults.flatMap((variant) => [
              variant.caption,
              ...variant.hashtags,
              variant.image.style ?? "",
            ]).filter(Boolean).join("\n"),
            { steps: stepsRaw, outputLanguage: brandMarket.outputLanguage, privateTerms },
          );
          return publicResults;
      } : null;

      // 6. Look up squad lead for the legacy captionAgent slot. Target tasks
      // never return an internal agent identity.
      let captionAgent: any = null;
      if (!strategyPublicPolicy && squad.lead_agent_id) {
        const lead = agentMap[squad.lead_agent_id];
        if (lead) captionAgent = { id: squad.lead_agent_id, name: lead.name, title: lead.title, avatarUrl: lead.avatarUrl };
        else {
          try {
            const [r]: any = await localPool.execute(
              `SELECT id, name, title, avatarUrl FROM agents WHERE id = ? LIMIT 1`,
              [squad.lead_agent_id],
            );
            const a = (r as any[])?.[0];
            if (a) captionAgent = { id: a.id, name: a.name, title: a.title, avatarUrl: a.avatarUrl ?? null };
          } catch {}
        }
      }

      let ok = strategyPublicPolicy
        ? planningArtifacts.some((artifact) => artifact.caption.length > 0)
        : variants.some((v) => v.caption.length > 0);

      // 2026-05-09 (CJ Phase 2): persist squad runs too so client can
      // navigate to /run/:outputId (consistent with orchestra path).
      let outputId: number | null = null;
      let missionId: number | null = null;
      const shouldPersist = strategyPublicPolicy
        ? true
        : ok;
      if (shouldPersist) {
        try {
          const { recordTaskRun, finaliseTaskRun } = await import("../_core/recordTaskRun");
          const content = strategyPublicPolicy
            ? JSON.stringify({
                schemaVersion: 2,
                contentModel: "ig-strategy-bundle",
                planningArtifacts,
                publicVariants: variants,
              }, null, 2)
            : JSON.stringify(variants, null, 2);
          const metadata = strategyPublicPolicy
            ? {
                latencyMs: Date.now() - startedAt,
                contentModel: "ig-strategy-bundle",
                planningCount: planningArtifacts.length,
                publicVariantCount: variants.length,
                publicFormats: [...new Set(variants.map((variant) => variant.format))],
                inputs: { topic: input.topic ?? "" },
              }
            : {
                latencyMs: Date.now() - startedAt,
                squadSlug: input.squadSlug,
                variantCount: variants.length,
                inputs: { topic: input.topic ?? "" },
              };
          const persisted = await recordTaskRun({
            userId,
            brandId: input.brandId ?? null,
            workspace: strategyRecordOverrides?.workspace ?? "facebook",
            platform: strategyRecordOverrides?.platform,
            outputType: strategyRecordOverrides?.outputType,
            taskId: strategyRecordOverrides?.taskId ?? input.squadSlug,
            taskLabel: strategyRecordOverrides?.taskLabel ?? squad.name ?? input.squadSlug,
            tier: "99s",
            title: strategyRecordOverrides?.taskLabel
              ?? (await import("../_core/titleFromCaption")).titleFromCaption(variants[0]?.caption, squad.name ?? input.squadSlug),
            content,
            metadata,
            ...(strategyPublicPolicy ? { progress: "caption_ready" as const } : {}),
            privateStrategyArtifacts: strategyPublicPolicy && privateRunId
              ? { runId: privateRunId, squadSlug: sqSlugNew, rows: privateArtifacts }
              : undefined,
          });
          outputId = persisted.outputId;
          missionId = persisted.missionId;
          if (strategyPublicPolicy && !outputId) {
            ok = false;
            errors.unshift(brandMarket.isZhTW
              ? "內容儲存失敗，請重試。"
              : "Content storage failed. Please retry.");
          } else if (strategyPublicPolicy && outputId && synthesizeStrategyPublicVariants) {
            const checkpointOutputId = outputId;
            // setImmediate keeps the mutation response independent of even the
            // first async brand-rule read. The output row already exists, so a
            // refresh can poll caption_ready while this continuation runs.
            setImmediate(() => {
              void (async () => {
                try {
                  const publicResults = await synthesizeStrategyPublicVariants();
                  const finalContent = JSON.stringify({
                    schemaVersion: 2,
                    contentModel: "ig-strategy-bundle",
                    planningArtifacts,
                    publicVariants: publicResults,
                  }, null, 2);
                  const finalMetadata = {
                    ...metadata,
                    taskId: strategyRecordOverrides?.taskId ?? input.squadSlug,
                    tier: "99s",
                    latencyMs: Date.now() - startedAt,
                    publicVariantCount: publicResults.length,
                    publicFormats: [...new Set(publicResults.map((variant) => variant.format))],
                  };
                  const finalised = await finaliseTaskRun({
                    outputId: checkpointOutputId,
                    content: finalContent,
                    metadata: finalMetadata,
                    progress: "done",
                  });
                  if (!finalised.ok) {
                    console.warn("[runSquadAuto] target public synthesis finalise failed", {
                      taskId: strategyRecordOverrides?.taskId,
                      outputId: checkpointOutputId,
                    });
                  }
                } catch (e) {
                  console.warn("[runSquadAuto] target public synthesis failed", {
                    taskId: strategyRecordOverrides?.taskId,
                    outputId: checkpointOutputId,
                    message: (e as Error).message,
                  });
                  const finalised = await finaliseTaskRun({
                    outputId: checkpointOutputId,
                    progress: "failed",
                    progressDetail: brandMarket.isZhTW
                      ? "對外貼文產生失敗，內容規劃仍可使用，請重跑一次。"
                      : "Public post generation failed. The planning remains available; please run the task again.",
                  });
                  if (!finalised.ok) {
                    console.warn("[runSquadAuto] target public synthesis failure state could not be saved", {
                      taskId: strategyRecordOverrides?.taskId,
                      outputId: checkpointOutputId,
                    });
                  }
                }
              })();
            });
          }
        } catch (e) {
          console.warn("[runSquadAuto] recordTaskRun failed:", (e as Error).message);
          if (strategyPublicPolicy) {
            ok = false;
            errors.unshift(brandMarket.isZhTW
              ? "內容儲存失敗，請重試。"
              : "Content storage failed. Please retry.");
          }
        }
      }

      return {
        taskId: strategyRecordOverrides?.taskId ?? input.squadSlug,
        totalLatencyMs: Date.now() - startedAt,
        fetchedUrl: null,
        captionAgent,
        imageAgent: null,
        variants,
        planningArtifacts: strategyPublicPolicy ? planningArtifacts : undefined,
        stages,
        ok,
        errors,
        outputId,
        missionId,
        ...(strategyPublicPolicy && outputId ? { progress: "caption_ready" as const } : {}),
      };
    }),

  // 100s tier — research-validated (scout) + video-where-applicable.
  // Uses same 60s production-package task pool; orchestra adds scout stage
  // automatically when tier="99s". Falls through to 30s pool for legacy.
  runOrchestra99: protectedProcedure
    .input(z.object({
      taskId: z.string().min(1).max(64),
      inputs: z.record(z.string(), z.string()).default({}),
      brandId: z.number().optional(),
      productId: z.number().optional().nullable(),
      eventId: z.number().optional().nullable(),
      // 2026-05-14 (CJ「先回 caption + brief、image 跟 QA 變 async polling」):
      // When true, return after captions+briefs (~30-45s) with progress=
      // 'caption_ready'. The full orchestra continues in background and
      // UPDATEs the same mission_outputs row. Frontend polls
      // output.getById until progress='done' or 'failed'.
      // 2026-08-11: workbench sweet-spot reference for audience attribution.
      spotRef: z.object({
        scenarioId: z.string().min(1).max(40),
        spotIndex: z.number().int().min(0).max(7),
      }).optional().nullable(),
      asyncMode: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      // 100s→99s compat: a stale client may still POST a legacy "fb-100-…"
      // taskId. Normalize once here so every lookup below resolves to the
      // renamed definition. Idempotent for new "fb-99-…" ids.
      input = { ...input, taskId: normalizeTaskId(input.taskId) };
      const userId = ctx.user!.id;
      // P0-D pre-flight cost guard (99s tier is the most expensive)
      const { preflightCostCheck } = await import("../llmWithBilling");
      const guard100 = await preflightCostCheck(userId);
      if (!guard100.ok) throw new TRPCError({ code: "FORBIDDEN", message: guard100.reason });
      // 2026-05-12: paywall quota check (plan task_99s cap)
      // 2026-05-14: points-based gating
      const { assertPoints, deductPoints } = await import("../_core/pointsService");
      await assertPoints(userId, "task_99s");
      await deductPoints(userId, "task_99s", { kind: "task", id: null });
      const { runOrchestra } = await import("../_core/quickTaskOrchestra");
      const scope = { productId: input.productId ?? null, eventId: input.eventId ?? null };

      // Pick template + config (same priority chain as before).
      const tier99Template = get99Template(input.taskId);
      const tier99Config = get99OrchestraConfig(input.taskId);
      let template: any = null; let config: any = null;
      if (tier99Template && tier99Config) {
        template = tier99Template; config = tier99Config;
      } else {
        const tier60Template =
          getFB60Template(input.taskId) ?? getIG60Template(input.taskId) ??
          getYT60Template(input.taskId) ?? getMulti60Template(input.taskId);
        const tier60Config =
          getFB60OrchestraConfig(input.taskId) ?? getIG60OrchestraConfig(input.taskId) ??
          getYT60OrchestraConfig(input.taskId) ?? getMulti60OrchestraConfig(input.taskId);
        if (tier60Template && tier60Config) {
          template = tier60Template; config = tier60Config;
        } else {
          template =
            FB_30S_TASKS.find((t) => t.id === input.taskId) ??
            IG_30S_TASKS.find((t) => t.id === input.taskId) ??
            YT_30S_TASKS.find((t) => t.id === input.taskId) ??
            TT_30S_TASKS.find((t) => t.id === input.taskId) ??
            LI_30S_TASKS.find((t) => t.id === input.taskId) ??
            EMAIL_30S_TASKS.find((t) => t.id === input.taskId) ??
            PR_30S_TASKS.find((t) => t.id === input.taskId) ??
            BRAND_30S_TASKS.find((t) => t.id === input.taskId) ??
            RESEARCH_30S_TASKS.find((t) => t.id === input.taskId) ??
            KOL_30S_TASKS.find((t) => t.id === input.taskId);
          if (!template) throw new Error(`Unknown task id: ${input.taskId}`);
          const { getOrchestraConfig: _getFB } = await import("../_core/quickTaskFB");
          config =
            _getFB(input.taskId) ?? getIGOrchestraConfig(input.taskId) ?? getYTOrchestraConfig(input.taskId) ??
            getTTOrchestraConfig(input.taskId) ?? getLIOrchestraConfig(input.taskId) ?? getEmailOrchestraConfig(input.taskId) ??
            getPROrchestraConfig(input.taskId) ?? getBrandOrchestraConfig(input.taskId) ?? getResearchOrchestraConfig(input.taskId) ?? getKOLOrchestraConfig(input.taskId);
          if (!config) throw new Error(`No config for: ${input.taskId}`);
        }
      }

      const baseArgs = { template, config, inputs: input.inputs, brandId: input.brandId, ...scope, userId, tier: "99s" as const,
        audienceTag: await resolveAudienceTag(userId, input.brandId, input.spotRef) };

      if (!input.asyncMode) {
        // Legacy sync path — fully await, return final result.
        return runOrchestra(baseArgs);
      }

      // ── Async path ─────────────────────────────────────────────────
      // Return after captions+briefs; let image gen + extras + QA run
      // in the background and UPDATE the same mission_outputs row.
      let resolvePartial!: (p: any) => void;
      let rejectPartial!: (e: any) => void;
      const partialPromise = new Promise<any>((resolve, reject) => {
        resolvePartial = resolve;
        rejectPartial = reject;
      });
      let checkpointFired = false;
      let capturedOutputId: number | null = null;

      // Fire-and-forget the full orchestra.
      // If checkpoint fires, partial resolves and we return to the user.
      // If the FULL Promise rejects AFTER checkpoint, we mark the row failed.
      // If it rejects BEFORE checkpoint, we reject the partial (caller gets error).
      runOrchestra({
        ...baseArgs,
        onCheckpoint: (partial) => {
          checkpointFired = true;
          capturedOutputId = (partial as any).outputId ?? null;
          resolvePartial(partial);
        },
      })
        .then((full) => {
          // If checkpoint never fired (e.g., task too short or didn't reach
          // captions stage), the orchestra fell through synchronously and
          // we still owe the partial-resolve so the mutation can return.
          if (!checkpointFired) resolvePartial(full);
        })
        .catch(async (err) => {
          console.error("[runOrchestra99 async tail] failed:", (err as Error)?.message);
          // If checkpoint fired and we captured an outputId, mark THAT row
          // as failed so the frontend stops polling. If no outputId yet,
          // reject the partial so the caller sees the error.
          if (checkpointFired && capturedOutputId) {
            try {
              const { finaliseTaskRun } = await import("../_core/recordTaskRun");
              await finaliseTaskRun({
                outputId: capturedOutputId,
                // Don't pass content → keep partial caption from checkpoint
                progress: "failed",
                progressDetail: String((err as Error)?.message ?? err).slice(0, 1000),
              });
            } catch (e2) {
              console.error("[runOrchestra99 async tail] mark failed also failed:", e2);
            }
          } else if (!checkpointFired) {
            rejectPartial(err);
          }
        });

      // Block on partial result only.
      return await partialPromise;
    }),

  runOrchestra: protectedProcedure
    .input(
      z.object({
        taskId: z.string().min(1).max(64),
        inputs: z.record(z.string(), z.string()).default({}),
        brandId: z.number().optional(),
        // 2026-05-11 (CJ「product / event 也要 narrow LLM context」): scope.
        productId: z.number().optional().nullable(),
        eventId: z.number().optional().nullable(),
        // 2026-08-11: where in the strategy workbench this piece came from.
        // Only the reference travels — the labels are resolved server-side
        // from the stored scenario so they can't drift, and the URL that
        // carries this stays short.
        spotRef: z.object({
          scenarioId: z.string().min(1).max(40),
          spotIndex: z.number().int().min(0).max(7),
        }).optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      input = { ...input, taskId: normalizeTaskId(input.taskId) }; // 100s→99s compat
      const userId = ctx.user!.id;
      // 2026-05-08 (P0-D): pre-flight cost guard. Trial users hitting
      // wallet floor or daily $5 cap are stopped before LLM fan-out.
      const { preflightCostCheck } = await import("../llmWithBilling");
      const guard = await preflightCostCheck(userId);
      if (!guard.ok) {
        throw new TRPCError({ code: "FORBIDDEN", message: guard.reason });
      }
      // 2026-05-12: paywall quota check (plan task_30s cap)
      // 2026-05-14: points-based gating
      const { assertPoints, deductPoints } = await import("../_core/pointsService");
      await assertPoints(userId, "task_30s");
      await deductPoints(userId, "task_30s", { kind: "task", id: null });
      const { runOrchestra } = await import("../_core/quickTaskOrchestra");
      const { getOrchestraConfig } = await import("../_core/quickTaskFB");
      // Look up template + config in both FB and IG catalogs
      const template =
        FB_30S_TASKS.find((t) => t.id === input.taskId) ??
        IG_30S_TASKS.find((t) => t.id === input.taskId) ??
        YT_30S_TASKS.find((t) => t.id === input.taskId) ??
        TT_30S_TASKS.find((t) => t.id === input.taskId) ??
        LI_30S_TASKS.find((t) => t.id === input.taskId) ??
        EMAIL_30S_TASKS.find((t) => t.id === input.taskId) ??
        PR_30S_TASKS.find((t) => t.id === input.taskId) ??
        BRAND_30S_TASKS.find((t) => t.id === input.taskId) ??
        RESEARCH_30S_TASKS.find((t) => t.id === input.taskId) ??
        KOL_30S_TASKS.find((t) => t.id === input.taskId);
      if (!template) {
        throw new Error(`Unknown 30s quick task id: ${input.taskId} (orchestra is 30s-only).`);
      }
      const config =
        getOrchestraConfig(input.taskId) ??
        getIGOrchestraConfig(input.taskId) ??
        getYTOrchestraConfig(input.taskId) ??
        getTTOrchestraConfig(input.taskId) ??
        getLIOrchestraConfig(input.taskId) ??
        getEmailOrchestraConfig(input.taskId) ??
        getPROrchestraConfig(input.taskId) ??
        getBrandOrchestraConfig(input.taskId) ??
        getResearchOrchestraConfig(input.taskId) ??
        getKOLOrchestraConfig(input.taskId);
      if (!config) {
        throw new Error(`No orchestra config for task ${input.taskId}.`);
      }
      // Required-field check
      for (const f of template.inputs) {
        if (f.required && !input.inputs[f.key]?.trim()) {
          throw new Error(`Missing required input: ${f.key} (${f.label})`);
        }
      }
      const orchestraArgs = {
        template,
        config,
        inputs: input.inputs,
        brandId: input.brandId,
        productId: input.productId ?? null,
        eventId: input.eventId ?? null,
        userId,
        audienceTag: await resolveAudienceTag(userId, input.brandId, input.spotRef),
      };

      // 2026-07-29 (Tier-1 TikTok video formats): a video task renders clips
      // via Kling i2v at ~150s each — far past nginx's 150s upstream, so the
      // sync path below would always 504 even though the job kept running.
      // Video tasks therefore use the SAME async checkpoint pattern as the
      // 60s/99s endpoints: return captions + stills at the checkpoint (~30-40s)
      // and let clips land in the same mission_outputs row afterwards.
      //
      // Gated strictly on config.runVideoGen so every existing 30s task keeps
      // its current fully-synchronous behaviour untouched.
      if (config.runVideoGen) {
        let resolvePartial!: (p: any) => void;
        let rejectPartial!: (e: any) => void;
        const partialPromise = new Promise<any>((resolve, reject) => {
          resolvePartial = resolve;
          rejectPartial = reject;
        });
        let checkpointFired = false;
        let capturedOutputId: number | null = null;

        runOrchestra({
          ...orchestraArgs,
          onCheckpoint: (partial) => {
            checkpointFired = true;
            capturedOutputId = (partial as any).outputId ?? null;
            resolvePartial(partial);
          },
        })
          .then((full) => {
            if (!checkpointFired) resolvePartial(full);
          })
          .catch(async (err) => {
            console.error("[runOrchestra video tail] failed:", (err as Error)?.message);
            if (checkpointFired && capturedOutputId) {
              try {
                const { finaliseTaskRun } = await import("../_core/recordTaskRun");
                await finaliseTaskRun({
                  outputId: capturedOutputId,
                  progress: "failed",
                  progressDetail: String((err as Error)?.message ?? err).slice(0, 1000),
                });
              } catch (e) {
                console.error("[runOrchestra video tail] finalise failed:", (e as Error)?.message);
              }
            } else if (!checkpointFired) {
              rejectPartial(err);
            }
          });

        return await partialPromise;
      }

      return runOrchestra(orchestraArgs);
    }),

  /**
   * 2026-05-09 (P3): regenerate a single variant of an existing output.
   * Fetches the original output's metadata.taskId + inputs, re-runs ONE
   * variant through the same orchestra path, replaces that variant in the
   * stored content. Original variant goes into metadata.archivedVariants
   * for history.
   */
  regenerateVariant: protectedProcedure
    .input(z.object({
      outputId: z.number().int().positive(),
      // Keep the legacy contract strict: variantIndex was required before
      // strategy bundles existed, so omitting it must not silently target 0.
      variantIndex: z.number().int().min(0),
      contentKind: ContentKindSchema.optional(),
      contentIndex: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user!.id;
      const { default: localPool } = await import("../localDb");
      const [rows]: any = await localPool.execute(
        `SELECT o.id, o.content, o.metadata, o.missionId,
                m.userId AS mission_user_id, m.brandId AS mission_brand_id,
                JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.taskId')) AS taskId,
                JSON_UNQUOTE(JSON_EXTRACT(o.metadata, '$.tier'))   AS tier
         FROM mission_outputs o
         LEFT JOIN missions m ON m.id = o.missionId
         WHERE o.id = ? AND m.userId = ? LIMIT 1`,
        [input.outputId, userId],
      );
      const row = (rows as any[])[0];
      if (!row) throw new Error("output not found or no permission");

      // The generic orchestra regenerator cannot preserve the server-owned
      // public slot contract (format/id) or re-run the IG strategy redaction
      // boundary. Fail closed instead of allowing a regenerated item to leak
      // planning internals or corrupt an IG strategy bundle. Those bundles
      // remain editable through the selector-aware caption rewrite flows.
      const target = selectRegenerationTarget(row.content, input);
      assertGenericRegenerationAllowed(target, input);

      const md = typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata ?? {});
      let taskId: string = row.taskId ?? "";
      const inputs = md.inputs ?? {};

      // Fallback: if taskId missing from metadata, recover from mission description tag [task:<id>]
      if (!taskId && row.missionId) {
        const [mRows]: any = await localPool.execute(
          `SELECT description FROM missions WHERE id = ? LIMIT 1`,
          [row.missionId],
        );
        const desc: string = (mRows as any[])[0]?.description ?? "";
        const m = desc.match(/\[task:([^\]]+)\]/);
        if (m?.[1]) taskId = m[1];
      }
      if (!taskId) throw new Error("此 output 沒有 taskId metadata，無法重生");

      const template =
        FB_30S_TASKS.find((t) => t.id === taskId) ??
        IG_30S_TASKS.find((t) => t.id === taskId) ??
        YT_30S_TASKS.find((t) => t.id === taskId) ??
        TT_30S_TASKS.find((t) => t.id === taskId) ??
        LI_30S_TASKS.find((t) => t.id === taskId) ??
        EMAIL_30S_TASKS.find((t) => t.id === taskId) ??
        PR_30S_TASKS.find((t) => t.id === taskId) ??
        BRAND_30S_TASKS.find((t) => t.id === taskId) ??
        RESEARCH_30S_TASKS.find((t) => t.id === taskId) ??
        KOL_30S_TASKS.find((t) => t.id === taskId) ??
        getFB60Template(taskId) ??
        getIG60Template(taskId) ??
        getYT60Template(taskId) ??
        getMulti60Template(taskId) ??
        get99Template(taskId);
      if (!template) throw new Error(`未知 task: ${taskId}`);

      const { getOrchestraConfig } = await import("../_core/quickTaskFB");
      const fullConfig =
        getOrchestraConfig(taskId) ??
        getIGOrchestraConfig(taskId) ??
        getYTOrchestraConfig(taskId) ??
        getTTOrchestraConfig(taskId) ??
        getLIOrchestraConfig(taskId) ??
        getEmailOrchestraConfig(taskId) ??
        getPROrchestraConfig(taskId) ??
        getBrandOrchestraConfig(taskId) ??
        getResearchOrchestraConfig(taskId) ??
        getFB60OrchestraConfig(taskId) ??
        getIG60OrchestraConfig(taskId) ??
        getYT60OrchestraConfig(taskId) ??
        getMulti60OrchestraConfig(taskId) ??
        get99OrchestraConfig(taskId);
      if (!fullConfig) throw new Error(`no orchestra config for ${taskId}`);

      // Override config to produce ONE variant only — use the same label
      // as the slot we're replacing, so the regenerated voice matches.
      const targetLabel = target.item?.label ?? fullConfig.variantLabels[target.index] ?? `版本 ${target.index + 1}`;
      const singleConfig = { ...fullConfig, variants: 1, images: 0, runImageGen: false, variantLabels: [targetLabel] };

      const taskTier: "30s" | "60s" | "99s" =
        get99Template(taskId)  ? "99s" :
        (getFB60Template(taskId) ?? getIG60Template(taskId) ?? getYT60Template(taskId) ?? getMulti60Template(taskId)) ? "60s" :
        "30s";
      const { runOrchestra } = await import("../_core/quickTaskOrchestra");
      const r = await runOrchestra({
        template, config: singleConfig, inputs, brandId: row.mission_brand_id ?? undefined, userId, tier: taskTier,
      });
      const newVariant = r.variants?.[0];
      if (!newVariant?.caption) throw new Error("重生失敗，agent 沒回傳內容");

      // This path deliberately runs with images:0, so replacing the whole
      // variant would discard the still-current image and its persisted
      // model prompt. Regenerating copy must not mutate the visual asset.
      const replacementVariant = preserveExistingVariantImage(newVariant, target.item);

      // Replace the variant + archive the old one
      const archived = Array.isArray(md.archivedVariants) ? md.archivedVariants : [];
      archived.push({
        archivedAt: new Date().toISOString(),
        index: target.index,
        variant: target.item,
        ...(input.contentKind !== undefined
          ? { contentKind: target.kind, contentIndex: target.index }
          : {}),
      });
      const newContent = replaceRegeneratedContent(row.content, input, replacementVariant, target);
      const newMetadata = JSON.stringify({ ...md, archivedVariants: archived, lastRegenAt: new Date().toISOString() });

      await localPool.execute(
        `UPDATE mission_outputs SET content = ?, metadata = ?, version = version + 1, updatedAt = NOW() WHERE id = ?`,
        [newContent, newMetadata, input.outputId],
      );

      return {
        ok: true,
        variantIndex: input.variantIndex,
        newCaption: newVariant.caption,
        ...(input.contentKind !== undefined
          ? { contentKind: target.kind, contentIndex: target.index }
          : {}),
      };
    }),

  runQuick: protectedProcedure
    .input(
      z.object({
        taskId: z.string().min(1).max(64),
        inputs: z.record(z.string(), z.string()).default({}),
        brandId: z.number().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      input = { ...input, taskId: normalizeTaskId(input.taskId) }; // 100s→99s compat
      // Look up template across all 30s + FB-60s
      const template =
        FB_30S_TASKS.find((t) => t.id === input.taskId) ??
        IG_30S_TASKS.find((t) => t.id === input.taskId) ??
        YT_30S_TASKS.find((t) => t.id === input.taskId) ??
        TT_30S_TASKS.find((t) => t.id === input.taskId) ??
        LI_30S_TASKS.find((t) => t.id === input.taskId) ??
        EMAIL_30S_TASKS.find((t) => t.id === input.taskId) ??
        PR_30S_TASKS.find((t) => t.id === input.taskId) ??
        BRAND_30S_TASKS.find((t) => t.id === input.taskId) ??
        RESEARCH_30S_TASKS.find((t) => t.id === input.taskId) ??
        KOL_30S_TASKS.find((t) => t.id === input.taskId);
      if (!template) {
        throw new Error(`Unknown 30s quick task id: ${input.taskId}. (60s uses runOrchestra60; 90s uses squad.stepExecute.)`);
      }

      // Required-field check
      for (const f of template.inputs) {
        if (f.required && !input.inputs[f.key]?.trim()) {
          throw new Error(`Missing required input: ${f.key} (${f.label})`);
        }
      }

      // 2026-05-05: load the bound agent persona (if set) and prepend to
      // the system prompt so the output really sounds like that agent.
      let agentPersona = "";
      let agentMeta: { id: number; name: string; title: string; avatarUrl: string | null } | null = null;
      if (template.agent_id) {
        try {
          const [agentRows]: any = await localPool.execute(
            `SELECT id, name, title, bio, specialty, methodology, avatarUrl FROM agents WHERE id = ? LIMIT 1`,
            [template.agent_id],
          );
          const a = (agentRows as any[])?.[0];
          if (a) {
            agentMeta = { id: a.id, name: a.name, title: a.title, avatarUrl: a.avatarUrl ?? null };
            agentPersona =
              `你是 ${a.name}，${a.title}。\n` +
              (a.bio ? `背景：${a.bio}\n` : "") +
              (a.specialty ? `專長：${a.specialty}\n` : "") +
              (a.methodology ? `方法論：${a.methodology}\n` : "") +
              `用你的口氣寫，不要寫得像通用 AI。\n\n`;
          }
        } catch { /* persona load failure is non-fatal */ }
      }

      // 2026-05-05 fix: if any input contains a URL, fetch the page and
      // inject a summary so the agent actually READS what the user shared
      // (vs writing a generic post that ignores the link content).
      let urlContext = "";
      let fetchedUrl: {
        url: string;
        title: string | null;
        chars: number;
        og: {
          image: string | null;
          title: string | null;
          description: string | null;
          site_name: string | null;
          domain: string;
        };
      } | null = null;
      let urlFetchFailure: { url: string; reason: "content_unavailable" } | null = null;
      for (const v of Object.values(input.inputs)) {
        if (typeof v === "string") {
          const url = findFirstUrl(v);
          if (url) {
            const summary = await fetchUrlSummary(url);
            if (summary) {
              urlContext = "\n\n" + formatUrlSummaryForPrompt(summary) + "\n\n";
              fetchedUrl = {
                url: summary.url,
                title: summary.title,
                chars: summary.fetched_chars,
                og: summary.og,
              };
              urlFetchFailure = null;
              break; // first URL only — keep prompt budget reasonable
            }
            urlFetchFailure ??= { url, reason: "content_unavailable" };
          }
        }
      }

      // Build prompt
      const brandPrefix = await buildBrandContext(input.brandId);
      const userMsg =
        Object.entries(input.inputs)
          .map(([k, v]) => `[${k}] ${v}`)
          .join("\n") || "(no extra inputs)";
      const systemFull =
        agentPersona +
        template.systemPrompt +
        "\n" +
        quickTaskOutputSpec(template.tier) +
        brandPrefix +
        urlContext;

      const messages = [
        { role: "system" as const, content: systemFull },
        { role: "user" as const, content: userMsg },
      ];

      // Call LLM with the template's preferred fast model
      const startedAt = Date.now();
      const result = await callWithFallback(
        messages,
        template.preferredModel === "any" ? "qwen" : (template.preferredModel as any),
      );
      const latencyMs = Date.now() - startedAt;

      // Parse + soft-validate output
      const parsedJson = tryParseJson(result.content);
      // 2026-05-05 fix: spread LLM output FIRST, then OVERRIDE the routing
      // fields with template defaults. Otherwise LLMs that emit Chinese
      // post_type (e.g. "图文貼文") break the mockup variant routing because
      // PlatformMockup's switch is keyed on English format slugs (feed /
      // carousel / reel / story / etc).
      const parsed = parseQuickTaskOutput({
        ...(parsedJson ?? {}),
        // System overrides — LLM doesn't get to mutate routing keys
        tier: template.tier,
        platform: template.outputDefaults.platform,
        post_type: template.outputDefaults.post_type,
      });

      return {
        taskId: template.id,
        tier: template.tier,
        postType: template.postType,
        latencyMs,
        provider: result.provider,
        model: result.model,
        fellBack: result.fellBack,
        ok: parsed.ok,
        output: parsed.ok ? parsed.data : (parsed.partial as Partial<QuickTaskOutput>),
        validationErrors: parsed.ok ? undefined : parsed.errors,
        rawText: result.content, // for debugging / regenerate
        agent: agentMeta,        // {id, name, title, avatarUrl} or null
        skill_slug: template.skill_slug ?? null,
        fetchedUrl,              // {url, title, chars} or null — was a URL read?
        urlFetchFailure,         // URL was present but yielded no promptable content
      };
    }),

  route: protectedProcedure
    .input(z.object({ text: z.string().min(2) }))
    .mutation(async ({ input }) => {
      const catalog = Object.values(TASKS).map((t) => {
        const fieldKeys = t.fields.map((f) => f.key).join(",");
        return `- ${t.id}（${t.squadName}）needs: [${fieldKeys}]`;
      }).join("\n");

      const system = `你是路由器。從以下 squad 清單挑出最匹配用戶意圖的 taskId，從用戶輸入抽出對應欄位值。

清單：
${catalog}

輸出嚴格 JSON：{"taskId":"...","inputs":{...},"confidence":0.0-1.0}
不匹配回 {"taskId":null,"confidence":0}。`;

      try {
        const r = await callWithFallback(
          [
            { role: "system", content: system },
            { role: "user", content: input.text },
          ],
          "forge"
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
