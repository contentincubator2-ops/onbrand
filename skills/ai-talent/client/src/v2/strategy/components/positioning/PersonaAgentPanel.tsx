/**
 * PersonaAgentPanel — 人設 Agent tile (策略 rail's 8th tab, cat=persona).
 *
 * 2026-08-21 (CJ「加一個人設的task tray...用戶可以自己新創agent，自己命名，
 * 並且決定這個Agent語調的應用範圍...訓練過程顯示進度條，然後，用戶可以按
 * 不同的AGENT試寫看看品牌的文案。並且選擇應用範圍」):
 *   - 用戶新增一個人設 Agent：命名 + 貼文字 / 貼文章連結 / 貼影音連結
 *     （v1 不做檔案上傳 — 影音連結目前僅支援有逐字幕的 YouTube 連結）。
 *   - 訓練在背景跑，卡片顯示進度條（抓取素材 → 生成人設 → 生成 SKILL）。
 *   - 訓練完成後可勾選「應用範圍」（沿用 AI 指令庫的 8 個平台），並可用
 *     這個 Agent 的語氣試寫一篇貼文（試寫結果可直接複製使用）。
 */
import React, { useState } from "react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { showToastGlobal } from "../../../../components/ui/Toast";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook, faInstagram, faTiktok, faThreads } from "@fortawesome/free-brands-svg-icons";
import {
  faMicrophone, faPlus, faXmark, faTrash, faWandMagicSparkles,
  faEnvelope, faCopy, faCheck, faRotateRight,
} from "@fortawesome/free-solid-svg-icons";
import CloudFilePicker, { type CloudFileSource } from "./CloudFilePicker";

// 2026-09-29（CJ：內容通路只剩 FB／IG／TikTok／電子報／官網）：應用範圍拿掉
// YouTube／LinkedIn／Press；agent.scope 裡既有的舊值不刪，只是不顯示。
const PLATFORMS: Array<{ id: string; label: string; icon: any; tone: string }> = [
  { id: "facebook",  label: "Facebook",  icon: faFacebook,  tone: "#1877F2" },
  { id: "instagram", label: "Instagram", icon: faInstagram, tone: "#E1306C" },
  { id: "threads",   label: "Threads",   icon: faThreads,   tone: "#000000" },
  { id: "tiktok",    label: "TikTok",    icon: faTiktok,    tone: "#000000" },
  { id: "email",     label: "EDM",       icon: faEnvelope,  tone: "#0EA5E9" },
];

const STEP_LABELS_ZH = ["抓取素材", "生成人設", "生成 SKILL"];
const STEP_LABELS_EN = ["Gathering sources", "Generating persona", "Generating skill"];

type PersonaAgent = {
  id: string;
  name: string;
  status: "training" | "ready" | "failed";
  currentStep: number;
  totalSteps: number;
  lastError: string | null;
  sources: { texts: string[]; articleUrls: string[]; videoUrls: string[]; cloudFiles: CloudFileSource[] };
  sourceSummary: string;
  persona: string;
  skill: string;
  scope: string[];
  createdAt: string;
};

function ProgressBar({ current, total, en }: { current: number; total: number; en: boolean }) {
  const pct = Math.max(4, Math.round((current / Math.max(1, total)) * 100));
  const labels = en ? STEP_LABELS_EN : STEP_LABELS_ZH;
  const stepLabel = labels[Math.min(current, labels.length - 1)] ?? labels[0];
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-default-600">{en ? "Training…" : "訓練中…"} {stepLabel}</span>
        <span className="text-[12px] text-default-400">{current}/{total}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-default-100 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "#C2410C" }} />
      </div>
    </div>
  );
}

/** Shared "list of text/link rows with add/remove" control — used by both
 *  the initial NewAgentForm and AddSourcesPanel's "加入更多素材" follow-up. */
