/**
 * DocMockup — Word/Notion-like document mockup for strategic + intake steps.
 *
 * Used for:
 *   - strategic steps  (research, brand context, SWOT, frameworks)
 *   - intake/decision steps (agent pre-fills, user reviews & edits)
 *   - QA review steps
 *
 * 2026-05-02 CJ direction:
 *   • "✓ 滿意，下一步" button must be inline (not hidden in right panel)
 *   • Intake steps (isEditable=true) show an editable textarea so users
 *     can revise agent's pre-filled content before confirming
 */
import React, { useState } from "react";
import { Avatar, Button, Chip, Divider, ScrollShadow, Skeleton, Textarea } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileLines, faClock, faUser, faCheckCircle, faRotateRight, faPenToSquare,
} from "@fortawesome/free-solid-svg-icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type MockupFields, MockupHeader, dicebear } from "./shared";

interface DocMockupProps extends MockupFields {
  /** Agent's markdown output (live or final) */
  body?: string | null;
  /** Step name shown as document subtitle */
  stepName?: string;
  /** Agent doing the writing */
  agentName?: string | null;
  /** Status: pending | running | drafted | confirmed */
  status?: string;
  /** When true (intake steps), body is editable before confirm */
  isEditable?: boolean;
  /** Called when user clicks ✓ 滿意，下一步 — receives final text */
  onConfirm?: (editedContent: string) => void;
  /** Called when user clicks 重做 */
  onRedo?: () => void;
  /** Whether a mutation is in-flight */
  isMutating?: boolean;
}

