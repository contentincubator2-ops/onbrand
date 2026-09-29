/**
 * BrandAssetEditor — manual-fill form for non-positioning brand assets:
 * logo / colors / fonts / photos. Stored under
 *   brands.positioning._assets[<key>]
 * via the same scope.savePositioning mutation. Per CJ direction these
 * are user-supplied (no LLM auto-fill); 圖像/圖示/圖表 are dropped.
 */
import { useLang } from "../../../../lib/i18n";
import {
  Card, CardBody, CardHeader, Chip, Input, Textarea, Button, Tooltip,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPenNib, faPalette, faFont, faImages, faPlus, faXmark, faSave,
} from "@fortawesome/free-solid-svg-icons";

export type AssetKey =
  // 視覺
  | "logo" | "colors" | "fonts" | "photos" | "guidelines" | "templates"
  | "imagery_style" | "icon_style" | "chart_style" | "layout_rules"
  // 文字（Restructure 2026-05-07）
  | "voice" | "voice_principles"
  | "preferred_terms" | "banned_words" | "term_substitutions"
  | "branded_terms" | "product_naming" | "abbreviations"
  | "cta_library" | "hook_library" | "templates_copy";

interface AssetEditorProps {
  assetKey: AssetKey;
  value: any;
  onChange: (next: any) => void;
  /** When true, all fields render read-only and a lock banner appears.
   *  Driven by the parent tab's lock state from /brands page. */
  readOnly?: boolean;
}

function getMeta(en: boolean): Record<AssetKey, { icon: any; title: string; sub: string }> {
  return {
    // 視覺
    logo:           { icon: faPenNib,  title: en ? "Logo"             : "標誌",       sub: en ? "Logo URL or usage guidelines"           : "上傳 logo URL 或描述使用規範" },
    colors:         { icon: faPalette, title: en ? "Colors"           : "顏色",       sub: en ? "Primary, secondary, complementary"      : "品牌主色、輔助色、互補色" },
    fonts:          { icon: faFont,    title: en ? "Fonts"            : "字型",       sub: en ? "Primary CN/EN, serif / sans, display"   : "中英文主字型、襯線 / 無襯線、特殊字" },
    photos:         { icon: faImages,  title: en ? "Photos"           : "照片",       sub: en ? "Team, product, space photos (URL list)" : "團隊照、產品照、空間照（URL 列表）" },
    guidelines:     { icon: faPenNib,  title: en ? "Guidelines"       : "準則",       sub: en ? "Brand usage rules, design principles"   : "品牌使用規範、設計原則" },
    templates:      { icon: faPenNib,  title: en ? "Brand templates"  : "品牌範本",   sub: en ? "Slides / business card / email links"   : "簡報 / 名片 / 信件範本連結" },
    imagery_style:  { icon: faImages,  title: en ? "Imagery style"    : "圖像風格",   sub: en ? "Photography tone / composition / temp"  : "攝影調性 / 構圖 / 色溫指南" },
    icon_style:     { icon: faPenNib,  title: en ? "Icon style"       : "圖示風格",   sub: en ? "Line / Solid / Duotone rules"           : "Line / Solid / Duotone 規範" },
    chart_style:    { icon: faPenNib,  title: en ? "Chart style"      : "圖表風格",   sub: en ? "Data-viz palette, styling"              : "資料視覺化色票、樣式" },
    layout_rules:   { icon: faPenNib,  title: en ? "Layout rules"     : "排版規範",   sub: en ? "Whitespace / alignment / hierarchy"     : "留白 / 對齊 / 標題層級" },
    // 文字
    voice:               { icon: faPenNib, title: en ? "Brand voice"          : "品牌口吻",     sub: en ? "Overall tone (formal / casual / playful)" : "整體語氣方向（正式 / 口語 / 幽默）" },
    voice_principles:    { icon: faPenNib, title: en ? "Voice principles"     : "品牌準則",     sub: en ? "Do / Don't rules"                         : "Do / Don't 規則" },
    preferred_terms:     { icon: faPenNib, title: en ? "Preferred terms"      : "推薦用詞",     sub: en ? "Words to favor, brand phrases"            : "鼓勵使用的詞、品牌常用語" },
    banned_words:        { icon: faPenNib, title: en ? "Banned words"         : "禁用詞",       sub: en ? "Words to avoid, sensitive, clichés"       : "不能出現的詞、敏感用語、空話" },
    term_substitutions:  { icon: faPenNib, title: en ? "Term substitutions"   : "替換對照",     sub: en ? "Say Y instead of X (one per line)"        : "原本要說 X，改說 Y（一行一條）" },
    branded_terms:       { icon: faPenNib, title: en ? "Branded terms"        : "品牌術語",     sub: en ? "Coined or trademarked terms"              : "自家發明 / 註冊的詞彙" },
    product_naming:      { icon: faPenNib, title: en ? "Product naming"       : "產品名稱規範", sub: en ? "Naming rules, EN/CN mapping"              : "產品命名規則、英中對照" },
    abbreviations:       { icon: faPenNib, title: en ? "Abbreviations"        : "縮寫對照",     sub: en ? "Company / product / industry acronyms"    : "公司 / 產品 / 行業縮寫" },
    cta_library:         { icon: faPenNib, title: en ? "CTA library"          : "行動呼籲庫",       sub: en ? "Common closing CTAs / 8 intents"          : "常用結尾行動句 / 8 種意圖" },
    hook_library:        { icon: faPenNib, title: en ? "Hook library"         : "Hook 庫",      sub: en ? "Common opening line templates"            : "常用開場句型範本" },
    templates_copy:      { icon: faPenNib, title: en ? "Copy templates"       : "文案範本",     sub: en ? "Campaign / announcement / EDM templates"  : "活動文 / 公告 / EDM 範本" },
  };
}

