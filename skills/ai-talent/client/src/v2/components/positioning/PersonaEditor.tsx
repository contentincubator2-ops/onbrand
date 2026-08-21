/**
 * PersonaEditor — 策略工作區的「人設」tray。
 *
 * 2026-08-21 (CJ「加一個人設的 task tray：讓她可以自己新創 agent、自己命名，
 * 並且決定這個 agent 語調的應用範圍要在哪些內容的任務」).
 *
 * 跟旁邊兩個 tray 的分工：
 *   文字 tray  → 品牌「怎麼講話」的規則（語氣、用詞、禁用詞）
 *   AI 指令庫  → 每個平台的系統指令，由 AI 依定位產生
 *   人設 tray  → 「誰在講」。客戶自己建的寫手，自己取名，自己指定他負責哪些任務
 *
 * 指定的任務跑起來時，署名與口吻都換成這個人（server: brandPersonas.ts）。
 * 沒被指定到的任務完全不受影響 —— 這是刻意的：客戶不會想一次換掉全部。
 */
import React from "react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { Input, Textarea } from "@heroui/react";
import { Plus, Trash2, UserRound, Sparkles, ChevronDown, ChevronRight, Search } from "lucide-react";

interface PersonaScope { taskIds: string[]; platforms: string[] }
interface Persona {
  id: string; name: string; title: string; persona: string;
  scope: PersonaScope; enabled: boolean;
  createdAt: string; updatedAt: string;
}
interface TaskRow { id: string; label: string; label_zh?: string | null; label_en?: string | null; platform: string; tier: string }

/** 平台代碼 → 顯示名。跟 quickTask.listFB 回傳的 platform 對齊。 */
const PLATFORMS: Array<{ id: string; zh: string; en: string }> = [
  { id: "facebook",  zh: "Facebook",  en: "Facebook" },
  { id: "instagram", zh: "Instagram", en: "Instagram" },
  { id: "youtube",   zh: "YouTube",   en: "YouTube" },
  { id: "tiktok",    zh: "TikTok",    en: "TikTok" },
  { id: "linkedin",  zh: "LinkedIn",  en: "LinkedIn" },
  { id: "email",     zh: "電子報",     en: "Email" },
  { id: "pr",        zh: "新聞稿",     en: "PR" },
  { id: "brand",     zh: "品牌策略",   en: "Brand" },
  { id: "audience",  zh: "受眾研究",   en: "Audience" },
  { id: "kol",       zh: "KOL 合作",   en: "KOL" },
];

/** 用戶可見文案不用 30s/60s/99s（內部 tier id 照舊）。 */
const TIER_ZH: Record<string, string> = { "30s": "單篇", "60s": "套組", "99s": "企劃" };
const TIER_EN: Record<string, string> = { "30s": "Single", "60s": "Pack", "99s": "Campaign" };

function newId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const emptyPersona = (): Persona => ({
  id: newId(), name: "", title: "", persona: "",
  scope: { taskIds: [], platforms: [] }, enabled: true,
  createdAt: "", updatedAt: "",
});

