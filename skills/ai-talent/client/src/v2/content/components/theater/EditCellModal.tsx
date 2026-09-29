/**
 * EditCellModal — full-screen editing modal for a single Theater cell.
 *
 * Opens when user clicks "Edit" on any cell card.
 * Features:
 *   - Large caption textarea (vs. the constrained inline overlay)
 *   - AI 潤稿 (calls trpc.theater.qaReviewCell)
 *   - Platform-specific structured fields (hashtags, subject, chapters, thread, h2)
 *   - Image preview + prompt editor + 重新產圖
 *   - 送到行事曆: inline datetime picker → trpc.theater.scheduleCell
 */
import { useState, useRef, useEffect } from "react";
import { Spinner } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import type { TheaterPlatform } from "../../../config/theaterCast";
import { ICON, CheckIcon, CloseIcon, ImageIcon, PaletteIcon, ScheduleIcon } from "../../../platform/components/icons";

// ── Platform display helpers ──────────────────────────────────────────────────
const PLATFORM_LABEL: Record<TheaterPlatform, string> = {
  facebook:  "Facebook",
  instagram: "Instagram",
  youtube:   "YouTube",
  threads:   "Threads",
  line:      "LINE",
  blog:      "Blog",
};

const PLATFORM_ICON: Record<TheaterPlatform, IconDefinition> = {
  facebook:  ICON.facebook,
  instagram: ICON.instagram,
  youtube:   ICON.youtube,
  threads:   ICON.threads,
  line:      ICON.line,
  blog:      ICON.text,
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface EditCellModalProps {
  platform: TheaterPlatform;
  date: string;            // YYYY-MM-DD
  dateLabel: string;       // localised "6/3（三）"
  initialCaption: string;
  initialStructured?: Record<string, any>;
  initialImageUrl?: string | null;
  initialImagePrompt?: string;
  brandId: number;
  brandTagline: string | null;
  lang: string;
  isAlreadyScheduled: boolean;
  // mutations (typed as any to avoid repeating tRPC inference)
  qaReviewMut: any;
  generateImageMut: any;
  scheduleCellMut: any;
  onSave: (updates: {
    caption: string;
    structured: Record<string, any>;
    imageUrl?: string | null;
    imagePrompt?: string;
  }) => void;
  onScheduleSuccess: (scheduledPostId: number, scheduledAt: string, caption: string, imageUrl: string | null) => void;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDateLabel(date: string, lang: string) {
  try {
    const d = new Date(date + "T12:00:00");
    const weekdays = lang === "en"
      ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
      : ["日","一","二","三","四","五","六"];
    const wd = weekdays[d.getDay()];
    if (lang === "en") return `${d.getMonth()+1}/${d.getDate()} (${wd})`;
    return `${d.getMonth()+1}/${d.getDate()}（${wd}）`;
  } catch { return date; }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function EditCellModal({
  platform, date, dateLabel,
  initialCaption, initialStructured = {}, initialImageUrl, initialImagePrompt,
  brandId, brandTagline, lang,
  isAlreadyScheduled,
  qaReviewMut, generateImageMut, scheduleCellMut,
  onSave, onScheduleSuccess, onClose,
}: EditCellModalProps) {
  const en = lang === "en";

  // ── Draft state ──────────────────────────────────────────────────────────
  const [caption, setCaption]   = useState(initialCaption);
  const [structured, setStructured] = useState<Record<string, any>>({ ...initialStructured });
  const [imageUrl, setImageUrl] = useState<string | null | undefined>(initialImageUrl);
  const [imagePrompt, setImagePrompt] = useState(initialImagePrompt ?? "");

  // ── UI state ─────────────────────────────────────────────────────────────
  const [polishing, setPolishing]   = useState(false);
  const [imaging, setImaging]       = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    // If the cell date is today or in the past, default to the next full hour
    // (≥5 min from now) so we never pre-fill a past time.
    const cellMidnight = new Date(`${date}T00:00`);
    const now = new Date();
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);
    if (cellMidnight <= todayMidnight) {
      const next = new Date(now.getTime() + 5 * 60_000);
      next.setMinutes(0, 0, 0);
      next.setTime(next.getTime() + 60 * 60_000); // advance to next hour
      return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:00`;
    }
    return `${date}T09:00`;
  });
  const [scheduling, setScheduling] = useState(false);
  const [hashtagInput, setHashtagInput] = useState("");
  const [polishError, setPolishError] = useState<string | null>(null);
  const [imageError, setImageError]   = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const scheduleRef = useRef<HTMLDivElement>(null);
  const captionRef  = useRef<HTMLTextAreaElement>(null);

  // Auto-focus caption on open
  useEffect(() => { captionRef.current?.focus(); }, []);

  // Scroll to schedule section when it opens
  useEffect(() => {
    if (showSchedule) setTimeout(() => scheduleRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, [showSchedule]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Hashtag helpers ──────────────────────────────────────────────────────
  const hashtags: string[] = Array.isArray(structured.hashtags) ? structured.hashtags : [];

  const addHashtag = () => {
    const tag = hashtagInput.trim().replace(/^#/, "");
    if (!tag) return;
    setStructured(s => ({ ...s, hashtags: [...hashtags, `#${tag}`] }));
    setHashtagInput("");
  };

  const removeHashtag = (idx: number) => {
    setStructured(s => ({ ...s, hashtags: hashtags.filter((_, i) => i !== idx) }));
  };

  // ── List field helper (chapters / thread / h2) ───────────────────────────
  const updateListItem = (field: string, idx: number, val: string) => {
    const arr: string[] = Array.isArray(structured[field]) ? [...structured[field]] : [];
    arr[idx] = val;
    setStructured(s => ({ ...s, [field]: arr }));
  };
  const addListItem = (field: string) => {
    const arr: string[] = Array.isArray(structured[field]) ? [...structured[field]] : [];
    setStructured(s => ({ ...s, [field]: [...arr, ""] }));
  };
  const removeListItem = (field: string, idx: number) => {
    const arr: string[] = Array.isArray(structured[field]) ? [...structured[field]] : [];
    setStructured(s => ({ ...s, [field]: arr.filter((_, i) => i !== idx) }));
  };

  // ── AI 潤稿 ──────────────────────────────────────────────────────────────
  const handlePolish = async () => {
    if (!caption.trim() || polishing) return;
    setPolishing(true);
    setPolishError(null);
    try {
      const r = await qaReviewMut.mutateAsync({
        draft: caption,
        platform,
        usp: brandTagline ?? "優質品牌內容",
      });
      if (r?.ok && r?.caption) setCaption(r.caption);
      else setPolishError(en ? "Polish failed — please try again" : "潤稿失敗，請再試一次");
    } catch (e: any) {
      setPolishError(typeof e?.message === "string" ? e.message : (en ? "Polish failed" : "潤稿失敗"));
    } finally {
      setPolishing(false);
    }
  };

  // ── 重新產圖 ──────────────────────────────────────────────────────────────
  const handleRegenImage = async () => {
    if (imaging) return;
    setImaging(true);
    setImageError(null);
    try {
      const r = await generateImageMut.mutateAsync({
        brandId,
        platform,
        caption,
        brandTagline,
        customPrompt: imagePrompt.trim() || undefined,
      });
      if (r?.ok && r?.imageUrl) {
        setImageUrl(r.imageUrl);
        if (r.brief) setImagePrompt(r.brief);
      } else {
        setImageError(en ? "Image generation failed" : "產圖失敗，請再試一次");
      }
    } catch (e: any) {
      setImageError(typeof e?.message === "string" ? e.message : (en ? "Image failed" : "產圖失敗"));
    } finally {
      setImaging(false);
    }
  };

  // ── 儲存草稿 ──────────────────────────────────────────────────────────────
  const handleSave = () => {
    onSave({ caption, structured, imageUrl, imagePrompt: imagePrompt || undefined });
    onClose();
  };

  // ── 送到行事曆 ────────────────────────────────────────────────────────────
  const handleSchedule = async () => {
    if (!scheduleAt || scheduling) return;
    setScheduling(true);
    setScheduleError(null);
    try {
      const r = await scheduleCellMut.mutateAsync({
        brandId,
        platform,
        date,
        caption,
        // Normalise: empty string → null so server doesn't trip on url validation
        imageUrl: (imageUrl && imageUrl.trim() !== "") ? imageUrl : null,
        scheduledAt: new Date(scheduleAt).toISOString(),
      });
      if (r?.ok && r?.scheduledPostId) {
        onScheduleSuccess(r.scheduledPostId, new Date(scheduleAt).toISOString(), caption, imageUrl ?? null);
        onSave({ caption, structured, imageUrl, imagePrompt: imagePrompt || undefined });
        onClose();
      } else {
        setScheduleError(en ? "Schedule failed" : "排程失敗，請再試一次");
      }
    } catch (e: any) {
      setScheduleError(typeof e?.message === "string" ? e.message : (en ? "Schedule failed" : "排程失敗"));
    } finally {
      setScheduling(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const charCount = caption.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl flex flex-col"
        style={{ width: "min(720px, 96vw)", maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-100 shrink-0">
          <span className="text-xl"><FontAwesomeIcon icon={PLATFORM_ICON[platform]} /></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-neutral-900">
              {PLATFORM_LABEL[platform]}
            </p>
            <p className="text-xs text-neutral-400">
              {dateLabel || formatDateLabel(date, lang)}
            </p>
          </div>
          {isAlreadyScheduled && (
            <span className="text-[12px] font-medium px-2 py-0.5 rounded-full bg-success-100 text-success-700">
              <span className="inline-flex items-center gap-1"><CheckIcon size={10} />{en ? "Scheduled" : "已排程"}</span>
            </span>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
            aria-label="close"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {/* ── Body (scrollable) ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Caption */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {en ? "Post content" : "貼文內容"}
              </label>
              <span className="text-[12px] text-neutral-400">{charCount} {en ? "chars" : "字"}</span>
            </div>
            <textarea
              ref={captionRef}
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={10}
              className="w-full text-[14px] leading-relaxed px-3 py-2.5 border border-neutral-200 rounded-xl resize-y focus:outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100 transition"
              placeholder={en ? "Write your post here…" : "在這裡輸入貼文內容…"}
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handlePolish}
                disabled={polishing || !caption.trim()}
                className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg bg-zinc-50 text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 transition"
              >
                {polishing ? <Spinner size="sm" color="current" /> : <span></span>}
                {en ? "AI Polish" : "AI 潤稿"}
              </button>
              {polishError && <span className="text-[12px] text-danger-600">{polishError}</span>}
            </div>
          </section>

          {/* Platform-specific structured fields */}
          {/* Hashtags (all platforms) */}
          {(platform === "facebook" || platform === "instagram" || platform === "threads" || platform === "youtube" || platform === "blog" || platform === "line") && (
            <section>
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 block mb-2">
                Hashtags
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {hashtags.map((tag, i) => (
                  <span key={i} className="flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
                    {tag}
                    <button onClick={() => removeHashtag(i)} className="text-neutral-400 hover:text-neutral-700 leading-none"><CloseIcon size={10} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={hashtagInput}
                  onChange={e => setHashtagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addHashtag(); } }}
                  placeholder={en ? "Add tag (Enter)" : "新增標籤（Enter）"}
                  className="flex-1 text-[12px] px-2.5 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-zinc-400 transition"
                />
                <button
                  onClick={addHashtag}
                  className="text-[12px] px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition"
                >
                  + {en ? "Add" : "新增"}
                </button>
              </div>
            </section>
          )}

          {/* Subject (LINE / blog) */}
          {(platform === "line" || platform === "blog") && (
            <section>
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 block mb-2">
                {en ? "Subject / Title" : "標題 / 主旨"}
              </label>
              <input
                value={structured.subject ?? ""}
                onChange={e => setStructured(s => ({ ...s, subject: e.target.value }))}
                className="w-full text-[13px] px-3 py-2 border border-neutral-200 rounded-xl focus:outline-none focus:border-zinc-400 transition"
                placeholder={en ? "Subject line…" : "輸入主旨…"}
              />
            </section>
          )}

          {/* YouTube chapters */}
          {platform === "youtube" && Array.isArray(structured.chapters) && (
            <section>
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 block mb-2">
                {en ? "Chapters" : "章節"}
              </label>
              <div className="space-y-1.5">
                {(structured.chapters as string[]).map((ch, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="text-[12px] text-neutral-400 w-5 text-right shrink-0">{i + 1}.</span>
                    <input
                      value={ch}
                      onChange={e => updateListItem("chapters", i, e.target.value)}
                      className="flex-1 text-[12px] px-2.5 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-zinc-400 transition"
                    />
                    <button onClick={() => removeListItem("chapters", i)} className="text-neutral-400 hover:text-danger-500 transition"><CloseIcon size={12} /></button>
                  </div>
                ))}
                <button
                  onClick={() => addListItem("chapters")}
                  className="text-[12px] text-zinc-600 hover:text-zinc-800 mt-1"
                >
                  + {en ? "Add chapter" : "新增章節"}
                </button>
              </div>
            </section>
          )}

          {/* Threads thread chain */}
          {platform === "threads" && Array.isArray(structured.thread) && (
            <section>
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 block mb-2">
                {en ? "Thread" : "串文"}
              </label>
              <div className="space-y-1.5">
                {(structured.thread as any[]).map((item, i) => {
                  const val = typeof item === "string" ? item : (item?.text ?? "");
                  return (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-[12px] text-neutral-400 w-5 text-right shrink-0 mt-2">{i + 1}.</span>
                      <textarea
                        value={val}
                        rows={2}
                        onChange={e => {
                          const arr = [...structured.thread];
                          arr[i] = typeof item === "string" ? e.target.value : { ...item, text: e.target.value };
                          setStructured(s => ({ ...s, thread: arr }));
                        }}
                        className="flex-1 text-[12px] px-2.5 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-zinc-400 transition resize-none"
                      />
                      <button onClick={() => removeListItem("thread", i)} className="text-neutral-400 hover:text-danger-500 transition mt-2"><CloseIcon size={12} /></button>
                    </div>
                  );
                })}
                <button
                  onClick={() => addListItem("thread")}
                  className="text-[12px] text-zinc-600 hover:text-zinc-800 mt-1"
                >
                  + {en ? "Add thread post" : "新增串文"}
                </button>
              </div>
            </section>
          )}

          {/* Blog H2 headers */}
          {platform === "blog" && Array.isArray(structured.h2) && (
            <section>
              <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 block mb-2">
                H2 {en ? "Sections" : "段落標題"}
              </label>
              <div className="space-y-1.5">
                {(structured.h2 as string[]).map((h, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="text-[12px] text-neutral-400 w-5 text-right shrink-0">H2</span>
                    <input
                      value={h}
                      onChange={e => updateListItem("h2", i, e.target.value)}
                      className="flex-1 text-[12px] px-2.5 py-1.5 border border-neutral-200 rounded-lg focus:outline-none focus:border-zinc-400 transition"
                    />
                    <button onClick={() => removeListItem("h2", i)} className="text-neutral-400 hover:text-danger-500 transition"><CloseIcon size={12} /></button>
                  </div>
                ))}
                <button
                  onClick={() => addListItem("h2")}
                  className="text-[12px] text-zinc-600 hover:text-zinc-800 mt-1"
                >
                  + {en ? "Add H2" : "新增段落"}
                </button>
              </div>
            </section>
          )}

          {/* Image section */}
          <section>
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500 block mb-3">
              {en ? "Image" : "配圖"}
            </label>
            <div className="flex gap-4 items-start">
              {/* Thumbnail */}
              <div
                className="shrink-0 rounded-xl overflow-hidden border border-neutral-200 bg-neutral-50 flex items-center justify-center"
                style={{ width: 120, height: 120 }}
              >
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl"><ImageIcon size={28} /></span>
                )}
              </div>

              {/* Prompt + regen */}
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-[12px] text-neutral-500">
                  {en
                    ? "Image prompt — edit to guide the next generation:"
                    : "圖片指令 — 可修改後重新產圖："}
                </p>
                <textarea
                  value={imagePrompt}
                  onChange={e => setImagePrompt(e.target.value)}
                  rows={3}
                  placeholder={en
                    ? "Describe the image you want (leave blank to auto-generate from caption)"
                    : "描述想要的圖片（留空則自動從貼文內容產生）"}
                  className="w-full text-[12px] px-2.5 py-2 border border-neutral-200 rounded-xl resize-none focus:outline-none focus:border-zinc-400 transition"
                />
                <button
                  onClick={handleRegenImage}
                  disabled={imaging}
                  className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40 transition"
                >
                  {imaging ? <Spinner size="sm" color="current" /> : <PaletteIcon size={12} />}
                  {en ? "Regenerate image" : "重新產圖"}
                </button>
                {imageError && <p className="text-[12px] text-danger-600">{imageError}</p>}
              </div>
            </div>
          </section>

          {/* Schedule section (expandable) */}
          {showSchedule && (
            <section ref={scheduleRef} className="rounded-xl border border-zinc-200 bg-zinc-50/40 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700">
                <span className="inline-flex items-center gap-1"><ScheduleIcon size={12} /> {en ? "Schedule to Calendar" : "排程到行事曆"}</span>
              </p>
              <div>
                <label className="text-[12px] text-neutral-600 block mb-1">
                  {en ? "Date & time" : "日期與時間"}
                </label>
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={e => setScheduleAt(e.target.value)}
                  className="text-[13px] px-3 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:border-zinc-500 transition bg-white"
                />
              </div>
              {scheduleError && <p className="text-[12px] text-danger-600">{scheduleError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSchedule}
                  disabled={scheduling || !scheduleAt}
                  className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-xl bg-zinc-600 text-white hover:bg-zinc-700 disabled:opacity-40 transition"
                >
                  {scheduling ? <Spinner size="sm" color="white" /> : null}
                  {isAlreadyScheduled
                    ? (en ? "Update schedule" : "更新排程")
                    : (en ? "Confirm schedule" : "確認排程")}
                </button>
                <button
                  onClick={() => setShowSchedule(false)}
                  className="text-[13px] px-3 py-2 rounded-xl border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition"
                >
                  {en ? "Cancel" : "取消"}
                </button>
              </div>
            </section>
          )}

        </div>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-100 bg-neutral-50/60 rounded-b-2xl shrink-0">
          <button
            onClick={onClose}
            className="text-[13px] text-neutral-500 hover:text-neutral-800 transition"
          >
            {en ? "Cancel" : "取消"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="text-[13px] font-medium px-4 py-2 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 transition"
            >
              {en ? "Save draft" : "儲存草稿"}
            </button>
            <button
              onClick={() => setShowSchedule(v => !v)}
              className={`flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-xl transition ${
                showSchedule
                  ? "bg-zinc-100 text-zinc-800 border border-zinc-300"
                  : "bg-zinc-600 text-white hover:bg-zinc-700"
              }`}
            >
              <ScheduleIcon size={13} /> {en ? "Schedule" : "排程發布"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
