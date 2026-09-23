/**
 * 產品 profile：四組 B2B 欄位的檢視與編輯。
 *
 * 2026-09-23 (CJ)：技術與規格／價值與應用／營運與商務／合規與風險。
 *
 * ── 畫面上最重要的一件事：哪些欄位不會進貼文 ────────────────────────
 * 核心競爭優勢、產品藍圖、ROI、智財保障這四欄，業務要知道，但貼文不能寫
 * （競品比較會被政策包拿掉、未公開功能是緘默期在擋的、數字要有出處、保障是
 * 合約承諾）。所以它們帶一個「僅供內部」的標記，而且把理由寫出來——只標一個
 * 鎖頭而不說為什麼，下一個人就會以為是誰忘了開權限。
 *
 * ── 示範內容要標出來 ────────────────────────────────────────────────
 * 種子裡有些格子是從實際刊登頁整理的，有些是示範。標示出來，才不會有人把
 * 示範的認證講給客戶聽。
 */
import React, { useState } from "react";
import { Lock, Sparkles } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { ErrorNote } from "../ui";
import { useT, useHubLang } from "../lang";

export type ProfileGroup = "technical" | "value" | "commercial" | "compliance";

export interface ProfileFieldSpec {
  key: string;
  group: ProfileGroup;
  label: [en: string, zh: string];
  ask: [en: string, zh: string];
  postSafe: boolean;
  whyNotPostSafe?: [en: string, zh: string];
  rows?: number;
}

export interface ProfileEntry { en: string; zh: string; source?: "listing" | "demo" }
export type SolutionProfile = Record<string, ProfileEntry>;

export const PROFILE_GROUPS: Array<{ id: ProfileGroup; label: [en: string, zh: string]; blurb: [en: string, zh: string] }> = [
  { id: "technical", label: ["Technical & specification", "技術與規格"], blurb: ["Builds credibility with a technical buyer.", "面對技術決策者建立信任。"] },
  { id: "value", label: ["Value & application", "價值與應用"], blurb: ["Turns the spec sheet into a business case.", "把規格轉成商業價值。"] },
  { id: "commercial", label: ["Operations & commercials", "營運與商務"], blurb: ["What it takes to ship and support it.", "真的要出貨與支援會碰到的事。"] },
  { id: "compliance", label: ["Compliance & risk", "合規與風險"], blurb: ["What enterprise buyers ask first.", "中大型企業第一個問的。"] },
];

