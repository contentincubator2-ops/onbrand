/**
 * 業務履歷與個人寫法的編輯視窗。清單類欄位一行一項——總部在展場上要能
 * 直接貼一段 LinkedIn 自介進來改，表單越像文件越好用。
 */
import React, { useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { ErrorNote, cx } from "../ui";
import { useT } from "../lang";

export interface EditableProfile {
  headline: string;
  location: string;
  yearsExperience: number | null;
  languages: string[];
  bio: string;
  expertise: string[];
  experience: Array<{ role: string; company: string; period: string; highlight: string }>;
  education: string;
  achievements: string[];
  stories: string[];
  voice: { tone: string; traits: string[]; signoff: string };
  avoid: string[];
}

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const joinLines = (a: string[]) => a.join("\n");

const input =
  "w-full rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-stone-600">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-stone-400">{hint}</span> : null}
    </label>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-stone-200 p-4">
      <legend className="px-1 text-[13px] font-semibold text-stone-900">{title}</legend>
      {note ? <p className="-mt-1 text-[12px] text-stone-500">{note}</p> : null}
      {children}
    </fieldset>
  );
}

export default function ProfileEditModal({ repId, title, team, profile, onClose }: {
  repId: number;
  title: string;
  team: string;
  profile: EditableProfile;
  onClose: () => void;
}) {
  const t = useT();
  const utils = trpc.useUtils();
  const [f, setF] = useState(() => ({
    title,
    team,
    headline: profile.headline,
    location: profile.location,
    years: profile.yearsExperience == null ? "" : String(profile.yearsExperience),
    languages: profile.languages.join(", "),
    bio: profile.bio,
    expertise: joinLines(profile.expertise),
    experience: profile.experience.length ? profile.experience : [{ role: "", company: "", period: "", highlight: "" }],
    education: profile.education,
    achievements: joinLines(profile.achievements),
    stories: joinLines(profile.stories),
    tone: profile.voice.tone,
    traits: joinLines(profile.voice.traits),
    signoff: profile.voice.signoff,
    avoid: joinLines(profile.avoid),
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = trpc.hub.admin.updateRepProfile.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.hub.admin.repProfile.invalidate({ repId }), utils.hub.admin.reps.invalidate()]);
      onClose();
    },
  });

  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const years = f.years.trim() === "" ? null : Number(f.years);
    save.mutate({
      repId,
      title: f.title.trim() || undefined,
      team: f.team.trim() || undefined,
      profile: {
        headline: f.headline,
        location: f.location,
        yearsExperience: Number.isFinite(years as number) ? years : null,
        languages: f.languages.split(",").map((x) => x.trim()).filter(Boolean),
        bio: f.bio,
        expertise: lines(f.expertise),
        experience: f.experience.filter((x) => x.role.trim() || x.company.trim()),
        education: f.education,
        achievements: lines(f.achievements),
        stories: lines(f.stories),
        voice: { tone: f.tone, traits: lines(f.traits), signoff: f.signoff },
        avoid: lines(f.avoid),
      },
    });
  }

  const setExp = (i: number, k: "role" | "company" | "period" | "highlight", v: string) =>
    set("experience", f.experience.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="rep-edit-title"
        onSubmit={submit}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <div>
            <div className="text-[12px] font-medium uppercase tracking-wide text-stone-500">{t("Edit profile", "編輯履歷")}</div>
            <h2 id="rep-edit-title" className="mt-0.5 text-[17px] font-semibold text-stone-900">
              {t("Résumé and voice", "履歷與個人寫法")}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("Close", "關閉")}
            className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Group title={t("Basics", "基本資料")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Title", "職稱")}><input className={input} value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
              <Field label={t("Team", "團隊")}><input className={input} value={f.team} onChange={(e) => set("team", e.target.value)} /></Field>
            </div>
            <Field label={t("One-line introduction", "一句話介紹")} hint={t("Shown on the team wall and the access page.", "會出現在名單卡片與加入頁。")}>
              <input className={input} value={f.headline} maxLength={160} onChange={(e) => set("headline", e.target.value)} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("Location", "地區")}><input className={input} value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
              <Field label={t("Years in the field", "年資")}>
                <input className={input} inputMode="numeric" value={f.years} onChange={(e) => set("years", e.target.value.replace(/[^\d]/g, "").slice(0, 2))} />
              </Field>
              <Field label={t("Languages", "語言")} hint={t("Comma-separated", "用逗號分隔")}>
                <input className={input} value={f.languages} onChange={(e) => set("languages", e.target.value)} />
              </Field>
            </div>
            <Field label={t("About", "自我介紹")}>
              <textarea className={cx(input, "min-h-[88px]")} value={f.bio} maxLength={1200} onChange={(e) => set("bio", e.target.value)} />
            </Field>
          </Group>

          <Group title={t("Experience", "經歷")}>
            {f.experience.map((x, i) => (
              <div key={i} className="space-y-2 rounded-md bg-stone-50 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <input className={input} placeholder={t("Role", "職位")} value={x.role} onChange={(e) => setExp(i, "role", e.target.value)} />
                  <input className={input} placeholder={t("Company", "公司")} value={x.company} onChange={(e) => setExp(i, "company", e.target.value)} />
                  <input className={input} placeholder="2020 – now" value={x.period} onChange={(e) => setExp(i, "period", e.target.value)} />
                  <button
                    type="button"
                    onClick={() => set("experience", f.experience.filter((_, j) => j !== i))}
                    className="justify-self-end rounded-md p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700"
                    aria-label={t("Remove", "移除")}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <input className={input} placeholder={t("What they did there, in one line", "一句話說在那裡做了什麼")} value={x.highlight} onChange={(e) => setExp(i, "highlight", e.target.value)} />
              </div>
            ))}
            {f.experience.length < 6 ? (
              <button
                type="button"
                onClick={() => set("experience", [...f.experience, { role: "", company: "", period: "", highlight: "" }])}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-stone-300 px-2.5 py-1.5 text-[12px] font-medium text-stone-600 hover:bg-stone-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> {t("Add a role", "新增一段經歷")}
              </button>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Expertise", "專長")} hint={t("One per line", "一行一項")}>
                <textarea className={cx(input, "min-h-[72px]")} value={f.expertise} onChange={(e) => set("expertise", e.target.value)} />
              </Field>
              <Field label={t("Achievements", "成就")} hint={t("One per line", "一行一項")}>
                <textarea className={cx(input, "min-h-[72px]")} value={f.achievements} onChange={(e) => set("achievements", e.target.value)} />
              </Field>
            </div>
            <Field label={t("Education", "學歷")}><input className={input} value={f.education} onChange={(e) => set("education", e.target.value)} /></Field>
          </Group>

          <Group
            title={t("How the AI writes as them", "AI 怎麼用他的口吻寫")}
            note={t(
              "These go into every post this rep generates. Company prices, wording and policy checks still win.",
              "這些會放進這位業務每一篇貼文的寫作指令。公司的價格、用詞與政策檢查仍然優先。",
            )}
          >
            <Field label={t("Tone", "語氣")}><input className={input} value={f.tone} onChange={(e) => set("tone", e.target.value)} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Writing habits", "寫作習慣")} hint={t("One per line", "一行一項")}>
                <textarea className={cx(input, "min-h-[72px]")} value={f.traits} onChange={(e) => set("traits", e.target.value)} />
              </Field>
              <Field label={t("Never says", "個人不講的話")} hint={t("One per line — on top of the company's banned words", "一行一項——疊在公司禁用詞之上")}>
                <textarea className={cx(input, "min-h-[72px]")} value={f.avoid} onChange={(e) => set("avoid", e.target.value)} />
              </Field>
            </div>
            <Field label={t("Sign-off", "慣用結尾")}><input className={input} value={f.signoff} onChange={(e) => set("signoff", e.target.value)} /></Field>
            <Field
              label={t("Stories the AI can tell", "AI 可以引用的親身經歷")}
              hint={t(
                "One per line. Leave numbers out — statistics in posts must come from approved market facts.",
                "一行一則。不要寫數字——貼文裡的統計只能來自核准的市場數據。",
              )}
            >
              <textarea className={cx(input, "min-h-[96px]")} value={f.stories} onChange={(e) => set("stories", e.target.value)} />
            </Field>
          </Group>

          <ErrorNote error={save.error} />
        </div>

        <div className="flex justify-end gap-2 border-t border-stone-200 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-md border border-stone-200 px-3 py-1.5 text-[13px] font-medium text-stone-700 hover:bg-stone-50">
            {t("Cancel", "取消")}
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className={cx("rounded-md bg-stone-900 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-stone-800", save.isPending && "opacity-60")}
          >
            {save.isPending ? t("Saving…", "儲存中…") : t("Save profile", "儲存")}
          </button>
        </div>
      </form>
    </div>
  );
}

/** 選好的照片在瀏覽器裡裁成置中正方形、縮到 512px JPEG，再送到伺服器。 */
export async function photoFileToDataUrl(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Please choose a JPEG, PNG or WebP image.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that image."));
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser can't resize images.");
    // 直式照片的臉通常在上半部，所以垂直方向偏上裁，不正中裁。
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) * 0.3, side, side, 0, 0, 512, 512);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
