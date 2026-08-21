/**
 * brandPersonas — 品牌自訂人設（客戶自己建的 agent）。
 *
 * 2026-08-21 (CJ「讓客戶可以自己新創 agent，自己命名，並且決定這個 agent
 * 語調的應用範圍要在哪些內容的任務」)：品牌大腦既有的語氣資產都是「規則」
 * （聲音指南 / 禁用詞 / voiceLock），描述的是「品牌怎麼講話」；人設描述的是
 * 「誰在講」。客戶要的是後者 —— 我自己養一個寫手，指定他負責哪幾種任務。
 *
 * 儲存位置：brands.positioning._personas（陣列）。
 *   沿用 _assets / _aiPrompts / _voiceLock 的慣例 —— positioning JSON 是品牌
 *   資產的單一來源，"_" 開頭的 meta key 不會被定位重跑覆蓋
 *   （positioningJobRunner 是 top-level spread），也不用 DB migration。
 *
 * 套用範圍（scope）兩種寫法，一個人設可以同時有：
 *   - taskIds  ：明確的任務 id（"fb-30-caption-short"）—— 精準指定
 *   - platforms：整個平台（"facebook"）—— 一次涵蓋該平台所有任務
 * 精準的贏：同一個任務同時被 A 的 taskIds 與 B 的 platforms 命中時，A 生效。
 * 兩者都命中同一層級時，取陣列中較前者（畫面上就是使用者排的順序）。
 */
export interface BrandPersonaScope {
  taskIds: string[];
  platforms: string[];
}

export interface BrandPersona {
  /** client-generated, stable across edits */
  id: string;
  /** 使用者自己取的名字 —— 產出頁上顯示的作者就是這個 */
  name: string;
  /** 職稱 / 角色，可空 */
  title: string;
  /** 人設本文：他是誰、怎麼講話、堅持什麼。這段會直接進 system prompt */
  persona: string;
  scope: BrandPersonaScope;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export const PERSONA_TEXT_CAP = 4000;

function asStrArray(x: unknown): string[] {
  return Array.isArray(x)
    ? x.map((s) => String(s ?? "").trim()).filter(Boolean)
    : [];
}

/** Tolerant read — anything malformed is skipped rather than throwing. */
export function parsePersonas(positioning: any): BrandPersona[] {
  const raw = positioning?._personas;
  if (!Array.isArray(raw)) return [];
  const out: BrandPersona[] = [];
  for (const p of raw) {
    const id = String(p?.id ?? "").trim();
    const name = String(p?.name ?? "").trim();
    if (!id || !name) continue;
    out.push({
      id,
      name: name.slice(0, 60),
      title: String(p?.title ?? "").trim().slice(0, 120),
      persona: String(p?.persona ?? "").slice(0, PERSONA_TEXT_CAP),
      scope: {
        taskIds: asStrArray(p?.scope?.taskIds),
        platforms: asStrArray(p?.scope?.platforms),
      },
      enabled: p?.enabled !== false,
      createdAt: String(p?.createdAt ?? ""),
      updatedAt: String(p?.updatedAt ?? ""),
    });
  }
  return out;
}

export async function loadBrandPersonas(
  brandId: number | undefined | null,
): Promise<BrandPersona[]> {
  if (!brandId) return [];
  try {
    // 動態 import：localDb 在 module load 時就會要求 DB 密碼，top-level import
    // 會讓純邏輯的單元測試（matchPersonaForTask）也連帶需要一組 env。
    // brandContext.ts 的 getBrandRuleAssets 也是同樣寫法。
    const { default: localPool } = await import("../localDb");
    const [rows]: any = await localPool.execute(
      `SELECT positioning FROM brands WHERE id = ? LIMIT 1`,
      [brandId],
    );
    let pos: any = rows?.[0]?.positioning;
    if (typeof pos === "string") { try { pos = JSON.parse(pos); } catch { return []; } }
    return parsePersonas(pos);
  } catch { return []; }
}

/**
 * 找出負責這個任務的人設。taskId 精準指定優先於整個平台。
 * platform 用 listFB 那組代碼（facebook / instagram / youtube / tiktok /
 * linkedin / email / pr / brand / audience / kol）。
 */
export function matchPersonaForTask(
  personas: BrandPersona[],
  taskId: string | null | undefined,
  platform: string | null | undefined,
): BrandPersona | null {
  const live = personas.filter((p) => p.enabled && p.persona.trim());
  if (live.length === 0) return null;
  const tid = String(taskId ?? "");
  if (tid) {
    const exact = live.find((p) => p.scope.taskIds.includes(tid));
    if (exact) return exact;
  }
  const plat = String(platform ?? "");
  if (plat) {
    const byPlatform = live.find((p) => p.scope.platforms.includes(plat));
    if (byPlatform) return byPlatform;
  }
  return null;
}

export async function resolveBrandPersona(
  brandId: number | undefined | null,
  taskId: string | null | undefined,
  platform: string | null | undefined,
): Promise<BrandPersona | null> {
  if (!brandId) return null;
  const personas = await loadBrandPersonas(brandId).catch(() => [] as BrandPersona[]);
  return matchPersonaForTask(personas, taskId, platform);
}

/**
 * 把自訂人設疊到原本被指派的 agent persona 上。
 *
 * 為什麼是「疊」不是「換掉」：預設 agent 的 persona 裡有經歷 / 方法論 / 案例，
 * 那是寫作工藝，換掉會讓輸出品質掉下來；客戶要換的是「講話的人是誰、語調是
 * 什麼」。所以自訂人設放最前面並明寫優先權，原 agent 降級成工藝參考。
 */
export function composePersonaPrompt(
  custom: BrandPersona,
  agentPersona: string,
): string {
  const head =
    `你是 ${custom.name}${custom.title ? `，${custom.title}` : ""}。` +
    `這是品牌指定由你來寫的任務。\n${custom.persona.trim()}\n`;
  const base = (agentPersona ?? "").trim();
  if (!base) return head;
  return (
    `${head}\n` +
    `【身分與語調以上方為準 — 最高優先】下面是這類任務的寫作工藝參考：` +
    `結構、節奏、格式照它，但自我介紹、口吻、用字、價值觀一律用上方的你，` +
    `不要改用下面這個人的名字或口吻。\n${base}`
  );
}