/** 跟伺服器端 solutionProfile.ts 的 PROFILE_FIELDS 一致。 */
export const PROFILE_FIELDS: ProfileFieldSpec[] = [
  { key: "specs", group: "technical", label: ["Core specs & performance", "核心規格與效能"], ask: ["Throughput, capacity, accuracy, power, yield.", "運算速度、頻寬、容量、精準度、功耗、良率。"], postSafe: true, rows: 4 },
  { key: "compatibility", group: "technical", label: ["Compatibility & ecosystem", "相容性與生態系"], ask: ["Operating systems, software, interfaces, clouds, standards.", "作業系統、軟體、接口、雲端平台、業界標準。"], postSafe: true, rows: 3 },
  {
    key: "roadmap", group: "technical", label: ["Roadmap", "產品藍圖"],
    ask: ["Current version and the next six months.", "目前版本與未來半年的計畫。"],
    postSafe: false,
    whyNotPostSafe: ["Unannounced features are what a quiet period blocks. Say it in the room, not in a post.", "未公開功能正是緘默期在擋的。會議室裡可以講，貼文不行。"],
    rows: 3,
  },
  { key: "useCases", group: "value", label: ["Use cases — the pain it removes", "痛點解決（應用場景）"], ask: ["Where it shines, and what problem it takes away.", "在哪些場景最能發揮，解決了什麼問題。"], postSafe: true, rows: 4 },
  {
    key: "usp", group: "value", label: ["Why we win", "核心競爭優勢"],
    ask: ["Against the alternatives the buyer is weighing.", "面對客戶真的在比較的其他選項。"],
    postSafe: false,
    whyNotPostSafe: ["The policy pack strips competitor comparisons out of posts.", "政策包會把貼文裡的競品比較拿掉。"],
    rows: 4,
  },
  {
    key: "roi", group: "value", label: ["Return on investment", "投資報酬率"],
    ask: ["What it saves or earns, over what period.", "省下或帶來多少，時間範圍多久。"],
    postSafe: false,
    whyNotPostSafe: ["A figure in a post must come from the sourced facts list. Add it there to publish it.", "貼文裡的數字必須來自有出處的市場數據。要公開就把它加進那張表。"],
    rows: 3,
  },
  { key: "licensing", group: "commercial", label: ["Pricing & licensing model", "定價與授權模式"], ask: ["Perpetual, subscription or usage-based? Volume breaks?", "買斷、訂閱還是按用量？有沒有量大折扣？"], postSafe: true, rows: 3 },
  { key: "leadTime", group: "commercial", label: ["Lead time & capacity", "交期與產能"], ask: ["Current capacity, and order to delivery.", "目前產能，下單到交貨多久。"], postSafe: true, rows: 2 },
  { key: "sla", group: "commercial", label: ["Support & warranty (SLA)", "售後服務與保固"], ask: ["Hours, response targets, on-site or remote, warranty scope.", "服務時段、回應時間、到場或遠端、保固範圍。"], postSafe: true, rows: 3 },
  { key: "certifications", group: "compliance", label: ["Security & compliance certifications", "資安與合規認證"], ask: ["ISO 27001, SOC 2, AEC-Q100, GDPR — with dates.", "ISO 27001、SOC 2、車規、GDPR——連同日期。"], postSafe: true, rows: 3 },
  {
    key: "ipIndemnity", group: "compliance", label: ["IP & indemnity", "專利與智財權"],
    ask: ["Infringement exposure and whether the customer is indemnified.", "侵權風險，以及是否提供客戶保障。"],
    postSafe: false,
    whyNotPostSafe: ["A public statement about indemnity is a contractual commitment.", "公開談智財保障等於做出合約承諾。"],
    rows: 3,
  },
];

function InternalOnly({ why }: { why?: [string, string] }) {
  const t = useT();
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-1.5 py-0.5 text-[10.5px] font-medium text-stone-700"
      title={why ? t(why[0], why[1]) : undefined}
    >
      <Lock className="h-2.5 w-2.5" aria-hidden />
      {t("internal only", "僅供內部")}
    </span>
  );
}

function SourceTag({ source }: { source?: string }) {
  const t = useT();
  if (source !== "demo") return null;
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-800">
      {t("demo content", "示範內容")}
    </span>
  );
}

