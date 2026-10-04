/**
 * /hub/reps/:repId — 一位業務的個人頁（CJ 2026-10-04「點進去有履歷，也有該人
 * 的品牌大腦 Access QR CODE，該頁面應該會漂亮」）。
 *
 * 左邊是這個人（履歷、經歷、可以講的故事），右邊是他跟系統的關係（AI 怎麼
 * 用他的口吻寫、他的品牌大腦入口、最近寫了什麼）。總部看完這一頁，應該能
 * 回答「這個業務的 AI 寫得出他自己的樣子嗎？他進來了沒有？」
 */
import React, { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Award, BookOpen, Briefcase, Camera, CheckCircle2, GraduationCap, Languages, Loader2,
  MapPin, MessageSquareQuote, PenLine, QrCode, RefreshCw, Sparkles, Trash2,
} from "lucide-react";
import { trpc } from "../../../lib/trpc";
import { Card, ChannelLabel, DemoTag, ErrorNote, Loading, Pill, RepPhoto, SectionTitle, VerdictBadge, cx, fmt, timeAgo, type Verdict } from "../ui";
import { useHubLang, useT } from "../lang";
import { CopyButton } from "../components/reps-CopyButton";
import ProfileEditModal, { photoFileToDataUrl } from "../components/reps-ProfileEditModal";
import ConversationHistory from "../components/reps-ConversationHistory";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[12px] text-stone-700">
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] italic text-stone-400">{children}</p>;
}

function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tabular-nums leading-none text-stone-900">{value}</div>
      {sub ? <div className="mt-1 truncate text-[11px] text-stone-500">{sub}</div> : null}
    </div>
  );
}

