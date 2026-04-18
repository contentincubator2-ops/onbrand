import mysql from 'mysql2/promise';

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'mos_user',
    password: 'mos_secure_2026',
    database: 'mos_db'
  });

  try {
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

    console.log('=== AGENTS COUNT ===');
    console.log(`Total: ${agents.length}`);
    console.log(JSON.stringify(agents.slice(0, 50), null, 2));

    // Squads inventory
    const [squads] = await conn.execute(`
      SELECT 
        id, slug, name, missionType, 
        workspace, methodology
      FROM agent_squads 
      WHERE is_active = 1
      ORDER BY id ASC
      LIMIT 200
    `);

    console.log('\n=== SQUADS COUNT ===');
    console.log(`Total: ${squads.length}`);
    console.log(JSON.stringify(squads.slice(0, 30), null, 2));

  } catch (e) {
    console.error('DB Error:', e.message);
  }

  conn.end();
})();
