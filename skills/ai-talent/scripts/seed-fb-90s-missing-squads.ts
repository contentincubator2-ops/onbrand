/**
 * seed-fb-90s-missing-squads (2026-07-18)
 *
 * CJ bug report: 8 FB 90s task cards all failed with
 * "squad <slug> not found". Root cause: FB_90S_TASK_INDEX (quickTaskFB.ts)
 * references squad slugs that were never seeded into the consolidated
 * `squads` table:
 *   fb-reels-script / fb-livestream-prep / fb-crisis-reply  ← seeded HERE
 *   fb-monthly-calendar / fb-event-launch-kit / fb-carousel ← index remapped
 *     to existing equivalents (pulizzi / garyvee-jab-hook / deiss-cvo)
 *
 * Same governance shape as seed-fb-additional-squads.ts (7 attributes per
 * step), same FB crew. Idempotent — UPDATE if slug exists, INSERT otherwise.
 *
 * Run on VM: npx tsx scripts/seed-fb-90s-missing-squads.ts
 */
import "dotenv/config";
import mysql from "mysql2/promise";

// Reuse existing FB-team agents (seeded by seed-fb-calendar-agents.ts)
const A = {
  lead: 180159,            // Claire Hsu — Social Media Brand Strategist
  audienceInsight: 239180, // Stacy Lin
  pillarArchitect: 239181, // Vincent Shen
  calendarLead: 239182,    // Phoebe Yang
  briefWriter: 239183,     // Aiden Hsu
  visualDirector: 239184,  // Mandy Cheng
};
const NAME: Record<number, string> = {
  180159: "Claire Hsu", 239180: "Stacy Lin", 239181: "Vincent Shen",
  239182: "Phoebe Yang", 239183: "Aiden Hsu", 239184: "Mandy Cheng",
};

interface Step {
  order: number;
  name: string;
  description: string;
  assignedAgentId: number;
  assignedAgentName: string;
  reviewerAgentId: number | null;
  outputKind: "decision" | "text_strategic" | "structured_table" | "text_content" | "qa_review";
  mockupVariant: string;
  storageTarget: string;
  userInputFields: string[];
  dataRequirements: { minUrls: number; minChars: number; requireBucketA?: string[] };
  aiModel: string;
}

interface SquadSeed {
  slug: string;
  name: string;
  description: string;
  methodology: string;
  steps: Step[];
  workspace: string[];
  tags: string[];
  use_cases: string[];
  output_formats: string[];
  deliverable_format: string;
  missionType: string;
}

// ── Squad 1: FB Reels 完整腳本 (Hook-Hold-Payoff) ────────────────────────
const REELS: SquadSeed = {
  slug: "fb-reels-script",
  name: "FB Reels 腳本小組",
  description: "產出 FB Reels 完整腳本：前 3 秒 hook、中段 hold 結構、結尾 payoff + CTA，含分鏡與配樂方向。",
  methodology: "短影音 Hook-Hold-Payoff 法（前 3 秒決定續看率）",
  steps: [
    {
      order: 0,
      name: "腳本結構規劃：Hook-Hold-Payoff 骨架",
      description: "依主題與品牌定位定 3 種 hook 切角（懸念 / 反差 / 共鳴），選 1 個主打；規劃中段 hold 的節奏（每 5-7 秒一個轉折）與 payoff 收法。",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "text_strategic", mockupVariant: "FBPostBriefMockup",
      storageTarget: "mission_step_progress.canonical_message[step=0]",
      userInputFields: ["topic", "duration_sec"],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 1,
      name: "完整腳本：口播 + 分鏡 + 字幕 + 配樂方向",
      description: "依 step 0 骨架寫完整腳本：逐段口播稿、鏡頭指示（景別/運鏡）、overlay 字幕、配樂情緒方向；結尾 CTA 對齊品牌目標。",
      assignedAgentId: A.briefWriter, assignedAgentName: NAME[A.briefWriter],
      reviewerAgentId: A.lead,
      outputKind: "text_content", mockupVariant: "FBPostBriefMockup",
      storageTarget: "mission_step_progress.canonical_message[step=1]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-sonnet-4-5",
    },
  ],
  workspace: ["facebook"],
  tags: ["facebook", "reels", "short-video", "script"],
  use_cases: ["fb-reels-script", "short-video-production"],
  output_formats: ["post_brief"],
  deliverable_format: "reels_script",
  missionType: "content-production",
};