export default function PersonaEditor({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";

  const utils = trpc.useUtils();
  const listQ = (trpc as any).brandPersona?.list?.useQuery?.(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  );
  const personas: Persona[] = (listQ?.data as any)?.personas ?? [];

  const tasksQ = (trpc as any).quickTask?.listFB?.useQuery?.(undefined, {
    refetchOnWindowFocus: false, staleTime: 5 * 60_000,
  });
  const allTasks: TaskRow[] = React.useMemo(() => {
    const rows = (tasksQ?.data as any[]) ?? [];
    return rows
      .filter((t) => t?.id && t?.platform)
      .map((t) => ({
        id: String(t.id), label: String(t.label ?? t.id),
        label_zh: t.label_zh ?? null, label_en: t.label_en ?? null,
        platform: String(t.platform), tier: String(t.tier ?? "30s"),
      }));
  }, [tasksQ?.data]);

  const saveMut = (trpc as any).brandPersona?.save?.useMutation?.({
    onSuccess: () => utils.brandPersona?.list?.invalidate?.({ brandId: brandId ?? 0 }),
  });
  const removeMut = (trpc as any).brandPersona?.remove?.useMutation?.({
    onSuccess: () => utils.brandPersona?.list?.invalidate?.({ brandId: brandId ?? 0 }),
  });
  const suggestMut = (trpc as any).brandPersona?.suggest?.useMutation?.();

  const [draft, setDraft] = React.useState<Persona | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [drafting, setDrafting] = React.useState(false);
  const [hint, setHint] = React.useState("");

  if (!brandId) {
    return <div className="p-8 text-center text-default-500">{en ? "Pick a brand first" : "請先選擇品牌"}</div>;
  }

  /** 這個任務實際上會由誰來寫（清單順序 = 優先順序，跟 server 的 matchPersonaForTask 同規則）。 */
  const ownerOf = (taskId: string, platform: string, exclude?: string): Persona | null => {
    const live = personas.filter((p) => p.enabled && p.persona.trim() && p.id !== exclude);
    return live.find((p) => p.scope.taskIds.includes(taskId))
        ?? live.find((p) => p.scope.platforms.includes(platform))
        ?? null;
  };

  const scopeSummary = (p: Persona): string => {
    const plats = p.scope.platforms
      .map((id) => PLATFORMS.find((x) => x.id === id))
      .filter(Boolean)
      .map((x) => (en ? x!.en : x!.zh));
    const n = p.scope.taskIds.length;
    const parts: string[] = [];
    if (plats.length) parts.push(en ? `${plats.join(" / ")} (all tasks)` : `${plats.join(" / ")} 全部任務`);
    if (n) parts.push(en ? `${n} task${n > 1 ? "s" : ""}` : `${n} 個指定任務`);
    if (!parts.length) return en ? "Not assigned yet — no task uses this voice" : "尚未指定任務 — 目前不會被套用";
    return parts.join(en ? " + " : " ＋ ");
  };

  const persist = async (p: Persona) => {
    setErr(null);
    if (!p.name.trim()) { setErr(en ? "Give the agent a name first" : "請先幫這個 agent 命名"); return; }
    try {
      await saveMut?.mutateAsync?.({
        brandId,
        persona: {
          id: p.id, name: p.name.trim(), title: p.title.trim(), persona: p.persona,
          scope: { taskIds: p.scope.taskIds, platforms: p.scope.platforms },
          enabled: p.enabled,
        },
      });
      setDraft(null);
      setHint("");
    } catch (e: any) {
      setErr(e?.message ?? (en ? "Save failed" : "儲存失敗"));
    }
  };

  const handleDraftPersona = async () => {
    if (!draft?.name.trim()) { setErr(en ? "Name the agent first — the draft is written for that name" : "請先命名 — 草稿會用這個名字來寫"); return; }
    setDrafting(true);
    setErr(null);
    try {
      const r = await suggestMut?.mutateAsync?.({
        brandId, name: draft.name.trim(),
        title: draft.title.trim() || undefined,
        hint: hint.trim() || undefined,
      });
      if (r?.ok) setDraft({ ...draft, persona: r.persona });
      else setErr(en ? "Draft failed — write it yourself or retry" : "草擬失敗 — 可以自己寫，或再試一次");
    } catch (e: any) {
      setErr(e?.message ?? (en ? "Draft failed" : "草擬失敗"));
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="w-9 h-9 rounded-full flex items-center justify-center bg-neutral-900">
            <UserRound size={16} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-default-900">{en ? "Personas" : "人設"}</h1>
        </div>
        <p className="text-sm text-default-500 max-w-[720px]">
          {en
            ? "Build your own writer, name them, and pick exactly which content tasks they write. Assigned tasks come out in this voice and are credited to this name; everything else is untouched."
            : "建立你自己的寫手，自己命名，指定他負責哪些內容任務。被指定的任務會用他的口吻產出、署名也是他；沒指定的任務完全不受影響。"}
        </p>
      </div>

      {err && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-[13px] text-red-700">{err}</div>
      )}

      {/* ── Persona list ─────────────────────────────────────────── */}
      <div className="space-y-3 mb-5">
        {personas.length === 0 && !draft && (
          <div className="rounded-xl border border-dashed border-neutral-300 px-6 py-10 text-center">
            <p className="text-sm font-semibold text-neutral-700 mb-1">
              {en ? "No persona yet" : "還沒有任何人設"}
            </p>
            <p className="text-[12.5px] text-neutral-500">
              {en
                ? "Tasks are written by the system-assigned agent until you create one."
                : "在你建立之前，任務都由系統指派的 agent 撰寫。"}
            </p>
          </div>
        )}

        {personas.map((p) => (
          <div key={p.id} className="rounded-xl border border-neutral-200 bg-white px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[15px] font-semibold text-neutral-900 truncate">{p.name}</span>
                  {p.title && <span className="text-[12px] text-neutral-500 truncate">{p.title}</span>}
                  {!p.enabled && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-neutral-300 text-neutral-500">
                      {en ? "OFF" : "已停用"}
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-neutral-500">{scopeSummary(p)}</p>
                {p.persona.trim() && (
                  <p className="mt-2 text-[12.5px] leading-relaxed text-neutral-600 line-clamp-2">{p.persona}</p>
                )}
                {!p.persona.trim() && (
                  <p className="mt-2 text-[12.5px] text-amber-700">
                    {en ? "No persona text — this agent stays inactive until you write it." : "還沒寫人設內容 — 在寫完之前不會被套用。"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => { setDraft({ ...p, scope: { ...p.scope } }); setErr(null); }}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50 transition"
                >
                  {en ? "Edit" : "編輯"}
                </button>
                <button
                  type="button"
                  title={en ? "Delete" : "刪除"}
                  onClick={async () => {
                    if (!window.confirm(en ? `Delete "${p.name}"?` : `確定刪除「${p.name}」？`)) return;
                    await removeMut?.mutateAsync?.({ brandId, personaId: p.id });
                    if (draft?.id === p.id) setDraft(null);
                  }}
                  className="w-8 h-8 rounded-lg border border-neutral-200 flex items-center justify-center text-neutral-400 hover:text-red-600 hover:border-red-200 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!draft && (
        <button
          type="button"
          onClick={() => { setDraft(emptyPersona()); setErr(null); setHint(""); }}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 transition"
        >
          <Plus size={14} /> {en ? "New persona" : "新增人設"}
        </button>
      )}

      {/* ── Editor ───────────────────────────────────────────────── */}
      {draft && (
        <div className="rounded-2xl border border-neutral-900 bg-white p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400 mb-4">
            {personas.some((p) => p.id === draft.id) ? (en ? "Edit persona" : "編輯人設") : (en ? "New persona" : "新增人設")}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <Input
              size="sm" label={en ? "Name (yours to choose)" : "名字（你自己取）"}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={en ? "e.g. 阿母" : "例：阿母"}
            />
            <Input
              size="sm" label={en ? "Role / title (optional)" : "職稱（可留空）"}
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder={en ? "e.g. Bedtime-story writer" : "例：睡前故事主筆"}
            />
          </div>

          {/* Persona text + AI draft */}
          <div className="mb-2 flex items-end gap-2">
            <Input
              size="sm" className="flex-1"
              label={en ? "One line on the voice you want (for the AI draft)" : "你想要的語調，一句話（給 AI 草擬用）"}
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder={en ? "e.g. like a neighbour mum telling a bedtime story" : "例：像鄰居媽媽在講睡前故事"}
            />
            <button
              type="button"
              onClick={handleDraftPersona}
              disabled={drafting}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-2 rounded-lg border border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 transition whitespace-nowrap"
            >
              <Sparkles size={13} /> {drafting ? (en ? "Drafting…" : "草擬中…") : (en ? "AI draft" : "AI 草擬")}
            </button>
          </div>
          <Textarea
            minRows={8}
            label={en ? "Persona — who they are and how they talk" : "人設內容 — 他是誰、怎麼講話"}
            value={draft.persona}
            onChange={(e) => setDraft({ ...draft, persona: e.target.value })}
            placeholder={en
              ? "Background, rhythm of speech, signature phrases, what they refuse to write…"
              : "背景、說話節奏、口頭禪、他堅持什麼與絕不寫什麼…"}
            className="mb-1"
          />
          <p className="text-[11.5px] text-neutral-400 mb-5">
            {en
              ? "300–500 words works best. This text is injected verbatim; two adjectives won't change the output."
              : "300–500 字最有效。這段會原文送進 prompt —— 只寫兩個形容詞不會改變產出。"}
          </p>

          {/* Scope picker */}
          <ScopePicker
            en={en}
            tasks={allTasks}
            loading={!tasksQ?.data && (tasksQ?.isLoading ?? true)}
            scope={draft.scope}
            onChange={(scope) => setDraft({ ...draft, scope })}
            ownerOf={(taskId, platform) => ownerOf(taskId, platform, draft.id)}
          />

          {/* Footer */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-100">
            <label className="flex items-center gap-2 text-[12.5px] text-neutral-600 select-none cursor-pointer">
              <input
                type="checkbox" checked={draft.enabled}
                onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
              />
              {en ? "Active" : "啟用"}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setDraft(null); setErr(null); }}
                className="text-[12.5px] font-semibold px-4 py-2 rounded-lg border border-neutral-300 hover:bg-neutral-50 transition"
              >
                {en ? "Cancel" : "取消"}
              </button>
              <button
                type="button"
                onClick={() => persist(draft)}
                disabled={saveMut?.isPending}
                className="text-[12.5px] font-semibold px-4 py-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-700 disabled:opacity-50 transition"
              >
                {saveMut?.isPending ? (en ? "Saving…" : "儲存中…") : (en ? "Save" : "儲存")}
              </button>
            </div>
          </div>
        </div>
      )}

      {allTasks.length === 0 && draft && (
        <p className="mt-3 text-[12px] text-neutral-400">
          {en ? "Task catalog still loading…" : "任務清單載入中…"}
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════ Scope picker ═══════════════════════ */

function ScopePicker({
  en, tasks, loading, scope, onChange, ownerOf,
}: {
  en: boolean;
  tasks: TaskRow[];
  loading: boolean;
  scope: PersonaScope;
  onChange: (s: PersonaScope) => void;
  /** 若這個任務已經被別的人設吃掉，回傳那個人設（用來顯示衝突） */
  ownerOf: (taskId: string, platform: string) => Persona | null;
}) {
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [q, setQ] = React.useState("");

  const byPlatform = React.useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      const arr = m.get(t.platform) ?? [];
      arr.push(t);
      m.set(t.platform, arr);
    }
    return m;
  }, [tasks]);

  const query = q.trim().toLowerCase();
  const matches = (t: TaskRow) =>
    !query ||
    t.id.toLowerCase().includes(query) ||
    String(t.label ?? "").toLowerCase().includes(query) ||
    String(t.label_zh ?? "").toLowerCase().includes(query) ||
    String(t.label_en ?? "").toLowerCase().includes(query);

  const togglePlatform = (pid: string) => {
    const has = scope.platforms.includes(pid);
    onChange({
      platforms: has ? scope.platforms.filter((x) => x !== pid) : [...scope.platforms, pid],
      // 整個平台勾起來時，該平台的逐項勾選就是多餘的 —— 清掉，避免畫面上同一件事
      // 被記兩次（server 端 taskIds 優先於 platforms，留著會讓「取消整個平台」
      // 之後還殘留一堆看不見的指定）。
      taskIds: has
        ? scope.taskIds
        : scope.taskIds.filter((id) => (byPlatform.get(pid) ?? []).every((t) => t.id !== id)),
    });
  };

  const toggleTask = (tid: string) => {
    const has = scope.taskIds.includes(tid);
    onChange({
      platforms: scope.platforms,
      taskIds: has ? scope.taskIds.filter((x) => x !== tid) : [...scope.taskIds, tid],
    });
  };

  const totalSelected = scope.taskIds.length;

  return (
    <div className="rounded-xl border border-neutral-200">
      <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-neutral-900">
            {en ? "Where this voice applies" : "語調的應用範圍"}
          </p>
          <p className="text-[11.5px] text-neutral-500">
            {en
              ? "Tick a whole platform, or drill in and pick individual tasks. A task ticked individually always wins over a whole-platform tick."
              : "可以整個平台勾起來，也可以展開挑單一任務。單一任務的指定永遠優先於整個平台。"}
          </p>
        </div>
        <div className="relative shrink-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={en ? "Find a task" : "搜尋任務"}
            className="text-[12px] pl-7 pr-2 py-1.5 rounded-lg border border-neutral-200 w-[160px] focus:outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      {loading && (
        <p className="px-4 py-6 text-[12.5px] text-neutral-400">{en ? "Loading tasks…" : "載入任務清單…"}</p>
      )}

      <div className="max-h-[420px] overflow-y-auto">
        {PLATFORMS.map((pf) => {
          const rows = (byPlatform.get(pf.id) ?? []).filter(matches);
          if (rows.length === 0) return null;
          const wholePlatform = scope.platforms.includes(pf.id);
          const picked = rows.filter((t) => scope.taskIds.includes(t.id)).length;
          const expanded = open[pf.id] ?? !!query;
          return (
            <div key={pf.id} className="border-b border-neutral-100 last:border-b-0">
              <div className="px-4 py-2.5 flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={wholePlatform} onChange={() => togglePlatform(pf.id)} />
                  <span className="text-[13px] font-semibold text-neutral-800">{en ? pf.en : pf.zh}</span>
                </label>
                <span className="text-[11.5px] text-neutral-400">
                  {wholePlatform
                    ? (en ? `all ${rows.length} tasks` : `全部 ${rows.length} 個任務`)
                    : picked > 0
                      ? (en ? `${picked} of ${rows.length} picked` : `已選 ${picked} / ${rows.length}`)
                      : (en ? `${rows.length} tasks` : `${rows.length} 個任務`)}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [pf.id]: !expanded }))}
                  className="ml-auto text-[11.5px] text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-1"
                >
                  {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  {en ? "Tasks" : "展開任務"}
                </button>
              </div>

              {expanded && (
                <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-x-4">
                  {rows.map((t) => {
                    const checked = scope.taskIds.includes(t.id);
                    const conflict = !checked && ownerOf(t.id, t.platform);
                    return (
                      <label
                        key={t.id}
                        className="flex items-start gap-2 py-1.5 cursor-pointer select-none group"
                        title={t.id}
                      >
                        <input
                          type="checkbox" checked={checked} className="mt-[3px]"
                          onChange={() => toggleTask(t.id)}
                        />
                        <span className="min-w-0">
                          <span className="text-[12.5px] text-neutral-700 group-hover:text-neutral-900">
                            {(en ? (t.label_en ?? t.label) : (t.label_zh ?? t.label)) || t.id}
                          </span>
                          <span className="ml-1.5 text-[10.5px] text-neutral-400">
                            {en ? (TIER_EN[t.tier] ?? t.tier) : (TIER_ZH[t.tier] ?? t.tier)}
                          </span>
                          {wholePlatform && !checked && (
                            <span className="ml-1.5 text-[10.5px] text-neutral-400">
                              {en ? "· covered by platform" : "· 已被整個平台涵蓋"}
                            </span>
                          )}
                          {conflict && !wholePlatform && (
                            <span className="ml-1.5 text-[10.5px] text-amber-700">
                              {en ? `· currently ${conflict.name}` : `· 目前由「${conflict.name}」負責`}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-neutral-100 text-[11.5px] text-neutral-500">
        {scope.platforms.length === 0 && totalSelected === 0
          ? (en ? "Nothing selected — this persona will not be used by any task." : "尚未選任何範圍 — 這個人設不會被任何任務套用。")
          : (en
              ? `${scope.platforms.length} whole platform(s) + ${totalSelected} individual task(s)`
              : `整個平台 ${scope.platforms.length} 個 ＋ 單一任務 ${totalSelected} 個`)}
      </div>
    </div>
  );
}