export default function BrandAssetEditor({ assetKey, value, onChange, readOnly = false }: AssetEditorProps) {
  const { lang } = useLang();
  const en = lang === "en";
  const meta = getMeta(en)[assetKey];
  const v = value ?? {};
  // No-op the change handler when locked — defense-in-depth in case any
  // field bypasses the visual disabled state.
  const safeOnChange = readOnly ? () => {} : onChange;

  return (
    <Card shadow="none" className="border border-divider">
      <CardHeader className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          <Chip
            size="sm"
            variant="flat"
            color={readOnly ? "warning" : "default"}
            className="shrink-0"
          >
            <FontAwesomeIcon icon={meta.icon} className="text-tiny mr-1" />
            {readOnly ? (en ? "Locked · read-only" : "已鎖定 · 唯讀") : "ASSET"}
          </Chip>
          {!!v?.aiSuggested && !readOnly && (
            <Tooltip content={en ? "AI-drafted starting point — review and edit, not a final decision" : "AI 草擬的起點建議 — 請確認並調整，不是最終定案"}>
              <Chip size="sm" variant="flat" color="secondary" className="shrink-0">
                {en ? "AI draft" : "AI 建議"}
              </Chip>
            </Tooltip>
          )}
          <div className="min-w-0">
            <h3 className="text-medium font-semibold truncate">{meta.title}</h3>
            <p className="text-tiny text-default-500 truncate">
              {readOnly
                ? (en ? "This section is locked — unlock this tab on /brands to edit." : "此分區已鎖定 — 回 /brands 解鎖該 tab 才能編輯。")
                : meta.sub}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardBody
        className="px-5 pb-5 pt-2 gap-4"
        style={readOnly ? { opacity: 0.65, pointerEvents: "none", userSelect: "text" } : undefined}
      >
        {assetKey === "logo"     && <LogoFields     v={v} onChange={safeOnChange} en={en} />}
        {assetKey === "colors"   && <ColorFields    v={v} onChange={safeOnChange} en={en} />}
        {assetKey === "fonts"    && <FontFields     v={v} onChange={safeOnChange} en={en} />}
        {assetKey === "photos"   && <PhotoFields    v={v} onChange={safeOnChange} en={en} />}
        {assetKey === "guidelines"  && <GenericTextarea v={v} onChange={safeOnChange} keyName="text"  label={en ? "Guidelines content" : "準則內容"} />}
        {assetKey === "templates"   && <GenericTextarea v={v} onChange={safeOnChange} keyName="links" label={en ? "Template links (one per line)" : "範本連結列表（每行一筆）"} />}
        {/* 視覺 — additional */}
        {assetKey === "imagery_style" && <GenericTextarea v={v} onChange={safeOnChange} keyName="text" label={en ? "Imagery rules (tone / composition / temperature)" : "圖像風格規範（攝影調性 / 構圖 / 色溫）"} />}
        {assetKey === "icon_style"    && <GenericTextarea v={v} onChange={safeOnChange} keyName="text" label={en ? "Icon style (Line / Solid / Duotone / stroke)" : "圖示風格（Line / Solid / Duotone / 線粗）"} />}
        {assetKey === "chart_style"   && <GenericTextarea v={v} onChange={safeOnChange} keyName="text" label={en ? "Chart style (data-viz palette, fonts, styling)" : "圖表風格（資料視覺化色票、字型、樣式）"} />}
        {assetKey === "layout_rules"  && <GenericTextarea v={v} onChange={safeOnChange} keyName="text" label={en ? "Layout rules (whitespace / alignment / hierarchy)" : "排版規範（留白 / 對齊 / 標題層級）"} />}
        {/* 文字 — bullet list editors（每行一條，Phase 2 接到 brand_caption_rules）*/}
        {assetKey === "voice"               && <GenericTextarea v={v} onChange={safeOnChange} keyName="text" label={en ? "Overall brand voice (a paragraph)" : "品牌整體語氣方向（一段話描述）"} />}
        {assetKey === "voice_principles"    && <ListEditor v={v} onChange={safeOnChange} keyName="items" en={en} label={en ? "Do / Don't rules (one per line)" : "Do / Don't 規則（每行一條）"} placeholder={en ? "e.g. Write 'the family laughed' not 'rave reviews'" : "例：寫『家人都笑了』而不是『顧客好評如潮』"} />}
        {assetKey === "preferred_terms"     && <ListEditor v={v} onChange={safeOnChange} keyName="items" en={en} label={en ? "Preferred terms (one per line)" : "推薦用詞（每行一個）"} placeholder={en ? "e.g. safeguard" : "例：守護"} />}
        {assetKey === "banned_words"        && <ListEditor v={v} onChange={safeOnChange} keyName="items" en={en} label={en ? "Banned words (one per line)" : "禁用詞（每行一個）"} placeholder={en ? "e.g. user experience" : "例：玩家使用經驗"} />}
        {assetKey === "term_substitutions"  && <PairListEditor v={v} onChange={safeOnChange} keyName="pairs" en={en} label={en ? "Term substitutions (don't say → say instead)" : "替換對照（不要說 → 改說）"} placeholderL={en ? "Original (X)" : "原本說的（X）"} placeholderR={en ? "Replacement (Y)" : "改成說（Y）"} />}
        {assetKey === "branded_terms"       && <ListEditor v={v} onChange={safeOnChange} keyName="items" en={en} label={en ? "Branded terms (one per line)" : "品牌術語（每行一個）"} placeholder={en ? "e.g. SoWork workflow" : "例：SoWork 工作流"} />}
        {assetKey === "product_naming"      && <GenericTextarea v={v} onChange={safeOnChange} keyName="text" label={en ? "Product naming rules" : "產品命名規範"} />}
        {assetKey === "abbreviations"       && <PairListEditor v={v} onChange={safeOnChange} keyName="pairs" en={en} label={en ? "Abbreviations (short → full)" : "縮寫對照（縮寫 → 全稱）"} placeholderL={en ? "e.g. CMO" : "例：CMO"} placeholderR={en ? "e.g. Chief Marketing Officer" : "例：Chief Marketing Officer"} />}
        {assetKey === "cta_library"         && <ListEditor v={v} onChange={safeOnChange} keyName="items" en={en} label={en ? "CTAs (one per line)" : "行動呼籲句子（每行一條）"} placeholder={en ? "e.g. Tap the link below for details" : "例：點下方連結看詳情"} />}
        {assetKey === "hook_library"        && <ListEditor v={v} onChange={safeOnChange} keyName="items" en={en} label={en ? "Hook openers (one per line)" : "開場 Hook（每行一條）"} placeholder={en ? "e.g. I met a mom last week who told me…" : "例：上週遇到一個媽媽，她說..."} />}
        {assetKey === "templates_copy"      && <ListEditor v={v} onChange={safeOnChange} keyName="items" en={en} label={en ? "Copy templates (title / URL per line)" : "文案範本（每行一個範本標題 / URL）"} placeholder={en ? "e.g. Mother's Day EDM template https://..." : "例：母親節 EDM 範本 https://..."} />}
      </CardBody>
    </Card>
  );
}

