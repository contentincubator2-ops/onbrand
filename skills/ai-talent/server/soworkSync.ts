/**
 * soworkSync.ts — app.sowork.ai Brand Data Integration
 *
 * Reads brand positioning data from the shared sowork_db (app.sowork.ai's database)
 * and syncs it into the agents enterprise_brands table as soworkAnalysis JSON.
 *
 * Data flow:
 *   sowork_db.brands (app.sowork.ai) → parse brandBook → enterprise_brands.soworkAnalysis
 */

import { getSoworkDb } from "./db";
import { getDb } from "./db";
import { brands as enterpriseBrands } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { mysqlTable, int, varchar, text, json, mediumtext, timestamp } from "drizzle-orm/mysql-core";

// ── sowork_db brands schema (read-only mirror) ────────────────────────────────

const soworkBrandsTable = mysqlTable("brands", {
  id:          int("id").primaryKey(),
  userId:      int("userId").notNull(),
  name:        varchar("name", { length: 255 }).notNull(),
  industry:    varchar("industry", { length: 255 }),
  description: text("description"),
  website:     varchar("website", { length: 500 }),
  tagline:     varchar("tagline", { length: 500 }),
  status:      varchar("status", { length: 50 }),
  brandBook:   mediumtext("brandBook"),
  valueProposition: json("valueProposition"),
  targetMarket: varchar("targetMarket", { length: 100 }),
  contentLanguage: varchar("contentLanguage", { length: 50 }),
  createdAt:   timestamp("createdAt"),
  updatedAt:   timestamp("updatedAt"),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AppSoworkBrand {
  id: number;
  name: string;
  industry: string | null;
  description: string | null;
  website: string | null;
  tagline: string | null;
  status: string | null;
  brandBook: string | null;
  soworkAnalysis: {
    positioning: string;
    targetAudience: string;
    brandVoice: string;
    valueProposition: string;
    taglineZh: string;
    taglineEn: string;
    differentiators: string[];
    source: "app.sowork.ai";
    syncedAt: string;
    appBrandId: number;
  } | null;
}

// ── Parse brandBook markdown into structured analysis ─────────────────────────

function parseBrandBook(brandBook: string | null, brandName: string): AppSoworkBrand["soworkAnalysis"] {
  if (!brandBook || brandBook.length < 50) return null;

  const safeExtract = (match: RegExpMatchArray | null, idx = 1): string =>
    (match && match[idx]) ? match[idx]!.replace(/[*#`>]/g, "").trim() : "";

  // Extract positioning statement
  const posMatch = brandBook.match(/品牌定位陳述[^\n]*\n+[>\s]*[「"]([^」"]{20,500})[」"]/);
  const positioning = safeExtract(posMatch) || safeExtract(brandBook.match(/Positioning Statement[^\n]*\n+[>\s]*[「""]?([^」""]{20,400})[」""]?/i));

  // Extract target audience
  const taMatch = brandBook.match(/目標受眾[^\n]*\n+([^\n]{10,200})/);
  const targetAudience = safeExtract(taMatch);

  // Extract brand voice / tone
  const voiceMatch = brandBook.match(/品牌語調[^\n]*\n+([^\n]{10,200})/i) ??
                     brandBook.match(/Brand Voice[^\n]*\n+([^\n]{10,200})/i);
  const brandVoice = safeExtract(voiceMatch);

  // Extract value proposition
  const vpMatch = brandBook.match(/核心價值主張[^\n]*\n+([^\n]{10,300})/i) ??
                  brandBook.match(/Value Proposition[^\n]*\n+([^\n]{10,300})/i);
  const valueProposition = safeExtract(vpMatch);

  // Extract taglines
  const taglineZhMatch = brandBook.match(/中文標語[^\n]*[：:]\s*([^\n]{3,50})/i) ??
                          brandBook.match(/Chinese Tagline[^\n]*[：:]\s*([^\n]{3,50})/i);
  const taglineZh = safeExtract(taglineZhMatch);

  const taglineEnMatch = brandBook.match(/英文標語[^\n]*[：:]\s*([^\n]{3,80})/i) ??
                          brandBook.match(/English Tagline[^\n]*[：:]\s*([^\n]{3,80})/i);
  const taglineEn = safeExtract(taglineEnMatch);

  // Extract differentiators
  const diffSection = brandBook.match(/差異化[^\n]*\n+([\s\S]{20,800}?)(?:\n##|\n---|\n\n##)/);
  const differentiators: string[] = [];
  if (diffSection && diffSection[1]) {
    const bullets = diffSection[1].match(/[-*•]\s*([^\n]{10,100})/g) ?? [];
    differentiators.push(...bullets.slice(0, 5).map(b => b.replace(/^[-*•]\s*/, "").trim()));
  }

  return {
    positioning: positioning || `${brandName} 的品牌定位`,
    targetAudience: targetAudience || "",
    brandVoice: brandVoice || "",
    valueProposition: valueProposition || "",
    taglineZh,
    taglineEn,
    differentiators,
    source: "app.sowork.ai",
    syncedAt: new Date().toISOString(),
    appBrandId: 0, // will be filled in
  };
}

// ── Main: list available brands from app.sowork.ai ────────────────────────────

export async function listAppSoworkBrands(appUserId: number): Promise<AppSoworkBrand[]> {
  const soworkDb = await getSoworkDb();

  const rows = await soworkDb
    .select({
      id: soworkBrandsTable.id,
      name: soworkBrandsTable.name,
      industry: soworkBrandsTable.industry,
      description: soworkBrandsTable.description,
      website: soworkBrandsTable.website,
      tagline: soworkBrandsTable.tagline,
      status: soworkBrandsTable.status,
      brandBook: soworkBrandsTable.brandBook,
    })
    .from(soworkBrandsTable)
    .where(eq(soworkBrandsTable.userId, appUserId))
    .orderBy(soworkBrandsTable.id);

  return rows.map(row => {
    const analysis = parseBrandBook(row.brandBook ?? null, row.name);
    if (analysis) analysis.appBrandId = row.id;
    return {
      id: row.id,
      name: row.name,
      industry: row.industry ?? null,
      description: row.description ?? null,
      website: row.website ?? null,
      tagline: row.tagline ?? null,
      status: row.status ?? null,
      brandBook: row.brandBook ?? null,
      soworkAnalysis: analysis,
    };
  });
}

// ── Sync: import app.sowork.ai brand into enterprise_brands ──────────────────

export async function syncBrandFromAppSowork(
  appBrandId: number,
  agentsUserId: number
): Promise<{ success: boolean; enterpriseBrandId: number; brandName: string; message: string }> {
  const soworkDb = await getSoworkDb();
  const agentsDb = await getDb();
  if (!agentsDb) throw new Error("Agents DB not available");

  // Fetch from app.sowork.ai DB
  const [row] = await soworkDb
    .select()
    .from(soworkBrandsTable)
    .where(eq(soworkBrandsTable.id, appBrandId))
    .limit(1);

  if (!row) throw new Error(`Brand ${appBrandId} not found in app.sowork.ai`);

  // Parse brandBook
  const analysis = parseBrandBook(row.brandBook ?? null, row.name);
  if (analysis) analysis.appBrandId = appBrandId;

  // Check if already synced
  const existing = await agentsDb
    .select({ id: enterpriseBrands.id })
    .from(enterpriseBrands)
    .where(and(
      eq(enterpriseBrands.userId, agentsUserId),
      eq(enterpriseBrands.name, row.name),
    ))
    .limit(1);

  let enterpriseBrandId: number;

  if (existing.length > 0 && existing[0]) {
    // Update existing
    enterpriseBrandId = existing[0].id;
    await agentsDb
      .update(enterpriseBrands)
      .set({
        description: row.description ?? undefined,
        websiteUrl: row.website ?? undefined,
        tagline: row.tagline ?? undefined,
        targetAudience: analysis?.targetAudience ?? undefined,
        brandVoice: analysis?.brandVoice ?? undefined,
        soworkAnalysis: analysis as Record<string, unknown> ?? undefined,
        dataSource: "sowork",
      })
      .where(eq(enterpriseBrands.id, enterpriseBrandId));
  } else {
    // Insert new
    const insertResult = await (agentsDb.insert(enterpriseBrands) as any).values({
      userId: agentsUserId,
      name: row.name,
      description: row.description ?? null,
      websiteUrl: row.website ?? null,
      tagline: row.tagline ?? null,
      targetAudience: analysis?.targetAudience ?? null,
      brandVoice: analysis?.brandVoice ?? null,
      soworkAnalysis: analysis ?? null,
      dataSource: "sowork",
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    enterpriseBrandId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId ?? 0;
  }

  return {
    success: true,
    enterpriseBrandId,
    brandName: row.name,
    message: `已從 app.sowork.ai 同步品牌「${row.name}」`,
  };
}
