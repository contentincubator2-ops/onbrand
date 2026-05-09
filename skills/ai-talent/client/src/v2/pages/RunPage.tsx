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

type Mode = "edit" | "chat" | "image" | "video";

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
  const [editText, setEditText] = useState("");
  const [chatPrompt, setChatPrompt] = useState("");
  const [copied, setCopied] = useState(false);

  const variants: VariantData[] = useMemo(() => {
    if (!data) return [];
    try {
      const parsed = JSON.parse(data.content);
      if (Array.isArray(parsed)) return parsed;
      if (parsed?.variants) return parsed.variants;
    } catch { /* ignore */ }
    return [{ label: "主版本", caption: data.content || "" }];
  }, [data]);

  const slide = variants[activeIdx];

  // Infer mockup variant from platform + outputType
  const mockupVariant: MockupVariant | null = useMemo(() => {
    if (!data) return null;
    const platformMap: Record<string, string> = {
      facebook: "facebook", instagram: "instagram", linkedin: "linkedin",
      youtube: "youtube", email: "email", press: "generic", other: "generic",
    };
    const formatMap: Record<string, string> = {
      post: "feed", story: "story", reel: "reel", ad_copy: "ad",
      email_html: "edm", script: "watch", report: "generic",
    };
    const platform = (platformMap[data.platform ?? "other"] ?? "generic") as any;
    const format = (formatMap[data.outputType ?? "post"] ?? "feed") as any;
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
      {/* ─── Inline header strip ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <Button isIconOnly variant="light" size="sm" onPress={() => navigate(-1)} aria-label="返回">
          <FontAwesomeIcon icon={faChevronLeft} />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-tiny text-default-500 truncate">
            {data.brand?.name ?? "未綁定品牌"} · {data.mission?.workspace ?? "—"}
          </p>
          <h1 className="text-small font-medium truncate">
            {data.title || data.mission?.taskLabel || "(無標題)"}
          </h1>
        </div>
        {data.mission?.tier && <Chip size="sm" variant="flat" color="secondary">{data.mission.tier}</Chip>}
        <Chip size="sm" variant="flat" color={data.status === "published" ? "success" : "default"}>
          {data.status}
        </Chip>
        <Tooltip content="重跑這個任務">
          <Button isIconOnly variant="light" size="sm" aria-label="重跑">
            <FontAwesomeIcon icon={faRotateRight} />
          </Button>
        </Tooltip>
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

      {/* ─── 2-COL: mockup big + right panel ─────────────────────────── */}
      <div className="grid grid-cols-[1fr_320px] gap-4 items-start">
        {/* CENTER */}
        <section className="min-w-0 flex flex-col gap-3">
          {/* Toolbar */}
          <div className="flex items-center gap-1 bg-white rounded-xl border border-default-200 px-2 py-1.5 shadow-sm">
            <ToolbarBtn icon={Pencil}        label="編輯文字"      active={mode==="edit"}  onClick={() => setMode("edit")} />
            <ToolbarBtn icon={MessageCircle} label="跟 agent 對話" active={mode==="chat"}  onClick={() => setMode("chat")} />
            <ToolbarBtn icon={LucideImage}   label="改圖"          active={mode==="image"} onClick={() => setMode("image")} />
            <ToolbarBtn icon={Video}         label="改影片"        active={mode==="video"} onClick={() => setMode("video")} />
            <Divider />
            <Tooltip content="撰寫 agent">
              <button className="w-7 h-7 rounded-full overflow-hidden ring-1 ring-default-200 hover:ring-secondary transition">
                <Avatar src={`https://api.dicebear.com/9.x/notionists/svg?seed=Tina`} className="w-7 h-7" />
              </button>
            </Tooltip>
            <Tooltip content="視覺 agent">
              <button className="w-7 h-7 rounded-full overflow-hidden ring-1 ring-default-200 hover:ring-secondary transition">
                <Avatar src={`https://api.dicebear.com/9.x/notionists/svg?seed=Mandy`} className="w-7 h-7" />
              </button>
            </Tooltip>
            <Divider />
            <ToolbarBtn icon={Wand2}         label="重生這段" />
            <ToolbarBtn icon={LucideSliders} label="參數" />
            <Divider />
            <ToolbarBtn icon={LucideCopy}    label="複製" onClick={onCopy} highlight={copied} />
            <ToolbarBtn icon={Save}          label="存到 Mission" />
            <div className="ml-auto" />
            <ToolbarBtn icon={Pencil} label="關閉" onClick={() => navigate(-1)} />
          </div>

          {/* Mockup big white card */}
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

        {/* RIGHT: mode panel + publish actions */}
        <aside className="space-y-3 sticky top-2 self-start">
          <Card>
            <CardBody className="space-y-3">
              {mode === "chat" && (
                <>
                  <p className="text-tiny font-semibold">跟 agent 改文案</p>
                  <p className="text-[11px] text-default-500 leading-relaxed">
                    告訴 agent 你想怎麼調整：例如「結尾改成限時優惠」、「太囉嗦砍第二段」。
                  </p>
                  <Textarea
                    placeholder="說明你想怎麼改…"
                    value={chatPrompt}
                    onChange={(e) => setChatPrompt(e.target.value)}
                    minRows={4}
                  />
                  <Button color="secondary" fullWidth>送出修改</Button>
                </>
              )}
              {mode === "edit" && (
                <>
                  <p className="text-tiny font-semibold">直接編輯</p>
                  <p className="text-[10px] text-default-500">
                    在這裡改文字，左邊 mockup 即時更新。
                  </p>
                  <Textarea
                    value={editText || slide?.caption || ""}
                    onChange={(e) => setEditText(e.target.value)}
                    minRows={10}
                  />
                  <Button color="secondary" fullWidth>儲存修改</Button>
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
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-2">
              <p className="text-tiny font-semibold">發布到</p>
              <Button color="primary" fullWidth startContent={<FontAwesomeIcon icon={faRocket} />} isDisabled>
                直接發 Facebook（即將推出）
              </Button>
              <Button variant="flat" fullWidth startContent={<FontAwesomeIcon icon={faCalendarPlus} />} isDisabled>
                排程到日曆（即將推出）
              </Button>
              <Button variant="flat" fullWidth startContent={<FontAwesomeIcon icon={faEnvelope} />} isDisabled>
                寄給團隊（即將推出）
              </Button>
              <Button variant="flat" fullWidth startContent={<FontAwesomeIcon icon={faFolderPlus} />}>
                存到 Mission
              </Button>
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
