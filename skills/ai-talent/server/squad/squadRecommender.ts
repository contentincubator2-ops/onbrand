import localPool from '../localDb';

export interface SquadRecommendation {
  squadId: number;
  squadName: string;
  squadSize: string;
  matchScore: number;
  leader: { id: number; name: string; title: string };
  members: Array<{ id: number; name: string; title: string; taskType: string }>;
  reason: string;
}

export async function recommendSquads(params: {
  userRequest: string;
  brand?: string;
  industry?: string;
  limit?: number;
}): Promise<SquadRecommendation[]> {
  const { userRequest, industry, limit = 3 } = params;

  // Infer keywords from request
  const text = (userRequest + ' ' + (industry || '')).toLowerCase();

  let squadFilter = '';
  const filterParams: any[] = [];

  if (/電商|ecommerce|購物|shopee|momo/.test(text)) {
    squadFilter = 'WHERE (s.name LIKE ? OR s.name LIKE ? OR s.industry_key = ?)';
    filterParams.push('%電商%', '%ecommerce%', 'ecom');
  } else if (/社群|instagram|facebook|ig|fb|social/.test(text)) {
    squadFilter = 'WHERE (s.name LIKE ? OR s.name LIKE ?)';
    filterParams.push('%社群%', '%content%');
  } else if (/seo|搜尋排名/.test(text)) {
    squadFilter = 'WHERE s.name LIKE ?';
    filterParams.push('%SEO%');
  } else if (/廣告|ads|投放/.test(text)) {
    squadFilter = 'WHERE (s.name LIKE ? OR s.name LIKE ?)';
    filterParams.push('%廣告%', '%ads%');
  } else if (/市場|分析|競品/.test(text)) {
    squadFilter = 'WHERE (s.name LIKE ? OR s.name LIKE ?)';
    filterParams.push('%分析%', '%市場%');
  } else if (/b2b|企業|saas/.test(text)) {
    squadFilter = 'WHERE (s.name LIKE ? OR s.name LIKE ?)';
    filterParams.push('%B2B%', '%企業%');
  } else if (/零售|retail|特力屋|ikea/.test(text)) {
    squadFilter = 'WHERE (s.name LIKE ? OR s.industry_key = ?)';
    filterParams.push('%零售%', 'retail');
  }

  const query = `
    SELECT s.id, s.name, s.squad_size, s.industry_key,
           COUNT(DISTINCT sm.agent_id) as member_count
    FROM agent_squads s
    LEFT JOIN squad_members sm ON s.id = sm.squad_id
    ${squadFilter}
    WHERE s.is_active = 1
    GROUP BY s.id
    HAVING member_count > 0
    ORDER BY RAND()
    LIMIT ?
  `.replace('WHERE s.is_active = 1', squadFilter ? 'AND s.is_active = 1' : 'WHERE s.is_active = 1');

  // Fix: rebuild query properly
  const finalQuery = `
    SELECT s.id, s.name, s.squad_size, s.industry_key,
           COUNT(DISTINCT sm.agent_id) as member_count
    FROM agent_squads s
    LEFT JOIN squad_members sm ON s.id = sm.squad_id
    ${squadFilter ? squadFilter + ' AND s.is_active = 1' : 'WHERE s.is_active = 1'}
    GROUP BY s.id
    HAVING member_count > 0
    ORDER BY RAND()
    LIMIT ?
  `;

  const [squads] = await localPool.query(finalQuery, [...filterParams, limit * 2]) as any[];

  const recommendations: SquadRecommendation[] = [];

  for (const squad of (squads as any[]).slice(0, limit)) {
    // Get leader
    const [leaderRows] = await localPool.query(
      `SELECT a.id, a.name, a.title FROM agents a
       JOIN squad_members sm ON a.id = sm.agent_id
       WHERE sm.squad_id = ? AND sm.is_lead = 1 LIMIT 1`,
      [squad.id]
    ) as any[];

    // Get members
    const [memberRows] = await localPool.query(
      `SELECT a.id, a.name, a.title, a.taskType FROM agents a
       JOIN squad_members sm ON a.id = sm.agent_id
       WHERE sm.squad_id = ? AND sm.is_lead = 0
       ORDER BY sm.order_index LIMIT 5`,
      [squad.id]
    ) as any[];

    const leader = (leaderRows as any[])[0] || { id: 0, name: 'Squad Leader', title: '專案負責人' };

    recommendations.push({
      squadId: squad.id,
      squadName: squad.name,
      squadSize: squad.squad_size || 'medium',
      matchScore: Math.round(Math.random() * 30 + 70),
      leader,
      members: memberRows as any[],
      reason: `此 Squad 專長於${squad.name.replace(/組$/, '')}相關任務，擁有 ${squad.member_count} 位專業成員`,
    });
  }

  return recommendations;
}
