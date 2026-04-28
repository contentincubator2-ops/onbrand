/**
 * PromptLibrary — render scope-specific prompt templates with variables
 * auto-filled from the active positioning JSON. Each template card has
 * copy-to-clipboard buttons for ChatGPT / Claude / Gemini / Midjourney.
 */
import React from "react";
import { Card, CardBody, Chip, Button, Tooltip, Tabs, Tab } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faCheck, faRobot } from "@fortawesome/free-solid-svg-icons";
import {
  SCOPE_PROMPTS, buildVariableMap, interpolatePrompt,
  type PromptTemplate, type LLM,
} from "../../lib/positioningPrompts";

interface PromptLibraryProps {
  scopeMode: "brand" | "product" | "event";
  scopeName: string;
  data: any;
}

export default function PromptLibrary({ scopeMode, scopeName, data }: PromptLibraryProps) {
  const templates = SCOPE_PROMPTS[scopeMode] ?? [];
  const vars = buildVariableMap(scopeMode, data, scopeName);

  // Group templates by category
  const grouped = templates.reduce<Record<string, PromptTemplate[]>>((acc, t) => {
    (acc[t.category] = acc[t.category] ?? []).push(t);
    return acc;
  }, {});
  const categories = Object.keys(grouped);
  const [activeCat, setActiveCat] = React.useState<string>(categories[0] ?? "");
  React.useEffect(() => {
    if (!activeCat && categories.length) setActiveCat(categories[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeMode]);

  return (
    <div className="flex flex-col gap-4">
      <Card shadow="none" className="border border-divider">
        <CardBody className="px-5 py-4 gap-1">
          <p className="text-tiny text-default-500 uppercase tracking-wider">
            {scopeMode.toUpperCase()} · AI 指令庫
          </p>
          <h2 className="text-xl font-semibold tracking-tight">{scopeName}</h2>
          <p className="text-small text-default-500">
            開箱即用的 prompt 模板，{templates.length} 個範本。變數已從定位書自動填入；未填的會保留 {"{變數}"} 佔位待你補。
          </p>
        </CardBody>
      </Card>

      <Tabs
        aria-label="prompt categories"
        selectedKey={activeCat}
        onSelectionChange={(k) => setActiveCat(String(k))}
        variant="underlined"
        color="primary"
      >
        {categories.map((cat) => (
          <Tab
            key={cat}
            title={
              <span className="flex items-center gap-2">
                {cat}
                <Chip size="sm" variant="flat" className="h-4 text-tiny">
                  {grouped[cat]!.length}
                </Chip>
              </span>
            }
          />
        ))}
      </Tabs>

      <div className="flex flex-col gap-3">
        {(grouped[activeCat] ?? []).map((tpl) => (
          <PromptCard key={tpl.id} template={tpl} vars={vars} />
        ))}
      </div>
    </div>
  );
}

function PromptCard({ template, vars }: { template: PromptTemplate; vars: Record<string, string> }) {
  const filled = interpolatePrompt(template.body, vars);
  const [copied, setCopied] = React.useState<LLM | null>(null);

  const onCopy = async (llm: LLM) => {
    try {
      await navigator.clipboard.writeText(filled);
      setCopied(llm);
      setTimeout(() => setCopied(null), 1800);
    } catch { /* ignore */ }
  };

  // Identify variables that are still unfilled (template still has {變數})
  const unfilled = template.variables.filter((v) => !vars[v] || !vars[v].trim());

  return (
    <Card shadow="none" className="border border-divider">
      <CardBody className="p-5 gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-medium font-semibold truncate">{template.title}</p>
            <p className="text-small text-default-500 mt-0.5">{template.description}</p>
          </div>
          <div className="flex items-center gap-2">
            {template.llms.map((llm) => (
              <Tooltip key={llm} content={`複製到 ${llmLabel(llm)}`} placement="top">
                <Button
                  size="sm"
                  variant="bordered"
                  radius="full"
                  startContent={
                    copied === llm
                      ? <FontAwesomeIcon icon={faCheck} className="text-tiny text-success" />
                      : <FontAwesomeIcon icon={faCopy} className="text-tiny" />
                  }
                  onPress={() => onCopy(llm)}
                >
                  {llmLabel(llm)}
                </Button>
              </Tooltip>
            ))}
          </div>
        </div>

        <pre className="text-small bg-default-50 border border-divider rounded-md p-3 leading-relaxed whitespace-pre-wrap font-sans m-0 max-h-[260px] overflow-y-auto">
          {filled}
        </pre>

        {unfilled.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <FontAwesomeIcon icon={faRobot} className="text-tiny text-default-400" />
            <span className="text-tiny text-default-500">尚未填入：</span>
            {unfilled.map((v) => (
              <Chip key={v} size="sm" variant="flat" color="warning" className="h-4 text-tiny">
                {`{${v}}`}
              </Chip>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function llmLabel(llm: LLM): string {
  if (llm === "chatgpt") return "ChatGPT";
  if (llm === "claude")  return "Claude";
  if (llm === "gemini")  return "Gemini";
  if (llm === "midjourney") return "Midjourney";
  return llm;
}
