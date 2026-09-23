/**
 * aiBrief — 把 buildBrandPrefix 產出的品牌簡報，拆成前台看得懂的段落與欄位來源。
 *
 * 2026-09-08 (CJ「品牌大腦也可以參考任務卡一樣，用戶可以自己上傳自己的文件，
 * 我們顯示出幫他把定位化為 AI 讀懂的文字的過程」)
 *
 * 簡報本身就是每張任務卡開跑前塞進模型的那段字（brandContext.buildBrandPrefix）。
 * 這裡不另外生一份「給人看的版本」—— 那會漂。只做兩件事：
 *   1. 依 `[段落標題]` 與 `【欄位標籤】` 切段，讓它能排版；
 *   2. 把標籤對回定位欄位（path），讓用戶知道「這一行是從我哪一格來的」。
 *
 * 標籤表是手抄 brandContext 的，所以 aiBrief.test.ts 會拿一份合成的簡報跑一遍，
 * 標籤一改這裡就紅。
 */

export interface BriefLine {
  /** 【】裡的標籤；沒有標籤的行為 null（例如語氣範例的內文）。 */
  label: string | null;
  text: string;
  /** 對回定位欄位的 path（brand: tagline.zhTagline…；product/event 前綴 product.／event.）；對不到為 null。 */
  field: string | null;
}

export interface BriefSection {
  title: string;
  lines: BriefLine[];
}

/** 標籤 → 定位欄位。與 brandContext.buildBrandPrefix 的 push 標籤一一對應。 */
export const LABEL_TO_FIELD: Record<string, string> = {
  // 品牌已鎖定屬性
  "Tagline 中": "tagline.zhTagline",
  "Tagline EN": "tagline.enTagline",
  "Tagline": "tagline",
  "Tagline (legacy)": "tagline",
  "Archetype": "voice.archetypes",
  "Archetype (legacy)": "voice.archetypes",
  "WHY (信念)": "goldenCircle.why",
  "HOW (作法)": "goldenCircle.how",
  "WHAT (產品/服務)": "goldenCircle.what",
  "定位摘要 (legacy)": "positioningSummary",
  // 品牌聲音指南
  "模仿這些範例的口吻": "voice.samples",
  // 寫手指引（_assets）
  "聲音指南": "_assets.voice",
  "聲音原則": "_assets.voice_principles",
  "偏好用詞": "_assets.preferred_terms",
  "CTA 範例": "_assets.cta_library",
  "目標受眾": "_assets.audience",
  "禁用詞": "_assets.banned_words",
  "用詞替換": "_assets.term_substitutions",
  // 補充脈絡
  "品牌故事": "origin.story",
  "主要受眾": "audience.primary",
  "受眾痛點": "audience.painPoints",
  "差異化": "differentiation.summary",
  // 2026-09-23：跟 brandContext.ts 的 contextBlock 標籤逐字對上——寫進簡報
  // 用什麼標籤，這裡就要認得同一個標籤，否則這兩格「有沒有進簡報」對用戶
  // 永遠是個問號。
  "唯一致勝理由": "differentiation.discriminator",
  "支撐證據": "differentiation.reasonToBelieve",
  "品牌定位文件補充": "_sourceDocs",
  // 產品
  "產品名稱": "product.name",
  "產品核心定位": "product.core.coreStatement",
  "產品 Slogan": "product.core.zhTagline",
  "一句話價值主張": "product.core.oneLineValueProp",
  "產品目標客群": "product.audience.primary",
  "客群痛點": "product.audience.pains",
  "核心功能": "product.value.coreFunctions",
  "使用者感受": "product.value.userFeeling",
  "獨家賣點": "product.competition.uniqueUsp",
  "產品語氣": "product.marketing.tone",
  "產品定位文件補充": "product._sourceDocs",
  // 活動
  "活動名稱": "event.name",
  "活動開始": "event.startAt",
  "活動結束": "event.endAt",
  "倒數": "event.startAt",
  "活動": "event.startAt",
  "活動定位摘要": "event.brief.briefSummary",
  "活動類型": "event.brief.eventType",
  "核心問題": "event.context.coreProblem",
  "活動核心受眾": "event.audience.primaryAudience",
  "關鍵洞察": "event.audience.keyInsight",
  "行銷目標": "event.objectives.marketingGoal",
  "SMP 單一主張": "event.smp.singleMindedProposition",
  "核心訊息": "event.messaging.coreMessage",
  "支撐訊息": "event.messaging.supportingPoints",
  "創意主題": "event.creative.creativeTheme",
  "活動定位文件補充": "event._sourceDocs",
};

/** 沒有【】標籤、但 brandContext 用固定字首的行。 */
const PREFIX_TO_FIELD: Array<[RegExp, string, string]> = [
  [/^tone keywords:\s*/i, "語調關鍵詞", "voice.tone"],
  [/^✗\s*禁用詞彙\s*\/\s*句式：?\s*/, "溝通禁區", "voice.forbidden"],
];

const SECTION_RE = /^\[(.+?)\]\s*$/;
const LABEL_RE = /^(?:-\s*)?【(.+?)】\s*(.*)$/;

/** 段落標題只留破折號前那截：「品牌已鎖定屬性 — 最高優先級…」→「品牌已鎖定屬性」。 */
function cleanTitle(t: string): string {
  return t.split(/\s*[—–-]{1,2}\s*/)[0]?.trim() || t.trim();
}

export function parseBrief(text: string): BriefSection[] {
  const sections: BriefSection[] = [];
  let current: BriefSection | null = null;
  let pendingLabel: BriefLine | null = null;

  const ensure = (): BriefSection => {
    if (!current) { current = { title: "市場脈絡", lines: [] }; sections.push(current); }
    return current;
  };

  for (const raw of String(text ?? "").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    const sec = SECTION_RE.exec(line.trim());
    if (sec) {
      current = { title: cleanTitle(sec[1]!), lines: [] };
      sections.push(current);
      pendingLabel = null;
      continue;
    }
    const lab = LABEL_RE.exec(line.trim());
    if (lab) {
      const label = lab[1]!.trim();
      const entry: BriefLine = { label, text: lab[2]!.trim(), field: LABEL_TO_FIELD[label] ?? null };
      ensure().lines.push(entry);
      // 【模仿這些範例的口吻】這種標籤後面接多行內文
      pendingLabel = entry.text ? null : entry;
      continue;
    }
    let matched = false;
    for (const [re, label, field] of PREFIX_TO_FIELD) {
      if (re.test(line.trim())) {
        const entry: BriefLine = { label, text: line.trim().replace(re, ""), field };
        ensure().lines.push(entry);
        pendingLabel = entry.text ? null : entry;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const content = line.trim().replace(/^-\s+/, "");
    if (pendingLabel) {
      pendingLabel.text = pendingLabel.text ? `${pendingLabel.text}\n${content}` : content;
    } else {
      ensure().lines.push({ label: null, text: content, field: null });
    }
  }
  return sections.filter((s) => s.lines.length > 0);
}

/** 簡報裡出現了哪些定位欄位（給前台對照「缺的格」用）。 */
export function fieldsInBrief(sections: BriefSection[]): string[] {
  const out = new Set<string>();
  for (const s of sections) for (const l of s.lines) if (l.field) out.add(l.field);
  return [...out];
}
