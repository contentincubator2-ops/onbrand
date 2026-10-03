/**
 * positioningDirector — 讓執行定位的策略總監，真的影響定位怎麼寫。
 *
 * 2026-09-30（CJ「總監的人設應該會影響產出」）：定位資料頁右上角的「SoWork 定位法」由
 * 策略總監頭像啟動（品牌／活動＝品牌定位總監，產品＝產品價值主張總監）。之前頭像只是門面，
 * 14 步 pipeline 用的是同一段通用 system prompt。現在把這位總監在 mos_db 的人設
 * （職稱、專長、經歷、方法論）＋工作守則／Skill（agentKnowledge）接在每一步的 system 後面。
 *
 * 影響的是「怎麼分析、怎麼取捨、下什麼判斷」；不影響的是輸出格式（JSON 鍵名）與事實
 * （品牌資料、官方確認客群、市場設定）——那些在 user prompt 裡，優先於人設。
 */
import { getDirectorByAgentId } from "../strategist/strategistDirectory";
import { loadAgentKnowledge } from "../../../platform/core/agents/agentKnowledge";

export interface DirectorPersonaInput {
  name: string;
  title: string;
  specialty?: string | null;
  experience?: string | null;
  methodology?: string | null;
}

/** 單一來源的長度上限：14 步每一步都會帶，太長就是 14 倍的 token。 */
const CAP = { experience: 1200, methodology: 800, specialty: 400, knowledge: 4000 } as const;
const cut = (s: string | null | undefined, n: number) => {
  const t = String(s ?? "").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** 純函式：組出接在 system prompt 後面的人設段落。 */
export function buildDirectorPersonaBlock(d: DirectorPersonaInput, knowledge = ""): string {
  const lines: string[] = [
    `【執行這份定位的策略總監】`,
    `這份定位由${d.name}（${d.title}）負責。請以他的專業視角完成這一步：用他的經歷、專長與方法論`,
    `決定怎麼分析、怎麼取捨、下什麼判斷。`,
  ];
  const specialty = cut(d.specialty, CAP.specialty);
  const experience = cut(d.experience, CAP.experience);
  const methodology = cut(d.methodology, CAP.methodology);
  if (specialty) lines.push(`專長：${specialty}`);
  if (experience) lines.push(`經歷：\n${experience}`);
  if (methodology) lines.push(`慣用的方法論：\n${methodology}`);
  const k = cut(knowledge, CAP.knowledge);
  if (k) lines.push(k);
  lines.push(
    `規則：`,
    `- 輸出格式（JSON 鍵名與結構）完全照題目要求，人設不改變格式。`,
    `- 品牌資料、官方確認客群、目標市場設定是事實，優先於你的經驗判斷。`,
    `- 不要在輸出裡提到總監本人、他的經歷或任何客戶名字——那些只用來形成判斷。`,
  );
  return lines.join("\n");
}

/**
 * 載入總監人設段落＋顯示用資訊。查不到這位 agent 就回 null——呼叫端會照常跑
 * （沒有人設＝通用 prompt），並留警告。
 */
export async function loadDirectorPersona(agentId: number, industry: string | null): Promise<{
  block: string; agentId: number; name: string; title: string;
} | null> {
  const d = await getDirectorByAgentId(agentId, industry);
  if (!d) return null;
  const knowledge = await loadAgentKnowledge(agentId, { source: "positioning.director" });
  return {
    block: buildDirectorPersonaBlock(d, knowledge),
    agentId: d.agentId, name: d.name, title: d.title,
  };
}
