/**
 * strategistPersonas — 可切換的「策略總監」人設清單。
 *
 * 2026-09-23（CJ「用戶還可以看這個策略總監的背景，或是要換其他的策略
 * 總監」→「2-3位，從mos_db選擇」）：mos_db 目前還沒有金鑰可以查
 * （MOS_MANUS_API_KEY 未設定，需要管理員在環境變數提供，不是這裡能解決
 * 的事），先用一份手寫的預設人設頂著，把「可以有好幾位、可以看背景、
 * 可以切換」這個框架先搭好——之後接上 mos_db 的真實 agent 資料時，只要
 * 把這個陣列換成從 mos-agents API 抓回來的結果，UI／router 都不用重寫。
 */
export interface StrategistPersona {
  id: string;
  name: string;
  title: string;
  /** dicebear seed，跟 AgentPersonaBar 同一套頭像系統。 */
  avatarSeed: string;
  /** 「查看背景」顯示的完整介紹。 */
  bio: string;
}

export const STRATEGIST_PERSONAS: StrategistPersona[] = [
  {
    id: "default",
    name: "策略總監",
    title: "SoWork 品牌策略顧問",
    avatarSeed: "Strategist-SoWork 品牌定位",
    bio: "專精品牌定位、市場洞察與差異化策略——用 SoWork 品牌定位法的 14 步邏輯看你的品牌。回答問題會直接引用你自己的定位資料（標語、受眾、差異化），不說空泛的行銷場面話；覺得你適合看看策略監測或做一次策略健檢時，會主動建議。",
  },
];

export function getPersona(id: string | null | undefined): StrategistPersona {
  return STRATEGIST_PERSONAS.find((p) => p.id === id) ?? STRATEGIST_PERSONAS[0]!;
}
