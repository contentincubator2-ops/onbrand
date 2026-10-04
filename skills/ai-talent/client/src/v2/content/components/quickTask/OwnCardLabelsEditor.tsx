/**
 * OwnCardLabelsEditor — 自建任務卡在「任務視窗」裡改標題與欄位標題。
 *
 * 2026-10-04（CJ「如果反悔的話，應該給用戶有修改標題、填寫欄位標題的機會，只有自建的卡片才可以」）。
 * 只改文字：卡片名稱、主問題（視窗大標）、額外欄位的標題。欄位的 key 不動（走 askFieldLabels），
 * 否則舊產出存的 inputs 會對不上。SKILL 與範例要改仍走「我的卡」編輯。
 */
import * as React from "react";
import { Button, Input } from "@heroui/react";
import { trpc } from "../../../../lib/trpc";

export interface OwnCardLabelsPatch {
  name: string;
  primaryQuestion: string;
  fieldLabels: Record<string, string>;
}

export default function OwnCardLabelsEditor({
  brandId, cardId, name, primaryQuestion, fields, en, onSaved, onCancel,
}: {
  brandId: number;
  cardId: string;
  name: string;
  primaryQuestion: string;
  /** 額外欄位（不含主問題）。 */
  fields: { key: string; label: string }[];
  en: boolean;
  onSaved: (patch: OwnCardLabelsPatch) => void;
  onCancel: () => void;
}) {
  const [nameV, setNameV] = React.useState(name);
  const [qV, setQV] = React.useState(primaryQuestion);
  const [labels, setLabels] = React.useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((f) => [f.key, f.label])),
  );
  const [error, setError] = React.useState<string | null>(null);
  const mut = (trpc as any).brandTaskCard?.update?.useMutation?.({
    onError: (e: any) => setError(e?.message ?? (en ? "Save failed" : "儲存失敗")),
  });

  const clean = {
    name: nameV.trim(),
    primaryQuestion: qV.trim(),
    fieldLabels: Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, v.trim()])),
  };
  const valid = clean.name.length > 0 && clean.primaryQuestion.length >= 2
    && Object.values(clean.fieldLabels).every((v) => v.length > 0);
  const changed = clean.name !== name || clean.primaryQuestion !== primaryQuestion
    || fields.some((f) => clean.fieldLabels[f.key] !== f.label);

  async function save(): Promise<void> {
    setError(null);
    try {
      await mut?.mutateAsync({
        brandId, cardId,
        name: clean.name,
        primaryQuestion: clean.primaryQuestion,
        ...(fields.length > 0 ? { askFieldLabels: clean.fieldLabels } : {}),
      });
      onSaved(clean);
    } catch { /* onError 已顯示 */ }
  }

  return (
    <div className="rounded-2xl border border-default-200 bg-default-50 p-3 space-y-2" data-own-card-editor>
      <p className="text-tiny text-default-500">
        {en
          ? "Only the wording changes — your SKILL and samples stay as they are."
          : "只改文字，不會動到這張卡的 SKILL 與範例。"}
      </p>
      <Input size="sm" label={en ? "Card name" : "卡片名稱"} value={nameV} onValueChange={setNameV} maxLength={60} />
      <Input size="sm" label={en ? "Main question (the big title)" : "主問題（視窗大標題）"} value={qV} onValueChange={setQV} maxLength={200} />
      {fields.map((f) => (
        <Input
          key={f.key} size="sm"
          label={en ? "Field title" : "欄位標題"}
          value={labels[f.key] ?? ""}
          onValueChange={(v) => setLabels((p) => ({ ...p, [f.key]: v }))}
          maxLength={40}
        />
      ))}
      {error && <p className="text-tiny text-danger-500">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="light" onPress={onCancel}>{en ? "Cancel" : "取消"}</Button>
        <Button size="sm" color="primary" isLoading={!!mut?.isLoading} isDisabled={!valid || !changed} onPress={save}>
          {en ? "Save" : "儲存"}
        </Button>
      </div>
    </div>
  );
}
