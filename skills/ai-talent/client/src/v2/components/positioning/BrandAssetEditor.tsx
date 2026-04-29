/**
 * BrandAssetEditor — manual-fill form for non-positioning brand assets:
 * logo / colors / fonts / photos. Stored under
 *   brands.positioning._assets[<key>]
 * via the same scope.savePositioning mutation. Per CJ direction these
 * are user-supplied (no LLM auto-fill); 圖像/圖示/圖表 are dropped.
 */
import React from "react";
import {
  Card, CardBody, CardHeader, Chip, Input, Textarea, Button, Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenNib, faPalette, faFont, faImages, faPlus, faXmark, faSave,
} from "@fortawesome/free-solid-svg-icons";

export type AssetKey = "logo" | "colors" | "fonts" | "photos" | "guidelines" | "templates";

interface AssetEditorProps {
  assetKey: AssetKey;
  value: any;
  onChange: (next: any) => void;
}

const META: Record<AssetKey, { icon: any; title: string; sub: string }> = {
  logo:        { icon: faPenNib,  title: "標誌", sub: "上傳 logo URL 或描述使用規範" },
  colors:      { icon: faPalette, title: "顏色", sub: "品牌主色、輔助色、互補色" },
  fonts:       { icon: faFont,    title: "字型", sub: "中英文主字型、襯線 / 無襯線、特殊字" },
  photos:      { icon: faImages,  title: "照片", sub: "團隊照、產品照、空間照（URL 列表）" },
  guidelines:  { icon: faPenNib,  title: "準則", sub: "品牌使用規範、設計原則" },
  templates:   { icon: faPenNib,  title: "品牌範本", sub: "簡報 / 名片 / 信件範本連結" },
};

export default function BrandAssetEditor({ assetKey, value, onChange }: AssetEditorProps) {
  const meta = META[assetKey];
  const v = value ?? {};

  return (
    <Card shadow="none" className="border border-divider">
      <CardHeader className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <Chip size="sm" variant="flat" color="default" className="shrink-0">
            <FontAwesomeIcon icon={meta.icon} className="text-tiny mr-1" />
            ASSET
          </Chip>
          <div className="min-w-0">
            <h3 className="text-medium font-semibold truncate">{meta.title}</h3>
            <p className="text-tiny text-default-500 truncate">{meta.sub}</p>
          </div>
        </div>
      </CardHeader>
      <CardBody className="px-5 pb-5 pt-2 gap-4">
        {assetKey === "logo"     && <LogoFields     v={v} onChange={onChange} />}
        {assetKey === "colors"   && <ColorFields    v={v} onChange={onChange} />}
        {assetKey === "fonts"    && <FontFields     v={v} onChange={onChange} />}
        {assetKey === "photos"   && <PhotoFields    v={v} onChange={onChange} />}
        {assetKey === "guidelines"  && <GenericTextarea v={v} onChange={onChange} keyName="text" label="準則內容" />}
        {assetKey === "templates"   && <GenericTextarea v={v} onChange={onChange} keyName="links" label="範本連結列表（每行一筆）" />}
      </CardBody>
    </Card>
  );
}

function LogoFields({ v, onChange }: { v: any; onChange: (next: any) => void }) {
  return (
    <>
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label="主 logo URL（PNG / SVG）"
        placeholder="https://example.com/logo.svg"
        value={v.primaryUrl ?? ""}
        onValueChange={(s) => onChange({ ...v, primaryUrl: s })}
      />
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label="深色背景 logo URL（白底版本）"
        placeholder="https://example.com/logo-dark.svg"
        value={v.darkUrl ?? ""}
        onValueChange={(s) => onChange({ ...v, darkUrl: s })}
      />
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label="Icon / Favicon URL"
        placeholder="https://example.com/icon.png"
        value={v.iconUrl ?? ""}
        onValueChange={(s) => onChange({ ...v, iconUrl: s })}
      />
      <Textarea size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label="使用規範" minRows={2}
        placeholder="例：最小尺寸 24px / 留白邊距 / 禁止變形"
        value={v.guidelines ?? ""}
        onValueChange={(s) => onChange({ ...v, guidelines: s })}
      />
    </>
  );
}

