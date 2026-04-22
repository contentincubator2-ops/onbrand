/**
 * diagnose-db-migration.ts — Compare sowork_db vs mos_db before consolidation
 *
 * Phase PreA diagnostic script:
 * 1. Check connection to both databases
 * 2. Compare data counts (squads, agents, missions)
 * 3. Identify which database is more complete
 * 4. Check for data integrity issues
 *
 * Run: ts-node scripts/diagnose-db-migration.ts
 */

import mysql from 'mysql2/promise';

interface DbStats {
  name: string;
  connected: boolean;
  squads: number;
  emptyAgents: number;
  uniqueSlugs: number;
  agents: number;
  missions: number;
  lastUpdate: string | null;
  duplicateSlugs: number;
}

async function checkDatabase(
  name: string,
  host: string,
  user: string,
  password: string,
  database: string
): Promise<DbStats> {
  const stats: DbStats = {
    name,
    connected: false,
    squads: 0,
    emptyAgents: 0,
    uniqueSlugs: 0,
    agents: 0,
    missions: 0,
    lastUpdate: null,
    duplicateSlugs: 0,
  };

  try {
    const connection = await mysql.createConnection({
      host,
      user,
      password,
      database,
      ssl: { rejectUnauthorized: false },
    });

    stats.connected = true;
    console.log(`✅ Connected to ${name} (${host})`);

    // Check squads count
    const [squads] = await connection.execute(
      'SELECT COUNT(*) as cnt FROM squads WHERE is_active=1'
    );
    stats.squads = (squads as any)[0].cnt;

    // Check empty agents
    const [empty] = await connection.execute(
      "SELECT COUNT(*) as cnt FROM squads WHERE is_active=1 AND (agents='[]' OR agents IS NULL)"
    );
    stats.emptyAgents = (empty as any)[0].cnt;

    // Check unique slugs
    const [unique] = await connection.execute(
      'SELECT COUNT(DISTINCT slug) as cnt FROM squads WHERE is_active=1'
    );
    stats.uniqueSlugs = (unique as any)[0].cnt;

    // Check duplicate slugs
    const [dups] = await connection.execute(
      'SELECT COUNT(*) as cnt FROM (SELECT slug FROM squads WHERE is_active=1 GROUP BY slug HAVING COUNT(*) > 1) as dupes'
    );
    stats.duplicateSlugs = (dups as any)[0].cnt;

    // Check agents count
    const [agents] = await connection.execute(
      'SELECT COUNT(*) as cnt FROM agents WHERE is_active=1'
    );
    stats.agents = (agents as any)[0].cnt;

    // Check missions count
    const [missions] = await connection.execute(
      'SELECT COUNT(*) as cnt FROM missions'
    );
    stats.missions = (missions as any)[0].cnt;

    // Check last update
    const [lastUpdate] = await connection.execute(
      'SELECT MAX(updated_at) as last_update FROM squads'
    );
    const updateDate = (lastUpdate as any)[0].last_update;
    stats.lastUpdate = updateDate ? new Date(updateDate).toISOString() : null;

    await connection.end();
  } catch (error) {
    console.error(`❌ Failed to connect to ${name}:`, (error as Error).message);
  }

  return stats;
}

