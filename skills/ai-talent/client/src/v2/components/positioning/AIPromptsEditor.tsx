/**
 * AIPromptsEditor — the AI 指令庫 tile.
 *
 * Per-platform prompt library: each platform has TWO prompts —
 *   - 文字指令 (caption_writer system prompt for that channel)
 *   - 圖片指令 (image_director / Flux brief style for that channel)
 *
 * Stored in positioning._aiPrompts[<platform>] = { text: string, image: string }.
 * 30s / 60s / 100s / Theater pull these when generating for that platform.
 *
 * AI 協助填 button per platform fills BOTH prompts using the brand's
 * positioning + knowledge + real public content (官網 / FB).
 *
 * CJ direction (2026-05-07):
 *   "AI 指令庫，是要變成獨立的 tile. 裡面呈現出不同社群平台的文字
 *    指令還有圖片指令。"
 */
import { useEffect, useState } from "react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";
import { Card, CardBody, Textarea, Button } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook, faInstagram, faYoutube, faTiktok, faLinkedin, faThreads } from "@fortawesome/free-brands-svg-icons";
import { faRobot, faEnvelope, faNewspaper, faSave, faCheck } from "@fortawesome/free-solid-svg-icons";
import { Sparkles } from "lucide-react";

const PLATFORMS: Array<{ id: string; label: string; icon: any; tone: string }> = [
  { id: "facebook",  label: "Facebook",  icon: faFacebook,  tone: "#1877F2" },
  { id: "instagram", label: "Instagram", icon: faInstagram, tone: "#E1306C" },
  { id: "youtube",   label: "YouTube",   icon: faYoutube,   tone: "#FF0000" },
  { id: "threads",   label: "Threads",   icon: faThreads,   tone: "#000000" },
  { id: "tiktok",    label: "TikTok",    icon: faTiktok,    tone: "#000000" },
  { id: "linkedin",  label: "LinkedIn",  icon: faLinkedin,  tone: "#0A66C2" },
  { id: "email",     label: "EDM",       icon: faEnvelope,  tone: "#0EA5E9" },
  { id: "press",     label: "Press",     icon: faNewspaper, tone: "#64748B" },
];

interface PromptValue { text?: string; image?: string }

