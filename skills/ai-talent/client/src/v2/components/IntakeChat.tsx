/**
 * IntakeChat — conversational pre-launch intake replacing the static
 * SquadIntakeSidebar form.
 */

import React, { useEffect, useRef, useState } from "react";
import { Avatar, Button, Chip, Spinner, Textarea } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faInstagram,
  faFacebook,
  faLinkedin,
  faYoutube,
  faTiktok,
  faLine,
} from "@fortawesome/free-brands-svg-icons";
import {
  faBookOpen,
  faLayerGroup,
  faRocket,
  faBrain,
  faPaperPlane,
  faCheck,
  faLock,
} from "@fortawesome/free-solid-svg-icons";
import { useIntakeChat } from "../lib/useIntakeChat";
import { trpc } from "../../lib/trpc";
import { pickLocaleText } from "../../lib/localizeText";
import { LAYER_TOKENS, resolveLayer } from "../../studio/primitives/tokens";

// ── Platform config ──────────────────────────────────────────────────────────

const PLATFORM_ICON_MAP: Record<string, any> = {
  instagram: faInstagram,
  facebook:  faFacebook,
  linkedin:  faLinkedin,
  youtube:   faYoutube,
  tiktok:    faTiktok,
  line:      faLine,
};

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn",
  youtube: "YouTube",     tiktok:   "TikTok",   line:     "LINE",
};

const WORKSPACE_META: Record<string, { label: string; icon: any }> = {
  instagram: { label: "Instagram", icon: faInstagram },
  facebook:  { label: "Facebook",  icon: faFacebook  },
  linkedin:  { label: "LinkedIn",  icon: faLinkedin  },
  youtube:   { label: "YouTube",   icon: faYoutube   },
  tiktok:    { label: "TikTok",    icon: faTiktok    },
  line:      { label: "LINE",      icon: faLine      },
};

// ── Chat bubbles ─────────────────────────────────────────────────────────────

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
  platform, onAuth, onSkip, onPrefetch, preparing, authorized, authorizedName,
}: {
  platform: string;
  onAuth: () => void;
  onSkip: () => void;
  onPrefetch: () => void;
  preparing: boolean;
  authorized: boolean;
  authorizedName: string;
}) {
  const icon = PLATFORM_ICON_MAP[platform] ?? faBrain;
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
        AI 專家讀取你的 {label} 數據後，能產出更精準的內容。可選跳過。
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="bordered" color="primary" className="flex-1 text-tiny"
          startContent={<FontAwesomeIcon icon={faLock} className="text-tiny" />}
          onMouseEnter={onPrefetch}
          onFocus={onPrefetch}
          onPress={onAuth}>
          {preparing ? `準備中…請再點一次` : `授權 ${label}`}
        </Button>
        <Button size="sm" variant="light" className="text-tiny text-default-400" onPress={onSkip}>
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
  brandCtx: string;
  busy: boolean;
  error: string | null;
  missionId: number | null;
  brandId?: number | null;
  onLaunch: (intakeSummary: string) => void;
  onBack: () => void;
  onPreviewChunk: (text: string) => void;
}

