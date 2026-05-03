/**
 * IntakeChat — conversational pre-launch intake replacing the static
 * SquadIntakeSidebar form.
 *
 * Layout (380px middle column):
 *   ┌─────────────────────────────┐
 *   │ ← 所有方法論  Squad name    │  ← header (shrink-0)
 *   │ [chips: layer · workspace]  │
 *   ├─────────────────────────────┤
 *   │                             │
 *   │  agent bubble               │  ← scrollable message list
 *   │          user bubble →      │
 *   │  [OAuth card]               │
 *   │  agent bubble               │
 *   │                             │
 *   ├─────────────────────────────┤
 *   │ [input] [送出]              │  ← shrink-0 input bar
 *   ├─────────────────────────────┤
 *   │ [派出小組 →]                │  ← sticky launch footer
 *   └─────────────────────────────┘
 *
 * Props mirror SquadIntakeSidebar so swap-in is minimal.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Avatar, Button, Chip, Divider, Spinner, Textarea,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookOpen, faLayerGroup, faRocket, faBrain,
  faInstagram, faFacebook, faLinkedin, faYoutube, faTiktok, faLine,
  faPaperPlane,
} from "@fortawesome/react-fontawesome";
import {
  faInstagram  as _i,
  faFacebook   as _f,
  faLinkedin   as _li,
  faYoutube    as _y,
  faTiktok     as _tt,
  faLine       as _ln,
} from "@fortawesome/free-brands-svg-icons";
import {
  faBookOpen   as _bo,
  faLayerGroup as _lg,
  faRocket     as _r,
  faBrain      as _br,
  faPaperPlane as _pp,
  faCheck,
  faLock,
} from "@fortawesome/free-solid-svg-icons";
import { useIntakeChat, type ChatMessage } from "../lib/useIntakeChat";
import { trpc } from "../../lib/trpc";
import { pickLocaleText } from "../../lib/localizeText";
import { LAYER_TOKENS, resolveLayer } from "../../studio/primitives/tokens";

// ── Platform auth config ────────────────────────────────────────────────────

const PLATFORM_ICON_MAP: Record<string, any> = {
  instagram: _i,
  facebook:  _f,
  linkedin:  _li,
  youtube:   _y,
  tiktok:    _tt,
  line:      _ln,
};

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn",
  youtube: "YouTube",     tiktok:   "TikTok",   line:     "LINE",
};

const WORKSPACE_META: Record<string, { label: string; icon: any }> = {
  instagram: { label: "Instagram", icon: _i },
  facebook:  { label: "Facebook",  icon: _f },
  linkedin:  { label: "LinkedIn",  icon: _li },
  youtube:   { label: "YouTube",   icon: _y },
  tiktok:    { label: "TikTok",    icon: _tt },
  line:      { label: "LINE",      icon: _ln },
};

// ── Single chat bubble ───────────────────────────────────────────────────────

function AgentBubble({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className="flex items-start gap-2 max-w-[92%]">
      <Avatar
        size="sm"
        className="shrink-0 mt-0.5"
        name="A"
        classNames={{ base: "bg-secondary text-white w-7 h-7 text-tiny" }}
      />
      <div className="rounded-2xl rounded-tl-sm bg-default-100 px-3 py-2 text-small leading-relaxed text-foreground">
        {content}
        {streaming && !content && (
          <span className="inline-flex gap-1 items-center ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-default-400 animate-bounce [animation-delay:0ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-default-400 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-default-400 animate-bounce [animation-delay:300ms]" />
          </span>
        )}
      </div>
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end max-w-[92%] ml-auto">
      <div className="rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-small leading-relaxed">
        {content}
      </div>
    </div>
  );
}

// ── OAuth inline card ────────────────────────────────────────────────────────

function AuthCard({
  platform,
  onAuth,
  onSkip,
  authorized,
  authorizedName,
}: {
  platform: string;
  onAuth: () => void;
  onSkip: () => void;
  authorized: boolean;
  authorizedName: string;
}) {
  const icon = PLATFORM_ICON_MAP[platform] ?? _br;
  const label = PLATFORM_LABEL[platform] ?? platform;

  if (authorized) {
    return (
      <div className="ml-9 flex items-center gap-2 rounded-xl border border-success px-3 py-2 bg-success-50/30">
        <FontAwesomeIcon icon={faCheck} className="text-success text-tiny" />
        <span className="text-small font-medium text-success truncate">{authorizedName || label}</span>
        <Chip size="sm" color="success" variant="flat" className="ml-auto shrink-0">已授權</Chip>
      </div>
    );
  }

  return (
    <div className="ml-9 rounded-xl border border-default-200 bg-content2 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={icon} className="text-default-500" />
        <p className="text-small font-semibold">授權 {label} 帳號</p>
        <Chip size="sm" color="warning" variant="flat" className="ml-auto text-tiny">建議</Chip>
      </div>
      <p className="text-tiny text-default-400 leading-relaxed">
        Agent 讀取你的 {label} 數據後，能產出更精準的內容。可選跳過。
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="bordered" color="primary" className="flex-1 text-tiny"
          startContent={<FontAwesomeIcon icon={faLock} className="text-tiny" />}
          onPress={onAuth}>
          授權 {label}
        </Button>
        <Button size="sm" variant="light" className="text-tiny text-default-400"
          onPress={onSkip}>
          略過
        </Button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export interface IntakeChatProps {
  squad: any;
  lang: "zh-TW" | "en";
  workspace: string | null;
  brandName: string | null;
  brandCtx: string;       // full serialized brand context
  busy: boolean;
  error: string | null;
  missionId: number | null;
  onLaunch: (intakeSummary: string) => void;
  onBack: () => void;
  onPreviewChunk: (text: string) => void;
}

export function IntakeChat({
  squad, lang, workspace,
  brandName, brandCtx,
  busy, error, missionId,
  onLaunch, onBack, onPreviewChunk,
}: IntakeChatProps) {
  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];
  const name = pickLocaleText(squad.name, lang) || squad.slug;
  const wsKey = workspace ?? (Array.isArray(squad.workspace) ? squad.workspace[0] : squad.workspace) ?? null;
  const wsMeta = wsKey ? WORKSPACE_META[wsKey] : null;
  const author = squad.methodology?.author;
  const year   = squad.methodology?.year;

  // Local squad context — fetched once from /api/intake/squad-ctx/:id
  const [squadCtx, setSquadCtx] = useState<string>("");
  const [ctxLoaded, setCtxLoaded] = useState(false);

  useEffect(() => {
    if (!squad.id) return;
    fetch(`/api/intake/squad-ctx/${squad.id}`)
      .then((r) => r.json())
      .then((d) => { setSquadCtx(d.ctx ?? ""); setCtxLoaded(true); })
      .catch(() => {
        // Fallback: build minimal ctx from squad object
        setSquadCtx(`小組名稱：${name}\n工作區：${wsKey ?? ""}`);
        setCtxLoaded(true);
      });
  }, [squad.id]);

  // Platform OAuth state
  const [platformAuthorized, setPlatformAuthorized] = useState(false);
  const [platformName, setPlatformName] = useState("");
  const getConnectToken = trpc.platformConnect.getConnectToken.useMutation();

  async function handlePlatformAuth(platform: string) {
    try {
      const { token, appSlug, projectId, env } = await getConnectToken.mutateAsync({
        platform: platform as any,
      });
      const { PipedreamClient } = await import("@pipedream/sdk");
      const pd = new PipedreamClient({
        projectEnvironment: env,
        externalUserId: "sowork-user",
        tokenCallback: async () => token,
      });
      const account = await pd.connectAccount({ app: appSlug });
      setPlatformName((account as any).name ?? (account as any).username ?? PLATFORM_LABEL[platform] ?? platform);
      setPlatformAuthorized(true);
    } catch {
      // Silent — user can skip
    }
  }

  // Chat hook
  const { messages, isStreaming, isReady, send, reset } = useIntakeChat({
    squadId: squad.id,
    squadCtx,
    brandCtx,
    onPreviewChunk,
    onReady: () => {},
  });

  // Auto-scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Kick off first agent message when ctx loads + no messages yet
  useEffect(() => {
    if (ctxLoaded && messages.length === 0) {
      // Trigger agent opener by sending an empty user "ping"
      // (hidden — we don't append it to messages; handled via initial role injection)
      const opener = `請開始 intake。品牌：${brandName ?? "（未提供）"}。`;
      send(opener);
    }
  }, [ctxLoaded]);

  // Compose intake summary from conversation (for launchSquad context)
  const intakeSummary = messages
    .filter((m) => !m.cardType)
    .map((m) => `${m.role === "user" ? "用戶" : "Agent"}：${m.content}`)
    .join("\n");

  // Input state
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    send(text);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-3 border-b border-default-200">
        <button
          className="flex items-center gap-1.5 text-tiny text-default-400 hover:text-foreground transition mb-3"
          onClick={onBack}
        >
          ← 所有方法論
        </button>
        <h2 className="font-semibold text-[15px] leading-snug tracking-tight">{name}</h2>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {wsMeta && (
            <Chip size="sm" variant="flat" color="default"
              startContent={<FontAwesomeIcon icon={wsMeta.icon} className="text-tiny ml-1" />}>
              {wsMeta.label}
            </Chip>
          )}
          <Chip size="sm" variant="flat"
            style={{ background: `${tone.bg}1A`, color: tone.bg }}
            startContent={<FontAwesomeIcon icon={_lg} className="text-tiny ml-1" />}>
            {lk}
          </Chip>
          {(author || year) && (
            <Chip size="sm" variant="flat"
              startContent={<FontAwesomeIcon icon={_bo} className="text-tiny ml-1" />}>
              {author ?? "—"}{year ? ` · ${year}` : ""}
            </Chip>
          )}
          {brandName && (
            <Chip size="sm" variant="flat" color="success"
              startContent={<FontAwesomeIcon icon={_br} className="text-tiny ml-1" />}>
              {brandName}
            </Chip>
          )}
        </div>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3"
      >
        {!ctxLoaded && (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.cardType === "auth" && msg.authPlatform) {
            return (
              <AuthCard
                key={i}
                platform={msg.authPlatform}
                authorized={platformAuthorized}
                authorizedName={platformName}
                onAuth={() => handlePlatformAuth(msg.authPlatform!)}
                onSkip={() => {}}
              />
            );
          }
          // Skip the hidden opener ping from user
          if (msg.role === "user" && i === 0 && msg.content.startsWith("請開始 intake")) return null;

          return msg.role === "assistant"
            ? <AgentBubble key={i} content={msg.content} streaming={msg.streaming} />
            : <UserBubble  key={i} content={msg.content} />;
        })}
      </div>

      {/* Input bar */}
      {!missionId && (
        <div className="shrink-0 px-3 pb-2 pt-2 border-t border-default-200">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef as any}
              variant="bordered"
              radius="lg"
              size="sm"
              placeholder="回覆 Agent 的問題…"
              minRows={1}
              maxRows={4}
              value={input}
              onValueChange={setInput}
              classNames={{ inputWrapper: "border-default-200 bg-content2" }}
              isDisabled={isStreaming || !ctxLoaded}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              isIconOnly
              size="sm"
              radius="full"
              color="primary"
              className="shrink-0 mb-0.5"
              isDisabled={!input.trim() || isStreaming}
              onPress={handleSend}
              aria-label="送出"
            >
              <FontAwesomeIcon icon={_pp} className="text-tiny" />
            </Button>
          </div>
        </div>
      )}

      {/* Sticky launch footer */}
      <div className="shrink-0 px-4 py-3 border-t border-default-200 space-y-2">
        {error && (
          <p className="text-tiny text-danger text-center">{error}</p>
        )}
        {!missionId ? (
          <Button
            color="primary"
            size="lg"
            radius="lg"
            className="w-full font-semibold"
            isLoading={busy}
            isDisabled={busy || (!isReady && messages.filter((m) => m.role === "user" && !m.content.startsWith("請開始")).length === 0)}
            onPress={() => onLaunch(intakeSummary)}
            startContent={!busy && <FontAwesomeIcon icon={_r} />}
          >
            {busy ? "啟動中…" : isReady ? "一切就緒，派出小組 →" : "派出小組 →"}
          </Button>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-tiny text-default-500">
              <Spinner size="sm" />
              <span>任務執行中…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
