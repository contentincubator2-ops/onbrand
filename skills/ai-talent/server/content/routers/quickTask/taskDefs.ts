/**
 * quickTask router 的舊式任務定義表與英文標籤。
 */
import { type ModelProvider } from "../../../platform/core/llm/multiModelRouter";
import { z } from "zod";

export type FieldDef = {
  key: string;
  label: string;
  kind: "text" | "longtext" | "url" | "select" | "number";
  placeholder?: string;
  options?: string[];
  required?: boolean;
  default?: string | number;
};

export type AgentDef = {
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

export type StageDef = {
  id: string;
  label: string;
  description: string;
  agents: AgentDef[]; // 1-2 個，多 agent 時必須 skill 互補
  isOrchestrator?: boolean;
};

export type TaskDef = {
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

export const TASKS: Record<string, TaskDef> = {
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

export function fillTemplate(tpl: string, inputs: Record<string, string | number | undefined>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = inputs[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

// ── English labels for all 30s/60s tasks ────────────────────────────────────
// Primary display locale is zh-TW; this map supplies the EN equivalent used
// when the UI language is switched to English. KOL tasks already use the
// { en, zh } object format so they're handled separately in listFB below.
export const TASK_LABEL_EN: Record<string, string> = {
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
  "ig-60-live-suite":             "IG Live 30-min run-of-show (6 segments)",
  "ig-60-live-event":             "IG Live audience-goal event (7 segments)",
  "ig-60-live-founder":           "IG founder-led live (5 segments)",
  "ig-60-live-versus":             "IG versus live (two-sided rounds)",
  "ig-60-live-comeback":           "IG comeback live (after a long absence)",
  "ig-60-live-collab-drop":        "IG collab drop live (two accounts, one launch)",
  "ig-60-live-first-ever":         "IG first-ever live",
  "ig-60-live-behind-scenes":      "IG unscripted workday live",
  "ig-60-live-crew":               "IG crew live (3-5 people on camera)",
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

/** 從活動企劃寫某一篇：哪一檔活動、企劃上的哪一格。 */
export const CAMPAIGN_ITEM_INPUT = z.object({
  eventId: z.number().int().positive(),
  itemId: z.string().min(1).max(80),
}).optional().nullable();
