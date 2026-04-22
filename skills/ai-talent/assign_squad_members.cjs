#!/usr/bin/env node
// Populate squad_members from squads.members JSON.
// Reads DB credentials from env: LOCAL_DB_HOST, LOCAL_DB_USER, LOCAL_DB_PASSWORD, LOCAL_DB_NAME.

const mysql = require('mysql2/promise');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[assign] Missing required env var: ${name}`);
    console.error(`[assign] Load your .env (e.g. \`set -a && source .env && set +a\`) then retry.`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const conn = await mysql.createConnection({
    host:     requireEnv('LOCAL_DB_HOST'),
    user:     requireEnv('LOCAL_DB_USER'),
    password: requireEnv('LOCAL_DB_PASSWORD'),
    database: requireEnv('LOCAL_DB_NAME'),
  });

  // Get all squads with their members JSON
  const [squads] = await conn.execute('SELECT id, name, members FROM squads WHERE is_active=1');
  console.log(`Processing ${squads.length} squads...`);

  let assigned = 0;
  let totalInserted = 0;
  let errors = 0;

  for (const squad of squads) {
    let members = [];
    try {
      members = typeof squad.members === 'string' ? JSON.parse(squad.members) : squad.members;
      if (!Array.isArray(members)) continue;
    } catch (e) {
      errors++;
      continue;
    }

    for (const member of members) {
      if (!member.agent_id) continue;
      try {
        const result = await conn.execute(
          `INSERT IGNORE INTO squad_members (squad_id, agent_id, role, is_lead, order_index) VALUES (?, ?, ?, ?, ?)`,
          [squad.id, member.agent_id, member.role || 'specialist', member.is_lead ? 1 : 0, member.order || 0]
        );
        if (result[0].affectedRows > 0) totalInserted++;
      } catch (e) {
        errors++;
      }
    }
    assigned++;
    if (assigned % 100 === 0) console.log(`Processed ${assigned}/${squads.length} squads...`);
  }

  const [count] = await conn.execute('SELECT COUNT(*) as cnt FROM squad_members');
  const [leaderCount] = await conn.execute('SELECT COUNT(*) as cnt FROM squad_members WHERE is_lead=1');
  console.log(`Done! Processed: ${assigned}, Inserted: ${totalInserted}, Errors: ${errors}`);
  console.log(`Total squad_members: ${count[0].cnt}`);
  console.log(`Total leaders: ${leaderCount[0].cnt}`);
  await conn.end();
}
main().catch(console.error);