export default function HubRepProfilePage() {
  const t = useT();
  const { lang } = useHubLang();
  const repId = Number(useParams<{ repId: string }>().repId);
  const utils = trpc.useUtils();
  const data = trpc.hub.admin.repProfile.useQuery({ repId }, { enabled: Number.isInteger(repId) && repId > 0 });
  const [editing, setEditing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => Promise.all([utils.hub.admin.repProfile.invalidate({ repId }), utils.hub.admin.reps.invalidate()]);
  const setPhoto = trpc.hub.admin.setRepPhoto.useMutation({ onSuccess: refresh });
  const portrait = trpc.hub.admin.generateRepPortrait.useMutation({ onSuccess: refresh });
  const issue = trpc.hub.admin.issueBindCode.useMutation({ onSuccess: refresh });

  if (data.isLoading) return <Loading label={t("Loading profile…", "載入履歷…")} />;
  if (data.error || !data.data) return <ErrorNote error={data.error ?? { message: t("Rep not found.", "找不到這位業務。") }} />;

  const { rep, profile, photoUrl, stats, access, recentPosts, completeness } = data.data;
  const firstName = (rep.name.match(/[A-Za-z]+/)?.[0] ?? rep.name).trim();
  const photoBusy = setPhoto.isPending || portrait.isPending;

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    try {
      setPhoto.mutate({ repId, dataUrl: await photoFileToDataUrl(file) });
    } catch (err: any) {
      setPhotoError(String(err?.message ?? err));
    }
  }

  return (
    <div className="space-y-4">
      <Link to="/hub/reps" className="inline-flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t("Sales reps", "業務名單")}
      </Link>

      {/* ── hero ─────────────────────────────────────────────────────────── */}
      <Card pad={false} className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-orange-100 via-amber-50 to-stone-100 sm:h-28" aria-hidden />
        <div className="px-5 pb-5 sm:px-6">
          <div className="-mt-14 flex flex-col gap-4 sm:-mt-16 sm:flex-row sm:items-end">
            <div className="relative w-fit">
              <div className="h-28 w-28 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-sm sm:h-36 sm:w-36">
                <RepPhoto name={rep.name} seed={rep.avatarSeed} photoUrl={photoUrl} rounded="rounded-xl" />
              </div>
              {photoBusy ? (
                <div className="absolute inset-1 flex items-center justify-center rounded-xl bg-white/70">
                  <Loader2 className="h-6 w-6 animate-spin text-stone-600" aria-label={t("Working…", "處理中…")} />
                </div>
              ) : null}
            </div>
            <div className="min-w-0 flex-1 sm:pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[26px] font-semibold leading-tight text-stone-900">{rep.name}</h1>
                <span className="rounded border border-stone-200 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">{rep.market}</span>
                {rep.isDemo ? <DemoTag /> : null}
              </div>
              <div className="mt-0.5 text-[14px] text-stone-600">
                {rep.title} · {rep.team}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-stone-500">
                {profile.location ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{profile.location}</span> : null}
                {profile.yearsExperience != null ? (
                  <span className="inline-flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" aria-hidden />{t(`${profile.yearsExperience} years`, `${profile.yearsExperience} 年資歷`)}</span>
                ) : null}
                {profile.languages.length ? (
                  <span className="inline-flex items-center gap-1"><Languages className="h-3.5 w-3.5" aria-hidden />{profile.languages.join(" · ")}</span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:pb-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-stone-800"
              >
                <PenLine className="h-3.5 w-3.5" aria-hidden /> {t("Edit profile", "編輯履歷")}
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
              >
                <Camera className="h-3.5 w-3.5" aria-hidden /> {photoUrl ? t("Change photo", "換照片") : t("Upload photo", "上傳照片")}
              </button>
              {rep.isDemo ? (
                <button
                  type="button"
                  onClick={() => portrait.mutate({ repId })}
                  disabled={photoBusy}
                  title={t("Fictional demo reps only — real reps upload their own photo", "只限虛構的示範業務——真人請上傳照片")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 py-1.5 text-[13px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  {portrait.isPending ? t("Generating…", "生成中…") : t("AI portrait", "AI 頭像")}
                </button>
              ) : null}
              {photoUrl ? (
                <button
                  type="button"
                  onClick={() => setPhoto.mutate({ repId, dataUrl: null })}
                  disabled={photoBusy}
                  aria-label={t("Remove photo", "移除照片")}
                  className="rounded-md border border-stone-200 bg-white p-1.5 text-stone-500 hover:bg-stone-50 hover:text-stone-800 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickPhoto} />
            </div>
          </div>

          {profile.headline ? (
            <p className="mt-4 max-w-3xl border-l-2 border-orange-300 pl-3 text-[15px] leading-relaxed text-stone-800">{profile.headline}</p>
          ) : null}
          {rep.isDemo && photoUrl ? (
            <p className="mt-2 text-[11px] text-stone-400">{t("Demo rep — fictional person; portrait may be AI-generated.", "示範業務——虛構人物，頭像可能為 AI 生成。")}</p>
          ) : null}
          {photoError || setPhoto.error || portrait.error ? (
            <div className="mt-3"><ErrorNote error={photoError ? { message: photoError } : setPhoto.error ?? portrait.error} /></div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-stone-100 border-t border-stone-100 sm:grid-cols-5 sm:divide-y-0">
          <StatTile label={t("Team rank", "團隊排名")} value={stats.rank ? `#${stats.rank}` : "—"} sub={t(`of ${stats.teamSize} reps`, `共 ${stats.teamSize} 位`)} />
          <StatTile label={t("Posts", "貼文")} value={fmt(stats.posts)} sub={t("last 21 days", "近 21 天")} />
          <StatTile
            label={t("Passed checks", "通過檢查")}
            value={stats.posts ? `${Math.round((stats.compliantPosts / stats.posts) * 100)}%` : "—"}
            sub={t("compliant or auto-fixed", "合規或自動修正")}
          />
          <StatTile label={t("Clicks", "點擊")} value={fmt(stats.clicks)} sub={t("tracked links", "追蹤連結")} />
          <StatTile label={t("Network", "人脈規模")} value={fmt(rep.networkSize)} sub={t("connections", "聯絡人")} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── left: the person ───────────────────────────────────────────── */}
        <div className="min-w-0 space-y-4">
          <Card>
            <SectionTitle title={t("About", "關於")} />
            {profile.bio ? <p className="whitespace-pre-line text-[14px] leading-relaxed text-stone-700">{profile.bio}</p> : <Empty>{t("No introduction yet.", "還沒有自我介紹。")}</Empty>}
            {profile.expertise.length || rep.industries.length ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-[12px] font-medium text-stone-500">{t("Expertise", "專長")}</div>
                  <div className="flex flex-wrap gap-1.5">{profile.expertise.map((x) => <Chip key={x}>{x}</Chip>)}</div>
                </div>
                <div>
                  <div className="mb-1.5 text-[12px] font-medium text-stone-500">{t("Customer industries", "負責的客戶產業")}</div>
                  <div className="flex flex-wrap gap-1.5">{rep.industries.map((x) => <Chip key={x.key}>{lang === "zh" ? x.zh : x.en}</Chip>)}</div>
                </div>
              </div>
            ) : null}
          </Card>

          <Card>
            <SectionTitle title={t("Experience", "經歷")} />
            {profile.experience.length ? (
              <ol className="relative space-y-5 border-l border-stone-200 pl-5">
                {profile.experience.map((x, i) => (
                  <li key={i} className="relative">
                    <span
                      className={cx("absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white", i === 0 ? "bg-orange-500" : "bg-stone-300")}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <div className="text-[14px] font-semibold text-stone-900">{x.role}</div>
                      <div className="text-[12px] tabular-nums text-stone-500">{x.period}</div>
                    </div>
                    <div className="text-[13px] text-stone-600">{x.company}</div>
                    {x.highlight ? <p className="mt-1 text-[13px] leading-relaxed text-stone-700">{x.highlight}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>{t("No experience listed yet.", "還沒有填經歷。")}</Empty>
            )}
            {profile.education || profile.achievements.length ? (
              <div className="mt-5 grid gap-4 border-t border-stone-100 pt-4 sm:grid-cols-2">
                {profile.education ? (
                  <div className="flex items-start gap-2.5">
                    <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                    <div>
                      <div className="text-[12px] font-medium text-stone-500">{t("Education", "學歷")}</div>
                      <div className="text-[13px] text-stone-800">{profile.education}</div>
                    </div>
                  </div>
                ) : null}
                {profile.achievements.length ? (
                  <div className="flex items-start gap-2.5">
                    <Award className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" aria-hidden />
                    <div>
                      <div className="text-[12px] font-medium text-stone-500">{t("Recognition", "成就")}</div>
                      <ul className="space-y-0.5 text-[13px] text-stone-800">{profile.achievements.map((a) => <li key={a}>{a}</li>)}</ul>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card>
            <SectionTitle
              title={t("Stories the AI can tell", "AI 可以引用的親身經歷")}
              hint={t("First-hand moments that make a post sound like this rep, not like a brochure.", "讓貼文聽起來像這個人、不像型錄的真實片段。")}
            />
            {profile.stories.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {profile.stories.map((s) => (
                  <li key={s} className="flex gap-2.5 rounded-lg bg-stone-50 p-3">
                    <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" aria-hidden />
                    <p className="text-[13px] leading-relaxed text-stone-700">{s}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{t("No stories yet — posts will fall back to the company's voice.", "還沒有故事——貼文會只用公司的語氣。")}</Empty>
            )}
          </Card>
          <ConversationHistory repId={repId} firstName={firstName} />
        </div>

        {/* ── right: their AI and their access ───────────────────────────── */}
        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-orange-600" aria-hidden />
              <h2 className="text-[15px] font-semibold text-stone-900">{t("Brand brain access", "品牌大腦 Access")}</h2>
            </div>
            <p className="mt-1 text-[12px] text-stone-500">
              {t(
                `${firstName} scans this to open their AI marketing team — the company brain plus their own voice.`,
                `${firstName} 掃這張 QR，就能打開他的 AI 行銷團隊：公司的品牌大腦，加上他自己的寫法。`,
              )}
            </p>

            {rep.lineBound ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                <div className="text-[13px] text-emerald-900">
                  <div className="font-medium">{t("Connected on LINE", "已在 LINE 連線")}</div>
                  <div className="mt-0.5 text-[12px] text-emerald-800">
                    {t("Access is active. The one-time code was used, so there's no QR to share.", "已經開通。一次性的綁定碼用掉了，所以不再顯示 QR。")}
                  </div>
                </div>
              </div>
            ) : access ? (
              <div className="mt-4">
                <div className="mx-auto w-fit rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
                  <img src={access.qrPath} width={200} height={200} className="block h-[200px] w-[200px]" alt={t(`Access QR for ${rep.name}`, `${rep.name} 的 Access QR`)} />
                </div>
                <div className="mt-3 text-center">
                  <div className="text-[11px] text-stone-500">{t("One-time code", "一次性綁定碼")}</div>
                  <div className="select-all pl-[0.25em] font-mono text-[24px] font-semibold tracking-[0.25em] text-stone-900">{access.code}</div>
                </div>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <CopyButton text={access.url} label={t("Copy link", "複製連結")} />
                  <a
                    href={access.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-stone-700 hover:bg-stone-50"
                  >
                    {t("Preview page", "預覽加入頁")}
                  </a>
                  <button
                    type="button"
                    onClick={() => issue.mutate({ repId })}
                    disabled={issue.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                  >
                    <RefreshCw className={cx("h-3.5 w-3.5", issue.isPending && "animate-spin")} aria-hidden /> {t("New code", "換一組")}
                  </button>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-stone-500">
                  {t(
                    "Works once. Scanning opens LINE with the code ready to send; sending it links the account and records consent. A new code replaces this one.",
                    "只能用一次。掃描後會打開 LINE、綁定碼已經填好，按送出就完成綁定並記錄同意。換一組會讓這張作廢。",
                  )}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-stone-300 p-4 text-center">
                <p className="text-[13px] text-stone-600">{t("No access code yet.", "還沒有綁定碼。")}</p>
                <button
                  type="button"
                  onClick={() => issue.mutate({ repId })}
                  disabled={issue.isPending}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  <QrCode className="h-4 w-4" aria-hidden /> {issue.isPending ? t("Creating…", "建立中…") : t("Create access QR", "建立 Access QR")}
                </button>
              </div>
            )}
            <ErrorNote error={issue.error} />
          </Card>

          <Card>
            <SectionTitle title={t(`How the AI writes as ${firstName}`, `AI 怎麼用 ${firstName} 的口吻寫`)} />
            <div className="mb-3">
              <div className="flex items-center justify-between text-[12px] text-stone-500">
                <span>{t("Persona completeness", "人設完整度")}</span>
                <span className="font-medium tabular-nums text-stone-800">{completeness}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div
                  className={cx("h-full rounded-full", completeness >= 75 ? "bg-emerald-500" : completeness >= 40 ? "bg-amber-500" : "bg-stone-300")}
                  style={{ width: `${completeness}%` }}
                />
              </div>
            </div>
            {profile.voice.tone ? (
              <dl className="space-y-3 text-[13px]">
                <div>
                  <dt className="text-[12px] font-medium text-stone-500">{t("Tone", "語氣")}</dt>
                  <dd className="mt-0.5 text-stone-800">{profile.voice.tone}</dd>
                </div>
                {profile.voice.traits.length ? (
                  <div>
                    <dt className="text-[12px] font-medium text-stone-500">{t("Writing habits", "寫作習慣")}</dt>
                    <dd className="mt-1 space-y-1">
                      {profile.voice.traits.map((x) => (
                        <div key={x} className="flex gap-2 text-stone-700"><PenLine className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden />{x}</div>
                      ))}
                    </dd>
                  </div>
                ) : null}
                {profile.voice.signoff ? (
                  <div>
                    <dt className="text-[12px] font-medium text-stone-500">{t("Sign-off", "慣用結尾")}</dt>
                    <dd className="mt-0.5 font-medium text-stone-800">{profile.voice.signoff}</dd>
                  </div>
                ) : null}
                {profile.avoid.length ? (
                  <div>
                    <dt className="text-[12px] font-medium text-stone-500">{t("Never says", "個人不講的話")}</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">{profile.avoid.map((x) => <Pill key={x} tone="bad">{x}</Pill>)}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <Empty>{t("No voice set — posts use the company voice only.", "還沒設定語氣——貼文只會用公司的語氣。")}</Empty>
            )}
            <p className="mt-4 flex gap-2 rounded-md bg-stone-50 p-2.5 text-[11px] leading-relaxed text-stone-500">
              <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {t(
                "Company rules always win: approved prices, preferred and banned wording, and the market's policy checks apply before personal style.",
                "公司規則永遠優先：核准價格、正面用詞與禁用詞、市場政策檢查都排在個人風格之前。",
              )}
            </p>
          </Card>

          <Card>
            <SectionTitle title={t("Recent posts", "最近的貼文")} />
            {recentPosts.length ? (
              <ul className="space-y-3">
                {recentPosts.map((p) => (
                  <li key={p.id}>
                    <Link to={`/hub/run/${p.id}`} className="block rounded-lg border border-stone-100 p-3 hover:border-stone-200 hover:bg-stone-50">
                      <div className="flex items-center justify-between gap-2">
                        <ChannelLabel channel={p.channel} />
                        <VerdictBadge verdict={p.verdict as Verdict} />
                      </div>
                      <p className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-stone-600">{p.caption}</p>
                      <div className="mt-1.5 truncate text-[11px] text-stone-400">
                        {(lang === "zh" ? p.solutionZh : p.solutionEn) ?? ""} · {timeAgo(p.createdAt)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{t("No posts yet.", "還沒有貼文。")}</Empty>
            )}
          </Card>
        </div>
      </div>

      {editing ? (
        <ProfileEditModal repId={repId} title={rep.title} team={rep.team} profile={profile} onClose={() => setEditing(false)} />
      ) : null}
    </div>
  );
}
