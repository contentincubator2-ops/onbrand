import { createPool } from 'mysql2/promise';

const pool = createPool({
  host: 'localhost',
  user: 'mos_user',
  password: 'mos_secure_2026',
  database: 'mos_db',
  waitForConnections: true,
  connectionLimit: 1,
  queueLimit: 0
});

(async () => {
  const conn = await pool.getConnection();
  try {
    // Count total squads
    const [countResult] = await conn.execute('SELECT COUNT(*) as total FROM agent_squads WHERE is_active = 1');
    console.log('=== TOTAL ACTIVE SQUADS ===');
    console.log(countResult);

    // Get squads by missionType/category
    const [squads] = await conn.execute(`
      SELECT 
        missionType,
        COUNT(*) as count,
        GROUP_CONCAT(DISTINCT slug SEPARATOR '|') as slugs
      FROM agent_squads 
      WHERE is_active = 1
      GROUP BY missionType
      ORDER BY missionType ASC
    `);
    
    console.log('\n=== SQUADS BY CATEGORY ===');
    console.log(squads);

    // Get agents with aiModel
    const [agents] = await conn.execute(`
      SELECT 
        id, slug, name, title, layer,
        aiModel, primarySkill, specialty
      FROM agents
      WHERE isAvailable = 1
      ORDER BY id ASC
      LIMIT 200
    `);
    
    console.log('\n=== AGENTS (first 50) ===');
    console.log(agents.slice(0, 50));

  } catch (e) {
    console.error('Error:', (e as any).message);
  } finally {
    conn.release();
    pool.end();
  }
})();
