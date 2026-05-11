/**
 * AgentPersonaBar — line-art portrait + speech bubble that lives at the
 * top of every brand workspace tab (定位 / 文字 / 知識). Mirrors the
 * Theater BrainBar visual language so the product feels staffed.
 *
 * 2026-05-11 (CJ「可以在定位和文字的地方，都有常駐的 agents 嗎」)
 *
 * Modes:
 *   idle    — default greeting bubble (e.g., "準備好分析品牌定位")
 *   busy    — caller passes its own message (typing/loading)
 *   done    — final status; bubble shows the completion message
 *
 * Personas:
 *   strategist     — 策略總監 (定位)
 *   copywriter     — 文字總監 (文字)
 *   librarian      — 知識總監 (知識)
 *   creative       — 創意總監 (企劃台)
 *
 * The component is intentionally small + presentational; pipeline
 * orchestration stays in PipelineThinkingPanel.
 */
import React from "react";
import { Avatar } from "@heroui/react";

export type PersonaId = "strategist" | "copywriter" | "librarian" | "creative";

const PERSONAS: Record<PersonaId, {
  label: string;
  seed: string;
  defaultLine: string;
  domain: string;
}> = {
  strategist: {
    label: "策略總監",
    seed: "Strategist-奧品牌定位",
    defaultLine: "我會用奧品牌定位法的 14 步幫你鎖定「你是誰、為誰而存在」— 鎖定後，所有內容都會以此為基礎產出。",
    domain: "Brand Positioning",
  },
  copywriter: {
    label: "文字總監",
    seed: "Copywriter-Drop",
    defaultLine: "等你的定位鎖定後，我會為你建立統一的品牌語氣、用字偏好、禁用詞，30s / 60s / 99s 任務都會吃這份手冊。",
    domain: "Brand Voice & Copy",
  },
  librarian: {
    label: "知識總監",
    seed: "Librarian-Drop",
    defaultLine: "我管理品牌的知識庫 — 產品資訊、競品研究、案例素材、FAQ。任務需要 ground truth 時，會優先從這裡取材。",
    domain: "Brand Knowledge",
  },
  creative: {
    label: "創意總監",
    seed: "Creative-Drop",
    defaultLine: "定位 + 文字 + 知識備好後，我會把它們轉成每篇貼文的骨架 — 30s 快寫、60s 製作包、99s 全企劃。",
    domain: "Creative Direction",
  },
};

export interface AgentPersonaBarProps {
  persona: PersonaId;
  /** Override the bubble copy (e.g., for working / done states). */
  message?: string;
  /** Tiny metadata under the name — e.g., "step 3/14 · live" */
  meta?: React.ReactNode;
  /** Slot at the bubble's right end (controls / chips). */
  trailing?: React.ReactNode;
  /** Visual mode hint, mainly for accent dot. */
  mode?: "idle" | "busy" | "done";
  /** Optional brand name to flavor avatar seed. */
  brandName?: string;
  /** Compact = smaller (use for tab headers that share vertical space). */
  compact?: boolean;
}

export default function AgentPersonaBar({
  persona, message, meta, trailing, mode = "idle", brandName, compact = false,
}: AgentPersonaBarProps) {
  const p = PERSONAS[persona];
  const avatar = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(p.seed + "-" + (brandName ?? ""))}`;
  const portraitSize = compact ? 72 : 88;
  const avatarSize = compact ? 56 : 72;

  return (
    <div className="flex items-stretch gap-4 mb-4">
      {/* Portrait */}
      <div className="flex-shrink-0 relative">
        <div
          className="bg-white flex items-center justify-center"
          style={{
            width: portraitSize, height: portraitSize,
            borderRadius: 18,
            border: "2px solid #111",
            boxShadow: "4px 4px 0 rgba(17,17,17,0.4)",
          }}
        >
          <Avatar src={avatar} size="lg" radius="md" style={{ width: avatarSize, height: avatarSize }} />
        </div>
        <div
          className="absolute -bottom-2 -right-2 px-2 py-0.5 text-[10px] font-bold text-white whitespace-nowrap"
          style={{ background: "#111", border: "1.5px solid #111", borderRadius: 6 }}
        >
          {p.label}
        </div>
      </div>

      {/* Speech bubble */}
      <div className="flex-1 relative">
        <div
          className="relative bg-white h-full"
          style={{
            border: "2px solid #111",
            boxShadow: "4px 4px 0 rgba(17,17,17,0.18)",
            borderRadius: 18,
            padding: compact ? "12px 18px" : "14px 20px",
            minHeight: portraitSize,
          }}
        >
          <div
            className="absolute left-[-10px] top-7 w-5 h-5 bg-white"
            style={{
              borderLeft: "2px solid #111",
              borderBottom: "2px solid #111",
              transform: "rotate(45deg)",
            }}
          />
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="flex items-center gap-2 flex-wrap text-[11px] uppercase tracking-[0.22em] text-neutral-500">
              <span className="font-semibold text-neutral-800">{p.label}</span>
              <span className="text-neutral-300">·</span>
              <span>{p.domain}</span>
              {meta && (
                <>
                  <span className="text-neutral-300">·</span>
                  <span>{meta}</span>
                </>
              )}
              {mode === "idle" && (
                <span className="inline-flex items-center gap-1 text-neutral-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-300" />
                  Ready
                </span>
              )}
              {mode === "busy" && (
                <span className="inline-flex items-center gap-1 text-neutral-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 animate-pulse" />
                  Live
                </span>
              )}
              {mode === "done" && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  Done
                </span>
              )}
            </div>
            {trailing && <div className="flex items-center gap-1.5">{trailing}</div>}
          </div>
          <p
            className="text-[14px] leading-relaxed text-neutral-900"
            style={{ fontFamily: '"Source Serif Pro", "Noto Serif TC", Georgia, serif' }}
          >
            {message ?? p.defaultLine}
          </p>
        </div>
      </div>
    </div>
  );
}
