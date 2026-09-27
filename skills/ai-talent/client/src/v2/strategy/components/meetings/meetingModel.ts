/**
 * meetingModel — 策略會議前端的型別、文案小工具、以及「範例會議」。
 *
 * 2026-09-26（CJ「會議頁要先有一個範例，讓用戶可以看得懂要怎麼做」）：範例是
 * 寫死的示意資料，畫面上一律標「範例」，按鈕是停用的——它的工作是讓人看懂一場
 * 會會留下什麼，不是假裝已經開過會。範例的與會者只寫角色名，不放真人姓名。
 */

export type MeetingFrequency = "weekly" | "biweekly" | "monthly" | "quarterly";
export type Verdict = "keep" | "adjust";
export type DecisionStatus = "adopted" | "modified" | "rejected";

export interface MeetingAttendee { agentId: number; name: string; title: string }

export interface Cite { code: string; quote: string | null }
export interface MeetingSource { code: string; label: string; href: string; text: string }
export interface StrategyCheck {
  anchorId: string; label: string; current: string; verdict: Verdict;
  proposal: string; reason: string; evidence: number[];
  /** 品牌資料出處（S 編號）；舊紀錄沒有這個欄位。 */
  cites?: Cite[];
  raisedBy: string;
}
export interface MeetingAction {
  title: string; owner: string;
  /** content = 可以直接寫成一篇內容；work = 研究／營運工作。舊紀錄沒有 kind，視為 work。 */
  kind?: "content" | "work";
  cites?: Cite[];
  /** 對應的任務卡——「開任務」直接打開這張卡、題目帶好。 */
  taskId?: string; taskLabel?: string; platform?: string;
}
export interface MeetingMinutes {
  summary: string;
  remarks: Array<{ name: string; title: string; gist: string }>;
  checks: StrategyCheck[];
  actions: MeetingAction[];
  /** 這場會可引用的品牌資料來源（S 編號）；舊紀錄沒有。 */
  sources?: MeetingSource[];
}
export interface Decision {
  status: DecisionStatus; note: string; at: string;
  /** 有寫進品牌大腦時的版本 id；撤回時伺服器會一併復原。 */
  versionId?: number;
  written?: string[];
}

/**
 * 哪些格子「採用」後會寫進品牌大腦——跟 server/strategy/core/meetingWriteback.ts 的
 * BRAND_WRITABLE／PRODUCT_WRITABLE 同一份名單（那邊才是真的閘門，這裡只決定提示怎麼寫）。
 */
const WRITABLE_IDS = { brand: ["audience", "differentiation", "tagline", "voice"], product: ["core", "audience", "value", "strategy"] } as const;
export function isWritableAnchor(scope: "brand" | "product", anchorId: string): boolean {
  return (WRITABLE_IDS[scope] as readonly string[]).includes(anchorId);
}

export interface AdoptPreview {
  writable: boolean;
  note?: string;
  locked: boolean;
  diffs: Array<{ key: string; label: string; before: string | string[]; after: string | string[] }>;
  patch: Record<string, string | string[]>;
  impact: string[];
  notUpdated: string;
}
export interface MeetingRun {
  id: number; meetingId: number; status: "running" | "done" | "failed"; note: string; trigger: string;
  transcript: Array<{ name: string; title: string; content: string }>;
  minutes: MeetingMinutes | null;
  evidence: Array<{ title: string; url?: string; source?: string; date?: string }>;
  decisions: Record<string, Decision>;
  createdAt: string;
}
export interface MeetingRow {
  id: number; brandId: number; scope: "brand" | "product"; scopeId: number;
  topic: string; agenda: string; attendees: MeetingAttendee[];
  frequency: MeetingFrequency; dayOfWeek: number | null; dayOfMonth: number | null;
  enabled: boolean; nextRunAt: string | null; lastRunAt: string | null;
  runCount: number; pending: number;
  latestRun: { id: number; status: MeetingRun["status"]; note: string; createdAt: string } | null;
}

const DOW_ZH = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
const DOW_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function frequencyText(m: { frequency: MeetingFrequency; dayOfWeek: number | null; dayOfMonth: number | null }, en: boolean): string {
  const dow = m.dayOfWeek ?? 1;
  const dom = m.dayOfMonth ?? 1;
  switch (m.frequency) {
    case "weekly": return en ? `Every ${DOW_EN[dow]}` : `每${DOW_ZH[dow]}`;
    case "biweekly": return en ? `Every other ${DOW_EN[dow]}` : `隔週${DOW_ZH[dow]}`;
    case "quarterly": return en ? `Quarterly, day ${dom}` : `每季 ${dom} 號`;
    default: return en ? `Monthly, day ${dom}` : `每月 ${dom} 號`;
  }
}

/**
 * 一律用台北時間顯示——會議排在台北早上 9 點，用瀏覽器時區顯示的話，人在美東會看到
 * 「前一天晚上 8 點」（2026-09-26 在 dev 實測踩到）。
 */
