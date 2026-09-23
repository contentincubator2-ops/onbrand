/**
 * strategistPersonas — 可切換的「策略總監」人設清單。
 *
 * 2026-09-23（CJ「用戶還可以看這個策略總監的背景，或是要換其他的策略
 * 總監」→「2-3位，從mos_db選擇」）：mos_db 目前還沒有金鑰可以查
 * （MOS_MANUS_API_KEY 未設定，需要管理員在環境變數提供，不是這裡能解決
 * 的事），先用手寫的預設人設頂著，把「可以有好幾位、可以看背景、可以
 * 切換」這個框架先搭好——之後接上 mos_db 的真實 agent 資料時，只要把
 * 這個陣列換成從 mos-agents API 抓回來的結果，UI／router 都不用重寫。
 *
 * 2026-09-23（同日第二次，CJ「品牌策略總監擅長於品牌，而產品策略總監，
 * 應該另外找一個背景有產品策略經驗的agent。agent的背景，要詳細列出來它
 * 的設定和經歷，要直接從mos_db抓取真實描述」）：
 *   - 拆成兩位——品牌 / 產品各自的策略總監，用 `scope` 標記，
 *     StrategyDirectorDrawer 依目前頁面的 scope 自動選對的人當預設。
 *   - 「真實描述要從 mos_db 抓」這件事**還是做不到**：實測 mos-agents
 *     MCP 仍然因缺 MOS_MANUS_API_KEY 回錯誤（跟稽核位置那次同一個原因），
 *     這不是我能解決的（不會自己找金鑰）。CJ 確認的方向是「先搭架構，
 *     人名/背景留待補」——所以底下兩筆的 name/bio 都是誠實的佔位資料：
 *     name 用職稱代替（不是編一個假的人名冒充真人），bio 是通用能力描述
 *     （不是從 mos_db 抄來的經歷）。`isPlaceholder: true` 是這件事的
 *     程式化標記，UI 會把它顯示成一句提醒，不會悄悄假裝是真的。
 *     等 MOS_MANUS_API_KEY 設定好，下一步是：search_agents 依 focus
 *     搜品牌策略 / 產品策略的 agent、挑定之後把這兩筆換成真實 id/name/
 *     bio，並把 isPlaceholder 拿掉。
 */
export interface StrategistPersona {
  id: string;
  name: string;
  title: string;
  /** dicebear seed，跟 AgentPersonaBar 同一套頭像系統。 */
  avatarSeed: string;
  /** 「查看背景」顯示的完整介紹。 */
  bio: string;
  /** 哪個 scope 預設用這位——drawer 依目前頁面自動選人時的依據。 */
  scope: "brand" | "product";
  /**
   * true = name/bio 是佔位資料（職稱代替人名、通用能力描述代替真實經歷），
   * 不是從 mos_db 抓來的真實 agent 資料。查得到 mos_db 之後要把這幾筆
   * 換成真的、並拿掉這個旗標。
   */
  isPlaceholder: boolean;
}

export const STRATEGIST_PERSONAS: StrategistPersona[] = [
  {
    id: "brand-default",
    name: "品牌策略總監",
    title: "SoWork 品牌策略顧問",
    avatarSeed: "Strategist-Brand-SoWork",
    scope: "brand",
    isPlaceholder: true,
    bio: "專精品牌定位、市場洞察與差異化策略——用 SoWork 品牌定位法的 14 步邏輯看你的品牌。回答問題會直接引用你自己的定位資料（標語、受眾、差異化），不說空泛的行銷場面話；覺得你適合看看策略監測或做一次策略健檢時，會主動建議。",
  },
  {
    id: "product-default",
    name: "產品策略總監",
    title: "產品策略顧問",
    avatarSeed: "Strategist-Product-SoWork",
    scope: "product",
    isPlaceholder: true,
    bio: "專精單一產品的定位、競爭分析與 GTM 策略——跟品牌整體策略分開判斷，看的是這支產品在市場裡具體的位置。回答問題會直接引用這支產品的定位資料（核心賣點、目標客群、競品），不說空泛的行銷場面話。",
  },
];

export function getPersona(id: string | null | undefined): StrategistPersona {
  return STRATEGIST_PERSONAS.find((p) => p.id === id) ?? STRATEGIST_PERSONAS[0]!;
}

/**
 * 依目前 scope 選出預設人選——品牌頁面預設品牌策略總監，產品頁面預設
 * 產品策略總監。活動目前沒有專屬人選，退回品牌那位（品牌策略的邏輯離
 * 活動策略最近，比硬塞一個不存在的「活動策略總監」誠實）。
 */
export function defaultPersonaForScope(
  scopeMode: "brand" | "product" | "event" | "none" | null | undefined,
): StrategistPersona {
  const want = scopeMode === "product" ? "product" : "brand";
  return STRATEGIST_PERSONAS.find((p) => p.scope === want) ?? STRATEGIST_PERSONAS[0]!;
}
