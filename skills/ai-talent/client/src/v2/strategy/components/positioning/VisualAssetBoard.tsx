/**
 * VisualAssetBoard — 視覺頁的卡片板。預設五張，其餘自己加。
 *
 * 2026-09-26（CJ「品牌視覺色彩(DNA)，也是單獨的任務卡…請幫我整理好整個架構」
 * ＋「一開始也只要呈現出五個任務卡，其他的任務卡，請參考文字和產品的體驗設計」）。
 *
 * 卡片外框用 TaskCardShell（跟任務卡／文字頁同一個殼）。每一張點下去開的視窗
 * 依卡片型態不同，但只有四種：
 *   dna     色票：上傳的圖抽出來、或自己鎖定
 *   upload  標誌檔（可直接上傳，見 BrandAssetEditor LogoFields）
 *   gallery 圖片庫（品牌範本）
 *   library 素材庫：全站上傳過的圖（常駐、不能刪，見 BrandLibrary）
 *   style   上傳參考圖 → AI 歸納風格描述 + AI 提示詞
 *   text    純文字規範（沿用 InlineAssetCard，不重寫編輯器）
 *
 * 顯示規則與「為什麼沒有字型卡」寫在 lib/visualAssets.ts。
 */
import React from "react";
import {
  Button, Card, CardBody, Chip, Modal, ModalBody, ModalContent, ModalHeader, Spinner, Textarea,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus, faCheck, faPenToSquare, faXmark, faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import { TaskCardShell } from "../../../platform/components/TaskCardShell";
import InlineAssetCard from "./InlineAssetCard";
import AssetPhotoGallery from "./AssetPhotoGallery";
import BrandLibrary, { useBrandLibrary } from "./BrandLibrary";
import { trpc } from "../../../../lib/trpc";
import {
  VISUAL_ASSETS, PINNED_VISUAL_KEYS, visualSpecOf, visualHasContent, visibleVisualKeys, type VisualAssetSpec,
} from "../../lib/visualAssets";

export interface VisualCustomCard {
  id: string;
  title: string;
  fields: { key: string; label: string; value: string }[];
}

export default function VisualAssetBoard({
  brandId, assets: assetsIn, added, dnaSwatches, lang, readOnly,
  onChange, onAddCard, onDeleteCard,
  customCards, onEditCustomCard, onDeleteCustomCard,
  renderDna, renderLogo,
}: {
  brandId: number;
  assets: Record<string, any>;
  added: string[];
  /** 色彩 DNA 的色票（brands.brand_colors）——它不住在 _assets 裡。 */
  dnaSwatches: string[];
  lang: "zh-TW" | "en";
  readOnly?: boolean;
  onChange: (key: string, next: any) => void;
  onAddCard: (key: string) => void;
  onDeleteCard: (key: string) => void;
  customCards?: VisualCustomCard[];
  onEditCustomCard?: (card: { id: string | null; title: string; fields: { label: string; value: string }[] } | null) => void;
  onDeleteCustomCard?: (id: string) => void;
  /** 色票面板與標誌編輯器由 BrandsPage 提供（它們各自綁著既有的 query）。 */
  renderDna: () => React.ReactNode;
  renderLogo: () => React.ReactNode;
}) {
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  // 素材庫與標誌的內容不全在 _assets 裡：素材庫在 asset_photos，標誌可能只存在
  // brands.logoUrl（FB 抓的、基本資料頁上傳的）。合進 assets 再判斷「已填」與縮圖。
  const { items: libraryItems } = useBrandLibrary(brandId);
  const brandQ = (trpc as any).brand.get.useQuery({ id: brandId }, { enabled: brandId > 0, refetchOnWindowFocus: false });
  const brandLogo: string | null = (brandQ.data as any)?.logoUrl ?? null;
  const logoUrl: string | null = assetsIn?.logo?.primaryUrl || assetsIn?.logo?.url || brandLogo;
  const assets: Record<string, any> = {
    ...assetsIn,
    library: { count: libraryItems.length },
    ...(logoUrl ? { logo: { ...(assetsIn?.logo ?? {}), primaryUrl: logoUrl } } : {}),
  };

  const keys = visibleVisualKeys(added, assets, dnaSwatches.length);
  const hidden = VISUAL_ASSETS.filter((a) => !keys.includes(a.key));
  const customs = customCards ?? [];
  const openSpec = openKey ? visualSpecOf(openKey) : null;

  const previewOf = (spec: VisualAssetSpec): string => {
    const v = assets[spec.key];
    if (spec.kind === "dna") {
      return dnaSwatches.length
        ? L(`${dnaSwatches.length} 個色票`, `${dnaSwatches.length} swatches`)
        : "";
    }
    if (spec.kind === "style") return String(v?.text ?? v?.prompt ?? "").trim();
    if (spec.kind === "upload") return v?.primaryUrl || v?.url ? L("已上傳", "Uploaded") : "";
    if (spec.kind === "gallery") return "";
    if (spec.kind === "library") return libraryItems.length ? L(`${libraryItems.length} 張圖`, `${libraryItems.length} images`) : "";
    return String(v?.text ?? "").trim();
  };

  const deleteBtn = (onDelete: () => void) => (
    <span
      role="button"
      tabIndex={0}
      aria-label={L("刪除這張卡", "Delete this card")}
      title={L("刪除這張卡", "Delete this card")}
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); e.stopPropagation(); onDelete();
      }}
      className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition rounded-full w-6 h-6 flex items-center justify-center bg-content1 border border-divider text-default-500 hover:text-danger hover:border-danger cursor-pointer"
    >
      <FontAwesomeIcon icon={faXmark} className="text-tiny" />
    </span>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {keys.map((key) => {
          const spec = visualSpecOf(key)!;
          const filled = visualHasContent(key, assets[key], dnaSwatches.length);
          const preview = previewOf(spec);
          return (
            <TaskCardShell
              key={key}
              onClick={() => setOpenKey(key)}
              ariaLabel={en ? spec.labelEn : spec.labelZh}
              media={<>
                {/* 色彩 DNA 的縮圖就是色票本身——它是這張卡的內容，不是裝飾。 */}
                {spec.kind === "dna" && dnaSwatches.length > 0 ? (
                  <span className="flex w-full h-full">
                    {dnaSwatches.slice(0, 6).map((hex, i) => (
                      <span key={i} className="flex-1" style={{ background: hex }} />
                    ))}
                  </span>
                ) : spec.kind === "upload" && logoUrl ? (
                  <img src={logoUrl} alt="" className="max-h-[70%] max-w-[70%] object-contain" />
                ) : spec.kind === "library" && libraryItems.length > 0 ? (
                  <span className="grid grid-cols-3 w-full h-full gap-px">
                    {libraryItems.slice(0, 6).map((it) => (
                      <img key={it.key} src={it.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    ))}
                  </span>
                ) : (
                  <FontAwesomeIcon icon={spec.icon} className="text-4xl text-default-400" />
                )}
                {filled && spec.kind !== "dna" && spec.kind !== "library" && (
                  <span className="absolute top-2 right-2">
                    <Chip size="sm" variant="flat" color="success"
                      startContent={<FontAwesomeIcon icon={faCheck} className="text-tiny ml-1" />}>
                      {L("已填", "done")}
                    </Chip>
                  </span>
                )}
                {!readOnly && !PINNED_VISUAL_KEYS.includes(key) && deleteBtn(() => onDeleteCard(key))}
              </>}
            >
              <p className="text-small font-semibold leading-snug">{en ? spec.labelEn : spec.labelZh}</p>
              <p className="text-tiny text-default-500 line-clamp-2">
                {preview || (en ? spec.whyEn : spec.whyZh)}
              </p>
              <div className="mt-auto pt-2 flex items-center gap-2 border-t border-divider">
                <span className="text-tiny font-medium text-default-700 truncate">
                  {spec.kind === "library"
                    ? (filled ? L("挑圖、上傳 →", "Browse & upload →") : L("上傳第一張 →", "Upload your first →"))
                    : filled ? L("編輯 →", "Edit →") : L("開始設定 →", "Set it up →")}
                </span>
              </div>
            </TaskCardShell>
          );
        })}

        {customs.map((c) => {
          const preview = c.fields.map((f) => f.value).filter(Boolean).join(" · ");
          return (
            <TaskCardShell
              key={c.id}
              onClick={() => onEditCustomCard?.({ id: c.id, title: c.title, fields: c.fields.map((f) => ({ label: f.label, value: f.value })) })}
              ariaLabel={c.title}
              media={<>
                <FontAwesomeIcon icon={faPenToSquare} className="text-4xl text-default-400" />
                <span className="absolute top-2 left-2">
                  <Chip size="sm" variant="flat" color="default">{L("自訂", "Custom")}</Chip>
                </span>
                {onDeleteCustomCard && !readOnly && deleteBtn(() => onDeleteCustomCard(c.id))}
              </>}
            >
              <p className="text-small font-semibold leading-snug">{c.title}</p>
              <p className="text-tiny text-default-500 line-clamp-2">{preview || L("還沒有內容", "No content yet")}</p>
              <div className="mt-auto pt-2 flex items-center gap-2 border-t border-divider">
                <span className="text-tiny font-medium text-default-700 truncate">{L("編輯 →", "Edit →")}</span>
              </div>
            </TaskCardShell>
          );
        })}

        {(hidden.length > 0 || !!onEditCustomCard) && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-default-300 bg-content1 text-default-500 transition hover:border-default-500 hover:text-default-700"
          >
            <FontAwesomeIcon icon={faPlus} className="text-2xl" />
            <span className="text-small font-medium">{L("新增卡片", "Add a card")}</span>
            <span className="text-tiny text-default-400">
              {hidden.length > 0
                ? L(`${hidden.length} 種現成的，或自己命名`, `${hidden.length} ready-made, or name your own`)
                : L("自己命名一張", "Name your own")}
            </span>
          </button>
        )}
      </div>

      {/* ── 開卡：依型態決定視窗內容 ── */}
      <Modal isOpen={!!openKey} onClose={() => setOpenKey(null)} size={openSpec?.kind === "library" ? "4xl" : "2xl"} scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-medium font-semibold">{openSpec ? (en ? openSpec.labelEn : openSpec.labelZh) : ""}</span>
            <span className="text-tiny text-default-500 font-normal">{openSpec ? (en ? openSpec.whyEn : openSpec.whyZh) : ""}</span>
          </ModalHeader>
          <ModalBody className="pb-6">
            {openSpec?.kind === "dna" && renderDna()}
            {openSpec?.kind === "upload" && renderLogo()}
            {openSpec?.kind === "gallery" && (
              <AssetPhotoGallery
                brandId={brandId}
                scope="brand"
                scopeId={brandId}
                scopeLabel={en ? "brand" : "品牌"}
              />
            )}
            {openSpec?.kind === "library" && (
              <BrandLibrary brandId={brandId} lang={lang} readOnly={readOnly} />
            )}
            {openSpec?.kind === "style" && (
              <StylePanel
                brandId={brandId}
                spec={openSpec}
                value={assets[openSpec.key]}
                lang={lang}
                readOnly={readOnly}
                onChange={(next) => onChange(openSpec.key, next)}
              />
            )}
            {openSpec?.kind === "text" && (
              <InlineAssetCard
                assetKey={openSpec.key}
                label={en ? openSpec.labelEn : openSpec.labelZh}
                Icon={null}
                bg=""
                shape="text"
                value={assets[openSpec.key]}
                onChange={(next) => onChange(openSpec.key, next)}
                brandId={brandId}
                readOnly={readOnly}
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* ── 新增卡片 ── */}
      <Modal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} size="lg" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-medium font-semibold">{L("新增卡片", "Add a card")}</span>
            <span className="text-tiny text-default-500 font-normal">
              {L("這些都是選填的——需要的時候再加，填了才有用。", "All optional — add one when you actually need it.")}
            </span>
          </ModalHeader>
          <ModalBody className="pb-6">
            <div className="flex flex-col gap-2">
              {onEditCustomCard && (
                <Card shadow="none" radius="md" isPressable
                  className="border border-dashed border-default-300 hover:bg-default-50 transition"
                  onPress={() => { setPickerOpen(false); onEditCustomCard(null); }}>
                  <CardBody className="flex-row items-center gap-3 p-4">
                    <FontAwesomeIcon icon={faPenToSquare} className="text-default-400" />
                    <div className="min-w-0">
                      <p className="text-small font-medium">{L("自訂卡片", "Custom card")}</p>
                      <p className="text-tiny text-default-500">
                        {L("自己命名標題與內容，打字或從檔案帶入", "Name it yourself — type or import from a file")}
                      </p>
                    </div>
                  </CardBody>
                </Card>
              )}
              {hidden.map((a) => (
                <Card key={a.key} shadow="none" radius="md" isPressable
                  className="border border-divider hover:bg-default-50 transition"
                  onPress={() => { onAddCard(a.key); setPickerOpen(false); setOpenKey(a.key); }}>
                  <CardBody className="flex-row items-center gap-3 p-4">
                    <FontAwesomeIcon icon={a.icon} className="text-default-400" />
                    <div className="min-w-0">
                      <p className="text-small font-medium">{en ? a.labelEn : a.labelZh}</p>
                      <p className="text-tiny text-default-500">{en ? a.whyEn : a.whyZh}</p>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}

/**
 * 風格卡的視窗：上傳幾張參考圖 → AI 歸納 → 兩段文字（人看的描述、模型吃的提示詞）。
 *
 * 「提案不自動套用」：AI 回來的東西先顯示，按了「採用」才寫進卡片；兩段都可以手改。
 * 參考圖走素材庫（asset_photos，全站上傳的圖），不另開一套上傳。
 */
function StylePanel({
  brandId, spec, value, lang, readOnly, onChange,
}: {
  brandId: number;
  spec: VisualAssetSpec;
  value: any;
  lang: "zh-TW" | "en";
  readOnly?: boolean;
  onChange: (next: any) => void;
}) {
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [err, setErr] = React.useState("");
  const [draft, setDraft] = React.useState<{ description: string; prompt: string } | null>(null);

  // 參考圖從素材庫挑（2026-09-30 起不限品牌照——產品照、存下來的 AI 圖也能拿來歸納風格）。
  const photos = useBrandLibrary(brandId).items.filter((p) => p.source !== "logo");

  const describeMut = (trpc as any).brand?.describeVisualStyle?.useMutation?.({
    onSuccess: (r: any) => setDraft({ description: r.description ?? "", prompt: r.prompt ?? "" }),
    onError: (e: any) => setErr(e?.message ?? ""),
  });

  const text = String(value?.text ?? "");
  const prompt = String(value?.prompt ?? "");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-small font-medium mb-1">{L("挑幾張你喜歡的參考圖", "Pick a few references you like")}</p>
        <p className="text-tiny text-default-500 mb-2">
          {L("從素材庫挑（最多 5 張）。AI 只歸納風格——光線、色調、構圖、質感，不會把照片裡的人或產品寫進去。",
             "From your asset library (max 5). AI describes style only — light, tone, framing, texture — never the subjects in them.")}
        </p>
        {photos.length === 0 ? (
          <p className="text-tiny text-warning">
            {L("素材庫還是空的——先到「素材庫」那張卡上傳幾張。", "Your asset library is empty — upload a few under “Asset library” first.")}
          </p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {photos.map((p) => {
              const on = picked.includes(p.url);
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPicked((cur) => on ? cur.filter((u) => u !== p.url) : cur.length >= 5 ? cur : [...cur, p.url])}
                  className={`rounded-lg overflow-hidden border-2 transition ${on ? "border-foreground" : "border-divider"}`}
                >
                  <img src={p.url} alt="" className="w-[72px] h-[72px] object-cover block" />
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <Button
            size="sm" color="primary" radius="md"
            isDisabled={picked.length === 0 || describeMut?.isPending || readOnly}
            isLoading={describeMut?.isPending}
            startContent={!describeMut?.isPending ? <FontAwesomeIcon icon={faWandMagicSparkles} /> : undefined}
            onPress={() => { setErr(""); describeMut?.mutate({ brandId, kind: spec.key === "icon_style" ? "icon" : "imagery", imageUrls: picked }); }}
          >
            {describeMut?.isPending ? L("讀圖中…", "Reading…") : L(`用這 ${picked.length} 張歸納風格`, `Derive style from ${picked.length}`)}
          </Button>
          {err && <span className="text-tiny text-danger">{err.slice(0, 200)}</span>}
        </div>
      </div>

      {describeMut?.isPending && (
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <span className="text-tiny text-default-500">{L("模型正在看那幾張圖…", "The model is looking at those images…")}</span>
        </div>
      )}

      {draft && (
        <Card shadow="none" radius="md" className="border border-divider">
          <CardBody className="gap-3 p-4">
            <p className="text-small font-medium">{L("AI 歸納的結果（還沒存）", "What AI derived (not saved yet)")}</p>
            <Textarea size="sm" variant="bordered" minRows={3} label={L("風格描述", "Style description")} labelPlacement="outside"
              value={draft.description} onValueChange={(v) => setDraft({ ...draft, description: v })} />
            <Textarea size="sm" variant="bordered" minRows={2} label={L("AI 提示詞（接進生圖）", "AI prompt (used in generation)")} labelPlacement="outside"
              value={draft.prompt} onValueChange={(v) => setDraft({ ...draft, prompt: v })} />
            <div className="flex gap-2">
              <Button size="sm" color="primary" radius="md"
                onPress={() => { onChange({ ...(value ?? {}), text: draft.description, prompt: draft.prompt }); setDraft(null); }}>
                {L("採用", "Use this")}
              </Button>
              <Button size="sm" variant="bordered" radius="md" onPress={() => setDraft(null)}>
                {L("丟掉", "Discard")}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <Textarea size="sm" variant="bordered" minRows={3} isDisabled={readOnly}
          label={L("目前的風格描述", "Current style description")} labelPlacement="outside"
          value={text} onValueChange={(v) => onChange({ ...(value ?? {}), text: v })} />
        <Textarea size="sm" variant="bordered" minRows={2} isDisabled={readOnly}
          label={L("目前的 AI 提示詞", "Current AI prompt")} labelPlacement="outside"
          description={L("這一段會直接接在生圖 prompt 裡。", "This is appended to every image prompt.")}
          value={prompt} onValueChange={(v) => onChange({ ...(value ?? {}), prompt: v })} />
      </div>
    </div>
  );
}
