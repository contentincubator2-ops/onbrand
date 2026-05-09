/**
 * RunPage — independent route /run/:outputId
 *
 * Lives INSIDE ShellLayout (left rail + collapsible panel come from
 * the shell). The page itself renders 2 inner columns:
 *   [CENTER] mockup big card with toolbar
 *   [RIGHT]  contextual mode panel + publish actions
 *
 * The variant nav (情感版/理性版/數據版) that was a 3rd column is now
 * inline horizontal chips above the mockup — frees space for the
 * mockup to be as wide as possible (CJ feedback: '中間 mockup 都太
 * 小，被背景吃掉').
 *
 * Toolbar holds the 11 functions CJ wanted preserved:
 *   ✏️ 編輯  💬 對話  🖼️ 圖  📹 影  👥 agent×2
 *   🪄 重生  🎚️ 設定  📋 複製  💾 存
 *   ↻ 重跑  ✕ 關閉
 */
import React, { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Avatar, Button, Card, CardBody, Chip, Spinner, Textarea, Tooltip,
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClipboard, faClipboardCheck, faRotateRight, faXmark,
  faShare, faCalendarPlus, faEnvelope, faRocket, faFolderPlus,
  faChevronLeft,
} from "@fortawesome/free-solid-svg-icons";
import {
  Pencil, MessageCircle, Image as LucideImage, Video,
  Wand2, Sliders as LucideSliders, Save, Copy as LucideCopy,
} from "lucide-react";
import { trpc } from "../../lib/trpc";
import { showToastGlobal } from "../../components/ui/Toast";
import { PlatformMockup } from "../components/PlatformMockup";
import type { MockupVariant } from "../lib/inferMockup";
import { TRPCClientError } from "@trpc/client";

type Mode = "edit" | "chat" | "image" | "video" | "agent" | "regen" | "settings" | "publish";

interface VariantData {
  label: string;
  caption: string;
  hashtags?: string[];
  imageStyle?: string;
  imageUrl?: string | null;
  imageStatus?: string;
  qa?: any;
  extras?: any;
}