function LogoFields({ v, onChange, en }: { v: any; onChange: (next: any) => void; en: boolean }) {
  return (
    <>
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label={en ? "Primary logo URL (PNG / SVG)" : "主 logo URL（PNG / SVG）"}
        placeholder="https://example.com/logo.svg"
        value={v.primaryUrl ?? ""}
        onValueChange={(s) => onChange({ ...v, primaryUrl: s })}
      />
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label={en ? "Dark-background logo URL (light version)" : "深色背景 logo URL（白底版本）"}
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
        label={en ? "Usage guidelines" : "使用規範"} minRows={2}
        placeholder={en ? "e.g. min 24px / clear space / no distortion" : "例：最小尺寸 24px / 留白邊距 / 禁止變形"}
        value={v.guidelines ?? ""}
        onValueChange={(s) => onChange({ ...v, guidelines: s })}
      />
    </>
  );
}

function ColorFields({ v, onChange, en }: { v: any; onChange: (next: any) => void; en: boolean }) {
  const colors: any[] = Array.isArray(v.list) ? v.list : [];
  const update = (i: number, key: string, val: string) => {
    const next = colors.map((c, j) => j === i ? { ...c, [key]: val } : c);
    onChange({ ...v, list: next });
  };
  const add = () => onChange({ ...v, list: [...colors, { name: "", hex: "", role: "" }] });
  const remove = (i: number) => onChange({ ...v, list: colors.filter((_, j) => j !== i) });

  return (
    <>
      <p className="text-tiny text-default-500">{en ? "Each swatch has a name, hex code, and role (primary / secondary / warning, etc.)." : "每筆色票包含名稱、Hex 色碼、角色（主色 / 輔助色 / 警示等）。"}</p>
      <div className="flex flex-col gap-2">
        {colors.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="shrink-0 w-9 h-9 rounded-md border border-divider"
              style={{ backgroundColor: c.hex || "#f5f5f5" }}
              title={c.hex}
            />
            <Input size="sm" variant="bordered" placeholder={en ? "Name (e.g. SoWork Blue)" : "名稱（如 SoWork 藍）"} value={c.name ?? ""} onValueChange={(s) => update(i, "name", s)} className="flex-1" />
            <Input size="sm" variant="bordered" placeholder="#0066FF" value={c.hex ?? ""} onValueChange={(s) => update(i, "hex", s)} className="w-32" />
            <Input size="sm" variant="bordered" placeholder={en ? "Role" : "角色"} value={c.role ?? ""} onValueChange={(s) => update(i, "role", s)} className="w-32" />
            <Tooltip content={en ? "Remove" : "移除"}>
              <Button isIconOnly size="sm" variant="light" onPress={() => remove(i)} aria-label={en ? "Remove" : "移除"}>
                <FontAwesomeIcon icon={faXmark} className="text-default-400" />
              </Button>
            </Tooltip>
          </div>
        ))}
      </div>
      <Button size="sm" variant="light" startContent={<FontAwesomeIcon icon={faPlus} className="text-tiny" />} onPress={add} className="self-start">
        {en ? "Add swatch" : "新增色票"}
      </Button>
    </>
  );
}

