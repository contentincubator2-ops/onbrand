const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'mos_user',
    password: 'mos_secure_2026',
    database: 'mos_db'
  });

  // Agents inventory
  const [agents] = await conn.execute(`
    SELECT 
      id, slug, name, title, layer, 
      aiModel, primarySkill, specialty, 
      isAvailable
    FROM agents 
    WHERE isAvailable = 1
    ORDER BY id ASC
    LIMIT 500
  `);

  console.log('=== AGENTS INVENTORY ===');
  console.log(JSON.stringify(agents, null, 2));

  // Squads inventory
  const [squads] = await conn.execute(`
    SELECT 
      id, slug, name, missionType, 
      workspace, agents, methodology
    FROM agent_squads 
    WHERE is_active = 1
    ORDER BY id ASC
    LIMIT 500
  `);

  console.log('\n=== SQUADS INVENTORY ===');
  console.log(JSON.stringify(squads, null, 2));

  conn.end();
})().catch(e => console.error(e));