export default function RunPage() {
  const { outputId } = useParams<{ outputId: string }>();
  const navigate = useNavigate();
  const id = Number(outputId);

  const { data, isLoading, error } = trpc.output.getById.useQuery(
    { id },
    { enabled: !!id, refetchOnWindowFocus: false },
  );

  const [activeIdx, setActiveIdx] = useState(0);
  const [mode, setMode] = useState<Mode>("chat");
  const [focusedAgent, setFocusedAgent] = useState<"caption"|"image"|null>(null);
  const [editText, setEditText] = useState<string | null>(null);
  const [chatPrompt, setChatPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  /** Local override for variants — applied after save, mockup updates live. */
  const [overrides, setOverrides] = useState<Record<number, { caption: string }>>({});
  /** AI chat history per variant. */
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user"|"assistant"; content: string }>>([]);
  const [aiPreview, setAiPreview] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const updateMut = trpc.output.updateVariantCaption.useMutation({
    onSuccess: () => {
      showToastGlobal("已儲存");
      utils.output.getById.invalidate({ id });
    },
    onError: (e) => showToastGlobal(`儲存失敗：${e.message}`),
  });
  const refineMut = (trpc as any).quickTask?.refineCaption?.useMutation
    ? (trpc as any).quickTask.refineCaption.useMutation()
    : null;
  const emailMut = trpc.output.emailToTeam.useMutation({
    onSuccess: (r) => {
      if (r.ok) showToastGlobal(`已寄給 ${r.sentCount} 位收件人`);
      else showToastGlobal(`部分寄送失敗：${r.failures.join("; ")}`);
    },
    onError: (e) => showToastGlobal(`寄送失敗：${e.message}`),
  });
  const scheduleMut = trpc.output.scheduleIcs.useMutation({
    onSuccess: (r) => {
      // Trigger .ics download
      const blob = new Blob([r.ics], { type: "text/calendar;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(a.href);
      showToastGlobal("已產生 .ics — 拖進日曆 App 即可");
      utils.output.getById.invalidate({ id });
    },
    onError: (e) => showToastGlobal(`排程失敗：${e.message}`),
  });
  const statusMut = trpc.output.updateStatus.useMutation({
    onSuccess: () => {
      showToastGlobal("已存到 Mission");
      utils.output.getById.invalidate({ id });
    },
  });

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 24);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16); // local datetime-local format
  });

  const variants: VariantData[] = useMemo(() => {
    if (!data) return [];
    try {
      const parsed = JSON.parse(data.content);
      if (Array.isArray(parsed)) return parsed;
      if (parsed?.variants) return parsed.variants;
    } catch { /* ignore */ }
    return [{ label: "主版本", caption: data.content || "" }];
  }, [data]);

  // Apply local overrides so mockup reflects unsaved edits in real time
  const slide = useMemo(() => {
    const base = variants[activeIdx];
    if (!base) return base;
    const ov = overrides[activeIdx];
    return ov ? { ...base, caption: ov.caption } : base;
  }, [variants, activeIdx, overrides]);

  // Infer mockup variant. taskId prefix is the most reliable signal —
  // works even on old DB rows where workspace='other' / platform='other'.
  // Priority: taskId pattern > mission.workspace > output.platform.
  const mockupVariant: MockupVariant | null = useMemo(() => {
    if (!data) return null;

    const taskId = data.mission?.taskId ?? "";

    // ── Brand + Research → proposal-style ──
    if (taskId.startsWith("br-") || taskId.startsWith("rs-")) {
      const coverIds = ["br-30-tagline", "br-30-positioning", "br-30-elevator-pitch", "br-30-manifesto"];
      const personaIds = ["rs-30-persona-draft", "rs-30-journey-map", "rs-30-competitive-interview", "rs-30-synthesis-template"];
      const researchDocIds = [
        "rs-30-interview-guide", "rs-30-survey", "rs-30-jtbd-guide",
        "rs-30-usability-script", "rs-30-screener", "rs-30-consent-form",
      ];
      const format =
        coverIds.includes(taskId) ? "proposal-cover" :
        personaIds.includes(taskId) ? "persona-card" :
        researchDocIds.includes(taskId) ? "research-doc" :
        taskId.startsWith("rs-") ? "research-doc" :
        "proposal-spec";
      return { platform: "generic" as any, format: format as any, label: `generic:${format}` };
    }

    // ── Map taskId prefix → platform (most reliable for old runs) ──
    const idPrefixMap: Record<string, string> = {
      fb: "facebook", ig: "instagram", yt: "youtube", tt: "tiktok",
      li: "linkedin", em: "email", pr: "press",
    };
    const idPrefix = taskId.split("-")[0];

    // ── Map taskId pattern → format (postType detection from task name) ──
    const formatFromTaskId = (id: string): string => {
      // FB
      if (id.includes("ad-")) return "ad";
      if (id.includes("comment-reply") || id.includes("comment")) return "comment";
      if (id.includes("pinned")) return "pinned";
      if (id.includes("story")) return "story";
      if (id.includes("reel")) return "reel";
      if (id.includes("carousel")) return "carousel";
      if (id.includes("bio") || id.includes("profile")) return "profile";
      if (id.includes("live")) return "live";
      // YT
      if (id.includes("thumbnail")) return "video-card";
      if (id.includes("shorts")) return "shorts";
      if (id.includes("community")) return "community";
      if (id.startsWith("yt-")) return "watch";
      // LI
      if (id.includes("article")) return "article";
      if (id.includes("newsletter")) return "newsletter";
      if (id.includes("poll")) return "poll";
      if (id.includes("document")) return "document";
      // TT
      if (id.startsWith("tt-")) return "foryou";
      // Email
      if (id.startsWith("em-")) return "edm";
      // PR
      if (id.startsWith("pr-")) return "press-release";
      // Default for fb/ig
      return "feed";
    };

    const workspaceMap: Record<string, string> = {
      facebook: "facebook", instagram: "instagram", linkedin: "linkedin",
      youtube: "youtube", tiktok: "tiktok", threads: "threads",
      line: "line", email: "email", press: "press",
    };
    const ws = data.mission?.workspace as string | undefined;

    const platform = (
      idPrefixMap[idPrefix]
      ?? workspaceMap[ws ?? ""]
      ?? (data.platform && data.platform !== "other" ? data.platform : null)
      ?? "generic"
    ) as any;
    const format = formatFromTaskId(taskId) as any;

    return { platform, format, label: `${platform}:${format}` };
  }, [data]);

  if (!id || isNaN(id)) {
    return <div className="p-12 text-center text-default-500">無效的 run ID</div>;
  }
  if (isLoading) {
    return <div className="p-12 flex justify-center"><Spinner size="lg" /></div>;
  }
  if (error || !data) {
    return (
      <div className="p-12 flex flex-col items-center gap-3 text-default-500">
        <p>找不到這個 run（可能已被移除或無權限）</p>
        <Button variant="flat" onPress={() => navigate(-1)}>返回</Button>
      </div>
    );
  }
  // 2026-05-09 cleanup (CJ direction「乾淨一條路」): if metadata.taskId
  // is missing, this run was persisted by an old/buggy code path. Show
  // a loud error rather than papering over with generic:feed mockup.
  if (!data.mission?.taskId) {
    return (
      <div className="p-12 flex flex-col items-center gap-4 max-w-xl mx-auto">
        <div className="bg-danger-50 border-2 border-danger-300 rounded-lg p-6 w-full">
          <h3 className="text-danger-700 font-bold mb-2">⚠️ 此 run 缺少 taskId</h3>
          <p className="text-sm text-default-700 mb-3">
            這筆紀錄沒有 metadata.taskId，所以無法判斷該用哪個 mockup 樣板。
            這是舊版 recordTaskRun 的殘留資料 — 新跑的任務都會正確寫入。
          </p>
          <p className="text-tiny text-default-500 font-mono">
            output.id = {data.id} · mission.id = {data.mission?.id ?? "?"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="flat" onPress={() => navigate("/30s")}>跑一個新的 30s 任務</Button>
          <Button variant="light" onPress={() => navigate(-1)}>返回</Button>
        </div>
      </div>
    );
  }

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(slide?.caption ?? "");
      setCopied(true);
      showToastGlobal("已複製到剪貼簿");
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="px-4 py-3 max-w-[1500px] mx-auto">
      {/* Header removed 2026-05-09 (CJ): was overlapping with ShellLayout's
          global brand picker. ShellLayout already shows the current brand
          + tier nav. Tier chip + 重跑 + 關閉 moved into the toolbar below. */}

      {/* ─── Task label + status row (slim, non-overlapping) ────────── */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <p className="text-tiny text-default-500 truncate flex-1">
          {data.title || data.mission?.taskLabel || "(無標題)"}
        </p>
        {/* DEBUG (2026-05-09): show mockup variant + taskId so we can trace
            which mockup is being chosen. Remove after verification. */}
        <Chip size="sm" variant="flat" className="font-mono text-[10px]">
          {mockupVariant ? `${mockupVariant.platform}:${mockupVariant.format}` : "?"} · {data.mission?.taskId ?? "no-task"}
        </Chip>
        {data.mission?.tier && <Chip size="sm" variant="flat" color="secondary">{data.mission.tier}</Chip>}
        <Chip size="sm" variant="flat" color={data.status === "published" ? "success" : data.status === "scheduled" ? "warning" : "default"}>
          {data.status}
        </Chip>
      </div>

      {/* ─── Variant pills (horizontal) ─────────────────────────────── */}
      {variants.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[10px] text-default-500 mr-1">版本：</span>
          {variants.map((v, i) => (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`px-3 py-1 rounded-full text-tiny transition border ${
                i === activeIdx
                  ? "bg-secondary text-white border-secondary"
                  : "bg-white text-default-700 border-default-200 hover:border-secondary"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* ─── 2-COL: mockup big (no toolbar) + right tool panel ──────── */}
      <div className="grid grid-cols-[1fr_360px] gap-4 items-start">
        {/* CENTER: pure mockup, no toolbar above (CJ direction 2026-05-09) */}
        <section className="min-w-0 flex flex-col gap-3">
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.05)] ring-1 ring-black/5 overflow-hidden">
            {mockupVariant && slide && (
              <PlatformMockup
                variant={{ ...mockupVariant, label: `${mockupVariant.label} · ${slide.label}` }}
                title={data.title ?? ""}
                brief={""}
                brandName={data.brand?.name ?? ""}
                brandLogoUrl={data.brand?.logoUrl ?? null}
                liveCaption={slide.caption}
                liveHashtags={slide.hashtags}
                liveImageStyle={slide.imageStyle}
                liveImageUrl={slide.imageUrl ?? undefined}
                liveImageStatus={slide.imageStatus as any}
              />
            )}
          </div>
        </section>

        {/* RIGHT: toolbar (top) + mode panel + publish actions
            CJ direction 2026-05-09: 'toolbar 一道右方對話窗上面，當用戶選擇
            不同按鍵，在顯示出該功能' — toolbar is the tab bar for the panel */}
        <aside className="space-y-3 sticky top-2 self-start">
          {/* Toolbar — clicking a button switches mode + the panel below
              expands to show that tool. */}
          <div className="bg-white rounded-xl border border-default-200 shadow-sm">
            <div className="flex items-center gap-0.5 px-2 py-1.5 flex-wrap">
              <ToolbarBtn icon={Pencil}        label="直接編輯"      active={mode==="edit"}  onClick={() => setMode("edit")} />
              <ToolbarBtn icon={MessageCircle} label="跟 agent 對話" active={mode==="chat"}  onClick={() => setMode("chat")} />
              <ToolbarBtn icon={LucideImage}   label="改圖"          active={mode==="image"} onClick={() => setMode("image")} />
              <ToolbarBtn icon={Video}         label="改影片"        active={mode==="video"} onClick={() => setMode("video")} />
              <Divider />
              {/* Agent avatars — click to see that agent's thinking */}
              <Tooltip content="撰寫 agent — 看思考過程">
                <button
                  onClick={() => { setMode("agent"); setFocusedAgent("caption"); }}
                  className={`w-7 h-7 rounded-full overflow-hidden ring-1 transition ${mode==="agent" && focusedAgent==="caption" ? "ring-secondary ring-2" : "ring-default-200 hover:ring-secondary"}`}
                >
                  <Avatar src={`https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(data.metadata?.captionAgent ?? "Caption")}`} className="w-7 h-7" />
                </button>
              </Tooltip>
              <Tooltip content="視覺 agent — 看思考過程">
                <button
                  onClick={() => { setMode("agent"); setFocusedAgent("image"); }}
                  className={`w-7 h-7 rounded-full overflow-hidden ring-1 transition ${mode==="agent" && focusedAgent==="image" ? "ring-secondary ring-2" : "ring-default-200 hover:ring-secondary"}`}
                >
                  <Avatar src={`https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(data.metadata?.imageAgent ?? "Visual")}`} className="w-7 h-7" />
                </button>
              </Tooltip>
              <Divider />
              <ToolbarBtn icon={Wand2}         label="重生這段"       active={mode==="regen"}    onClick={() => setMode("regen")} />
              <ToolbarBtn icon={LucideSliders} label="參數"           active={mode==="settings"} onClick={() => setMode("settings")} />
              <Divider />
              <ToolbarBtn icon={LucideCopy}    label="複製文案"       onClick={onCopy} highlight={copied} />
              <ToolbarBtn icon={Save}          label="存到 Mission" active={mode==="publish"} onClick={() => setMode("publish")} />
              <Divider />
              <Tooltip content="重跑同任務" placement="bottom">
                <button
                  onClick={() => {
                    const tier = data.mission?.tier ?? "30s";
                    const taskId = data.mission?.taskId;
                    if (!taskId) { showToastGlobal("找不到原任務 ID"); return; }
                    navigate(`/${tier}?rerun=${id}`);
                  }}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-default-500 hover:bg-default-100 hover:text-default-800 transition"
                  aria-label="重跑"
                >
                  <FontAwesomeIcon icon={faRotateRight} className="text-tiny" />
                </button>
              </Tooltip>
              <Tooltip content="返回" placement="bottom">
                <button
                  onClick={() => navigate(-1)}
                  className="w-7 h-7 rounded-md flex items-center justify-center text-default-500 hover:bg-default-100 hover:text-default-800 transition"
                  aria-label="返回"
                >
                  <FontAwesomeIcon icon={faXmark} className="text-tiny" />
                </button>
              </Tooltip>
            </div>
          </div>
          <Card>
            <CardBody className="space-y-3">
              {mode === "chat" && (
                <>
                  <p className="text-tiny font-semibold">跟 agent 改文案</p>
                  <p className="text-[11px] text-default-500 leading-relaxed">
                    告訴 agent 你想怎麼調整：例如「結尾改成限時優惠」、「太囉嗦砍第二段」。
                  </p>
                  {chatHistory.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto bg-default-50 rounded-lg p-2">
                      {chatHistory.slice(-4).map((m, i) => (
                        <div key={i} className={`text-[11px] leading-relaxed ${m.role==="user" ? "text-default-900" : "text-secondary"}`}>
                          <span className="font-semibold mr-1">{m.role==="user"?"你":"AI"}：</span>
                          {m.content.slice(0, 180)}{m.content.length > 180 ? "…" : ""}
                        </div>
                      ))}
                    </div>
                  )}
                  <Textarea
                    placeholder="說明你想怎麼改…"
                    value={chatPrompt}
                    onChange={(e) => setChatPrompt(e.target.value)}
                    minRows={3}
                  />
                  {aiPreview && (
                    <div className="text-[11px] bg-secondary-50 border border-secondary-200 rounded-lg p-2 space-y-1.5">
                      <p className="font-semibold text-secondary-700">AI 改寫預覽</p>
                      <p className="whitespace-pre-wrap leading-relaxed text-default-800 max-h-32 overflow-y-auto">{aiPreview}</p>
                      <div className="flex gap-1.5 pt-1">
                        <Button size="sm" color="secondary"
                          isDisabled={updateMut.isPending}
                          onPress={() => {
                            setOverrides(o => ({ ...o, [activeIdx]: { caption: aiPreview } }));
                            updateMut.mutate({ id, variantIndex: activeIdx, caption: aiPreview });
                            setAiPreview(null);
                          }}
                        >採用</Button>
                        <Button size="sm" variant="flat" onPress={() => setAiPreview(null)}>放棄</Button>
                      </div>
                    </div>
                  )}
                  <Button
                    color="secondary" fullWidth
                    isDisabled={!chatPrompt.trim() || !refineMut || refineMut.isPending}
                    isLoading={refineMut?.isPending}
                    onPress={async () => {
                      if (!refineMut) { showToastGlobal("AI 改寫服務暫不可用"); return; }
                      try {
                        const r = await refineMut.mutateAsync({
                          currentCaption: slide?.caption ?? "",
                          userFeedback: chatPrompt,
                          brandId: data.mission?.brandId ?? undefined,
                          history: chatHistory,
                        });
                        if (r.ok) {
                          setChatHistory(h => [
                            ...h,
                            { role: "user", content: chatPrompt },
                            { role: "assistant", content: r.explanation || "(已改寫)" },
                          ]);
                          setAiPreview(r.rewritten);
                          setChatPrompt("");
                        } else {
                          showToastGlobal(`AI 改寫失敗：${r.error ?? "未知錯誤"}`);
                        }
                      } catch (e: any) {
                        showToastGlobal(`錯誤：${e.message ?? String(e)}`);
                      }
                    }}
                  >
                    送出修改
                  </Button>
                </>
              )}
              {mode === "edit" && (
                <>
                  <p className="text-tiny font-semibold">直接編輯</p>
                  <p className="text-[10px] text-default-500">
                    在這裡改文字，左邊 mockup 即時更新。
                  </p>
                  <Textarea
                    value={editText ?? slide?.caption ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditText(v);
                      // Live preview in mockup
                      setOverrides(o => ({ ...o, [activeIdx]: { caption: v } }));
                    }}
                    minRows={10}
                  />
                  <div className="flex gap-1.5">
                    <Button
                      color="secondary" fullWidth
                      isDisabled={editText == null || editText === (variants[activeIdx]?.caption ?? "") || updateMut.isPending}
                      isLoading={updateMut.isPending}
                      onPress={() => {
                        if (editText == null) return;
                        updateMut.mutate({ id, variantIndex: activeIdx, caption: editText });
                      }}
                    >儲存修改</Button>
                    <Button
                      variant="flat"
                      isDisabled={editText == null}
                      onPress={() => {
                        setEditText(null);
                        setOverrides(o => { const n = { ...o }; delete n[activeIdx]; return n; });
                      }}
                    >還原</Button>
                  </div>
                </>
              )}
              {mode === "image" && (
                <>
                  <p className="text-tiny font-semibold">改配圖</p>
                  <p className="text-[11px] text-default-500">
                    當前風格：{slide?.imageStyle || "(無 brief)"}
                  </p>
                  <Button variant="flat" fullWidth>重新產圖</Button>
                  <Button variant="flat" fullWidth>換風格方向</Button>
                </>
              )}
              {mode === "video" && (
                <>
                  <p className="text-tiny font-semibold">影片版本</p>
                  <p className="text-[11px] text-default-500">尚未產出影片</p>
                  <Button variant="flat" fullWidth>從這篇生影片</Button>
                </>
              )}
              {mode === "agent" && (
                <>
                  <p className="text-tiny font-semibold flex items-center gap-2">
                    <Avatar
                      src={`https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(focusedAgent==="image" ? (data.metadata?.imageAgent ?? "Visual") : (data.metadata?.captionAgent ?? "Caption"))}`}
                      className="w-7 h-7"
                    />
                    {focusedAgent === "image"
                      ? `${data.metadata?.imageAgent ?? "視覺 agent"} — 思考過程`
                      : `${data.metadata?.captionAgent ?? "撰寫 agent"} — 思考過程`}
                  </p>
                  <div className="bg-default-50 rounded-lg p-2.5 text-[11px] leading-relaxed space-y-2 max-h-72 overflow-y-auto">
                    {focusedAgent === "image" ? (
                      <>
                        <p className="font-semibold">配圖風格 brief：</p>
                        <p className="whitespace-pre-wrap text-default-800">
                          {slide?.imageStyle || "（這個任務沒有配圖 brief）"}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold">寫作流程：</p>
                        <ol className="list-decimal pl-4 space-y-1 text-default-700">
                          <li>讀品牌 persona + 任務 brief</li>
                          <li>套用市場語氣 master + agent 自身方法論</li>
                          <li>產 {variants.length} 個變體（{variants.map(v => v.label).filter(Boolean).slice(0,3).join(" / ")}{variants.length > 3 ? "..." : ""}）</li>
                          <li>QA 檢查每個 variant 結構 / 字數 / hashtag</li>
                        </ol>
                        <p className="font-semibold mt-2">本變體輸出：</p>
                        <p className="whitespace-pre-wrap text-default-800">
                          {(slide?.caption ?? "").slice(0, 400)}{(slide?.caption?.length ?? 0) > 400 ? "…" : ""}
                        </p>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-default-400 leading-relaxed">
                    💡 進階 agent 思考紀錄（推理 token / 重試紀錄 / 工具呼叫）即將推出。
                  </p>
                </>
              )}
              {mode === "regen" && (
                <>
                  <p className="text-tiny font-semibold">重生這段文案</p>
                  <p className="text-[11px] text-default-500 leading-relaxed">
                    讓同一位 agent 重新寫一次當前 variant（保留品牌 + 任務設定）。
                  </p>
                  <Button color="secondary" fullWidth isDisabled>立即重生（即將推出）</Button>
                  <p className="text-[10px] text-default-400">
                    將呼叫 {data.metadata?.captionAgent ?? "撰寫 agent"} 重新產出當前變體，原版會自動歸檔。
                  </p>
                </>
              )}
              {mode === "settings" && (
                <>
                  <p className="text-tiny font-semibold">參數設定</p>
                  <div className="text-[11px] space-y-1.5 text-default-700">
                    <div className="flex justify-between"><span>任務</span><span className="font-mono text-tiny">{data.mission?.taskId ?? "—"}</span></div>
                    <div className="flex justify-between"><span>Tier</span><span>{data.mission?.tier ?? "—"}</span></div>
                    <div className="flex justify-between"><span>變體數</span><span>{variants.length}</span></div>
                    <div className="flex justify-between"><span>產出延遲</span><span>{data.metadata?.latencyMs ? `${(data.metadata.latencyMs/1000).toFixed(1)}s` : "—"}</span></div>
                    <div className="flex justify-between"><span>撰寫 agent</span><span>{data.metadata?.captionAgent ?? "—"}</span></div>
                    <div className="flex justify-between"><span>視覺 agent</span><span>{data.metadata?.imageAgent ?? "—"}</span></div>
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2">
              <p className="text-tiny font-semibold">發布到</p>
              <Button color="primary" fullWidth startContent={<FontAwesomeIcon icon={faRocket} />} isDisabled>
                直接發 Facebook（需綁 Meta Token）
              </Button>
              <Button
                variant="flat" fullWidth
                startContent={<FontAwesomeIcon icon={faCalendarPlus} />}
                onPress={() => setScheduleDialogOpen(true)}
              >排程到日曆（.ics）</Button>
              <Button
                variant="flat" fullWidth
                startContent={<FontAwesomeIcon icon={faEnvelope} />}
                onPress={() => setEmailDialogOpen(true)}
              >寄給團隊</Button>
              <Button
                variant="flat" fullWidth
                startContent={<FontAwesomeIcon icon={faFolderPlus} />}
                isDisabled={data.status === "approved" || statusMut.isPending}
                isLoading={statusMut.isPending}
                onPress={() => statusMut.mutate({ id, status: "approved" })}
              >{data.status === "approved" ? "✓ 已存 Mission" : "存到 Mission"}</Button>
              <Button
                variant="flat" fullWidth
                startContent={<FontAwesomeIcon icon={copied ? faClipboardCheck : faClipboard} />}
                onPress={onCopy}
              >
                {copied ? "已複製" : "複製文字"}
              </Button>
              <Button
                variant="light" fullWidth size="sm"
                startContent={<FontAwesomeIcon icon={faShare} />}
                onPress={() => {
                  navigator.clipboard.writeText(window.location.href);
                  showToastGlobal("已複製此頁網址");
                }}
              >
                複製此頁網址
              </Button>
            </CardBody>
          </Card>
        </aside>
      </div>

      {/* ── EMAIL DIALOG ────────────────────────────────────────────── */}
      <Modal isOpen={emailDialogOpen} onClose={() => setEmailDialogOpen(false)} size="md">
        <ModalContent>
          <ModalHeader className="text-base">寄給團隊 review</ModalHeader>
          <ModalBody className="space-y-3">
            <Input
              label="收件人 email（用逗號分隔多個）"
              placeholder="cj@sowork.ai, anna@client.com"
              value={emailRecipients}
              onChange={(e) => setEmailRecipients(e.target.value)}
            />
            <Textarea
              label="附加訊息（可選）"
              placeholder="請幫我看一下這版本的 hook 是否打到目標族群"
              value={emailNote}
              onChange={(e) => setEmailNote(e.target.value)}
              minRows={3}
            />
            <p className="text-tiny text-default-500">寄出時會附上完整 caption + 品牌資訊。</p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEmailDialogOpen(false)}>取消</Button>
            <Button
              color="primary"
              isLoading={emailMut.isPending}
              isDisabled={!emailRecipients.trim()}
              onPress={() => {
                const recipients = emailRecipients.split(",").map(s => s.trim()).filter(Boolean);
                if (recipients.length === 0) return;
                emailMut.mutate({
                  id, variantIndex: activeIdx,
                  recipients, note: emailNote || undefined,
                }, {
                  onSuccess: () => setEmailDialogOpen(false),
                });
              }}
            >寄出</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── SCHEDULE DIALOG ─────────────────────────────────────────── */}
      <Modal isOpen={scheduleDialogOpen} onClose={() => setScheduleDialogOpen(false)} size="sm">
        <ModalContent>
          <ModalHeader className="text-base">排程發布時間</ModalHeader>
          <ModalBody className="space-y-3">
            <Input
              type="datetime-local"
              label="發布時間"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
            />
            <p className="text-tiny text-default-500">
              產生 .ics 檔下載 — 拖進 Google Calendar / Outlook / Apple Calendar 即可。
              這個 run 也會在系統內標記為「已排程」。
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setScheduleDialogOpen(false)}>取消</Button>
            <Button
              color="primary"
              isLoading={scheduleMut.isPending}
              onPress={() => {
                scheduleMut.mutate({
                  id, variantIndex: activeIdx,
                  scheduledAt: new Date(scheduleAt).toISOString(),
                  durationMinutes: 30,
                }, {
                  onSuccess: () => setScheduleDialogOpen(false),
                });
              }}
            >下載 .ics</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-default-200 mx-1" />;
}

function ToolbarBtn({
  icon: Icon, label, active, highlight, onClick,
}: {
  icon: any; label: string; active?: boolean; highlight?: boolean; onClick?: () => void;
}) {
  return (
    <Tooltip content={label} placement="bottom">
      <button
        onClick={onClick}
        className={`w-7 h-7 rounded-md flex items-center justify-center transition ${
          active
            ? "bg-secondary/15 text-secondary"
            : highlight
              ? "bg-success-100 text-success-700"
              : "text-default-500 hover:bg-default-100 hover:text-default-800"
        }`}
        aria-label={label}
      >
        <Icon size={14} strokeWidth={1.75} />
      </button>
    </Tooltip>
  );
}