function renderRowInput(
  list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>,
  placeholder: string, en: boolean, multiline?: boolean,
) {
  const setAt = (l: string[], i: number, v: string) => l.map((x, idx) => (idx === i ? v : x));
  const addRow = () => setter((l) => [...l, ""]);
  const removeRow = (i: number) => setter((l) => (l.length <= 1 ? [""] : l.filter((_, idx) => idx !== i)));
  return (
    <div className="space-y-2">
      {list.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          {multiline ? (
            <textarea
              value={v}
              onChange={(e) => setter((l) => setAt(l, i, e.target.value))}
              placeholder={placeholder}
              rows={3}
              className="flex-1 text-xs border border-default-200 rounded-lg p-2.5 resize-y focus:outline-none focus:border-orange-400"
            />
          ) : (
            <input
              value={v}
              onChange={(e) => setter((l) => setAt(l, i, e.target.value))}
              placeholder={placeholder}
              className="flex-1 text-xs border border-default-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
            />
          )}
          <button onClick={() => removeRow(i)} className="mt-1 text-default-300 hover:text-danger-500 shrink-0">
            <FontAwesomeIcon icon={faXmark} style={{ fontSize: 12 }} />
          </button>
        </div>
      ))}
      <button onClick={addRow} className="text-[12px] font-medium text-default-500 hover:text-orange-600 flex items-center gap-1">
        <FontAwesomeIcon icon={faPlus} style={{ fontSize: 12 }} /> {en ? "Add another" : "再加一個"}
      </button>
    </div>
  );
}

