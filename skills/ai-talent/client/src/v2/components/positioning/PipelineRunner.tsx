/**
 * PipelineRunner — floating control panel + state machine for the
 * 11-step (12 with goldenCircle distillation) brand positioning research.
 *
 * State is hoisted to BrandsPage so changing currentStep also auto-jumps
 * the sub-nav (setSection on the parent). The runner pane shows progress,
 * play / pause / skip controls, and emits onWriteSegment(segmentId, value)
 * when each step completes.
 */
import React from "react";
import { Card, CardBody, Button, Chip, Progress } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlay, faPause, faForward, faStop, faWandSparkles, faCheck } from "@fortawesome/free-solid-svg-icons";
import type { PipelineStepSpec, PipelineStatus } from "../../lib/positioningPipeline";

export interface PipelineState {
  status: PipelineStatus;
  /** Index into the steps array (0-based). */
  cursor: number;
  /** Step ids that have completed. */
  completed: number[];
}

interface PipelineRunnerProps {
  steps: PipelineStepSpec[];
  state: PipelineState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onStop: () => void;
}

export default function PipelineRunner({
  steps, state, onStart, onPause, onResume, onSkip, onStop,
}: PipelineRunnerProps) {
  const total = steps.length;
  const current = steps[state.cursor];
  const pct = state.status === "done"
    ? 100
    : Math.round((state.completed.length / total) * 100);

  return (
    <Card
      shadow="sm"
      className="border border-divider sticky top-2 z-20"
    >
      <CardBody className="px-5 py-3 gap-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-default-100 border border-divider">
              <FontAwesomeIcon icon={faWandSparkles} className="text-default-600 text-tiny" />
            </span>
            <p className="text-small font-medium">品牌定位分析</p>
            {state.status === "running" && (
              <Chip size="sm" variant="flat" color="primary">
                Step {state.completed.length + 1} / {total}
              </Chip>
            )}
            {state.status === "paused" && (
              <Chip size="sm" variant="flat" color="warning">已暫停</Chip>
            )}
            {state.status === "done" && (
              <Chip size="sm" variant="flat" color="success" startContent={<FontAwesomeIcon icon={faCheck} className="text-tiny ml-1" />}>
                完成
              </Chip>
            )}
          </div>
          <div className="flex items-center gap-2">
            {state.status === "idle" && (
              <Button size="sm" color="primary" startContent={<FontAwesomeIcon icon={faPlay} />} onPress={onStart}>
                開始分析
              </Button>
            )}
            {state.status === "running" && (
              <>
                <Button size="sm" variant="bordered" startContent={<FontAwesomeIcon icon={faPause} />} onPress={onPause}>
                  暫停
                </Button>
                <Button size="sm" variant="bordered" startContent={<FontAwesomeIcon icon={faForward} />} onPress={onSkip}>
                  跳過此步
                </Button>
                <Button size="sm" variant="light" startContent={<FontAwesomeIcon icon={faStop} />} onPress={onStop}>
                  停止
                </Button>
              </>
            )}
            {state.status === "paused" && (
              <>
                <Button size="sm" color="primary" startContent={<FontAwesomeIcon icon={faPlay} />} onPress={onResume}>
                  繼續
                </Button>
                <Button size="sm" variant="light" startContent={<FontAwesomeIcon icon={faStop} />} onPress={onStop}>
                  停止
                </Button>
              </>
            )}
            {state.status === "done" && (
              <Button size="sm" variant="light" onPress={onStop}>
                關閉
              </Button>
            )}
          </div>
        </div>
        {state.status !== "idle" && (
          <>
            <Progress
              size="sm"
              value={pct}
              color={state.status === "done" ? "success" : "primary"}
              aria-label="進度"
            />
            {current && state.status !== "done" && (
              <p className="text-tiny text-default-500 truncate">
                目前：{current.title}
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