export function IntakeChat({
  squad, lang, workspace,
  brandName, brandCtx,
  busy, error, missionId,
  brandId,
  onLaunch, onBack, onPreviewChunk,
}: IntakeChatProps) {
  const lk = resolveLayer(squad.strategyLayer);
  const tone = LAYER_TOKENS[lk];
  const name = pickLocaleText(squad.name, lang) || squad.slug;
  const wsKey = workspace ?? (Array.isArray(squad.workspace) ? squad.workspace[0] : squad.workspace) ?? null;
  const wsMeta = wsKey ? WORKSPACE_META[wsKey] : null;
  const author = squad.methodology?.author;
  const year   = squad.methodology?.year;

  // Squad context fetched from server
  const [squadCtx, setSquadCtx] = useState<string>("");
  const [ctxLoaded, setCtxLoaded] = useState(false);

  useEffect(() => {
    if (!squad.id) return;
    fetch(`/api/intake/squad-ctx/${squad.id}`)
      .then((r) => r.json())
      .then((d) => { setSquadCtx(d.ctx ?? ""); setCtxLoaded(true); })
      .catch(() => {
        setSquadCtx(`小組名稱：${name}\n工作區：${wsKey ?? ""}`);
        setCtxLoaded(true);
      });
  }, [squad.id]);

  // Platform OAuth
  const [platformAuthorized, setPlatformAuthorized] = useState(false);
  const [platformName, setPlatformName] = useState("");
  const [authPreparing, setAuthPreparing] = useState(false);
  const getConnectToken = trpc.platformConnect.getConnectToken.useMutation();

  // 2026-05-18 (CJ「Connect account popup blocked」): the Pipedream SDK
  // opens its OAuth popup inside connectAccount(). Browsers block that
  // popup if it runs AFTER an await (the user-gesture/transient
  // activation is gone) — and the old code did `await getConnectToken`
  // + `await import(sdk)` BEFORE connectAccount. Fix: PREFETCH the token
  // and the SDK module (on hover/focus/mount) so the click handler can
  // call connectAccount with NO awaits in front of it → no popup block.
  const pdSdkRef = useRef<any>(null);
  const pdTokenRef = useRef<Record<string, { token: string; expiresAt: number; appSlug: string; env: string; connectLinkUrl: string }>>({});
  const pdPrefetchingRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    import("@pipedream/sdk/browser")
      .then((m) => { pdSdkRef.current = (m as any).PipedreamClient; })
      .catch(() => { /* retried lazily in prefetch */ });
  }, []);

  const prefetchPlatformAuth = React.useCallback(async (platform: string) => {
    if (pdPrefetchingRef.current[platform]) return;
    const cached = pdTokenRef.current[platform];
    if (cached && cached.expiresAt - Date.now() > 60_000 && pdSdkRef.current) return;
    pdPrefetchingRef.current[platform] = true;
    try {
      if (!pdSdkRef.current) {
        const m = await import("@pipedream/sdk/browser");
        pdSdkRef.current = (m as any).PipedreamClient;
      }
      const tk = await getConnectToken.mutateAsync({ platform: platform as any, brandId: brandId ?? 0 });
      if (tk?.token) {
        pdTokenRef.current[platform] = {
          token: tk.token,
          expiresAt: new Date(tk.expiresAt || Date.now() + 300_000).getTime(),
          appSlug: tk.appSlug,
          env: tk.env ?? "production",
          connectLinkUrl: tk.connectLinkUrl ?? "",
        };
      }
    } catch {
      // Silent — user can skip
    } finally {
      pdPrefetchingRef.current[platform] = false;
    }
  }, [getConnectToken]);

  // Synchronous: NO awaits before pd.connectAccount() so the popup keeps
  // the click's user activation. If not warmed yet, warm it and ask the
  // user to tap again (never attempt a popup that will be blocked).
  function handlePlatformAuth(platform: string) {
    const tk = pdTokenRef.current[platform];
    const Ctor = pdSdkRef.current;
    if (!Ctor || !tk || tk.expiresAt - Date.now() < 30_000) {
      setAuthPreparing(true);
      void prefetchPlatformAuth(platform).finally(() => setAuthPreparing(false));
      return;
    }
    try {
      const pd = new Ctor({
        projectEnvironment: tk.env as "production" | "development",
        externalUserId: "sowork-user",
        tokenCallback: async () => ({ token: tk.token, expiresAt: new Date(tk.expiresAt), connectLinkUrl: tk.connectLinkUrl }),
      });
      pd.connectAccount({
        app: tk.appSlug,
        onSuccess: (res: any) => {
          setPlatformName(PLATFORM_LABEL[platform] ?? res?.id ?? platform);
          setPlatformAuthorized(true);
          delete pdTokenRef.current[platform];
        },
        onError: () => {
          // Silent — user can skip
          delete pdTokenRef.current[platform];
          void prefetchPlatformAuth(platform);
        },
        onClose: ({ successful }: any) => {
          if (!successful) {
            delete pdTokenRef.current[platform];
            void prefetchPlatformAuth(platform);
          }
        },
      });
    } catch {
      // Silent — user can skip
    }
  }

  // Chat hook
  const { messages, isStreaming, isReady, send } = useIntakeChat({
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

  // Kick off agent opener when context loads
  useEffect(() => {
    if (ctxLoaded && messages.length === 0) {
      send(`請開始建立資料。品牌：${brandName ?? "（未提供）"}。`);
    }
  }, [ctxLoaded]);

  // Intake summary for launchSquad
  const intakeSummary = messages
    .filter((m) => !m.cardType)
    .map((m) => `${m.role === "user" ? "用戶" : "Agent"}：${m.content}`)
    .join("\n");

  // Input
  const [input, setInput] = useState("");

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
            startContent={<FontAwesomeIcon icon={faLayerGroup} className="text-tiny ml-1" />}>
            {lk}
          </Chip>
          {(author || year) && (
            <Chip size="sm" variant="flat"
              startContent={<FontAwesomeIcon icon={faBookOpen} className="text-tiny ml-1" />}>
              {author ?? "—"}{year ? ` · ${year}` : ""}
            </Chip>
          )}
          {brandName && (
            <Chip size="sm" variant="flat" color="success"
              startContent={<FontAwesomeIcon icon={faBrain} className="text-tiny ml-1" />}>
              {brandName}
            </Chip>
          )}
        </div>
      </div>

      {/* Message list */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
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
                onPrefetch={() => prefetchPlatformAuth(msg.authPlatform!)}
                preparing={authPreparing}
                onSkip={() => {}}
              />
            );
          }
          // Hide the hidden opener ping
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
              variant="bordered" radius="lg" size="sm"
              placeholder="回覆 Agent 的問題…"
              minRows={1} maxRows={4}
              value={input}
              onValueChange={setInput}
              classNames={{ inputWrapper: "border-default-200 bg-content2" }}
              isDisabled={isStreaming || !ctxLoaded}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
              }}
            />
            <Button
              isIconOnly size="sm" radius="full" color="primary"
              className="shrink-0 mb-0.5"
              isDisabled={!input.trim() || isStreaming}
              onPress={handleSend}
              aria-label="送出"
            >
              <FontAwesomeIcon icon={faPaperPlane} className="text-tiny" />
            </Button>
          </div>
        </div>
      )}

      {/* Sticky launch footer */}
      <div className="shrink-0 px-4 py-3 border-t border-default-200 space-y-2">
        {error && <p className="text-tiny text-danger text-center">{error}</p>}
        {!missionId ? (
          <Button
            color="primary" size="lg" radius="lg"
            className="w-full font-semibold"
            isLoading={busy}
            isDisabled={busy || (!isReady && messages.filter((m) => m.role === "user" && !m.content.startsWith("請開始")).length === 0)}
            onPress={() => onLaunch(intakeSummary)}
            startContent={!busy && <FontAwesomeIcon icon={faRocket} />}
          >
            {busy ? "啟動中…" : isReady ? "一切就緒，派出小組 →" : "派出小組 →"}
          </Button>
        ) : (
          <div className="flex items-center gap-2 text-tiny text-default-500">
            <Spinner size="sm" />
            <span>任務執行中…</span>
          </div>
        )}
      </div>
    </div>
  );
}
