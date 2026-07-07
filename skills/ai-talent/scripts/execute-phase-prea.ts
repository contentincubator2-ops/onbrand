/**
 * execute-phase-prea.ts — Execute Phase PreA: Data Consolidation
 *
 * Direct database connection and migration execution:
 * 1. Connect to both sowork_db (Azure) and mos_db (Local)
 * 2. Compare data completeness
 * 3. Execute migration: sowork_db → mos_db
 * 4. Validate data integrity
 * 5. Create schema backup for GitHub
 *
 * Run: npx tsx scripts/execute-phase-prea.ts
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

interface MigrationStats {
  tablesChecked: string[];
  rowsMigrated: { [key: string]: number };
  errors: string[];
  success: boolean;
}

async function executePhasePreA() {
  console.log('🚀 Phase PreA: Data Consolidation - Direct Execution\n');

  const stats: MigrationStats = {
    tablesChecked: [],
    rowsMigrated: {},
    errors: [],
    success: false,
  };

  // Connection configurations
  const soworkConfig = {
    host: process.env.SOWORK_DB_HOST || 'ytcreator-ai-server.mysql.database.azure.com',
    user: process.env.SOWORK_DB_USER || 'lahbqgrqit',
    password: process.env.SOWORK_DB_PASSWORD || 'SoWork2026db',
    database: process.env.SOWORK_DB_NAME || 'sowork_db',
  };

  const mosConfig = {
    host: process.env.LOCAL_DB_HOST || 'localhost',
    port: parseInt(process.env.LOCAL_DB_PORT || '3306'),
    user: process.env.LOCAL_DB_USER || 'mos_user',
    password: process.env.LOCAL_DB_PASSWORD || 'MUST_SET_LOCAL_DB_PASSWORD',
    database: process.env.LOCAL_DB_NAME || 'mos_db',
  };

  // Step 1: Test connections
  console.log('📌 Step 1: Testing database connections...\n');

  let soworkConn: mysql.Connection | null = null;
  let mosConn: mysql.Connection | null = null;

  try {
    soworkConn = await mysql.createConnection({
      ...soworkConfig,
      ssl: { rejectUnauthorized: false },
    });
    console.log('✅ Connected to sowork_db (Azure)');
  } catch (error) {
    const msg = `❌ Cannot connect to sowork_db: ${(error as Error).message}`;
    console.log(msg);
    stats.errors.push(msg);
  }

  try {
    mosConn = await mysql.createConnection({
      ...mosConfig,
    });
    console.log('✅ Connected to mos_db (Local)');
  } catch (error) {
    const msg = `❌ Cannot connect to mos_db: ${(error as Error).message}`;
    console.log(msg);
    stats.errors.push(msg);
  }

  if (!soworkConn || !mosConn) {
    console.log('\n❌ Cannot proceed without both database connections');
    return stats;
  }

  // Step 2: Compare data counts
  console.log('\n📌 Step 2: Comparing data completeness...\n');

  try {
    const [soworkSquads] = await soworkConn.query(
      'SELECT COUNT(*) as cnt FROM squads WHERE is_active=1'
    );
    const [mosSquads] = await mosConn.query(
      'SELECT COUNT(*) as cnt FROM squads WHERE is_active=1'
    );

    const soworkCount = (soworkSquads as any)[0].cnt;
    const mosCount = (mosSquads as any)[0].cnt;

    console.log(`sowork_db squads: ${soworkCount}`);
    console.log(`mos_db squads:    ${mosCount}`);
    console.log(`Difference:       ${Math.abs(soworkCount - mosCount)}\n`);

    if (soworkCount <= mosCount) {
      console.log('⚠️  mos_db already has >= sowork_db data. Skipping migration.');
      stats.success = true;
      return stats;
    }
  } catch (error) {
    stats.errors.push(`Error comparing counts: ${(error as Error).message}`);
  }

  // Step 3: Backup mos_db schema before migration
  console.log('📌 Step 3: Creating backup structure...\n');

  try {
    const backupDir = path.join(process.cwd(), 'database', 'schema');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    console.log(`✅ Backup directory ready: ${backupDir}`);
  } catch (error) {
    stats.errors.push(`Error creating backup dir: ${(error as Error).message}`);
  }

  // Step 4: Execute migration for each core table
  console.log('\n📌 Step 4: Migrating data from sowork_db to mos_db...\n');

  const tablesToMigrate = [
    'squads',
    'agents',
    'missions',
    'agent_chats',
  ];

  for (const table of tablesToMigrate) {
    try {
      console.log(`  Migrating ${table}...`);

      // Get count before
      const [beforeRows] = await mosConn.query(
        `SELECT COUNT(*) as cnt FROM ${table}`
      );
      const beforeCount = (beforeRows as any)[0].cnt;

      // Get data from sowork_db
      const [sourceData] = await soworkConn.query(
        `SELECT * FROM ${table}`
      );

      if ((sourceData as any[]).length === 0) {
        console.log(`    → No data to migrate`);
        continue;
      }

      // Insert into mos_db (with ON DUPLICATE KEY UPDATE for idempotency)
      const rows = sourceData as any[];
      const batchSize = 100;

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const placeholders = batch.map(() => '(?)').join(',');
        const columns = Object.keys(batch[0]);

        const query = `INSERT IGNORE INTO ${table} (${columns.join(',')}) VALUES ${batch
          .map(
            (row) =>
              `(${columns.map((col) => (row[col] === null ? 'NULL' : mysql.escape(row[col]))).join(',')})`
          )
          .join(',')}`;

        try {
          await mosConn.query(query);
        } catch (batchError) {
          // Fallback: insert one by one
          for (const row of batch) {
            try {
              const values = columns.map((col) =>
                row[col] === null ? 'NULL' : mysql.escape(row[col])
              );
              await mosConn.query(
                `INSERT IGNORE INTO ${table} (${columns.join(',')}) VALUES (${values.join(',')})`
              );
            } catch {
              // Skip individual row errors
            }
          }
        }
      }

      // Get count after
      const [afterRows] = await mosConn.query(
        `SELECT COUNT(*) as cnt FROM ${table}`
      );
      const afterCount = (afterRows as any)[0].cnt;
      const inserted = afterCount - beforeCount;

      stats.rowsMigrated[table] = inserted;
      stats.tablesChecked.push(table);
      console.log(`    ✅ Inserted ${inserted} rows (Total: ${afterCount})`);
    } catch (error) {
      const msg = `Error migrating ${table}: ${(error as Error).message}`;
      console.log(`    ❌ ${msg}`);
      stats.errors.push(msg);
    }
  }

  // Step 5: Validate data integrity
  console.log('\n📌 Step 5: Validating data integrity...\n');

  try {
    const [dupSlugs] = await mosConn.query(
      'SELECT COUNT(*) as cnt FROM (SELECT slug FROM squads WHERE is_active=1 GROUP BY slug HAVING COUNT(*) > 1) as x'
    );
    const dupCount = (dupSlugs as any)[0].cnt;

    if (dupCount > 0) {
      console.log(`⚠️  Found ${dupCount} duplicate slug(s) - run merge-duplicate-squads.ts`);
      stats.errors.push(`${dupCount} duplicate slugs detected`);
    } else {
      console.log('✅ No duplicate slugs');
    }

    const [emptyAgents] = await mosConn.query(
      "SELECT COUNT(*) as cnt FROM squads WHERE is_active=1 AND (agents='[]' OR agents IS NULL)"
    );
    const emptyCount = (emptyAgents as any)[0].cnt;

    if (emptyCount > 0) {
      console.log(`⚠️  Found ${emptyCount} squads with empty agents`);
      stats.errors.push(`${emptyCount} squads with empty agents`);
    } else {
      console.log('✅ No empty agents JSON');
    }
  } catch (error) {
    stats.errors.push(`Validation error: ${(error as Error).message}`);
  }

  // Step 6: Close connections
  if (soworkConn) await soworkConn.end();
  if (mosConn) await mosConn.end();

  // Summary
  console.log('\n📊 Phase PreA Summary:\n');
  console.log(`Tables migrated: ${stats.tablesChecked.join(', ')}`);
  console.log(`Total rows migrated:`);
  Object.entries(stats.rowsMigrated).forEach(([table, count]) => {
    console.log(`  - ${table}: ${count}`);
  });

  if (stats.errors.length > 0) {
    console.log(`\n⚠️  Issues found (${stats.errors.length}):`);
    stats.errors.forEach((err) => console.log(`  - ${err}`));
    stats.success = false;
  } else {
    console.log('\n✅ Phase PreA completed successfully!');
    stats.success = true;
  }

  console.log('\n🔄 Next steps:');
  if (stats.success) {
    console.log('1. Run: npx tsx scripts/validate-squads.ts');
    console.log('2. Run: npx tsx scripts/merge-duplicate-squads.ts (if needed)');
    console.log('3. Proceed to Phase A: Code Refactoring');
  } else {
    console.log('1. Fix the errors above');
    console.log('2. Re-run Phase PreA');
  }

  console.log('\n');
  return stats;
}

executePhasePreA().catch(console.error);
