/**
 * Schema diff: drizzle/schema.ts vs the actual MySQL database.
 *
 * Walks every mysqlTable export, asks information_schema for the
 * live column set, and prints what's missing on either side. Read-only;
 * outputs an actionable report instead of mutating the DB. Pair with
 * scripts/migrate.ts to ALTER the missing columns idempotently.
 *
 *   pnpm tsx scripts/audit-schema-diff.ts
 *
 * Reads connection details from LOCAL_DB_* (or DB_* fallback) so the
 * same script runs against either Azure sowork_db or the VM mos_db.
 */
import { createPool } from "mysql2/promise";
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import * as schema from "../drizzle/schema";

const pool = createPool({
  host:     process.env.LOCAL_DB_HOST     || process.env.DB_HOST     || "localhost",
  port:     Number(process.env.LOCAL_DB_PORT || process.env.DB_PORT) || 3306,
  user:     process.env.LOCAL_DB_USER     || process.env.DB_USER     || "mos_user",
  password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD || "mos_secure_2026",
  database: process.env.LOCAL_DB_NAME     || process.env.DB_NAME     || "mos_db",
  ssl:      process.env.DB_SSL === "true" ? {} : undefined,
});

function isMySqlTable(value: unknown): value is MySqlTable {
  return value !== null && typeof value === "object" && Symbol.for("drizzle:Name") in (value as object);
}

interface Diff {
  table: string;
  exists: boolean;
  missingInDb: Array<{ name: string; suggestedSql: string }>;
  unknownInDb: string[];
}

async function main() {
  const conn = await pool.getConnection();
  const dbName = (
    await conn.query("SELECT DATABASE() AS d")
  )[0] as Array<{ d: string }>;
  const targetDb = dbName[0]?.d ?? "(unknown)";

  console.log(`[schema-diff] DB: ${targetDb}`);
  console.log(`[schema-diff] Comparing against drizzle/schema.ts ...\n`);

  const diffs: Diff[] = [];

  for (const [exportName, value] of Object.entries(schema)) {
    if (!isMySqlTable(value)) continue;

    const cfg = getTableConfig(value as MySqlTable);
    const tableName = cfg.name;

    const [tblRows] = (await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName],
    )) as unknown as [Array<{ TABLE_NAME: string }>, unknown];

    if (tblRows.length === 0) {
      diffs.push({
        table: tableName,
        exists: false,
        missingInDb: cfg.columns.map((c) => ({
          name: c.name,
          suggestedSql: `(table missing: see drizzle/schema.ts ${exportName})`,
        })),
        unknownInDb: [],
      });
      continue;
    }

    const [colRows] = (await conn.query(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName],
    )) as unknown as [
      Array<{ COLUMN_NAME: string; DATA_TYPE: string; COLUMN_TYPE: string; IS_NULLABLE: string }>,
      unknown,
    ];

    const liveCols = new Set(colRows.map((r) => r.COLUMN_NAME));
    const drizzleCols = new Set(cfg.columns.map((c) => c.name));

    const missingInDb = cfg.columns
      .filter((c) => !liveCols.has(c.name))
      .map((c) => ({
        name: c.name,
        // Best-effort suggestion — humans should review before applying.
        suggestedSql: `ALTER TABLE \`${tableName}\` ADD COLUMN \`${c.name}\` ${guessMysqlType(c)};`,
      }));

    const unknownInDb = [...liveCols].filter((c) => !drizzleCols.has(c));

    if (missingInDb.length > 0 || unknownInDb.length > 0) {
      diffs.push({ table: tableName, exists: true, missingInDb, unknownInDb });
    }
  }

  console.log(`Tables checked: ${Object.values(schema).filter(isMySqlTable).length}`);
  console.log(`Tables with drift: ${diffs.length}\n`);

  for (const d of diffs) {
    console.log(`── ${d.table} ${d.exists ? "" : "(MISSING TABLE)"} ──`);
    if (d.missingInDb.length > 0) {
      console.log(`  Missing in DB:`);
      for (const c of d.missingInDb) {
        console.log(`    - ${c.name}`);
        console.log(`      ${c.suggestedSql}`);
      }
    }
    if (d.unknownInDb.length > 0) {
      console.log(`  Extra in DB (not in drizzle schema):`);
      for (const c of d.unknownInDb) console.log(`    - ${c}`);
    }
    console.log();
  }

  if (diffs.length === 0) {
    console.log("✅ Schema matches drizzle/schema.ts cleanly.");
  } else {
    console.log(
      `\n⚠️  ${diffs.length} table(s) have drift. Apply suggestedSql via scripts/migrate.ts (idempotent ALTERs) or run them manually after review.`,
    );
  }

  conn.release();
  await pool.end();
}

function guessMysqlType(col: any): string {
  // Drizzle column → close-enough MySQL DDL fragment for ALTER TABLE.
  // Not perfect (e.g. enum values, defaults) — humans should sanity-check.
  const dataType: string = col.dataType ?? "";
  const sqlTypeMap: Record<string, string> = {
    string: col.length ? `VARCHAR(${col.length}) NULL` : "TEXT NULL",
    number: col.size === "big" ? "BIGINT NULL" : "INT NULL",
    boolean: "TINYINT(1) NULL",
    date: "DATETIME(3) NULL",
    json: "JSON NULL",
  };
  if (dataType in sqlTypeMap) return sqlTypeMap[dataType] as string;
  // Drizzle-mysql column types like "varchar", "int", "timestamp", "datetime"
  const ct = (col.columnType || "").toLowerCase();
  if (ct.includes("varchar")) return col.length ? `VARCHAR(${col.length}) NULL` : "VARCHAR(255) NULL";
  if (ct.includes("text")) return "TEXT NULL";
  if (ct.includes("int")) return "INT NULL";
  if (ct.includes("timestamp")) return "TIMESTAMP NULL";
  if (ct.includes("datetime")) return "DATETIME(3) NULL";
  if (ct.includes("json")) return "JSON NULL";
  if (ct.includes("enum")) return "VARCHAR(64) NULL  -- enum: review values manually";
  if (ct.includes("tinyint")) return "TINYINT(1) NULL";
  return "/* type unknown — review */ VARCHAR(255) NULL";
}

main().catch((err) => {
  console.error("[schema-diff] FAILED:", err);
  process.exit(1);
});
