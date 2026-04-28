/**
 * ThinkingOverlay — typewriter effect for streamed agent reasoning.
 *
 * Sits above the SegmentEditor while the pipeline runner is targeting
 * this segment. Reads `text` prop and types it out at a fixed rate, then
 * fades and hands off to the field-write animation.
 */
import React from "react";
import { Card, CardBody, Chip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot } from "@fortawesome/free-solid-svg-icons";

export interface ThinkingOverlayProps {
  /** Full reasoning text — gets typed character-by-character. */
  text: string;
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
}

export default function ThinkingOverlay({
  text, stepNum, stepTotal, stepTitle, cps = 35, onComplete, visible = true,
}: ThinkingOverlayProps) {
  const [shown, setShown] = React.useState("");
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
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
  }, [text]);

  return (
    <Card
      shadow="none"
      className={`border border-divider bg-default-50 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
    >
      <CardBody className="px-5 py-4 gap-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-content1 border border-divider">
            <FontAwesomeIcon icon={faRobot} className="text-default-600 text-tiny" />
          </span>
          {stepNum && stepTotal && (
            <Chip size="sm" variant="flat" color="default">
              {stepNum} / {stepTotal}
            </Chip>
          )}
          {stepTitle && (
            <span className="text-small font-medium truncate">{stepTitle}</span>
          )}
          {!done && (
            <span className="text-tiny text-default-400 ml-auto animate-pulse">分析中…</span>
          )}
          {done && (
            <Chip size="sm" variant="flat" color="success" className="ml-auto">推理完成 — 寫入欄位</Chip>
          )}
        </div>
        <pre className="text-small text-default-600 leading-relaxed whitespace-pre-wrap font-sans m-0">
          {shown}
          {!done && <span className="inline-block w-2 h-4 bg-default-500 align-middle ml-0.5 animate-pulse" />}
        </pre>
      </CardBody>
    </Card>
  );
}