function ColorFields({ v, onChange }: { v: any; onChange: (next: any) => void }) {
  const colors: any[] = Array.isArray(v.list) ? v.list : [];
  const update = (i: number, key: string, val: string) => {
    const next = colors.map((c, j) => j === i ? { ...c, [key]: val } : c);
    onChange({ ...v, list: next });
  };
  const add = () => onChange({ ...v, list: [...colors, { name: "", hex: "", role: "" }] });
  const remove = (i: number) => onChange({ ...v, list: colors.filter((_, j) => j !== i) });

  return (
    <>
      <p className="text-tiny text-default-500">每筆色票包含名稱、Hex 色碼、角色（主色 / 輔助色 / 警示等）。</p>
      <div className="flex flex-col gap-2">
        {colors.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="shrink-0 w-9 h-9 rounded-md border border-divider"
              style={{ backgroundColor: c.hex || "#f5f5f5" }}
              title={c.hex}
            />
            <Input size="sm" variant="bordered" placeholder="名稱（如 SoWork 藍）" value={c.name ?? ""} onValueChange={(s) => update(i, "name", s)} className="flex-1" />
            <Input size="sm" variant="bordered" placeholder="#0066FF" value={c.hex ?? ""} onValueChange={(s) => update(i, "hex", s)} className="w-32" />
            <Input size="sm" variant="bordered" placeholder="角色" value={c.role ?? ""} onValueChange={(s) => update(i, "role", s)} className="w-32" />
            <Tooltip content="移除">
              <Button isIconOnly size="sm" variant="light" onPress={() => remove(i)} aria-label="移除">
                <FontAwesomeIcon icon={faXmark} className="text-default-400" />
              </Button>
            </Tooltip>
          </div>
        ))}
      </div>
      <Button size="sm" variant="light" startContent={<FontAwesomeIcon icon={faPlus} className="text-tiny" />} onPress={add} className="self-start">
        新增色票
      </Button>
    </>
  );
}

function FontFields({ v, onChange }: { v: any; onChange: (next: any) => void }) {
  return (
    <>
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label="主中文字型"
        placeholder="例：Noto Sans TC / 思源黑體"
        value={v.zhPrimary ?? ""}
        onValueChange={(s) => onChange({ ...v, zhPrimary: s })}
      />
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label="主英文字型"
        placeholder="例：Inter / SF Pro"
        value={v.enPrimary ?? ""}
        onValueChange={(s) => onChange({ ...v, enPrimary: s })}
      />
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label="標題用襯線字（可選）"
        placeholder="例：Source Han Serif TC"
        value={v.serifDisplay ?? ""}
        onValueChange={(s) => onChange({ ...v, serifDisplay: s })}
      />
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label="等寬 / 程式碼字型（可選）"
        placeholder="例：JetBrains Mono"
        value={v.mono ?? ""}
        onValueChange={(s) => onChange({ ...v, mono: s })}
      />
      <Textarea size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label="字型使用規範" minRows={2}
        placeholder="例：H1 用 thin / 內文用 regular 14px"
        value={v.guidelines ?? ""}
        onValueChange={(s) => onChange({ ...v, guidelines: s })}
      />
    </>
  );
}

function PhotoFields({ v, onChange }: { v: any; onChange: (next: any) => void }) {
  const urls: string[] = Array.isArray(v.urls) ? v.urls : [];
  return (
    <>
      <p className="text-tiny text-default-500">每行一個 URL（團隊照 / 產品照 / 空間照 ...）</p>
      <Textarea size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label="照片 URL 列表" minRows={4}
        placeholder="https://example.com/team.jpg&#10;https://example.com/office.jpg"
        value={urls.join("\n")}
        onValueChange={(s) => onChange({ ...v, urls: s.split(/\r?\n/).map((u) => u.trim()).filter(Boolean) })}
      />
    </>
  );
}

function GenericTextarea({ v, onChange, keyName, label }: { v: any; onChange: (next: any) => void; keyName: string; label: string }) {
  return (
    <Textarea
      size="sm" radius="md" variant="bordered" labelPlacement="outside"
      label={label} minRows={4}
      value={v[keyName] ?? ""}
      onValueChange={(s) => onChange({ ...v, [keyName]: s })}
    />
  );
}