function FontFields({ v, onChange, en }: { v: any; onChange: (next: any) => void; en: boolean }) {
  return (
    <>
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label={en ? "Primary CN font" : "主中文字型"}
        placeholder={en ? "e.g. Noto Sans TC / Source Han Sans" : "例：Noto Sans TC / 思源黑體"}
        value={v.zhPrimary ?? ""}
        onValueChange={(s) => onChange({ ...v, zhPrimary: s })}
      />
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label={en ? "Primary EN font" : "主英文字型"}
        placeholder={en ? "e.g. Inter / SF Pro" : "例：Inter / SF Pro"}
        value={v.enPrimary ?? ""}
        onValueChange={(s) => onChange({ ...v, enPrimary: s })}
      />
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label={en ? "Display serif (optional)" : "標題用襯線字（可選）"}
        placeholder={en ? "e.g. Source Han Serif TC" : "例：Source Han Serif TC"}
        value={v.serifDisplay ?? ""}
        onValueChange={(s) => onChange({ ...v, serifDisplay: s })}
      />
      <Input size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label={en ? "Mono / code font (optional)" : "等寬 / 程式碼字型（可選）"}
        placeholder={en ? "e.g. JetBrains Mono" : "例：JetBrains Mono"}
        value={v.mono ?? ""}
        onValueChange={(s) => onChange({ ...v, mono: s })}
      />
      <Textarea size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label={en ? "Font usage rules" : "字型使用規範"} minRows={2}
        placeholder={en ? "e.g. H1 in Thin, body in Regular 14px" : "例：H1 用 thin / 內文用 regular 14px"}
        value={v.guidelines ?? ""}
        onValueChange={(s) => onChange({ ...v, guidelines: s })}
      />
    </>
  );
}