// ── Squad 2: FB 直播完整套組（成對敘事：預告 + 摘要）────────────────────
const LIVESTREAM: SquadSeed = {
  slug: "fb-livestream-prep",
  name: "FB 直播配套小組",
  description: "直播前後成對敘事：預告貼文 + 直播段落大綱 + 直播後摘要與精華剪輯指南，前後語氣與賣點一致。",
  methodology: "Pre/Post 成對敘事一致性法（預告的懸念必須在摘要收回）",
  steps: [
    {
      order: 0,
      name: "Intake：直播主題 / 日期 / 爆點盤點",
      description: "確認直播主題、日期時間、預計爆點（新品 / 優惠 / 來賓）與 TA；決定預告的懸念主軸。",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "decision", mockupVariant: "IntakeFormMockup",
      storageTarget: "mission_step_progress.canonical_message[step=0]",
      userInputFields: ["topic", "live_datetime", "highlights"],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 1,
      name: "直播前：預告貼文 + 段落大綱",
      description: "寫直播預告貼文（懸念 hook + 時間 CTA）與直播本體段落大綱（開場 / 3-5 個爆點段 / 結尾收單），主持人可直接照跑。",
      assignedAgentId: A.briefWriter, assignedAgentName: NAME[A.briefWriter],
      reviewerAgentId: A.lead,
      outputKind: "text_content", mockupVariant: "FBPostBriefMockup",
      storageTarget: "mission_step_progress.canonical_message[step=1]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-sonnet-4-5",
    },
    {
      order: 2,
      name: "直播後：摘要貼文 + 精華剪輯指南",
      description: "寫直播後摘要貼文（收回預告的懸念 + 重點回顧 + 下一步 CTA）與精華剪輯指南（3-5 段可剪成 reel 的時間點類型與字幕建議）。",
      assignedAgentId: A.pillarArchitect, assignedAgentName: NAME[A.pillarArchitect],
      reviewerAgentId: A.lead,
      outputKind: "text_content", mockupVariant: "FBPostBriefMockup",
      storageTarget: "mission_step_progress.canonical_message[step=2]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-sonnet-4-5",
    },
  ],
  workspace: ["facebook"],
  tags: ["facebook", "livestream", "pre-post-narrative"],
  use_cases: ["fb-livestream-prep", "livestream-production"],
  output_formats: ["post_brief"],
  deliverable_format: "livestream_suite",
  missionType: "campaign-livestream",
};

// ── Squad 3: FB 完整危機公關（Lagadec 四段式）───────────────────────────
const CRISIS: SquadSeed = {
  slug: "fb-crisis-reply",
  name: "FB 危機公關小組",
  description: "危機評估 + 第一份對外聲明（Lagadec 四段式）+ 後續追蹤與媒體 talking points。",
  methodology: "Lagadec 危機溝通：致歉 + 解釋 + 承諾 + 私訊四段式",
  steps: [
    {
      order: 0,
      name: "危機評估與回應策略",
      description: "評估危機等級（客訴 / 輿論 / 產品安全）、擴散速度與利害關係人；決定回應姿態（道歉 / 澄清 / 說明）與時程。",
      assignedAgentId: A.lead, assignedAgentName: NAME[A.lead],
      reviewerAgentId: null,
      outputKind: "text_strategic", mockupVariant: "FBPostBriefMockup",
      storageTarget: "mission_step_progress.canonical_message[step=0]",
      userInputFields: ["topic", "severity"],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-opus-4-6",
    },
    {
      order: 1,
      name: "第一份對外聲明（Lagadec 四段式）",
      description: "致歉（承認感受）→ 解釋（已知事實，不推責）→ 承諾（具體行動與時間）→ 私訊引導（個案處理）。同時給留言區置頂版與粉專貼文版。",
      assignedAgentId: A.briefWriter, assignedAgentName: NAME[A.briefWriter],
      reviewerAgentId: A.lead,
      outputKind: "text_content", mockupVariant: "FBPostBriefMockup",
      storageTarget: "mission_step_progress.canonical_message[step=1]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-sonnet-4-5",
    },
    {
      order: 2,
      name: "後續追蹤 + 媒體 talking points",
      description: "48-72 小時進度更新貼文模板、結案說明貼文、若媒體詢問的 3-5 個 talking points（口徑一致、不揣測、不承諾未定事項）。",
      assignedAgentId: A.pillarArchitect, assignedAgentName: NAME[A.pillarArchitect],
      reviewerAgentId: A.lead,
      outputKind: "text_content", mockupVariant: "FBPostBriefMockup",
      storageTarget: "mission_step_progress.canonical_message[step=2]",
      userInputFields: [],
      dataRequirements: { minUrls: 0, minChars: 0 },
      aiModel: "claude-sonnet-4-5",
    },
  ],
  workspace: ["facebook"],
  tags: ["facebook", "crisis", "pr", "lagadec"],
  use_cases: ["fb-crisis-reply", "crisis-comms"],
  output_formats: ["post_brief"],
  deliverable_format: "crisis_playbook",
  missionType: "crisis-response",
};