function NewAgentForm({ brandId, onDone }: { brandId: number; onDone: () => void }) {
  const { lang } = useLang();
  const en = lang === "en";
  const utils = trpc.useUtils();
  const createMut = (trpc as any).personaAgent?.create?.useMutation?.();

  const [name, setName] = useState("");
  const [texts, setTexts] = useState<string[]>([""]);
  const [articleUrls, setArticleUrls] = useState<string[]>([""]);
  const [videoUrls, setVideoUrls] = useState<string[]>([""]);
  const [cloudFiles, setCloudFiles] = useState<CloudFileSource[]>([]);
  const [scope, setScope] = useState<Set<string>>(new Set());

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) { showToastGlobal(en ? "Name this agent first" : "請先為這個 Agent 命名"); return; }
    const cleanTexts = texts.map((t) => t.trim()).filter((t) => t.length >= 5);
    const cleanArticles = articleUrls.map((t) => t.trim()).filter(Boolean);
    const cleanVideos = videoUrls.map((t) => t.trim()).filter(Boolean);
    if (cleanTexts.length === 0 && cleanArticles.length === 0 && cleanVideos.length === 0 && cloudFiles.length === 0) {
      showToastGlobal(en ? "Add at least one text, article link, video link, or cloud file" : "請至少提供一段文字、一個文章連結、一個影音連結，或一個雲端檔案");
      return;
    }
    createMut?.mutate?.(
      { brandId, name: trimmedName, sources: { texts: cleanTexts, articleUrls: cleanArticles, videoUrls: cleanVideos, cloudFiles }, scope: Array.from(scope) },
      {
        onSuccess: (r: any) => {
          if (r?.ok) {
            showToastGlobal(en ? "✓ Training started" : "✓ 開始訓練", "success");
            utils.personaAgent?.list?.invalidate?.();
            onDone();
          } else showToastGlobal(r?.error ?? (en ? "Failed to start" : "建立失敗，請再試一次"));
        },
        onError: () => showToastGlobal(en ? "Failed to start" : "建立失敗，請再試一次"),
      },
    );
  };

  const rowInput = (list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>, placeholder: string, multiline?: boolean) =>
    renderRowInput(list, setter, placeholder, en, multiline);

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-5 mb-6">
      <div className="mb-4">
        <label className="text-xs font-semibold text-default-700 mb-1.5 block">{en ? "Agent name" : "Agent 名稱"}</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={en ? "e.g. Founder's voice" : "例：創辦人語氣"}
          className="w-full text-sm border border-default-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-400"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <div>
          <label className="text-xs font-semibold text-default-700 mb-1.5 block">{en ? "Text samples" : "文字素材"}</label>
          {rowInput(texts, setTexts, en ? "Paste a real post / transcript / article…" : "貼上真實貼文 / 逐字稿 / 文章原文…", true)}
        </div>
        <div>
          <label className="text-xs font-semibold text-default-700 mb-1.5 block">{en ? "Article links" : "文章連結"}</label>
          {rowInput(articleUrls, setArticleUrls, "https://…")}
        </div>
        <div>
          <label className="text-xs font-semibold text-default-700 mb-1.5 block">
            {en ? "Video links" : "影音連結"}
            <span className="ml-1 text-[12px] font-normal text-default-400">{en ? "(YouTube transcript only)" : "（目前僅支援 YouTube 逐字稿）"}</span>
          </label>
          {rowInput(videoUrls, setVideoUrls, "https://youtube.com/watch?v=…")}
        </div>
      </div>

      <div className="mb-4">
        <label className="text-xs font-semibold text-default-700 mb-1.5 block">
          {en ? "Cloud video/audio files" : "雲端影音檔案"}
          <span className="ml-1 text-[12px] font-normal text-default-400">{en ? "(no captions needed — real speech-to-text)" : "（不需要字幕，直接語音轉文字）"}</span>
        </label>
        <CloudFilePicker
          brandId={brandId}
          sources={cloudFiles}
          onAdd={(f) => setCloudFiles((l) => (l.some((x) => x.provider === f.provider && x.fileId === f.fileId) ? l : [...l, f]))}
          onRemove={(key) => setCloudFiles((l) => l.filter((x) => `${x.provider}:${x.fileId}` !== key))}
        />
      </div>

      <div className="mb-4">
        <label className="text-xs font-semibold text-default-700 mb-1.5 block">
          {en ? "Scope of application" : "應用範圍"}
          <span className="ml-1 text-[12px] font-normal text-default-400">{en ? "(optional — can set after training)" : "（選填，訓練完成後也可再設定）"}</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const on = scope.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => setScope((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                  on ? "border-default-900 bg-default-900 text-white" : "border-default-200 bg-white text-default-600 hover:border-default-400"
                }`}
              >
                <FontAwesomeIcon icon={p.icon} style={{ color: on ? "#fff" : p.tone, fontSize: 12 }} />
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onDone} className="text-xs font-medium text-default-500 px-3 py-2">{en ? "Cancel" : "取消"}</button>
        <button
          onClick={submit}
          disabled={createMut?.isPending}
          className="text-xs font-semibold px-4 py-2 rounded-full text-white transition flex items-center gap-1.5"
          style={{ background: createMut?.isPending ? "#FDBA74" : "#F97316" }}
        >
          <FontAwesomeIcon icon={faWandMagicSparkles} style={{ fontSize: 12 }} />
          {createMut?.isPending ? (en ? "Starting…" : "建立中…") : (en ? "Start training" : "開始訓練")}
        </button>
      </div>
    </div>
  );
}

/** 加入更多素材 — an agent isn't a one-shot snapshot; keep feeding it more
 *  of the same person's material and it retrains from the merged set.
 *  2026-08-21 (CJ「Delphi.ai 請直接學習它的流程」— Delphi's "Sync Your
 *  Knowledge" step keeps evolving the Digital Mind as content is added,
 *  rather than a single upload at creation time). */
function AddSourcesPanel({ brandId, agentId, onDone }: { brandId: number; agentId: string; onDone: () => void }) {
  const { lang } = useLang();
  const en = lang === "en";
  const utils = trpc.useUtils();
  const addMut = (trpc as any).personaAgent?.addSources?.useMutation?.();

  const [texts, setTexts] = useState<string[]>([""]);
  const [articleUrls, setArticleUrls] = useState<string[]>([""]);
  const [videoUrls, setVideoUrls] = useState<string[]>([""]);
  const [cloudFiles, setCloudFiles] = useState<CloudFileSource[]>([]);

  const submit = () => {
    const cleanTexts = texts.map((t) => t.trim()).filter((t) => t.length >= 5);
    const cleanArticles = articleUrls.map((t) => t.trim()).filter(Boolean);
    const cleanVideos = videoUrls.map((t) => t.trim()).filter(Boolean);
    if (cleanTexts.length === 0 && cleanArticles.length === 0 && cleanVideos.length === 0 && cloudFiles.length === 0) {
      showToastGlobal(en ? "Add at least one new source" : "請至少提供一筆新素材");
      return;
    }
    addMut?.mutate?.(
      { brandId, id: agentId, sources: { texts: cleanTexts, articleUrls: cleanArticles, videoUrls: cleanVideos, cloudFiles } },
      {
        onSuccess: (r: any) => {
          if (r?.ok) { showToastGlobal(en ? "✓ Retraining with new material" : "✓ 已加入，重新訓練中", "success"); utils.personaAgent?.list?.invalidate?.(); onDone(); }
          else showToastGlobal(r?.error ?? (en ? "Failed to add" : "加入失敗，請再試一次"));
        },
        onError: () => showToastGlobal(en ? "Failed to add" : "加入失敗，請再試一次"),
      },
    );
  };

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3.5 space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-[12px] font-semibold text-default-600 mb-1 block">{en ? "Text" : "文字"}</label>
          {renderRowInput(texts, setTexts, en ? "New text sample…" : "新的文字素材…", en, true)}
        </div>
        <div>
          <label className="text-[12px] font-semibold text-default-600 mb-1 block">{en ? "Article link" : "文章連結"}</label>
          {renderRowInput(articleUrls, setArticleUrls, "https://…", en)}
        </div>
        <div>
          <label className="text-[12px] font-semibold text-default-600 mb-1 block">{en ? "Video link" : "影音連結"}</label>
          {renderRowInput(videoUrls, setVideoUrls, "https://youtube.com/watch?v=…", en)}
        </div>
      </div>
      <div>
        <label className="text-[12px] font-semibold text-default-600 mb-1 block">{en ? "Cloud file" : "雲端檔案"}</label>
        <CloudFilePicker
          brandId={brandId}
          sources={cloudFiles}
          onAdd={(f) => setCloudFiles((l) => (l.some((x) => x.provider === f.provider && x.fileId === f.fileId) ? l : [...l, f]))}
          onRemove={(key) => setCloudFiles((l) => l.filter((x) => `${x.provider}:${x.fileId}` !== key))}
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onDone} className="text-[12px] font-medium text-default-500 px-3 py-1.5">{en ? "Cancel" : "取消"}</button>
        <button
          onClick={submit}
          disabled={addMut?.isPending}
          className="text-[12px] font-semibold px-3.5 py-1.5 rounded-full text-white transition"
          style={{ background: addMut?.isPending ? "#FDBA74" : "#F97316" }}
        >
          {addMut?.isPending ? (en ? "Adding…" : "加入中…") : (en ? "Add & retrain" : "加入並重新訓練")}
        </button>
      </div>
    </div>
  );
}

function AgentCard({ brandId, agent }: { brandId: number; agent: PersonaAgent }) {
  const { lang } = useLang();
  const en = lang === "en";
  const utils = trpc.useUtils();
  const updateMut = (trpc as any).personaAgent?.update?.useMutation?.();
  const removeMut = (trpc as any).personaAgent?.remove?.useMutation?.();
  const retrainMut = (trpc as any).personaAgent?.retrain?.useMutation?.();
  const draftMut = (trpc as any).personaAgent?.testDraft?.useMutation?.();

  const [expanded, setExpanded] = useState(false);
  const [addingSources, setAddingSources] = useState(false);
  const [scope, setScope] = useState<Set<string>>(new Set(agent.scope));
  const [draftPlatform, setDraftPlatform] = useState<string>(
    agent.scope.find((id) => PLATFORMS.some((p) => p.id === id)) ?? "facebook",
  );
  const [draftTopic, setDraftTopic] = useState("");
  const [draftResult, setDraftResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  React.useEffect(() => { setScope(new Set(agent.scope)); }, [agent.scope.join(",")]);

  const toggleScope = (id: string) => {
    const next = new Set(scope);
    if (next.has(id)) next.delete(id); else next.add(id);
    setScope(next);
    updateMut?.mutate?.({ brandId, id: agent.id, scope: Array.from(next) }, {
      onSuccess: () => utils.personaAgent?.list?.invalidate?.(),
    });
  };

  const runDraft = () => {
    if (!draftTopic.trim()) { showToastGlobal(en ? "Give it a topic first" : "請先填一個主題"); return; }
    setDraftResult(null);
    draftMut?.mutate?.({ brandId, id: agent.id, platform: draftPlatform, topic: draftTopic.trim() }, {
      onSuccess: (r: any) => {
        if (r?.ok) setDraftResult(r.draft);
        else showToastGlobal(r?.error ?? (en ? "Draft failed" : "試寫失敗，請再試一次"));
      },
      onError: () => showToastGlobal(en ? "Draft failed" : "試寫失敗，請再試一次"),
    });
  };

  const copyDraft = async () => {
    if (!draftResult) return;
    try {
      await navigator.clipboard.writeText(draftResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard unavailable — no-op */ }
  };

  return (
    <div className="rounded-2xl border border-default-200 bg-white overflow-hidden mb-4">
      <div className="px-5 py-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: agent.status === "ready" ? "#F97316" : agent.status === "failed" ? "#DC2626" : "#A8A29E" }}>
            <FontAwesomeIcon icon={faMicrophone} style={{ color: "#fff", fontSize: 13 }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-default-900 truncate">{agent.name}</h3>
              {agent.status === "ready" && <span className="text-[12px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{en ? "Ready" : "已完成"}</span>}
              {agent.status === "failed" && <span className="text-[12px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">{en ? "Failed" : "失敗"}</span>}
            </div>
            {agent.status === "ready" && agent.sourceSummary && (
              <p className="text-[12px] text-default-400 mt-0.5">{agent.sourceSummary}</p>
            )}
            {agent.status === "failed" && agent.lastError && (
              <p className="text-[12px] text-danger-500 mt-0.5">{agent.lastError}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {agent.status === "failed" && (
            <button
              onClick={() => retrainMut?.mutate?.({ brandId, id: agent.id }, { onSuccess: () => utils.personaAgent?.list?.invalidate?.() })}
              disabled={retrainMut?.isPending}
              className="text-default-400 hover:text-orange-600 p-1.5"
              title={en ? "Retry" : "重試"}
            >
              <FontAwesomeIcon icon={faRotateRight} style={{ fontSize: 13 }} />
            </button>
          )}
          <button
            onClick={() => {
              if (!window.confirm(en ? `Delete "${agent.name}"?` : `刪除「${agent.name}」這個 Agent？`)) return;
              removeMut?.mutate?.({ brandId, id: agent.id }, { onSuccess: () => utils.personaAgent?.list?.invalidate?.() });
            }}
            className="text-default-300 hover:text-danger-500 p-1.5"
            title={en ? "Delete" : "刪除"}
          >
            <FontAwesomeIcon icon={faTrash} style={{ fontSize: 12 }} />
          </button>
        </div>
      </div>

      {agent.status === "training" && (
        <div className="px-5 pb-4">
          <ProgressBar current={agent.currentStep} total={agent.totalSteps} en={en} />
        </div>
      )}

      {agent.status === "ready" && (
        <>
          <div className="px-5 pb-3 flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => {
              const on = scope.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleScope(p.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[12px] font-medium transition ${
                    on ? "border-default-900 bg-default-900 text-white" : "border-default-200 bg-white text-default-500 hover:border-default-400"
                  }`}
                >
                  <FontAwesomeIcon icon={p.icon} style={{ color: on ? "#fff" : p.tone, fontSize: 12 }} />
                  {p.label}
                </button>
              );
            })}
          </div>

          <button onClick={() => setExpanded((v) => !v)} className="w-full px-5 py-2.5 text-left text-xs font-medium text-default-500 hover:text-default-700 border-t border-default-100 flex items-center justify-between">
            <span>{expanded ? (en ? "Hide persona & skill / test draft" : "收起人設、SKILL 與試寫") : (en ? "View persona & skill / test draft" : "查看人設、SKILL，並試寫")}</span>
            <span>{expanded ? "▾" : "▸"}</span>
          </button>

          {expanded && (
            <div className="px-5 pb-5 border-t border-default-100 pt-4 space-y-4">
              <div>
                <div className="text-[12px] font-bold uppercase tracking-widest text-default-400 mb-1.5">{en ? "Persona" : "人設"}</div>
                <p className="text-xs text-default-700 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto rounded-lg bg-default-50 p-3">{agent.persona}</p>
              </div>
              <div>
                <div className="text-[12px] font-bold uppercase tracking-widest text-default-400 mb-1.5">SKILL</div>
                <p className="text-xs text-default-700 leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto rounded-lg bg-default-50 p-3">{agent.skill}</p>
              </div>

              <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3.5">
                <div className="text-[12px] font-semibold text-default-700 mb-2">{en ? "Test-draft with this agent" : "用這個 Agent 試寫"}</div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <select
                    value={draftPlatform}
                    onChange={(e) => setDraftPlatform(e.target.value)}
                    className="text-xs border border-default-200 rounded-lg px-2 py-1.5 bg-white"
                  >
                    {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <input
                    value={draftTopic}
                    onChange={(e) => setDraftTopic(e.target.value)}
                    placeholder={en ? "Topic for this draft…" : "這篇文案的主題…"}
                    className="flex-1 min-w-[160px] text-xs border border-default-200 rounded-lg px-3 py-1.5"
                  />
                  <button
                    onClick={runDraft}
                    disabled={draftMut?.isPending}
                    className="text-xs font-semibold px-3.5 py-1.5 rounded-full text-white transition"
                    style={{ background: draftMut?.isPending ? "#FDBA74" : "#F97316" }}
                  >
                    {draftMut?.isPending ? (en ? "Writing…" : "試寫中…") : (en ? "Test draft" : "試寫")}
                  </button>
                </div>
                {draftResult && (
                  <div className="rounded-lg bg-white border border-default-200 p-3 mt-2">
                    <p className="text-xs text-default-800 leading-relaxed whitespace-pre-wrap">{draftResult}</p>
                    <button onClick={copyDraft} className="mt-2 text-[12px] font-medium text-default-500 hover:text-orange-600 flex items-center gap-1">
                      <FontAwesomeIcon icon={copied ? faCheck : faCopy} style={{ fontSize: 12 }} />
                      {copied ? (en ? "Copied" : "已複製") : (en ? "Copy" : "複製")}
                    </button>
                  </div>
                )}
              </div>

              {addingSources ? (
                <AddSourcesPanel brandId={brandId} agentId={agent.id} onDone={() => setAddingSources(false)} />
              ) : (
                <button
                  onClick={() => setAddingSources(true)}
                  className="text-[12px] font-medium text-default-500 hover:text-orange-600 flex items-center gap-1.5"
                >
                  <FontAwesomeIcon icon={faPlus} style={{ fontSize: 12 }} /> {en ? "Add more sources & retrain" : "加入更多素材並重新訓練"}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PersonaAgentPanel({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  const [creating, setCreating] = useState(false);

  const listQ = (trpc as any).personaAgent?.list?.useQuery?.(
    { brandId: brandId ?? 0 },
    { enabled: !!brandId, refetchInterval: (data: any) => (Array.isArray(data) && data.some((a: any) => a.status === "training") ? 3000 : false) },
  );
  const agents: PersonaAgent[] = listQ?.data ?? [];

  if (!brandId) {
    return <div className="p-8 text-center text-default-500">{en ? "Pick a brand first" : "請先選擇品牌"}</div>;
  }

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#F97316" }}>
              <FontAwesomeIcon icon={faMicrophone} style={{ color: "#fff", fontSize: 14 }} />
            </div>
            <h1 className="text-2xl font-semibold text-default-900">{en ? "Persona agents" : "人設 Agent"}</h1>
          </div>
          <p className="text-sm text-default-500">
            {en
              ? "Train a custom agent from a specific person's real words — pasted text, article links, YouTube links, or a Google Drive/OneDrive video/audio file. Each agent can be scoped to specific platforms, used to draft in that voice, and keeps evolving as you add more material later."
              : "用某個真實的人的文字、文章連結、YouTube 連結，或 Google Drive／OneDrive 影音檔案，訓練出一個專屬 Agent。訓練完成後可指定應用範圍（平台）、用這個 Agent 的語氣試寫文案，之後也能持續加入更多素材讓它越來越像本人。"}
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="text-xs font-semibold px-4 py-2.5 rounded-full text-white transition flex items-center gap-1.5 shrink-0"
            style={{ background: "#F97316" }}
          >
            <FontAwesomeIcon icon={faPlus} style={{ fontSize: 12 }} />
            {en ? "New persona agent" : "新增人設 Agent"}
          </button>
        )}
      </div>

      {creating && <NewAgentForm brandId={brandId} onDone={() => setCreating(false)} />}

      {agents.length === 0 && !creating ? (
        <div className="text-center py-16 text-default-400 text-sm">
          {en ? "No persona agents yet — create one above." : "還沒有任何人設 Agent，點右上角新增一個。"}
        </div>
      ) : (
        agents.slice().reverse().map((a) => <AgentCard key={a.id} brandId={brandId} agent={a} />)
      )}
    </div>
  );
}
