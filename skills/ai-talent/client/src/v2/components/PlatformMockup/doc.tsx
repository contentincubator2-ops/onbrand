/**
 * DocMockup — Word/Notion-like document mockup for strategic steps.
 *
 * When a squad step is classified "strategic" (research / brand context /
 * persona / SWOT / framework etc), middle column renders this instead
 * of the platform mockup. The document body fills with the agent's
 * markdown output as it streams in.
 *
 * Pre-output state: skeleton lines + helpful "等待 agent 撰寫" copy.
 */
import React from "react";
import { Avatar, Chip, Divider, ScrollShadow, Skeleton } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileLines, faClock, faUser, faCheckCircle,
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
}

export function DocMockup({
  title, brief, brandName,
  body, stepName, agentName, status = "pending",
  variantLabel,
}: DocMockupProps) {
  const isWriting = status === "running" || (!body && status === "drafted");
  const isDone = status === "confirmed";
  const hasContent = !!(body && body.trim().length > 0);

  return (
    <div className="w-full max-w-[760px] mx-auto">
      <MockupHeader icon={faFileLines} label="策略文件" variantLabel={variantLabel ?? "策略文件"} />

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
            {status === "drafted" && hasContent && (
              <Chip size="sm" variant="flat" color="warning">等待審查</Chip>
            )}
            {isDone && (
              <Chip size="sm" variant="flat" color="success"
                startContent={<FontAwesomeIcon icon={faCheckCircle} className="text-tiny ml-1" />}>
                已確認
              </Chip>
            )}
          </div>
        </div>

        {/* Page surface */}
        <ScrollShadow className="max-h-[640px]">
          <div className="px-12 py-12 sm:px-16 sm:py-16">
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

            {/* Body */}
            {hasContent ? (
              <article
                className={[
                  "prose prose-sm max-w-none",
                  "prose-headings:tracking-tight prose-headings:font-semibold",
                  "prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-2",
                  "prose-h3:text-medium prose-h3:mt-4",
                  "prose-p:leading-relaxed prose-p:text-foreground",
                  "prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
                  "prose-strong:font-semibold",
                  "prose-code:text-tiny prose-code:bg-default-100 prose-code:rounded prose-code:px-1",
                ].join(" ")}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {body!}
                </ReactMarkdown>
              </article>
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
                  {brief || "等待 agent 開始撰寫策略文件…"}
                </p>
                <Skeleton className="h-3 w-[88%] rounded opacity-50" />
                <Skeleton className="h-3 w-[72%] rounded opacity-50" />
                <Skeleton className="h-3 w-[60%] rounded opacity-50" />
              </div>
            )}
          </div>
        </ScrollShadow>
      </div>

      {/* Footer hint */}
      <p className="text-tiny text-default-400 text-center mt-3">
        策略文件即時填入 · 完成後可在右側 ✓ 滿意 解鎖下一步
      </p>
    </div>
  );
}