export function DocMockup({
  title, brief, brandName,
  body, stepName, agentName, status = "pending",
  variantLabel,
  isEditable = false,
  onConfirm, onRedo, isMutating = false,
}: DocMockupProps) {
  const isWriting = status === "running" || (!body && status === "drafted");
  const isDone = status === "confirmed";
  const hasContent = !!(body && body.trim().length > 0);
  const canAct = status === "drafted" && hasContent;

  // Local edit state for intake steps
  const [editedBody, setEditedBody] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);

  // Sync editedBody when body first arrives
  React.useEffect(() => {
    if (body && !editedBody) setEditedBody(body);
  }, [body]);

  const finalBody = isEditing ? editedBody : (body ?? "");

  return (
    <div className="w-full max-w-[760px] mx-auto">
      <MockupHeader icon={faFileLines} label="策略文件" variantLabel={variantLabel ?? (isEditable ? "Intake 確認" : "策略文件")} />

      {/* Document paper */}
      <div className="bg-content1 border border-divider rounded-medium shadow-2xl overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-divider bg-default-50">
          <div className="flex items-center gap-2 min-w-0">
            <FontAwesomeIcon icon={faFileLines} className="text-default-500" />
            <p className="text-small font-medium truncate">
              {stepName ? `${title} · ${stepName}` : title}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isWriting && (
              <Chip size="sm" variant="flat" color="secondary"
                startContent={<FontAwesomeIcon icon={faClock} className="text-tiny ml-1" />}>
                撰寫中
              </Chip>
            )}
            {canAct && !isDone && (
              <Chip size="sm" variant="flat" color="warning">等待確認</Chip>
            )}
            {isDone && (
              <Chip size="sm" variant="flat" color="success"
                startContent={<FontAwesomeIcon icon={faCheckCircle} className="text-tiny ml-1" />}>
                已確認
              </Chip>
            )}
            {/* Edit toggle for editable intake docs */}
            {isEditable && canAct && !isDone && onConfirm && (
              <Button
                size="sm" variant="light" radius="md"
                startContent={<FontAwesomeIcon icon={faPenToSquare} />}
                onPress={() => { setIsEditing((v) => !v); if (!isEditing) setEditedBody(body ?? ""); }}
              >
                {isEditing ? "預覽" : "編輯"}
              </Button>
            )}
          </div>
        </div>

        {/* Page surface */}
        <ScrollShadow className="max-h-[560px]">
          <div className="px-12 py-12 sm:px-16 sm:py-14">
            {/* Title block */}
            <h1 className="font-semibold text-3xl tracking-tight leading-tight">
              {stepName ?? title}
            </h1>
            <div className="mt-3 flex items-center gap-2 text-tiny text-default-500">
              {agentName && (
                <>
                  <Avatar src={dicebear(agentName)} size="sm" classNames={{ base: "w-5 h-5" }} />
                  <span>{agentName}</span>
                  <span>·</span>
                </>
              )}
              <FontAwesomeIcon icon={faUser} />
              <span>{brandName ?? "Your Brand"}</span>
              <span>·</span>
              <span>{new Date().toLocaleDateString("zh-TW")}</span>
            </div>

            <Divider className="my-6" />

            {/* Body — editable textarea OR rendered markdown */}
            {hasContent ? (
              isEditing ? (
                <Textarea
                  variant="bordered" radius="md"
                  minRows={10} maxRows={30}
                  value={editedBody}
                  onValueChange={setEditedBody}
                  className="font-mono text-small"
                  placeholder="編輯 agent 預填的內容…"
                />
              ) : (
                <article
                  className={[
                    "prose prose-sm max-w-none",
                    "prose-headings:tracking-tight prose-headings:font-semibold prose-headings:text-foreground",
                    "prose-h1:text-2xl prose-h1:mt-8 prose-h1:mb-3 prose-h1:pb-2 prose-h1:border-b prose-h1:border-divider",
                    "prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-2",
                    "prose-h3:text-base prose-h3:mt-4 prose-h3:mb-1",
                    "prose-p:leading-7 prose-p:text-foreground prose-p:my-2",
                    "prose-ul:my-2 prose-ul:pl-4 prose-ol:my-2 prose-ol:pl-4",
                    "prose-li:my-1 prose-li:leading-6",
                    "prose-strong:font-semibold prose-strong:text-foreground",
                    "prose-em:text-default-600",
                    "prose-hr:my-4 prose-hr:border-divider",
                    "prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:pl-4 prose-blockquote:text-default-600 prose-blockquote:italic",
                    "prose-code:text-tiny prose-code:bg-default-100 prose-code:rounded prose-code:px-1 prose-code:text-secondary",
                    "prose-pre:bg-default-100 prose-pre:rounded-lg prose-pre:text-tiny",
                    "prose-table:text-small prose-th:bg-default-50 prose-td:border prose-td:border-divider prose-th:border prose-th:border-divider",
                  ].join(" ")}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalBody}</ReactMarkdown>
                </article>
              )
            ) : isWriting ? (
              <div className="space-y-3">
                <p className="text-tiny text-default-500 mb-4 flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                  {agentName ?? "agent"} 正在撰寫中…
                </p>
                <Skeleton className="h-4 w-[40%] rounded" />
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-[96%] rounded" />
                <Skeleton className="h-3 w-[88%] rounded" />
                <div className="h-3" />
                <Skeleton className="h-4 w-[35%] rounded" />
                <Skeleton className="h-3 w-[92%] rounded" />
                <Skeleton className="h-3 w-[80%] rounded" />
                <Skeleton className="h-3 w-[68%] rounded" />
                <div className="h-3" />
                <Skeleton className="h-3 w-[78%] rounded" />
                <Skeleton className="h-3 w-[72%] rounded" />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-small text-default-500 italic">
                  {brief || "等待 agent 開始填寫…"}
                </p>
                <Skeleton className="h-3 w-[88%] rounded opacity-50" />
                <Skeleton className="h-3 w-[72%] rounded opacity-50" />
                <Skeleton className="h-3 w-[60%] rounded opacity-50" />
              </div>
            )}
          </div>
        </ScrollShadow>

        {/* ── Inline action bar — always visible when step is drafted ── */}
        {canAct && !isDone && (onConfirm || onRedo) && (
          <div className="px-5 py-4 border-t border-divider bg-default-50 flex items-center gap-2">
            {onConfirm && (
              <Button
                color="success" size="md" radius="lg"
                className="flex-1 font-semibold"
                isLoading={isMutating}
                isDisabled={isMutating}
                startContent={!isMutating && <FontAwesomeIcon icon={faCheckCircle} />}
                onPress={() => onConfirm(isEditing ? editedBody : (body ?? ""))}
              >
                ✓ 確認，下一步
              </Button>
            )}
            {onRedo && (
              <Button
                variant="bordered" size="md" radius="lg"
                isDisabled={isMutating}
                startContent={<FontAwesomeIcon icon={faRotateRight} />}
                onPress={onRedo}
              >
                重做
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
