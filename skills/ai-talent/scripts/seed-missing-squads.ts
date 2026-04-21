/**
 * seed-missing-squads.ts
 *
 * 按照方案A補充現有 squad 所缺少的 squads。
 * 標準與 sowork-brand-positioning squad 一致：
 *   identity  → brand_name + website_url (最低要求)
 *   access    → GA4, Facebook Business (optional OAuth)
 *   output    → Google Drive, Email, YouTube
 *
 * 缺少的 squads（按 workspace 分類）：
 *   strategy   → tw-b2b-saas-gtm, mkt-analytics-attribution
 *   website    → tw-website-rebuild, mkt-seo-growth
 *   facebook   → mkt-content-engine, mkt-social-content, tw-facebook-ads
 *   ecommerce  → tw-ecom-full-funnel
 *
 * Usage: npm run db:seed-missing
 */

import { createPool } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Helpers (same as seed-local-squads.ts) ────────────────────────────────

async function findAgent(
  conn: any,
  keywords: string[],
  excludeIds: number[] = [],
): Promise<number | null> {
  if (!keywords.length) return null;
  const safe = (s: string) => s.replace(/'/g, "\\'").replace(/%/g, "\\%");
  const likeParts = keywords
    .map(k => `(primarySkill LIKE '%${safe(k)}%' OR specialty LIKE '%${safe(k)}%' OR title LIKE '%${safe(k)}%')`)
    .join(" OR ");
  const excludePart = excludeIds.length > 0
    ? `AND id NOT IN (${excludeIds.join(",")})` : "";
  const [rows] = await conn.execute(
    `SELECT id FROM agents WHERE isAvailable = 1 AND (${likeParts}) ${excludePart} ORDER BY id ASC LIMIT 1`
  ) as any[];
  return (rows as any[])[0]?.id ?? null;
}

async function assignSkillsToAgent(conn: any, agentId: number, skills: string[]): Promise<void> {
  if (!agentId || !skills.length) return;
  try {
    const [rows] = await conn.execute(
      `SELECT primarySkill, specialty FROM agents WHERE id = ? LIMIT 1`, [agentId]
    ) as any[];
    const row = (rows as any[])[0];
    if (!row) return;
    const existing = new Set(
      [row.primarySkill ?? "", row.specialty ?? ""]
        .join(",")
        .split(/[,|;\n]/)
        .map((s: string) => s.trim().toLowerCase())
        .filter(Boolean)
    );
    const toAdd = skills.filter(s => !existing.has(s.toLowerCase()));
    if (toAdd.length === 0) return;
    const newSpecialty = [row.specialty ?? "", ...toAdd].filter(Boolean).join(", ");
    await conn.execute(`UPDATE agents SET specialty = ? WHERE id = ?`, [newSpecialty, agentId]);
    console.log(`[seed-missing] Agent ${agentId}: added skills [${toAdd.join(", ")}]`);
  } catch (err: any) {
    console.warn(`[seed-missing] assignSkillsToAgent(${agentId}) warn:`, err.message);
  }
}

async function getAgentInfo(
  conn: any,
  id: number | null,
): Promise<{ id: number; slug: string; name: string } | null> {
  if (!id) return null;
  try {
    const [rows] = await conn.execute(
      `SELECT id, slug, name FROM agents WHERE id = ? LIMIT 1`, [id]
    ) as any[];
    return (rows as any[])[0] ?? null;
  } catch { return null; }
}

function assignAgentToStep(
  step: Record<string, any>,
  agentInfo: { id: number; slug: string; name: string } | null,
): Record<string, any> {
  return {
    ...step,
    assignedAgentId:   agentInfo?.id   ?? null,
    assignedAgentSlug: agentInfo?.slug  ?? null,
    assignedAgentName: agentInfo?.name  ?? null,
  };
}

async function upsertSquad(conn: any, s: {
  slug: string; name: string; description: string;
  industryKey: string; missionType: string;
  workspace: string[];
  methodology: string;
  agents: object[]; tags: string[]; useCases: string[];
  outputFormats: string[];
  requiredIntegrations: string[];
  token: number;
  showcases: { company: string; description: string; result: string; source?: string }[];
}) {
  const [existing] = await conn.execute(
    `SELECT id FROM squads WHERE slug = ? LIMIT 1`, [s.slug]
  ) as any[];
  if ((existing as any[]).length > 0) {
    await conn.execute(
      `UPDATE squads SET name=?, description=?, missionType=?, agents=?, tags=?, use_cases=?,
       workspace=?, methodology=?, output_formats=?, required_integrations=?, token=?, showcases=?,
       is_active=1, updated_at=NOW() WHERE slug=?`,
      [s.name, s.description, s.missionType, JSON.stringify(s.agents), JSON.stringify(s.tags),
       JSON.stringify(s.useCases), JSON.stringify(s.workspace), s.methodology,
       JSON.stringify(s.outputFormats), JSON.stringify(s.requiredIntegrations), s.token,
       JSON.stringify(s.showcases), s.slug]
    );
    console.log(`[seed-missing] Squad '${s.slug}': updated`);
  } else {
    await conn.execute(
      `INSERT INTO squads (slug,name,description,industry_key,missionType,agents,tags,use_cases,
       workspace,methodology,output_formats,required_integrations,token,showcases,is_active,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,NOW(),NOW())`,
      [s.slug, s.name, s.description, s.industryKey, s.missionType,
       JSON.stringify(s.agents), JSON.stringify(s.tags), JSON.stringify(s.useCases),
       JSON.stringify(s.workspace), s.methodology, JSON.stringify(s.outputFormats),
       JSON.stringify(s.requiredIntegrations), s.token, JSON.stringify(s.showcases)]
    );
    const [newRow] = await conn.execute(
      `SELECT id FROM squads WHERE slug = ? LIMIT 1`, [s.slug]
    ) as any[];
    console.log(`[seed-missing] Squad '${s.slug}' inserted id=${(newRow as any[])[0]?.id}`);
  }
}

async function upsertWorkflow(conn: any, w: {
  missionType: string; name: string; description: string; steps: object[];
}) {
  const [existing] = await conn.execute(
    `SELECT id FROM squad_workflow_templates WHERE taskType = ? LIMIT 1`, [w.missionType]
  ) as any[];
  if ((existing as any[]).length > 0) {
    await conn.execute(
      `UPDATE squad_workflow_templates SET name=?, description=?, steps=?, missionType=?, updatedAt=NOW() WHERE taskType=?`,
      [w.name, w.description, JSON.stringify(w.steps), w.missionType, w.missionType]
    );
    console.log(`[seed-missing] Workflow '${w.missionType}': updated`);
  } else {
    await conn.execute(
      `INSERT INTO squad_workflow_templates (taskType,missionType,name,description,steps,isActive,createdAt) VALUES (?,?,?,?,?,1,NOW())`,
      [w.missionType, w.missionType, w.name, w.description, JSON.stringify(w.steps)]
    );
    console.log(`[seed-missing] Workflow '${w.missionType}': inserted`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const pool = createPool({
    host:     process.env.LOCAL_DB_HOST     || "localhost",
    port:     parseInt(process.env.LOCAL_DB_PORT || "3306"),
    user:     process.env.LOCAL_DB_USER     || "mos_user",
    password: process.env.LOCAL_DB_PASSWORD || "mos_secure_2026",
    database: process.env.LOCAL_DB_NAME     || "mos_db",
    charset:  "utf8mb4",
    multipleStatements: false,
  });

  const conn = await pool.getConnection();

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // WORKSPACE: strategy
    // ══════════════════════════════════════════════════════════════════════════

    // ── S1. tw-b2b-saas-gtm（B2B SaaS GTM 策略）────────────────────────────
    {
      const slug     = "tw-b2b-saas-gtm";
      const taskType = "tw-b2b-saas-gtm";
      const used: number[] = [];

      const leadSkills = ["gtm", "go-to-market", "b2b", "saas", "product-marketing", "brand-strategy"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }

      const m2Skills = ["competitive-analysis", "market-research", "competitor-intelligence", "b2b"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }

      const m3Skills = ["persona", "icp", "target-audience", "customer-research", "b2b"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }

      const m4Skills = ["positioning", "value-proposition", "messaging", "copywriting", "saas"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "gtm_strategist",      order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "competitive_analyst",  order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "icp_researcher",       order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "positioning_writer",   order: 4 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
      ]);

      const steps = [
        assignAgentToStep({
          order: 1, name: "品牌基礎研究",
          description: "主動爬取品牌官網與公開資料，輸出品牌核心業務摘要（產品/客群/收費模式/市場區域），請用戶確認方向正確後進入下一步。",
          tool: "octolens",
          outputType: "brand_brief",
          requiredSkills: ["brand-strategy", "b2b", "market-research"],
        }, leadInfo),
        assignAgentToStep({
          order: 2, name: "競品分析",
          description: "搜尋台灣同類 SaaS/B2B 競品（91APP、SHOPLINE、Cyberbiz 等），輸出 3-5 個競品概覽（名稱/定位/弱點），請用戶確認/調整競品清單。",
          tool: "marketing-strategy-pmm",
          outputType: "competitor_overview",
          requiredSkills: ["competitive-analysis", "competitor-intelligence", "b2b"],
        }, m2Info),
        assignAgentToStep({
          order: 3, name: "ICP & Persona 建立",
          description: "根據品牌與競品分析，輸出 2-3 個 ICP Persona（職稱/痛點/決策路徑/預算），請用戶確認是否符合實際客群。",
          tool: "madison-market-research",
          outputType: "icp_personas",
          requiredSkills: ["persona", "icp", "customer-research", "b2b"],
        }, m3Info),
        assignAgentToStep({
          order: 4, name: "差異化優勢確認",
          description: "分析競品空白，提出 5 個候選差異化優勢，請用戶選擇或調整最能代表品牌的方向。",
          tool: "marketing-strategy-pmm",
          outputType: "differentiation_list",
          requiredSkills: ["positioning", "competitive-analysis", "value-proposition"],
        }, m2Info),
        assignAgentToStep({
          order: 5, name: "GTM 定位方案 A + B",
          description: "整合前面確認的內容，輸出方向 A 完整定位方案（標語/定位聲明/訊息支柱）+ 方向 B 差異化備案，最終交付 2 方向 × 5 定位 = 10 個方案組合。",
          tool: "osp_marketing_tools",
          outputType: "gtm_positioning_report",
          requiredSkills: ["gtm", "positioning", "messaging", "copywriting", "saas"],
        }, leadInfo),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "B2B SaaS GTM 策略流程",
        description: "五步驟 GTM：品牌研究 → 競品分析 → ICP Persona → 差異化優勢 → 雙方向定位方案",
        steps,
      });

      await upsertSquad(conn, {
        slug,
        name: "B2B SaaS GTM 策略小組",
        description: "專為台灣 B2B SaaS 品牌打造的 GTM 定位小組。整合競品情報（octolens）、ICP 研究（Madison）、訊息框架（marketing-strategy-pmm），輸出雙方向完整定位方案，從品牌定位到通路策略一步到位。",
        industryKey: "b2b",
        missionType: taskType,
        workspace: ["strategy"],
        methodology: "b2b-gtm",
        agents: members,
        tags: ["b2b", "saas", "gtm", "positioning", "brand-strategy", "icp", "competitive-analysis", "taiwan", "strategy"],
        useCases: ["新品牌 GTM 策略", "B2B SaaS 重新定位", "進台灣市場前的品牌策略", "ICP 與訊息框架建立", "競品空白分析", "定位書撰寫"],
        outputFormats: ["PDF 策略報告", "Google Slides 簡報", "定位方案 A+B 比較表"],
        requiredIntegrations: ["google-analytics"],
        token: 75000,
        showcases: [
          { company: "SHOPLINE", description: "從「電商工具」重新定位為「一站式品牌電商解決方案」，針對中小品牌主的 ICP 打造完整 GTM 訊息體系", result: "客戶轉換率提升 35%，ARPU 增加 28%", source: "SHOPLINE 2024 Annual Report" },
          { company: "Cyberbiz", description: "以「台灣在地服務 + 快速上線」差異化對抗國際競品，GTM 訊息聚焦 SMB 老闆的時間成本痛點", result: "市占穩居台灣電商 SaaS 前三名，NPS 82", source: "Cyberbiz 官方案例" },
        ],
      });
    }

    // ── S2. mkt-analytics-attribution（競品每日情報）─────────────────────────
    {
      const slug     = "mkt-analytics-attribution";
      const taskType = "mkt-analytics-attribution";
      const used: number[] = [];

      const leadSkills = ["analytics", "ga4", "data-analytics", "attribution", "marketing-analytics"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }

      const m2Skills = ["competitive-intelligence", "competitor-monitoring", "market-research", "social-listening"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }

      const m3Skills = ["reporting", "data-visualization", "business-intelligence", "insights"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "analytics_lead",          order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "competitor_monitor",       order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "insights_reporter",        order: 3 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
      ]);

      const steps = [
        assignAgentToStep({
          order: 1, name: "競品清單確認",
          description: "根據品牌產業搜尋主要競品，列出建議追蹤清單（3-8 個），請用戶確認或補充，並設定監控頻率（每日/每週）。",
          tool: "octolens",
          outputType: "competitor_watchlist",
          requiredSkills: ["competitive-intelligence", "market-research"],
        }, m2Info),
        assignAgentToStep({
          order: 2, name: "競品動態搜尋",
          description: "主動搜尋各競品最新新聞/社群/廣告動態（過去 7 天），用 Facebook Ad Library、SimilarWeb 等工具輸出原始情報摘要。",
          tool: "octolens",
          outputType: "raw_intel_summary",
          requiredSkills: ["competitor-monitoring", "social-listening", "competitive-intelligence"],
        }, m2Info),
        assignAgentToStep({
          order: 3, name: "情報分析與威脅評級",
          description: "對每條情報進行分析，標記高/中/低威脅等級，說明對品牌的潛在影響與機會點，輸出結構化分析表。",
          tool: "marketing-strategy-pmm",
          outputType: "threat_analysis_table",
          requiredSkills: ["analytics", "competitive-intelligence", "insights"],
        }, leadInfo),
        assignAgentToStep({
          order: 4, name: "行動建議與報告交付",
          description: "根據情報提出 3 個具體行動建議，輸出完整競品情報報告（Markdown + 可選 PDF），確認每日報告格式是否符合需求。",
          tool: "internal",
          outputType: "intel_report",
          requiredSkills: ["reporting", "data-visualization", "business-intelligence"],
        }, m3Info),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "競品情報分析流程",
        description: "四步驟競品監控：清單確認 → 動態搜尋 → 威脅評級 → 行動建議報告",
        steps,
      });

      await upsertSquad(conn, {
        slug,
        name: "競品情報監控小組",
        description: "自動追蹤競品動態，每日輸出結構化競品情報報告。整合 octolens 競品監控、Facebook Ad Library 廣告情報、GA4 流量對比分析，標記高/中/低威脅並提出即時行動建議。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["strategy"],
        methodology: "competitive-intelligence",
        agents: members,
        tags: ["analytics", "competitive-intelligence", "ga4", "attribution", "market-research", "reporting", "strategy", "monitoring"],
        useCases: ["每日競品情報追蹤", "廣告策略監控", "市場趨勢預警", "競品廣告分析", "行銷歸因分析", "週報月報自動生成"],
        outputFormats: ["每日情報 Markdown 報告", "競品威脅評級表", "PDF 月報", "Google Slides 摘要"],
        requiredIntegrations: ["google-analytics", "facebook-ads"],
        token: 55000,
        showcases: [
          { company: "台灣電商品牌", description: "每日監控 UNIQLO/NET/GU 廣告投放動態，提前 48 小時預測競品促銷節點，調整自家廣告預算", result: "ROAS 提升 22%，促銷期間銷售超越競品 15%", source: "內部案例" },
        ],
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // WORKSPACE: website
    // ══════════════════════════════════════════════════════════════════════════

    // ── W1. tw-website-rebuild（官網文案調整 / CRO）───────────────────────────
    {
      const slug     = "tw-website-rebuild";
      const taskType = "tw-website-rebuild";
      const used: number[] = [];

      const leadSkills = ["cro", "conversion-optimization", "ux", "website", "copywriting"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }

      const m2Skills = ["copywriting", "brand-voice", "content-strategy", "ux-writing"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }

      const m3Skills = ["seo", "on-page-seo", "technical-seo", "keyword-research"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }

      const m4Skills = ["ux-design", "ui-design", "landing-page", "ab-testing"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "cro_lead",           order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "copy_strategist",    order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "seo_specialist",     order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "ux_optimizer",       order: 4 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
      ]);

      const steps = [
        assignAgentToStep({
          order: 1, name: "官網現況診斷",
          description: "爬取品牌官網，摘要現有 Hero/CTA/Value Prop 文案，標出改善機會點（可讀性、CTA 清晰度、訊息一致性），輸出診斷報告。",
          tool: "octolens",
          outputType: "website_audit",
          requiredSkills: ["cro", "ux", "website"],
        }, leadInfo),
        assignAgentToStep({
          order: 2, name: "競品官網比較",
          description: "搜尋 2-3 個競品官網文案，比較 Hero 訊息、CTA 設計、Value Prop 結構，找出差異化空間，請用戶確認改善優先方向。",
          tool: "octolens",
          outputType: "competitor_website_comparison",
          requiredSkills: ["competitive-analysis", "cro", "copywriting"],
        }, m2Info),
        assignAgentToStep({
          order: 3, name: "Hero 文案優化",
          description: "提出 3 個 Hero 標題 + 副標題組合（各有不同切角：功能型/情感型/社會證明型），請用戶選擇或調整語氣偏好。",
          tool: "osp_marketing_tools",
          outputType: "hero_copy_options",
          requiredSkills: ["copywriting", "brand-voice", "ux-writing"],
        }, m2Info),
        assignAgentToStep({
          order: 4, name: "SEO + CTA 優化",
          description: "結合 SEO 關鍵字建議，提出 3 組 CTA 文案 + 3 組 Value Proposition，並加入 Meta Description / Title Tag 建議，請用戶確認。",
          tool: "marketing-strategy-pmm",
          outputType: "seo_cta_package",
          requiredSkills: ["seo", "on-page-seo", "copywriting", "cro"],
        }, m3Info),
        assignAgentToStep({
          order: 5, name: "完整官網優化文案交付",
          description: "整合確認版本，輸出官網完整優化文案包（Hero/CTA/Features Section/FAQ 建議/Meta Tags），含 A/B 測試優先順序建議。",
          tool: "internal",
          outputType: "website_copy_package",
          requiredSkills: ["cro", "copywriting", "ab-testing", "ux-writing"],
        }, leadInfo),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "官網文案 CRO 優化流程",
        description: "五步驟官網優化：現況診斷 → 競品比較 → Hero 文案 → SEO+CTA → 完整文案包交付",
        steps,
      });

      await upsertSquad(conn, {
        slug,
        name: "官網文案 CRO 優化小組",
        description: "專注官網轉換率優化（CRO）與文案重寫。爬取現有官網做診斷，比對競品缺口，產出 Hero 文案 3 選項、SEO 優化 Meta Tags、CTA 改善建議，最終交付可直接上線的完整文案包。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["website"],
        methodology: "cro",
        agents: members,
        tags: ["cro", "website", "copywriting", "seo", "ux", "landing-page", "ab-testing", "conversion"],
        useCases: ["官網首頁文案重寫", "Landing Page 優化", "CTA 改善", "SEO 文案升級", "競品官網比較", "A/B 測試方案"],
        outputFormats: ["官網文案包（Markdown）", "SEO Meta Tags 清單", "CRO 診斷報告", "Google Slides 提案"],
        requiredIntegrations: ["google-analytics", "google-search-console"],
        token: 60000,
        showcases: [
          { company: "台灣 SaaS 品牌", description: "重寫官網 Hero 文案，從功能導向改為痛點導向，CTA 從「免費試用」改為「14 天免費，無需信用卡」", result: "轉換率提升 41%，跳出率下降 18%", source: "內部 A/B 測試數據" },
          { company: "電商品牌", description: "首頁 Value Prop 加入社會證明（品牌故事 + 客戶案例數字），SEO 標題加入長尾關鍵字", result: "自然搜尋流量 +33%，首頁停留時間 +28 秒", source: "GA4 數據" },
        ],
      });
    }

    // ── W2. mkt-seo-growth（SEO 長文成長）────────────────────────────────────
    {
      const slug     = "mkt-seo-growth";
      const taskType = "mkt-seo-growth";
      const used: number[] = [];

      const leadSkills = ["seo", "content-marketing", "content-strategy", "organic-growth"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }

      const m2Skills = ["keyword-research", "on-page-seo", "technical-seo", "search-console"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }

      const m3Skills = ["long-form-content", "blog-writing", "copywriting", "storytelling"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }

      const m4Skills = ["link-building", "content-promotion", "digital-pr", "backlink"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "seo_strategist",     order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "keyword_specialist",  order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "content_writer",      order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "link_builder",        order: 4 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
      ]);

      const steps = [
        assignAgentToStep({
          order: 1, name: "關鍵字研究",
          description: "根據品牌產業搜尋熱門關鍵字與 People Also Ask 問題，提出 5 個文章主題候選（含搜尋量估計與競爭難度），請用戶選擇主題。",
          tool: "marketing-strategy-pmm",
          outputType: "keyword_topic_list",
          requiredSkills: ["keyword-research", "seo", "search-console"],
        }, m2Info),
        assignAgentToStep({
          order: 2, name: "競品文章內容缺口分析",
          description: "搜尋該主題現有排名文章（前 5 名），分析內容缺口（哪些問題沒被回答，哪些角度沒被覆蓋），請用戶確認差異化切入角度。",
          tool: "octolens",
          outputType: "content_gap_analysis",
          requiredSkills: ["seo", "competitive-analysis", "content-strategy"],
        }, leadInfo),
        assignAgentToStep({
          order: 3, name: "文章大綱",
          description: "產出完整 H2/H3 結構大綱（含每段預期字數、引用資料方向、內部連結建議），請用戶確認結構後開始撰寫。",
          tool: "osp_marketing_tools",
          outputType: "article_outline",
          requiredSkills: ["content-strategy", "seo", "long-form-content"],
        }, leadInfo),
        assignAgentToStep({
          order: 4, name: "完整 SEO 長文撰寫",
          description: "輸出完整 1500-2500 字 SEO 長文，含 Meta Title/Description、Heading 關鍵字布局、內部/外部連結建議、圖片 Alt Text 建議，格式可直接貼入 CMS。",
          tool: "internal",
          outputType: "seo_article",
          requiredSkills: ["long-form-content", "blog-writing", "copywriting", "seo"],
        }, m3Info),
        assignAgentToStep({
          order: 5, name: "推廣與反向連結策略",
          description: "針對此文章建議 3 個推廣管道（社群分享格式、email newsletter 摘要、可投稿的媒體/論壇）+ 5 個潛在反向連結目標，輸出外擴推廣計劃。",
          tool: "marketing-strategy-pmm",
          outputType: "promotion_link_plan",
          requiredSkills: ["link-building", "content-promotion", "digital-pr"],
        }, m4Info),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "SEO 長文成長流程",
        description: "五步驟 SEO 內容：關鍵字研究 → 競品缺口分析 → 文章大綱 → 完整長文撰寫 → 推廣與反向連結",
        steps,
      });

      await upsertSquad(conn, {
        slug,
        name: "SEO 內容成長小組",
        description: "專注自然流量成長的 SEO 長文生產小組。從關鍵字研究到完整文章撰寫，整合競品缺口分析、SEO 技術優化、反向連結策略，每週產出高品質可排名的 SEO 長文，持續累積有機流量資產。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["website"],
        methodology: "seo-content",
        agents: members,
        tags: ["seo", "content-marketing", "organic-growth", "keyword-research", "long-form", "blog", "link-building", "content-strategy"],
        useCases: ["每週 SEO 長文生產", "新品上市 SEO 鋪墊", "競品關鍵字超越", "自然流量成長計劃", "內容行銷策略", "品牌知識庫建立"],
        outputFormats: ["SEO 長文（Markdown/HTML）", "Meta Tags 清單", "文章大綱", "推廣計劃"],
        requiredIntegrations: ["google-analytics", "google-search-console"],
        token: 65000,
        showcases: [
          { company: "台灣電商品牌", description: "持續 6 個月每週產出 1 篇 2000 字 SEO 長文，覆蓋「MIT 服飾」「平價時尚」等 30+ 長尾關鍵字", result: "自然搜尋流量從 5,000 增長到 45,000 月造訪，SEO 帶來的銷售佔比提升至 18%", source: "GA4 + Search Console 數據" },
        ],
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // WORKSPACE: facebook / social
    // ══════════════════════════════════════════════════════════════════════════

    // ── F1. mkt-content-engine（固定品牌貼文 / 內容引擎）───────────────────────
    {
      const slug     = "mkt-content-engine";
      const taskType = "mkt-content-engine";
      const used: number[] = [];

      const leadSkills = ["content-strategy", "content-marketing", "social-media", "editorial"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }

      const m2Skills = ["social-media", "facebook", "instagram", "community-management"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }

      const m3Skills = ["copywriting", "brand-voice", "storytelling", "content-creation"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }

      const m4Skills = ["visual-content", "design-brief", "creative-direction", "ugc"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "content_strategist",  order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "social_media_manager", order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "content_writer",       order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "creative_director",    order: 4 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
      ]);

      const steps = [
        assignAgentToStep({
          order: 1, name: "本週話題研究",
          description: "搜尋本週行業熱門話題與社群趨勢（台灣 Facebook/Instagram），提出 5 個貼文主題候選（含預期互動方向），請用戶確認方向。",
          tool: "octolens",
          outputType: "weekly_topics",
          requiredSkills: ["content-strategy", "social-media", "community-management"],
        }, m2Info),
        assignAgentToStep({
          order: 2, name: "品牌語調確認",
          description: "根據品牌資料分析語調，輸出 2 個語調範例貼文（正式/親切），請用戶確認偏好的品牌聲音方向。",
          tool: "osp_marketing_tools",
          outputType: "brand_voice_samples",
          requiredSkills: ["brand-voice", "copywriting", "storytelling"],
        }, m3Info),
        assignAgentToStep({
          order: 3, name: "一週排期規劃",
          description: "提出 7 天貼文排期（含平台/主題/格式/最佳發布時間），請用戶確認或調整排程優先順序。",
          tool: "internal",
          outputType: "content_calendar",
          requiredSkills: ["editorial", "content-strategy", "social-media"],
        }, leadInfo),
        assignAgentToStep({
          order: 4, name: "貼文草稿（前半週）",
          description: "輸出第 1-3 天完整貼文草稿（含文案、圖片視覺描述建議、Hashtag 組合），請用戶確認後繼續後半週。",
          tool: "osp_marketing_tools",
          outputType: "post_drafts_1_3",
          requiredSkills: ["copywriting", "visual-content", "brand-voice"],
        }, m3Info),
        assignAgentToStep({
          order: 5, name: "完整一週貼文包交付",
          description: "輸出完整 5-7 篇貼文草稿（Facebook + Instagram 雙版本），含視覺設計 Brief、Hashtag 策略、互動問句設計、排程建議，可直接套用發佈。",
          tool: "internal",
          outputType: "weekly_content_package",
          requiredSkills: ["content-creation", "social-media", "ugc", "creative-direction"],
        }, leadInfo),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "品牌社群內容引擎流程",
        description: "五步驟內容生產：話題研究 → 語調確認 → 週排期規劃 → 草稿前半週 → 完整貼文包",
        steps,
      });

      await upsertSquad(conn, {
        slug,
        name: "品牌社群內容引擎小組",
        description: "每週穩定產出 5-7 篇高品質品牌貼文，覆蓋 Facebook + Instagram 雙平台。整合話題研究、品牌語調、視覺設計 Brief，輸出可直接排程發佈的完整內容包，讓品牌社群保持活躍且風格一致。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["facebook"],
        methodology: "content-engine",
        agents: members,
        tags: ["content-marketing", "social-media", "facebook", "instagram", "brand-voice", "editorial", "community", "content-strategy"],
        useCases: ["每週品牌貼文生產", "社群帳號活躍維護", "節慶主題內容", "品牌故事系列", "產品上市社群鋪墊", "粉絲互動增長"],
        outputFormats: ["週貼文包（含雙平台版本）", "視覺設計 Brief", "內容月曆", "Hashtag 策略"],
        requiredIntegrations: ["facebook-ads", "google-drive"],
        token: 50000,
        showcases: [
          { company: "台灣服飾品牌", description: "每週產出 7 篇貼文（FB+IG），整合換季話題、MIT 在地感、穿搭 UGC 徵稿，語調統一親切台灣風", result: "粉絲互動率提升 85%，有機觸及增長 60%，6 個月粉絲增長 12,000+", source: "Facebook Insights" },
        ],
      });
    }

    // ── F2. mkt-social-content（社群內容策略）────────────────────────────────
    {
      const slug     = "mkt-social-content";
      const taskType = "mkt-social-content";
      const used: number[] = [];

      const leadSkills = ["social-media-strategy", "social-media", "community-growth", "influencer"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }

      const m2Skills = ["influencer-marketing", "kol", "ugc", "collaboration"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }

      const m3Skills = ["analytics", "social-analytics", "engagement", "data-driven-content"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }

      const m4Skills = ["video-content", "reels", "short-form", "creative-content"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "social_strategist",  order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "influencer_manager", order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "social_analyst",     order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "video_content_lead", order: 4 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
      ]);

      const steps = [
        assignAgentToStep({
          order: 1, name: "社群帳號現況診斷",
          description: "分析品牌 Facebook/Instagram 現有帳號的貼文頻率、互動率、熱門內容類型、受眾結構，標出成長機會點，請用戶確認問題優先順序。",
          tool: "octolens",
          outputType: "social_audit",
          requiredSkills: ["social-analytics", "analytics", "social-media"],
        }, m3Info),
        assignAgentToStep({
          order: 2, name: "競品社群策略分析",
          description: "搜尋 3-5 個競品的社群策略，分析其內容類型分布、KOL 合作模式、病毒內容特徵，找出可差異化的社群空間。",
          tool: "octolens",
          outputType: "competitor_social_analysis",
          requiredSkills: ["competitive-analysis", "social-media", "community-growth"],
        }, leadInfo),
        assignAgentToStep({
          order: 3, name: "KOL / 合作機會盤點",
          description: "根據品牌產業與受眾，建議 5-10 個 KOL/KOC 合作目標（含粉絲規模、互動率、收費估算），提出合作模式建議（開箱/穿搭/直播等）。",
          tool: "madison-market-research",
          outputType: "kol_shortlist",
          requiredSkills: ["influencer-marketing", "kol", "ugc", "collaboration"],
        }, m2Info),
        assignAgentToStep({
          order: 4, name: "內容組合策略",
          description: "根據診斷結果設計最佳內容組合（80/20 法則：教育/娛樂/促銷比例），規劃 Reels/短影音/圖文的月度比例，以及 UGC 徵稿活動概念。",
          tool: "osp_marketing_tools",
          outputType: "content_mix_strategy",
          requiredSkills: ["content-strategy", "video-content", "reels", "short-form"],
        }, m4Info),
        assignAgentToStep({
          order: 5, name: "社群成長 90 天計劃",
          description: "整合以上分析，輸出 90 天社群成長計劃（含 KPI 目標、每月主題、KOL 合作排程、廣告投放建議），可作為社群操作 SOP。",
          tool: "internal",
          outputType: "social_growth_plan_90d",
          requiredSkills: ["social-media-strategy", "community-growth", "influencer", "analytics"],
        }, leadInfo),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "社群成長策略流程",
        description: "五步驟社群策略：帳號診斷 → 競品分析 → KOL 盤點 → 內容組合設計 → 90 天成長計劃",
        steps,
      });

      await upsertSquad(conn, {
        slug,
        name: "社群成長策略小組",
        description: "從診斷到執行，全面提升品牌社群表現。整合社群數據分析、KOL 合作管理、短影音內容策略、競品社群情報，輸出包含 KPI、KOL 清單、內容月曆、廣告建議的 90 天社群成長計劃。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["facebook"],
        methodology: "social-growth",
        agents: members,
        tags: ["social-media", "facebook", "instagram", "kol", "influencer", "community-growth", "reels", "ugc", "video-content", "social-analytics"],
        useCases: ["社群帳號重啟成長", "KOL 合作選擇", "社群從零到千", "短影音策略", "品牌社群 SOP 建立", "粉絲黏著度提升"],
        outputFormats: ["90 天社群計劃", "KOL 候選清單", "內容組合策略報告", "PDF 提案"],
        requiredIntegrations: ["facebook-ads", "google-analytics"],
        token: 60000,
        showcases: [
          { company: "台灣美妝品牌", description: "設計 KOL 微網紅策略（10 個 1-5 萬粉的 KOC），搭配每週 UGC 徵稿活動，粉絲真實互動取代廣告觸及", result: "6 個月 IG 粉絲從 3,000 到 18,000，互動率提升 3.2 倍", source: "Instagram Insights" },
        ],
      });
    }

    // ── F3. tw-facebook-ads（Facebook 廣告文案 / 策略）───────────────────────
    {
      const slug     = "tw-facebook-ads";
      const taskType = "tw-facebook-ads";
      const used: number[] = [];

      const leadSkills = ["facebook-ads", "meta-ads", "paid-social", "performance-marketing"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }

      const m2Skills = ["ad-copywriting", "copywriting", "direct-response", "persuasion"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }

      const m3Skills = ["audience-targeting", "lookalike", "retargeting", "facebook-pixel"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }

      const m4Skills = ["creative-strategy", "video-ads", "carousel-ads", "ab-testing"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "ads_strategist",     order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "ad_copywriter",       order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "audience_specialist", order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "creative_strategist", order: 4 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
      ]);

      const steps = [
        assignAgentToStep({
          order: 1, name: "廣告目標與預算確認",
          description: "根據品牌目標（轉換/流量/品牌曝光），建議廣告目標設定、預算分配框架（漏斗三層比例：冷受眾 50% / 暖受眾 30% / 再行銷 20%），請用戶確認方向。",
          tool: "marketing-strategy-pmm",
          outputType: "ad_objective_budget",
          requiredSkills: ["facebook-ads", "performance-marketing", "meta-ads"],
        }, leadInfo),
        assignAgentToStep({
          order: 2, name: "競品廣告研究",
          description: "用 Facebook Ad Library 搜尋 3-5 個競品廣告，分析其素材類型、文案結構、CTA、落地頁設計，找出可差異化的廣告機會。",
          tool: "octolens",
          outputType: "competitor_ad_analysis",
          requiredSkills: ["competitive-analysis", "facebook-ads", "creative-strategy"],
        }, m4Info),
        assignAgentToStep({
          order: 3, name: "受眾策略設計",
          description: "提出 3 層受眾策略（冷受眾興趣/行為組合、暖受眾網站訪客/影片觀看、再行銷購物車放棄/舊客），包含相似受眾種子建議。",
          tool: "madison-market-research",
          outputType: "audience_strategy",
          requiredSkills: ["audience-targeting", "lookalike", "retargeting", "facebook-pixel"],
        }, m3Info),
        assignAgentToStep({
          order: 4, name: "廣告文案 × 3 組",
          description: "針對每層受眾提出廣告文案組合（主標題/內文/CTA），每組 2-3 個文案版本（情感型/功能型/社會證明型），共輸出 6-9 個文案選項。",
          tool: "osp_marketing_tools",
          outputType: "ad_copy_set",
          requiredSkills: ["ad-copywriting", "copywriting", "direct-response", "persuasion"],
        }, m2Info),
        assignAgentToStep({
          order: 5, name: "素材創意 Brief + A/B 測試計劃",
          description: "輸出每組廣告的素材創意 Brief（圖片/影片/輪播格式說明）+ A/B 測試優先順序（先測受眾 or 文案 or 素材），建議第一週測試框架。",
          tool: "internal",
          outputType: "creative_brief_ab_plan",
          requiredSkills: ["creative-strategy", "video-ads", "carousel-ads", "ab-testing"],
        }, leadInfo),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "Facebook 廣告策略流程",
        description: "五步驟 Meta 廣告：目標預算確認 → 競品廣告研究 → 受眾策略 → 文案 3 組 → 素材 Brief + A/B 計劃",
        steps,
      });

      await upsertSquad(conn, {
        slug,
        name: "Facebook 廣告策略小組",
        description: "專攻 Meta (Facebook/Instagram) 廣告全漏斗策略。從競品廣告研究到受眾分層設計，產出 3 層受眾策略 + 6-9 個文案選項 + 素材創意 Brief + A/B 測試計劃，讓廣告帳戶有系統地降低 CPA、提升 ROAS。",
        industryKey: "general",
        missionType: taskType,
        workspace: ["facebook"],
        methodology: "paid-social",
        agents: members,
        tags: ["facebook-ads", "meta-ads", "paid-social", "performance-marketing", "retargeting", "audience-targeting", "ad-copywriting", "creative-strategy", "ab-testing", "roas"],
        useCases: ["新廣告帳戶建立", "廣告 ROAS 優化", "受眾擴展策略", "再行銷序列設計", "文案 A/B 測試", "節慶廣告全案規劃"],
        outputFormats: ["廣告策略報告", "文案集（3 組 × 多版本）", "素材創意 Brief", "A/B 測試計劃", "受眾分層地圖"],
        requiredIntegrations: ["facebook-ads", "google-analytics"],
        token: 70000,
        showcases: [
          { company: "台灣電商品牌", description: "重構廣告受眾分層（冷/暖/再行銷三層），配合文案 A/B 測試（情感型 vs 功能型），優化廣告帳戶結構", result: "ROAS 從 1.8 提升到 4.2，CPA 下降 41%，單月廣告銷售額成長 180%", source: "Meta Ads Manager 數據" },
        ],
      });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // WORKSPACE: ecommerce
    // ══════════════════════════════════════════════════════════════════════════

    // ── E1. tw-ecom-full-funnel（電商全漏斗廣告優化）────────────────────────
    {
      const slug     = "tw-ecom-full-funnel";
      const taskType = "tw-ecom-full-funnel";
      const used: number[] = [];

      const leadSkills = ["ecommerce", "full-funnel", "performance-marketing", "growth-hacking"];
      const leadId = await findAgent(conn, leadSkills, used);
      if (leadId) { used.push(leadId); await assignSkillsToAgent(conn, leadId, leadSkills); }

      const m2Skills = ["facebook-ads", "google-ads", "paid-search", "shopping-ads"];
      const m2 = await findAgent(conn, m2Skills, used);
      if (m2) { used.push(m2); await assignSkillsToAgent(conn, m2, m2Skills); }

      const m3Skills = ["cro", "landing-page", "checkout-optimization", "upsell"];
      const m3 = await findAgent(conn, m3Skills, used);
      if (m3) { used.push(m3); await assignSkillsToAgent(conn, m3, m3Skills); }

      const m4Skills = ["email-marketing", "crm", "retention", "customer-lifecycle"];
      const m4 = await findAgent(conn, m4Skills, used);
      if (m4) { used.push(m4); await assignSkillsToAgent(conn, m4, m4Skills); }

      const m5Skills = ["analytics", "ga4", "attribution", "ltv", "cohort-analysis"];
      const m5 = await findAgent(conn, m5Skills, used);
      if (m5) { used.push(m5); await assignSkillsToAgent(conn, m5, m5Skills); }

      const members = [
        leadId && { agent_id: leadId, is_lead: true,  role: "ecom_growth_lead",       order: 1 },
        m2     && { agent_id: m2,     is_lead: false, role: "paid_ads_specialist",     order: 2 },
        m3     && { agent_id: m3,     is_lead: false, role: "cro_specialist",          order: 3 },
        m4     && { agent_id: m4,     is_lead: false, role: "retention_specialist",    order: 4 },
        m5     && { agent_id: m5,     is_lead: false, role: "analytics_specialist",    order: 5 },
      ].filter(Boolean);

      const [leadInfo, m2Info, m3Info, m4Info, m5Info] = await Promise.all([
        getAgentInfo(conn, leadId),
        getAgentInfo(conn, m2 ?? null),
        getAgentInfo(conn, m3 ?? null),
        getAgentInfo(conn, m4 ?? null),
        getAgentInfo(conn, m5 ?? null),
      ]);

      const steps = [
        assignAgentToStep({
          order: 1, name: "廣告現況診斷",
          description: "請用戶提供近期廣告數據（或根據品牌資料估算），診斷現況問題點：哪層漏斗最漏？ROAS/CAC/ROAS 在哪個環節斷裂？",
          tool: "marketing-strategy-pmm",
          outputType: "funnel_diagnosis",
          requiredSkills: ["analytics", "ga4", "attribution", "ecommerce"],
        }, m5Info),
        assignAgentToStep({
          order: 2, name: "競品廣告 + 漏斗研究",
          description: "搜尋競品廣告策略（Facebook Ad Library + Google）、落地頁設計、促銷機制，找出全漏斗優化機會，請用戶確認重點攻擊方向。",
          tool: "octolens",
          outputType: "competitor_funnel_research",
          requiredSkills: ["competitive-analysis", "ecommerce", "full-funnel"],
        }, m2Info),
        assignAgentToStep({
          order: 3, name: "受眾 + 廣告策略優化",
          description: "提出 3 層受眾策略優化方向（冷受眾新客獲取 / 暖受眾轉換加速 / 再行銷挽回），含 Google Shopping 與 Meta 廣告的預算配比建議。",
          tool: "madison-market-research",
          outputType: "audience_ads_optimization",
          requiredSkills: ["facebook-ads", "google-ads", "shopping-ads", "audience-targeting"],
        }, m2Info),
        assignAgentToStep({
          order: 4, name: "官網 + 結帳 CRO 建議",
          description: "針對產品頁、購物車、結帳流程提出 CRO 改善建議（含 Upsell/Cross-sell 機制、放棄購物車挽回 Email 觸發設計），輸出優先執行清單。",
          tool: "osp_marketing_tools",
          outputType: "cro_checkout_optimization",
          requiredSkills: ["cro", "landing-page", "checkout-optimization", "upsell"],
        }, m3Info),
        assignAgentToStep({
          order: 5, name: "留客 + LTV 提升策略",
          description: "設計 Email/LINE 再行銷序列（歡迎信/購後關懷/復購提醒/會員升級），輸出完整 CRM 自動化觸發地圖，讓 LTV 持續增長。",
          tool: "internal",
          outputType: "retention_ltv_strategy",
          requiredSkills: ["email-marketing", "crm", "retention", "customer-lifecycle", "ltv"],
        }, m4Info),
        assignAgentToStep({
          order: 6, name: "完整全漏斗優化方案",
          description: "整合前五步驟，輸出完整電商全漏斗優化方案（廣告策略 + CRO 改善 + 留客序列 + KPI 目標），含 30/60/90 天行動路線圖。",
          tool: "internal",
          outputType: "full_funnel_optimization_report",
          requiredSkills: ["ecommerce", "full-funnel", "performance-marketing", "growth-hacking"],
        }, leadInfo),
      ];

      await upsertWorkflow(conn, {
        missionType: taskType,
        name: "電商全漏斗優化流程",
        description: "六步驟電商全漏斗：現況診斷 → 競品研究 → 廣告受眾優化 → 官網 CRO → 留客 LTV → 完整方案交付",
        steps,
      });

      await upsertSquad(conn, {
        slug,
        name: "電商全漏斗成長小組",
        description: "覆蓋電商完整成長漏斗的專業小組：從付費廣告獲客（Meta + Google）到官網 CRO 轉換優化，再到 CRM 留客 LTV 提升。整合 GA4 漏斗診斷、競品廣告研究、CRO 改善建議、Email 自動化序列設計，輸出含 30/60/90 天行動路線圖的完整電商成長方案。",
        industryKey: "ecom",
        missionType: taskType,
        workspace: ["facebook"],
        methodology: "full-funnel",
        agents: members,
        tags: ["ecommerce", "full-funnel", "performance-marketing", "facebook-ads", "google-ads", "cro", "retention", "crm", "ltv", "growth-hacking", "taiwan"],
        useCases: ["電商 ROAS 優化", "購物車放棄挽回", "新客獲取成本降低", "舊客復購率提升", "全漏斗廣告架構建立", "電商節慶全案規劃"],
        outputFormats: ["電商成長報告", "廣告策略提案", "CRO 改善清單", "CRM 自動化地圖", "30/60/90 天計劃"],
        requiredIntegrations: ["facebook-ads", "google-analytics", "google-drive", "email"],
        token: 85000,
        showcases: [
          { company: "台灣快時尚電商", description: "重構全漏斗廣告結構：Meta 冷受眾拉客 + Google Shopping 意圖攔截 + Email 放棄購物車挽回序列，三管齊下", result: "整體電商收益提升 67%，CAC 下降 35%，復購率從 18% 提升至 31%", source: "GA4 + Meta Ads Manager 數據" },
          { company: "3C 電商品牌", description: "Product Page CRO 改善（加入社會證明+影片展示）+ 跨售機制設計，結合再行銷 Email 序列", result: "AOV 提升 28%，結帳完成率從 61% 提升至 78%", source: "GA4 E-commerce 報告" },
        ],
      });
    }

    console.log("\n[seed-missing] ✅ 所有缺少的 Squads 已成功 seed！");
    console.log("[seed-missing] 新增 8 個 squads：");
    console.log("  strategy:   tw-b2b-saas-gtm, mkt-analytics-attribution");
    console.log("  website:    tw-website-rebuild, mkt-seo-growth");
    console.log("  facebook:   mkt-content-engine, mkt-social-content, tw-facebook-ads");
    console.log("  ecommerce:  tw-ecom-full-funnel");

  } catch (err: any) {
    console.error("[seed-missing] ERROR:", err.message ?? err);
    throw err;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[seed-missing] FATAL:", err.message ?? err);
  process.exit(1);
});
