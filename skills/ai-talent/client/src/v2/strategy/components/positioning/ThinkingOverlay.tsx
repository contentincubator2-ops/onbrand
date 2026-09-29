/**
 * ThinkingOverlay — three-phase visualization of the wizard step.
 *
 *   phase="loading"  → spinner + "Anthropic 分析中… (Xs)" elapsed timer
 *                       + dots heartbeat. Shown while the LLM call is
 *                       actually running (can be 20-60s). The user
 *                       previously thought the system hung here because
 *                       the typewriter finished before the API returned.
 *   phase="typing"   → typewriter rolls the real reasoning text.
 *   phase="writing"  → "✍️ 正在寫入欄位…" status before fields populate.
 *
 * Parent controls phase + text. Calls onComplete when typewriter ends.
 */
import React from "react";
import { Card, CardBody, Chip, Spinner } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserTie, faPenNib,
} from "@fortawesome/free-solid-svg-icons";

export type ThinkingPhase = "loading" | "typing" | "writing";

export interface ThinkingOverlayProps {
  /** Reasoning text — typed character-by-character during phase=typing. */
  text: string;
  /** Phase of the analysis lifecycle. */
  phase?: ThinkingPhase;
  /** Step number / total — for the progress chip. */
  stepNum?: number;
  stepTotal?: number;
  /** Step title. */
  stepTitle?: string;
  /** Characters per second. */
  cps?: number;
  /** Called once typing completes. */
  onComplete?: () => void;
  /** Visibility — when false, fades out. */
  visible?: boolean;
  /** ISO timestamp when this step started — drives loading timer. */
  startedAt?: number;
}

export default function ThinkingOverlay({
  text, phase = "typing", stepNum, stepTotal, stepTitle, cps = 35,
  onComplete, visible = true, startedAt,
}: ThinkingOverlayProps) {
  const [shown, setShown] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  // Live elapsed counter for loading phase
  React.useEffect(() => {
    if (phase !== "loading") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);

  // Typewriter — only runs in typing phase
  React.useEffect(() => {
    if (phase !== "typing") return;
    setShown("");
    setDone(false);
    if (!text) return;
    const interval = 1000 / cps;
    let i = 0;
    const tick = setInterval(() => {
      i++;
      if (i >= text.length) {
        setShown(text);
        setDone(true);
        clearInterval(tick);
        onComplete?.();
      } else {
        setShown(text.slice(0, i));
      }
    }, interval);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, text]);

  const elapsedSec = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;

  // Strip step-numbering prefix (e.g., "Step 11.5 — " or "最後 — ") from
  // titles when displaying — CJ wants only the content title, not the
  // numbering chrome (counter chip is already gone).
  const cleanTitle = stepTitle?.replace(/^(?:Step\s+\S+|最後)\s*[—\-]\s*/u, "") ?? "";

  return (
    <Card
      shadow="none"
      className={`border border-divider bg-default-50 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
    >
      <CardBody className="px-5 py-4 gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-content1 border border-divider">
            <FontAwesomeIcon icon={faUserTie} className="text-default-600 text-tiny" />
          </span>
          {cleanTitle && (
            <span className="text-small font-medium truncate">{cleanTitle}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {phase === "loading" && (
              <>
                <Spinner size="sm" color="primary" />
                <span className="text-tiny text-default-500">
                  Anthropic 分析中…<span className="font-mono ml-1">{elapsedSec}s</span>
                </span>
              </>
            )}
            {phase === "typing" && !done && (
              <span className="text-tiny text-default-400 animate-pulse">推理 streaming…</span>
            )}
            {phase === "typing" && done && (
              <Chip size="sm" variant="flat" color="default">推理完成</Chip>
            )}
            {phase === "writing" && (
              <Chip size="sm" variant="flat" color="success"
                startContent={<FontAwesomeIcon icon={faPenNib} className="text-tiny ml-1" />}>
                正在寫入欄位…
              </Chip>
            )}
          </div>
        </div>

        {phase === "loading" && (
          <div className="text-small text-default-600 leading-relaxed">
            <p>系統正在執行：</p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-default-500">
              <li>Web search 抓取產業 / 競品 / 受眾資料</li>
              <li>Anthropic Claude Sonnet 4.5 推理（依本步驟的指令 規範）</li>
              <li>結構化輸出符合 segment schema 的 JSON</li>
            </ul>
            <p className="mt-2 text-tiny text-default-400">
              這個步驟通常需要 <strong>20-60 秒</strong>。請耐心等候 — 系統不是當機，是在認真思考。
            </p>
          </div>
        )}

        {phase === "typing" && (
          <pre className="text-small text-default-600 leading-relaxed whitespace-pre-wrap font-sans m-0 max-h-[300px] overflow-y-auto">
            {shown}
            {!done && <span className="inline-block w-2 h-4 bg-default-500 align-middle ml-0.5 animate-pulse" />}
          </pre>
        )}

        {phase === "writing" && (
          <p className="text-small text-default-600 leading-relaxed">
            分析完成。正在把結論寫入下方欄位 — 請看下方表單。
          </p>
        )}
      </CardBody>
    </Card>
  );
}