async function main() {
  console.log('🔍 Phase PreA: Database Consolidation Diagnostic\n');

  // Get environment variables — no hardcoded production fallbacks. Fail fast
  // if required credentials are missing (see docs/runbooks/secret-rotation.md).
  const must = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new Error(`[diagnose-db-migration] Missing required env var: ${name}`);
    return v;
  };
  const soworkHost = must('SOWORK_DB_HOST');
  const soworkUser = must('SOWORK_DB_USER');
  const soworkPassword = must('SOWORK_DB_PASSWORD');
  const soworkDatabase = process.env.SOWORK_DB_NAME || 'sowork_db';

  const localHost = process.env.LOCAL_DB_HOST || 'localhost';
  const localUser = must('LOCAL_DB_USER');
  const localPassword = must('LOCAL_DB_PASSWORD');
  const localDatabase = process.env.LOCAL_DB_NAME || 'mos_db';

  console.log('📊 Connecting to databases...\n');

  const [soworkStats, mosStats] = await Promise.all([
    checkDatabase('sowork_db (Azure)', soworkHost, soworkUser, soworkPassword, soworkDatabase),
    checkDatabase('mos_db (Local)', localHost, localUser, localPassword, localDatabase),
  ]);

  console.log('\n📈 Database Comparison:\n');
  console.log('┌─────────────────────┬──────────────┬──────────────┐');
  console.log('│ Metric              │ sowork_db    │ mos_db       │');
  console.log('├─────────────────────┼──────────────┼──────────────┤');
  const soworkConnected = soworkStats.connected ? '✅ Yes' : '❌ No';
  const mosConnected = mosStats.connected ? '✅ Yes' : '❌ No';
  console.log(`│ Connected           │ ${soworkConnected.padEnd(12)} │ ${mosConnected.padEnd(12)} │`);
  console.log(`│ Squads              │ ${soworkStats.squads.toString().padEnd(12)} │ ${mosStats.squads.toString().padEnd(12)} │`);
  console.log(`│ Unique Slugs        │ ${soworkStats.uniqueSlugs.toString().padEnd(12)} │ ${mosStats.uniqueSlugs.toString().padEnd(12)} │`);
  console.log(`│ Duplicate Slugs     │ ${soworkStats.duplicateSlugs.toString().padEnd(12)} │ ${mosStats.duplicateSlugs.toString().padEnd(12)} │`);
  console.log(`│ Empty Agents        │ ${soworkStats.emptyAgents.toString().padEnd(12)} │ ${mosStats.emptyAgents.toString().padEnd(12)} │`);
  console.log(`│ Agents              │ ${soworkStats.agents.toString().padEnd(12)} │ ${mosStats.agents.toString().padEnd(12)} │`);
  console.log(`│ Missions            │ ${soworkStats.missions.toString().padEnd(12)} │ ${mosStats.missions.toString().padEnd(12)} │`);
  const soworkUpdate = (soworkStats.lastUpdate || 'Unknown').substring(0, 12);
  const mosUpdate = (mosStats.lastUpdate || 'Unknown').substring(0, 12);
  console.log(`│ Last Update         │ ${soworkUpdate.padEnd(12)} │ ${mosUpdate.padEnd(12)} │`);
  console.log('└─────────────────────┴──────────────┴──────────────┘');

  console.log('\n🎯 Analysis:\n');

  if (soworkStats.connected && mosStats.connected) {
    const soworkComplete = soworkStats.squads > mosStats.squads;
    const sourceDb = soworkComplete ? 'sowork_db' : 'mos_db';

    console.log(`✅ Both databases are accessible`);
    console.log(`\n📋 Recommendation: Use ${sourceDb} as source of truth`);
    console.log(`   - sowork_db squads: ${soworkStats.squads}`);
    console.log(`   - mos_db squads: ${mosStats.squads}`);
    console.log(`   - Difference: ${Math.abs(soworkStats.squads - mosStats.squads)}`);

    if (soworkStats.duplicateSlugs > 0 || mosStats.duplicateSlugs > 0) {
      console.log(`\n⚠️  Data integrity issues detected:`);
      if (soworkStats.duplicateSlugs > 0) {
        console.log(`   - sowork_db: ${soworkStats.duplicateSlugs} duplicate slug(s)`);
      }
      if (mosStats.duplicateSlugs > 0) {
        console.log(`   - mos_db: ${mosStats.duplicateSlugs} duplicate slug(s)`);
      }
      console.log(`   → Run: ts-node scripts/merge-duplicate-squads.ts`);
    }

    if (soworkStats.emptyAgents > 0 || mosStats.emptyAgents > 0) {
      console.log(`\n⚠️  Empty agents detected:`);
      if (soworkStats.emptyAgents > 0) {
        console.log(`   - sowork_db: ${soworkStats.emptyAgents} squads with empty agents`);
      }
      if (mosStats.emptyAgents > 0) {
        console.log(`   - mos_db: ${mosStats.emptyAgents} squads with empty agents`);
      }
    }

    console.log(`\n🔄 Next steps for Phase PreA:`);
    console.log(`1. Backup mos_db: mysqldump -h ${localHost} -u ${localUser} -p ${localDatabase} > backup.sql`);
    console.log(`2. Export sowork_db: mysqldump -h ${soworkHost} -u ${soworkUser} -p ${soworkDatabase} > export.sql`);
    console.log(`3. Import to mos_db: mysql -h ${localHost} -u ${localUser} -p ${localDatabase} < export.sql`);
    console.log(`4. Validate: ts-node scripts/validate-squads.ts`);
  } else {
    console.log(`❌ Cannot proceed: ${!soworkStats.connected ? 'sowork_db' : 'mos_db'} not accessible`);
    console.log(`\n📌 Connection details needed:`);
    console.log(`   sowork_db: ${soworkHost}`);
    console.log(`   mos_db: ${localHost}`);
  }

  console.log('\n');
}

main().catch(console.error);
