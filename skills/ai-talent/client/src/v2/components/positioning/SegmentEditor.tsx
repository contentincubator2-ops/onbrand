/**
 * SegmentEditor — generic form renderer for one positioning segment.
 *
 * Reads a SegmentSpec (from positioningSchema.ts) and the current value
 * for that segment, renders one of: text / textarea / array (string list)
 * / tableRows / number per field. Calls onChange(value) on every edit so
 * the parent can debounce + persist.
 *
 * Top-right of the segment header shows a "由 {agent} 幫我填寫" button —
 * Phase 5 stub: alert until Phase 6 wires the agent runner.
 */
import React from "react";
import { Card, CardBody, CardHeader, Button, Input, Textarea, Chip, Tooltip } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRobot, faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import type { SegmentSpec, FieldSpec } from "../../lib/positioningSchema";

export interface SegmentEditorProps {
  spec: SegmentSpec;
  value: any;
  onChange: (next: any) => void;
  /** Called when user clicks the "由 agent 幫我填寫" button. */
  onRunAgent?: (agentSlug: string) => void;
}

export default function SegmentEditor({ spec, value, onChange, onRunAgent }: SegmentEditorProps) {
  const v = value ?? {};
  const setField = (key: string, next: any) => onChange({ ...v, [key]: next });

  return (
    <Card shadow="none" className="border border-divider">
      <CardHeader className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <Chip size="sm" variant="flat" color="default" className="shrink-0">
            {spec.num}
          </Chip>
          <h3 className="text-medium font-semibold truncate">{spec.title}</h3>
        </div>
        <Tooltip content={`由 ${spec.agent} 幫我填寫`} placement="top">
          <Button
            size="sm"
            variant="bordered"
            radius="full"
            startContent={<FontAwesomeIcon icon={faRobot} className="text-tiny" />}
            onPress={() => onRunAgent?.(spec.agent)}
          >
            自動填寫
          </Button>
        </Tooltip>
      </CardHeader>
      <CardBody className="px-5 pb-5 pt-2 gap-4">
        {spec.fields.map((f) => (
          <FieldRenderer key={f.key} field={f} value={v[f.key]} onChange={(next) => setField(f.key, next)} />
        ))}
      </CardBody>
    </Card>
  );
}

function FieldRenderer({
  field, value, onChange,
}: { field: FieldSpec; value: any; onChange: (v: any) => void }) {
  if (field.type === "text") {
    return (
      <Input
        size="sm"
        radius="md"
        variant="bordered"
        label={field.label}
        labelPlacement="outside"
        placeholder={field.hint}
        value={value ?? ""}
        onValueChange={onChange}
      />
    );
  }
  if (field.type === "number") {
    return (
      <Input
        size="sm"
        type="number"
        radius="md"
        variant="bordered"
        label={field.label}
        labelPlacement="outside"
        value={value != null ? String(value) : ""}
        onValueChange={(s) => onChange(s === "" ? null : Number(s))}
      />
    );
  }
  if (field.type === "textarea") {
    return (
      <Textarea
        size="sm"
        radius="md"
        variant="bordered"
        label={field.label}
        labelPlacement="outside"
        placeholder={field.hint}
        minRows={2}
        value={value ?? ""}
        onValueChange={onChange}
      />
    );
  }
  if (field.type === "array") {
    const arr: string[] = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-col gap-2">
        <label className="text-tiny text-default-500">{field.label}</label>
        {arr.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              size="sm" radius="md" variant="bordered"
              value={item}
              onValueChange={(s) => {
                const next = [...arr]; next[i] = s; onChange(next);
              }}
            />
            <Button
              isIconOnly size="sm" variant="light"
              onPress={() => onChange(arr.filter((_, j) => j !== i))}
              aria-label="移除"
            >
              <FontAwesomeIcon icon={faXmark} className="text-default-400" />
            </Button>
          </div>
        ))}
        <Button
          size="sm" variant="light" radius="md"
          startContent={<FontAwesomeIcon icon={faPlus} className="text-tiny" />}
          onPress={() => onChange([...arr, ""])}
          className="self-start"
        >
          新增一項
        </Button>
      </div>
    );
  }
  if (field.type === "tableRows") {
    const rows: any[] = Array.isArray(value) ? value : [];
    const cols = field.columns ?? [];
    const blank = Object.fromEntries(cols.map((c) => [c.key, ""]));
    return (
      <div className="flex flex-col gap-2">
        <label className="text-tiny text-default-500">{field.label}</label>
        <div className="border border-divider rounded-md overflow-x-auto">
          <table className="w-full text-small">
            <thead className="bg-default-50">
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className="text-left px-3 py-2 text-tiny font-medium text-default-600 border-b border-divider">
                    {c.label}
                  </th>
                ))}
                <th className="w-10 border-b border-divider" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-divider">
                  {cols.map((c) => (
                    <td key={c.key} className="px-2 py-1.5 align-top">
                      {c.type === "textarea" ? (
                        <Textarea
                          size="sm" variant="bordered" minRows={1} radius="sm"
                          classNames={{ inputWrapper: "min-h-0" }}
                          value={row[c.key] ?? ""}
                          onValueChange={(s) => {
                            const next = [...rows]; next[i] = { ...row, [c.key]: s }; onChange(next);
                          }}
                        />
                      ) : c.type === "number" ? (
                        <Input
                          size="sm" type="number" variant="bordered" radius="sm"
                          value={row[c.key] != null ? String(row[c.key]) : ""}
                          onValueChange={(s) => {
                            const next = [...rows]; next[i] = { ...row, [c.key]: s === "" ? null : Number(s) }; onChange(next);
                          }}
                        />
                      ) : (
                        <Input
                          size="sm" variant="bordered" radius="sm"
                          value={row[c.key] ?? ""}
                          onValueChange={(s) => {
                            const next = [...rows]; next[i] = { ...row, [c.key]: s }; onChange(next);
                          }}
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-1 py-1.5">
                    <Button
                      isIconOnly size="sm" variant="light"
                      onPress={() => onChange(rows.filter((_, j) => j !== i))}
                      aria-label="移除"
                    >
                      <FontAwesomeIcon icon={faXmark} className="text-default-400" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          size="sm" variant="light" radius="md"
          startContent={<FontAwesomeIcon icon={faPlus} className="text-tiny" />}
          onPress={() => onChange([...rows, blank])}
          className="self-start"
        >
          新增一列
        </Button>
      </div>
    );
  }
  return null;
}