function PhotoFields({ v, onChange, en }: { v: any; onChange: (next: any) => void; en: boolean }) {
  const urls: string[] = Array.isArray(v.urls) ? v.urls : [];
  return (
    <>
      <p className="text-tiny text-default-500">{en ? "One URL per line (team, product, space, etc.)" : "每行一個 URL（團隊照 / 產品照 / 空間照 ...）"}</p>
      <Textarea size="sm" radius="md" variant="bordered" labelPlacement="outside"
        label={en ? "Photo URL list" : "照片 URL 列表"} minRows={4}
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

// ─── List editor — 每行一條（一鍵批次貼上）─────────────────────────────
function ListEditor({ v, onChange, keyName, label, placeholder, en }: {
  v: any; onChange: (next: any) => void;
  keyName: string; label: string; placeholder?: string; en: boolean;
}) {
  const items: string[] = Array.isArray(v[keyName]) ? v[keyName] : [];
  const setItems = (next: string[]) => onChange({ ...v, [keyName]: next });

  const addItem = () => setItems([...items, ""]);
  const removeItem = (i: number) => setItems(items.filter((_, j) => j !== i));
  const updateItem = (i: number, val: string) => setItems(items.map((x, j) => j === i ? val : x));

  // Bulk-paste: split on newlines, append non-empty
  const bulkPaste = (raw: string) => {
    const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    setItems([...items, ...lines]);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-tiny font-medium text-default-700">{label}</label>
      {items.length === 0 && (
        <p className="text-tiny text-default-400">{en ? "No entries yet." : "尚未加入任何條目。"}</p>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            size="sm" radius="md" variant="bordered"
            value={item} placeholder={placeholder}
            onValueChange={(s) => updateItem(i, s)}
          />
          <button onClick={() => removeItem(i)} className="text-default-400 hover:text-danger px-1">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-1">
        <Button size="sm" variant="flat" color="primary" onPress={addItem} startContent={<FontAwesomeIcon icon={faPlus} />}>
          {en ? "Add one" : "新增一條"}
        </Button>
        <Tooltip content={en ? "Paste multiple lines — one entry per line" : "一次貼上多行 — 每行 = 一條"}>
          <Button
            size="sm" variant="light" color="default"
            onPress={() => {
              const raw = window.prompt(en ? `Paste multiple ${label} (one per line)` : `一次貼上多條 ${label}（每行一條）`);
              if (raw) bulkPaste(raw);
            }}
          >
            {en ? "Bulk paste" : "批次貼上"}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

// ─── Pair list editor — 雙欄（X → Y）──────────────────────────────────
function PairListEditor({ v, onChange, keyName, label, placeholderL, placeholderR, en }: {
  v: any; onChange: (next: any) => void;
  keyName: string; label: string; placeholderL?: string; placeholderR?: string; en: boolean;
}) {
  const pairs: Array<{ from: string; to: string }> = Array.isArray(v[keyName]) ? v[keyName] : [];
  const setPairs = (next: Array<{ from: string; to: string }>) => onChange({ ...v, [keyName]: next });

  const addPair = () => setPairs([...pairs, { from: "", to: "" }]);
  const removePair = (i: number) => setPairs(pairs.filter((_, j) => j !== i));
  const updatePair = (i: number, key: "from" | "to", val: string) =>
    setPairs(pairs.map((p, j) => j === i ? { ...p, [key]: val } : p));

  // Bulk-paste: split on newlines, each line "X → Y" or "X|Y" or "X, Y"
  const bulkPaste = (raw: string) => {
    const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const additions: Array<{ from: string; to: string }> = [];
    for (const ln of lines) {
      const m = ln.split(/\s*(?:→|->|=>|\||,)\s*/);
      if (m.length >= 2) {
        additions.push({ from: m[0]!.trim(), to: m.slice(1).join(" ").trim() });
      }
    }
    if (additions.length > 0) setPairs([...pairs, ...additions]);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-tiny font-medium text-default-700">{label}</label>
      {pairs.length === 0 && (
        <p className="text-tiny text-default-400">{en ? "No mappings yet." : "尚未加入任何對照。"}</p>
      )}
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            size="sm" radius="md" variant="bordered"
            value={p.from} placeholder={placeholderL}
            onValueChange={(s) => updatePair(i, "from", s)}
          />
          <span className="text-default-400">→</span>
          <Input
            size="sm" radius="md" variant="bordered"
            value={p.to} placeholder={placeholderR}
            onValueChange={(s) => updatePair(i, "to", s)}
          />
          <button onClick={() => removePair(i)} className="text-default-400 hover:text-danger px-1">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 mt-1">
        <Button size="sm" variant="flat" color="primary" onPress={addPair} startContent={<FontAwesomeIcon icon={faPlus} />}>
          {en ? "Add one" : "新增一條"}
        </Button>
        <Tooltip content={en ? "Supported: X → Y / X | Y / X, Y (one per line)" : "支援格式：X → Y / X | Y / X, Y（每行一條）"}>
          <Button
            size="sm" variant="light" color="default"
            onPress={() => {
              const raw = window.prompt(en ? `Paste multiple ${label} (format: X → Y, one per line)` : `一次貼上多條 ${label}（格式：X → Y，每行一條）`);
              if (raw) bulkPaste(raw);
            }}
          >
            {en ? "Bulk paste" : "批次貼上"}
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
// Suppress unused imports lint when faSave is not used (kept for symmetry)
void faSave;