async function seedSquad(pool: mysql.Pool, sq: SquadSeed): Promise<void> {
  const agentsJson = (() => {
    const ids = Array.from(new Set(sq.steps.map((s) => s.assignedAgentId)));
    if (!ids.includes(A.lead)) ids.unshift(A.lead);
    return ids.map((id) => ({
      id, name: NAME[id] ?? `Agent ${id}`,
      role: id === A.lead ? "Squad Lead" : "Specialist",
      is_lead: id === A.lead,
    }));
  })();

  const [existing]: any = await pool.execute(
    `SELECT id FROM squads WHERE slug = ? LIMIT 1`, [sq.slug]);
  const exists = (existing as any[])?.[0];
  if (exists) {
    await pool.execute(
      `UPDATE squads
          SET name = ?, description = ?, methodology = ?,
              agents = ?, steps = ?, lead_agent_id = ?,
              tags = ?, workspace = ?, use_cases = ?, output_formats = ?,
              deliverable_format = ?, missionType = ?,
              is_active = 1, is_approved = 1, approved_at = NOW()
        WHERE id = ?`,
      [
        sq.name, sq.description, sq.methodology,
        JSON.stringify(agentsJson), JSON.stringify(sq.steps), A.lead,
        JSON.stringify(sq.tags), JSON.stringify(sq.workspace),
        JSON.stringify(sq.use_cases), JSON.stringify(sq.output_formats),
        sq.deliverable_format, sq.missionType,
        exists.id,
      ],
    );
    console.log(`  ✓ updated squad #${exists.id}  ${sq.slug}`);
    return;
  }

  const [r]: any = await pool.execute(
    `INSERT INTO squads (
       slug, name, description, methodology,
       agents, steps, lead_agent_id, tags,
       tier, strategy_layer, workspace,
       use_cases, output_formats,
       is_active, is_approved, approved_at,
       source, architecture, orchestrator_layer,
       squad_size, squad_tier,
       has_video_output, video_aspect_ratio, video_duration_sec,
       deliverable_format, deliverable_level,
       missionType
     ) VALUES (
       ?, ?, ?, ?,
       ?, ?, ?, ?,
       'core', 'L4_channel', ?,
       ?, ?,
       1, 1, NOW(),
       'seeded', 'a2a', 'execution',
       'medium', 'medium',
       0, '1:1', 15,
       ?, 3,
       ?
     )`,
    [
      sq.slug, sq.name, sq.description, sq.methodology,
      JSON.stringify(agentsJson), JSON.stringify(sq.steps), A.lead,
      JSON.stringify(sq.tags), JSON.stringify(sq.workspace),
      JSON.stringify(sq.use_cases), JSON.stringify(sq.output_formats),
      sq.deliverable_format, sq.missionType,
    ],
  );
  console.log(`  ✓ inserted squad #${r?.insertId}  ${sq.slug}  (${sq.steps.length} steps, auto-approved)`);
}

async function main() {
  const pool = mysql.createPool({
    host: process.env.LOCAL_DB_HOST ?? "127.0.0.1",
    user: process.env.LOCAL_DB_USER ?? "mos_user",
    password: process.env.LOCAL_DB_PASSWORD,
    database: process.env.LOCAL_DB_NAME ?? "mos_db",
  });
  for (const sq of [REELS, LIVESTREAM, CRISIS]) {
    await seedSquad(pool, sq);
  }
  const [rows]: any = await pool.execute(
    `SELECT slug, is_active, JSON_LENGTH(steps) AS steps_n FROM squads
      WHERE slug IN ('fb-reels-script','fb-livestream-prep','fb-crisis-reply')`);
  console.table(rows);
  await pool.end();
  console.log("done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
