/**
 * ResearchPanelMockup — squad step 2 output: deep audience × competitor research.
 *
 * Renders:
 *   - Thinking trace (typewriter-able)
 *   - Sources panel (URL list with char counts)
 *   - Conclusion summary (key findings)
 *   - Budget meter (X/8 URLs · Y/12000 chars)
 */
import React from "react";
import { Chip, Progress, Card, CardBody, Spinner } from "@heroui/react";
import { SectionHeader, NotionCard, EmptyHint, type SquadMockupCommonProps } from "./shared";

export interface ResearchSource {
  url: string;
  title: string;
  charCount: number;
  excerpt: string;
}

export interface ResearchData {
  thinking?: string;            // long-form reasoning trace
  conclusion?: string;          // distilled summary (markdown OK)
  sources?: ResearchSource[];
  budget?: { minUrls: number; minChars: number };
  isStreaming?: boolean;        // when LLM is mid-flight
}

interface Props extends SquadMockupCommonProps {
  data?: ResearchData;
}

export function ResearchPanelMockup({ data, isActive = false }: Props) {
  if (!data || (!data.thinking && !data.conclusion && (!data.sources || data.sources.length === 0))) {
    return (
      <NotionCard>
        <SectionHeader icon="🔬" eyebrow="STEP 2 · RESEARCH" title="支柱受眾 × 競品缺口深度研究" />
        <EmptyHint>{isActive ? "Stacy Lin 研究中…" : "步驟 2 跑完才會有研究內容"}</EmptyHint>
      </NotionCard>
    );
  }

  const sources = data.sources ?? [];
  const totalChars = sources.reduce((s, src) => s + (src.charCount || 0), 0);
  const budget = data.budget ?? { minUrls: 8, minChars: 12000 };
  const urlsPct  = Math.min(100, (sources.length / Math.max(1, budget.minUrls))  * 100);
  const charsPct = Math.min(100, (totalChars       / Math.max(1, budget.minChars)) * 100);
  const urlsOk   = sources.length >= budget.minUrls;
  const charsOk  = totalChars       >= budget.minChars;

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      {/* Header */}
      <NotionCard>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <SectionHeader
            icon="🔬"
            eyebrow="STEP 2 · RESEARCH"
            title="Pillar 受眾 × 競品 gap 深度研究"
          />
          {(isActive || data.isStreaming) && (
            <Chip
              size="sm"
              variant="flat"
              color="primary"
              startContent={<Spinner size="sm" classNames={{ wrapper: "scale-75" }} />}
            >
              ● Stacy Lin 研究中…
            </Chip>
          )}
        </div>

        {/* Budget bars */}
        <div className="flex flex-col gap-2 mt-1">
          <div>
            <div className="flex items-center justify-between text-tiny mb-1">
              <span className="text-default-500">URL 來源</span>
              <span className={urlsOk ? "text-success font-semibold" : "text-default-700"}>
                {sources.length} / {budget.minUrls}
              </span>
            </div>
            <Progress size="sm" value={urlsPct} color={urlsOk ? "success" : "primary"} aria-label="urls budget" />
          </div>
          <div>
            <div className="flex items-center justify-between text-tiny mb-1">
              <span className="text-default-500">內容字數</span>
              <span className={charsOk ? "text-success font-semibold" : "text-default-700"}>
                {totalChars.toLocaleString()} / {budget.minChars.toLocaleString()}
              </span>
            </div>
            <Progress size="sm" value={charsPct} color={charsOk ? "success" : "primary"} aria-label="chars budget" />
          </div>
        </div>
      </NotionCard>

      {/* Conclusion */}
      {data.conclusion && (
        <NotionCard>
          <p className="text-tiny text-default-500 uppercase tracking-wider mb-1">研究結論</p>
          <pre className="text-small text-default-700 leading-relaxed whitespace-pre-wrap font-sans m-0">
            {data.conclusion}
          </pre>
        </NotionCard>
      )}

      {/* Thinking trace */}
      {data.thinking && (
        <NotionCard>
          <p className="text-tiny text-default-500 uppercase tracking-wider mb-1">推理軌跡</p>
          <pre className="text-tiny text-default-600 leading-relaxed whitespace-pre-wrap font-sans m-0 max-h-[260px] overflow-y-auto">
            {data.thinking}
          </pre>
        </NotionCard>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <NotionCard>
          <p className="text-tiny text-default-500 uppercase tracking-wider mb-2">
            來源（{sources.length} 筆 · {totalChars.toLocaleString()} 字）
          </p>
          <div className="flex flex-col gap-2">
            {sources.map((s, i) => (
              <Card key={i} shadow="none" className="border border-divider">
                <CardBody className="p-3 gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-small font-medium text-primary hover:underline truncate min-w-0"
                    >
                      {s.title || s.url}
                    </a>
                    <Chip size="sm" variant="flat" className="shrink-0 h-5 text-tiny tabular-nums">
                      {s.charCount.toLocaleString()} 字
                    </Chip>
                  </div>
                  <p className="text-tiny text-default-500 truncate">{s.url}</p>
                  {s.excerpt && (
                    <p className="text-tiny text-default-700 leading-relaxed line-clamp-2">{s.excerpt}</p>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </NotionCard>
      )}
    </div>
  );
}