export default function AIPromptsEditor({ brandId }: { brandId: number | null }) {
  const { lang } = useLang();
  const en = lang === "en";
  if (!brandId) {
    return <div className="p-8 text-center text-default-500">{en ? "Pick a brand first" : "請先選擇品牌"}</div>;
  }

  const utils = trpc.useUtils();
  const scopeQuery = (trpc as any).scope?.active?.useQuery?.(
    { brandId, productId: null, eventId: null },
    { enabled: !!brandId, refetchOnWindowFocus: false },
  );
  const positioning = (scopeQuery?.data as any)?.brand?.positioning ?? {};
  const stored: Record<string, PromptValue> = (positioning._aiPrompts ?? {}) as Record<string, PromptValue>;

  const [drafts, setDrafts] = useState<Record<string, PromptValue>>(stored);
  const dirtyRef = { current: new Set<string>() };
  const [savingPlatform, setSavingPlatform] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [filling, setFilling] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<string>("facebook");

  useEffect(() => { setDrafts(stored); /* eslint-disable-next-line */ }, [JSON.stringify(stored)]);

  const saveMut = (trpc as any).scope?.savePositioning?.useMutation?.({
    onSuccess: () => utils.scope?.active?.invalidate?.(),
  });
  const suggestAIPromptsMut = (trpc as any).brandKnowledge?.suggestAIPrompts?.useMutation?.();

  const persist = (next: Record<string, PromptValue>) => {
    if (!saveMut || !brandId) return;
    const merged = { ...positioning, _aiPrompts: next };
    saveMut.mutate({ kind: "brand", id: brandId, positioning: merged });
  };

  const debounce = useState<{ t: any | null }>({ t: null })[0];
  const updatePrompt = (platform: string, kind: "text" | "image", val: string) => {
    setDrafts((d) => {
      const next = { ...d, [platform]: { ...(d[platform] ?? {}), [kind]: val } };
      if (debounce.t) clearTimeout(debounce.t);
      setSavingPlatform(platform);
      debounce.t = setTimeout(() => {
        persist(next);
        setSavingPlatform(null);
        setSaved(platform);
        setTimeout(() => setSaved(null), 1400);
      }, 700);
      return next;
    });
  };

  const handleAIFor = async (platform: string) => {
    if (!brandId) return;
    setFilling(platform);
    try {
      const r = await suggestAIPromptsMut?.mutateAsync?.({ brandId, platform });
      if (r?.ok) {
        const next = {
          ...drafts,
          [platform]: { text: r.value?.text ?? "", image: r.value?.image ?? "" },
        };
        setDrafts(next);
        persist(next);
      }
    } finally {
      setFilling(null);
    }
  };

  const active = PLATFORMS.find((p) => p.id === activePlatform) ?? PLATFORMS[0]!;
  const cur = drafts[active.id] ?? {};

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#7C3AED" }}>
              <FontAwesomeIcon icon={faRobot} style={{ color: "#fff", fontSize: 14 }} />
            </div>
            <h1 className="text-2xl font-semibold text-default-900">{en ? "AI prompt library" : "AI 指令庫"}</h1>
          </div>
          <p className="text-sm text-default-500">
            {en
              ? "Set brand-specific text and image instructions for each platform. 30s, 60s, 99s, and 7-Day Publisher tasks automatically apply these when generating content for that platform."
              : "為每個社群平台設定品牌專屬的文字指令 + 圖片指令。30s / 60s / 99s / 七日發布台 在該平台跑任務時會自動套用。"}
          </p>
        </div>
      </div>

      {/* Platform tab strip */}
      <div className="overflow-x-auto mb-5" style={{ scrollbarWidth: "none" }}>
        <div className="flex items-center gap-2 w-max pb-1">
          {PLATFORMS.map((p) => {
            const filled =
              (drafts[p.id]?.text ?? "").trim().length > 0 ||
              (drafts[p.id]?.image ?? "").trim().length > 0;
            const isActive = p.id === activePlatform;
            return (
              <button
                key={p.id}
                onClick={() => setActivePlatform(p.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full transition shrink-0 border ${
                  isActive ? "border-default-900 bg-default-900 text-white"
                           : "border-default-200 bg-white text-default-700 hover:border-default-400"
                }`}
              >
                <FontAwesomeIcon icon={p.icon} style={{ color: isActive ? "#fff" : p.tone, fontSize: 12 }} />
                <span className="text-xs font-medium">{p.label}</span>
                {filled && <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-300" : "bg-emerald-500"}`} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Platform card with text + image prompts */}
      <Card>
        <CardBody className="p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={active.icon} style={{ color: active.tone, fontSize: 16 }} />
              <h2 className="font-semibold text-default-900">{en ? `${active.label} prompts` : `${active.label} 指令`}</h2>
              {savingPlatform === active.id && (
                <span className="text-[10px] text-default-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> {en ? "Auto-saving…" : "自動儲存中…"}
                </span>
              )}
              {saved === active.id && (
                <span className="text-[10px] text-emerald-600 flex items-center gap-1">
                  <FontAwesomeIcon icon={faCheck} className="text-[10px]" /> {en ? "Saved" : "已儲存"}
                </span>
              )}
            </div>
            <Button
              size="sm"
              color="secondary"
              variant="flat"
              onPress={() => handleAIFor(active.id)}
              isLoading={filling === active.id}
              startContent={filling !== active.id && <Sparkles size={12} />}
            >
              {filling === active.id
                ? (en ? "Generating…" : "產生中…")
                : (en ? `AI: draft ${active.label} prompts` : `AI 產生 ${active.label} 指令`)}
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-default-700 mb-1.5 block flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px]">{en ? "Text prompt" : "文字指令"}</span>
                {en ? "System prompt for copywriting" : "寫文案時的系統指令"}
              </label>
              <Textarea
                size="sm"
                variant="flat"
                minRows={10}
                maxRows={20}
                placeholder={en
                  ? `Voice, structure, length, tone to follow when writing for ${active.label}…\ne.g. Short ${active.label} post, 120–180 chars, opening hook in line 1, no clichés, 1–2 hashtags at the end…`
                  : `為 ${active.label} 寫貼文時要遵守的口吻、結構、長度、tone…\n例：寫 ${active.label} 短貼文，120-180 字，第一句為開場鉤、不要套話、最後 1-2 個主題標籤…`}
                value={cur.text ?? ""}
                onValueChange={(s) => updatePrompt(active.id, "text", s)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-default-700 mb-1.5 block flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px]">{en ? "Image prompt" : "圖片指令"}</span>
                {en ? "Image / Flux style brief" : "配圖 / Flux 風格指引"}
              </label>
              <Textarea
                size="sm"
                variant="flat"
                minRows={10}
                maxRows={20}
                placeholder={en
                  ? `Visual style guide for ${active.label} imagery…\ne.g. Clean white background, brand primary + one product shot, 30% headline space, 9:16 vertical, warm tone…`
                  : `為 ${active.label} 配圖時的視覺風格指南…\n例：${active.label} 配圖採乾淨白底、品牌主色 + 一張產品實拍，留 30% 標題空間，9:16 直幅，色溫偏暖…`}
                value={cur.image ?? ""}
                onValueChange={(s) => updatePrompt(active.id, "image", s)}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="mt-4 text-xs text-default-500 bg-default-50 rounded-lg p-3 leading-relaxed">
        <div className="font-medium text-default-700 mb-1">{en ? "💡 How it works" : "💡 使用說明"}</div>
        {en
          ? "Every time a task runs for this platform (e.g. a 30s Facebook post), the system applies the Text and Image instructions above to the content AI for that platform. Platforms left blank fall back to the general brand voice."
          : "每次跑該平台的任務（如 30s FB 短貼文）時，系統會自動把這裡的「文字指令」+「圖片指令」套用到對應的 AI 專家。未填寫的平台會自動套用通用品牌口吻。"}
      </div>
    </div>
  );
}