export function fmtDate(iso: string | null | undefined, en: boolean, withTime = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(en ? "en-US" : "zh-TW", withTime
    ? { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric" });
}

/** 伺服器的 note 前綴轉成人話。 */
export function runNoteText(note: string, en: boolean): string {
  if (!note) return "";
  if (note.startsWith("no_attendees")) return en ? "No attendees were set." : "這場會沒有設定與會者。";
  if (note.startsWith("llm_")) return en ? "An attendee could not speak (model error). Try again later." : "有一位與會者發言失敗（模型連線問題），稍後再開一次。";
  if (note.startsWith("minutes_error")) return en ? "Minutes could not be compiled; the transcript is kept." : "會議紀錄整理失敗，逐字發言已保留。";
  if (note.startsWith("interrupted")) return en ? "The meeting was interrupted. Run it again." : "會議中途中斷，請再開一次。";
  if (note.startsWith("error")) return en ? "Something went wrong during the meeting." : "開會過程出了錯。";
  return note;
}

/** 常用主題範本——點一下帶入主題與議程。 */
export const TOPIC_TEMPLATES: Array<{ topic: string; topicEn: string; agenda: string; frequency: MeetingFrequency }> = [
  { topic: "月度品牌策略檢討", topicEn: "Monthly brand strategy review", frequency: "monthly",
    agenda: "看這個月的市場變化與策略監測情報，檢查受眾、差異化、標語是否還站得住，決定下個月的內容重點。" },
  { topic: "季度定位健檢", topicEn: "Quarterly positioning check-up", frequency: "quarterly",
    agenda: "逐格檢查品牌定位：受眾有沒有移動、競爭者有沒有新動作、差異化是否被追上、語氣是否一致。" },
  { topic: "競品動態討論", topicEn: "Competitor moves", frequency: "biweekly",
    agenda: "針對監測到的競品動作，討論要不要回應、用哪個錨點回應。" },
  { topic: "產品價值主張檢視", topicEn: "Product value proposition review", frequency: "monthly",
    agenda: "檢查這個產品的受眾、價值主張、定價與組合是否需要調整。" },
];

// ─── 範例會議 ────────────────────────────────────────────────────────────

export const EXAMPLE_MEETING = {
  topic: "月度品牌策略檢討",
  agenda: TOPIC_TEMPLATES[0]!.agenda,
  frequencyLabel: "每月 1 號・早上 9 點",
  attendees: [
    { name: "品牌定位總監", title: "負責受眾與差異化" },
    { name: "消費者行為顧問", title: "負責購買動機" },
    { name: "定價與價值顧問", title: "負責價格與組合" },
  ],
};

export const EXAMPLE_RUN: { date: string; minutes: MeetingMinutes; evidence: MeetingRun["evidence"] } = {
  date: "2026-09-01",
  evidence: [
    { title: "開學季文具聲量較上月增加，大學生討論集中在「好看的筆記工具」", source: "策略監測", date: "2026-08-27" },
    { title: "主要競品推出 199 元入門組合", source: "策略監測", date: "2026-08-22" },
  ],
  minutes: {
    sources: [
      { code: "S1", label: "品牌定位・目標受眾", href: "", text: "25–35 歲、喜歡手帳的上班族女性，重視日常小確幸" },
      { code: "S2", label: "品牌定位・差異化", href: "", text: "顏色是心情的工具——每一支筆都有一個心情名字" },
      { code: "S3", label: "產品「開學季筆記組」", href: "", text: "售價：NT$390｜Slogan：第一本手帳就上手｜主客群：尚未填寫" },
    ],
    summary: "受眾建議往大學生延伸（開學季聲量是證據）；差異化與標語維持。競品的入門組合先觀察，不跟著降價。",
    remarks: [
      { name: "品牌定位總監", title: "負責受眾與差異化", gist: "受眾可以往大學生延伸，但差異化「顏色是心情的工具」不要動。" },
      { name: "消費者行為顧問", title: "負責購買動機", gist: "大學生買的是「筆記好看」，跟我們的差異化是同一件事，延伸成本低。" },
      { name: "定價與價值顧問", title: "負責價格與組合", gist: "競品 199 元組合是搶量，我們不跟價，改用組合內容做區隔。" },
    ],
    checks: [
      { anchorId: "audience", label: "目標受眾", current: "25–35 歲、喜歡手帳的上班族女性", verdict: "adjust",
        proposal: "25–35 歲手帳上班族為主，延伸 18–22 歲重視筆記美感的大學生", reason: "開學季大學生聲量明顯上升，而且他們在意的正是我們的強項。",
        evidence: [0], cites: [{ code: "S1", quote: "喜歡手帳的上班族女性" }, { code: "S3", quote: "主客群：尚未填寫" }], raisedBy: "品牌定位總監" },
      { anchorId: "competition", label: "競爭格局", current: "大型文具連鎖、日系進口品牌", verdict: "keep",
        proposal: "", reason: "競品降價是短期促銷，格局沒有改變。", evidence: [1], raisedBy: "定價與價值顧問" },
      { anchorId: "differentiation", label: "差異化", current: "顏色是心情的工具", verdict: "keep",
        proposal: "", reason: "大學生的需求正好落在這個差異化上，不需要改。", evidence: [], cites: [{ code: "S2", quote: "顏色是心情的工具" }], raisedBy: "消費者行為顧問" },
      { anchorId: "tagline", label: "品牌標語", current: "每天多一點顏色", verdict: "keep",
        proposal: "", reason: "本次會議未討論這一格", evidence: [], raisedBy: "" },
    ],
    actions: [
      { title: "開學季・筆記配色：大學生的第一本手帳怎麼挑", owner: "消費者行為顧問", kind: "content", taskLabel: "Instagram・輪播貼文" },
      { title: "下次會議追蹤競品 199 元組合的銷售反應", owner: "定價與價值顧問", kind: "work" },
    ],
  },
};

/** 還沒決定的「建議調整」數。 */
export function pendingCount(run: Pick<MeetingRun, "status" | "minutes" | "decisions">): number {
  if (run.status !== "done" || !run.minutes) return 0;
  return run.minutes.checks.filter((c) => c.verdict === "adjust" && !run.decisions[c.anchorId]).length;
}

export function decisionLabel(s: DecisionStatus, en: boolean): string {
  if (s === "adopted") return en ? "Adopted" : "已採用";
  if (s === "modified") return en ? "Adopted with changes" : "修改後採用";
  return en ? "Not adopted" : "不採用";
}
