const mysql = require('mysql2/promise');

async function main() {
  // 2026-06-28 (security scan): no hardcoded DB password — require env.
  if (!process.env.LOCAL_DB_PASSWORD) throw new Error("LOCAL_DB_PASSWORD must be set");
  const conn = await mysql.createConnection({
    host: process.env.LOCAL_DB_HOST || 'localhost',
    user: process.env.LOCAL_DB_USER || 'mos_user',
    password: process.env.LOCAL_DB_PASSWORD,
    database: process.env.LOCAL_DB_NAME || 'mos_db'
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