/** 唯讀檢視，放在產品 modal 裡。 */
export function ProfileView({ profile }: { profile: SolutionProfile }) {
  const t = useT();
  const { lang } = useHubLang();
  const filled = PROFILE_FIELDS.filter((f) => profile[f.key]?.[lang === "zh" ? "zh" : "en"]);

  if (!filled.length) {
    return (
      <p className="text-[13px] text-neutral-500">
        {t("No product profile filled in yet.", "產品資料還沒有填寫。")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {PROFILE_GROUPS.map((g) => {
        const mine = filled.filter((f) => f.group === g.id);
        if (!mine.length) return null;
        return (
          <div key={g.id}>
            <div className="mb-1.5">
              <div className="text-[12px] font-semibold text-neutral-700">{t(g.label[0], g.label[1])}</div>
              <div className="text-[11.5px] text-neutral-500">{t(g.blurb[0], g.blurb[1])}</div>
            </div>
            <ul className="space-y-2">
              {mine.map((f) => {
                const e = profile[f.key]!;
                return (
                  <li key={f.key} className="rounded-lg border border-neutral-200 p-2.5">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[12.5px] font-medium text-neutral-800">{t(f.label[0], f.label[1])}</span>
                      {!f.postSafe ? <InternalOnly why={f.whyNotPostSafe} /> : null}
                      <SourceTag source={e.source} />
                    </div>
                    <p className="text-[13px] leading-relaxed text-neutral-700">{lang === "zh" ? e.zh : e.en}</p>
                    {!f.postSafe && f.whyNotPostSafe ? (
                      <p className="mt-1 text-[11.5px] leading-relaxed text-stone-500">
                        {t(f.whyNotPostSafe[0], f.whyNotPostSafe[1])}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** 編輯器裡的那一段：每一欄中英兩格，外加「讓 AI 補」。 */
export function ProfileEditor({
  solutionId,
  profile,
  onChange,
}: {
  solutionId: number;
  profile: SolutionProfile;
  onChange: (p: SolutionProfile) => void;
}) {
  const t = useT();
  const { lang } = useHubLang();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const ai = trpc.hub.admin.draftProfileField.useMutation();

  const set = (key: string, patch: Partial<ProfileEntry>) => {
    const base: ProfileEntry = profile[key] ?? { en: "", zh: "" };
    onChange({ ...profile, [key]: { ...base, ...patch } });
  };

  return (
    <div className="space-y-4">
      {PROFILE_GROUPS.map((g) => (
        <div key={g.id}>
          <div className="mb-2">
            <div className="text-[12px] font-semibold text-neutral-700">{t(g.label[0], g.label[1])}</div>
            <div className="text-[11.5px] text-neutral-500">{t(g.blurb[0], g.blurb[1])}</div>
          </div>

          {PROFILE_FIELDS.filter((f) => f.group === g.id).map((f) => {
            const e = profile[f.key] ?? { en: "", zh: "" };
            const busy = busyKey === f.key && ai.isPending;
            return (
              <div key={f.key} className="mb-3 rounded-lg border border-neutral-200 p-2.5">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[12.5px] font-medium text-neutral-800">{t(f.label[0], f.label[1])}</span>
                  {!f.postSafe ? <InternalOnly why={f.whyNotPostSafe} /> : null}
                  <SourceTag source={e.source} />
                </div>
                <p className="mb-1.5 text-[11.5px] leading-relaxed text-neutral-500">{t(f.ask[0], f.ask[1])}</p>

                <div className="grid gap-2 sm:grid-cols-2">
                  <textarea
                    value={e.en} rows={f.rows ?? 3} placeholder="EN"
                    onChange={(ev) => set(f.key, { en: ev.target.value })}
                    className="w-full rounded-lg border border-neutral-300 p-2 text-[13px] outline-none focus:border-orange-500"
                  />
                  <textarea
                    value={e.zh} rows={f.rows ?? 3} placeholder="中文"
                    onChange={(ev) => set(f.key, { zh: ev.target.value })}
                    className="w-full rounded-lg border border-neutral-300 p-2 text-[13px] outline-none focus:border-orange-500"
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={notes[f.key] ?? ""}
                    onChange={(ev) => setNotes({ ...notes, [f.key]: ev.target.value })}
                    placeholder={t("Notes for the AI (optional)", "給 AI 的筆記（選填）")}
                    className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusyKey(f.key);
                      try {
                        const r = await ai.mutateAsync({
                          solutionId, fieldKey: f.key,
                          notes: notes[f.key] ?? "",
                          language: lang === "zh" ? "zh-TW" : "en-US",
                        });
                        // 回空字串是「資料不足」的誠實答案，不要用它蓋掉已經寫好的內容。
                        set(f.key, {
                          en: r.en || e.en,
                          zh: r.zh || e.zh,
                          source: r.en || r.zh ? undefined : e.source,
                        });
                      } finally {
                        setBusyKey(null);
                      }
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-300 px-2.5 py-1.5 text-[12.5px] font-medium text-orange-700 disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                    {busy ? t("Writing…", "整理中…") : t("Let AI fill this", "讓 AI 補這一欄")}
                  </button>
                </div>

                {busyKey === f.key && ai.data ? (
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-neutral-500">
                    {t(ai.data.notice.en, ai.data.notice.zh)}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
      <ErrorNote error={ai.error} />
    </div>
  );
}
