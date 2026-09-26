/**
 * CopyAssetBoard — 文字頁的卡片板：一開始只有三張，其餘自己加。
 *
 * 2026-09-26（CJ「1. 我想要改成跟品牌頁面相同格式的任務卡格式。2. 一開始，只要
 * 出現推薦用詞、禁用詞與縮寫對照就好，其他的欄位，都提供新增的卡片的選項，讓用戶
 * 自己加」）。
 *
 * ── 為什麼預設只有三張 ───────────────────────────────────────────────
 * 原本一次攤開 4 組 11 張（品牌口吻／品牌準則／推薦用詞／禁用詞／替換對照／
 * 品牌術語／產品名稱規範／縮寫對照／CTA 庫／Hook 庫／文案範本）。十一個空欄位
 * 擺在眼前，使用者不知道從哪一格開始，結果是一格都不填。
 *
 * 三張預設是「填了立刻有用」的那三張：推薦用詞與禁用詞會被內容產出時的品牌規則
 * 硬檢查直接吃掉（enforceBrandRulesOnText），縮寫對照決定同一個東西的叫法。
 * 其他八張仍然在，但要使用者自己加——他知道自己需要 Hook 庫的時候才會填得好。
 *
 * ── 已經有內容的卡片一定看得見 ───────────────────────────────────────
 * 顯示規則是「預設三張 ∪ 使用者加的 ∪ **已經有內容的**」。少了最後一項，既有品牌
 * 打開這一頁會以為資料不見了——那比多幾張空卡嚴重得多。
 *
 * ── 卡片格式 ─────────────────────────────────────────────────────────
 * 用 TaskCardShell（跟任務卡同一個殼）：固定高的圖片區＋卡身。編輯沿用既有的
 * InlineAssetCard，點卡片開 modal——不重寫編輯器，只換陳列方式。
 */
import React from "react";
import { Button, Card, CardBody, Chip, Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faCheck, faPenToSquare, faXmark } from "@fortawesome/free-solid-svg-icons";

import { TaskCardShell } from "../../../content/components/TaskCardShell";
import InlineAssetCard from "./InlineAssetCard";
import {
  COPY_ASSETS, specOf, countOf, previewOf, visibleKeys, type CopyAssetSpec, type CopyShape,
} from "../../lib/copyAssets";

export type { CopyAssetSpec, CopyShape };
export { COPY_ASSETS, specOf, countOf, previewOf, visibleKeys };

export interface CustomCardRow {
  id: string;
  title: string;
  fields: { key: string; label: string; value: string }[];
}

export default function CopyAssetBoard({
  brandId, drafts, added, onChange, onAddCard, readOnly, fillingKeys, lang,
  customCards, onEditCustomCard, onDeleteCard, onDeleteCustomCard,
}: {
  brandId: number | null;
  drafts: Record<string, any>;
  /** 使用者加過的卡片 key（存在 positioning._assetCards）。 */
  added: string[];
  onChange: (key: string, next: any) => void;
  onAddCard: (key: string) => void;
  readOnly?: boolean;
  fillingKeys?: Set<string>;
  lang: "zh-TW" | "en";
  /**
   * 2026-09-26（CJ「新增的任務卡，也可以由用戶自行定義卡片名稱和內容」）：
   * 自訂卡片用的是**品牌頁同一份** positioning customSegments，不是另開一套：
   * 那條路的注入（brandContext.pushCustomSegments）已經在跑任務時生效，
   * 另開一套等於使用者填了卻沒人讀。
   */
  customCards?: CustomCardRow[];
  onEditCustomCard?: (card: { id: string | null; title: string; fields: { label: string; value: string }[] } | null) => void;
  /**
   * 2026-09-26（CJ「任務卡上，要增加刪除的按鈕」）：
   * · 預設卡片：刪＝清空內容並從清單移除。**內容一定要一起清掉**——顯示規則是
   *   「有內容的一定看得見」，只移除不清空的話，那張卡下一秒又自己回來，看起來
   *   像壞掉。所以刪除的確認訊息會講明這件事。
   * · 自訂卡片：走品牌頁同一條刪除（positioning 的 customSegments）。
   */
  onDeleteCard?: (key: string) => void;
  onDeleteCustomCard?: (id: string) => void;
}) {
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const keys = visibleKeys(added, drafts);
  const hidden = COPY_ASSETS.filter((a) => !keys.includes(a.key));
  const customs = customCards ?? [];
  const openSpec = openKey ? specOf(openKey) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {keys.map((key) => {
          const spec = specOf(key)!;
          const value = drafts[key];
          const n = countOf(value, spec.shape);
          const filled = n > 0;
          const preview = previewOf(value, spec.shape);
          return (
            <TaskCardShell
              key={key}
              onClick={() => setOpenKey(key)}
              ariaLabel={en ? spec.labelEn : spec.labelZh}
              media={<>
                <FontAwesomeIcon icon={spec.icon} className="text-4xl text-default-400" />
                {filled && (
                  <span className="absolute top-2 right-2">
                    <Chip size="sm" variant="flat" color="success"
                      startContent={<FontAwesomeIcon icon={faCheck} className="text-tiny ml-1" />}>
                      {n}
                    </Chip>
                  </span>
                )}
                {fillingKeys?.has(key) && (
                  <span className="absolute bottom-2 left-2">
                    <Chip size="sm" variant="flat" color="default">{L("填寫中…", "Filling…")}</Chip>
                  </span>
                )}
                {/* 刪除：用 span 而不是巢狀 button（button 不能包 button）。
                    hover 才顯示——每張卡都掛一顆常駐的 ✕ 會讓整片卡牆看起來像
                    隨時要出事。 */}
                {onDeleteCard && !readOnly && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={L("刪除這張卡", "Delete this card")}
                    title={L("刪除這張卡", "Delete this card")}
                    onClick={(e) => { e.stopPropagation(); onDeleteCard(key); }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault(); e.stopPropagation(); onDeleteCard(key);
                    }}
                    className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition rounded-full w-6 h-6 flex items-center justify-center bg-content1 border border-divider text-default-500 hover:text-danger hover:border-danger cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faXmark} className="text-tiny" />
                  </span>
                )}
              </>}
            >
              <p className="text-small font-semibold leading-snug">{en ? spec.labelEn : spec.labelZh}</p>
              <p className="text-tiny text-default-500 line-clamp-2">
                {preview || (en ? spec.whyEn : spec.whyZh)}
              </p>
              <div className="mt-auto pt-2 flex items-center gap-2 border-t border-divider">
                <span className="text-tiny font-medium text-default-700 truncate">
                  {filled ? L("編輯 →", "Edit →") : L("開始填 →", "Fill it in →")}
                </span>
              </div>
            </TaskCardShell>
          );
        })}

        {/* 自訂卡片：使用者自己命名的那些。內容一樣會進 prompt（brandContext
            的 pushCustomSegments），所以跟預設卡片並排，不另闢一區。 */}
        {customs.map((c) => {
          const preview = c.fields.map((f) => f.value).filter(Boolean).join(" · ");
          const n = c.fields.filter((f) => (f.value ?? "").trim()).length;
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
                {n > 0 && (
                  <span className="absolute top-2 right-2">
                    <Chip size="sm" variant="flat" color="success"
                      startContent={<FontAwesomeIcon icon={faCheck} className="text-tiny ml-1" />}>
                      {n}
                    </Chip>
                  </span>
                )}
                {onDeleteCustomCard && !readOnly && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={L("刪除這張卡", "Delete this card")}
                    title={L("刪除這張卡", "Delete this card")}
                    onClick={(e) => { e.stopPropagation(); onDeleteCustomCard(c.id); }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault(); e.stopPropagation(); onDeleteCustomCard(c.id);
                    }}
                    className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition rounded-full w-6 h-6 flex items-center justify-center bg-content1 border border-divider text-default-500 hover:text-danger hover:border-danger cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faXmark} className="text-tiny" />
                  </span>
                )}
              </>}
            >
              <p className="text-small font-semibold leading-snug">{c.title}</p>
              <p className="text-tiny text-default-500 line-clamp-2">
                {preview || L("還沒有內容", "No content yet")}
              </p>
              <div className="mt-auto pt-2 flex items-center gap-2 border-t border-divider">
                <span className="text-tiny font-medium text-default-700 truncate">{L("編輯 →", "Edit →")}</span>
              </div>
            </TaskCardShell>
          );
        })}

        {/* 新增卡片：刻意長得像一張卡而不是一顆按鈕——它跟卡片並排，做的是同一件事的延伸 */}
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

      {/* 編輯：沿用既有的 InlineAssetCard，不重寫編輯器 */}
      <Modal isOpen={!!openKey} onClose={() => setOpenKey(null)} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <span className="text-medium font-semibold">{openSpec ? (en ? openSpec.labelEn : openSpec.labelZh) : ""}</span>
            <span className="text-tiny text-default-500 font-normal">{openSpec ? (en ? openSpec.whyEn : openSpec.whyZh) : ""}</span>
          </ModalHeader>
          <ModalBody className="pb-6">
            {openSpec && (
              <InlineAssetCard
                assetKey={openSpec.key}
                label={en ? openSpec.labelEn : openSpec.labelZh}
                Icon={null}
                bg=""
                shape={openSpec.shape}
                value={drafts[openSpec.key]}
                onChange={(next) => onChange(openSpec.key, next)}
                brandId={brandId}
                readOnly={readOnly}
                filling={fillingKeys?.has(openSpec.key)}
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 新增卡片的選單：講清楚每一張填了會影響什麼，而不是只給名稱 */}
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
              {/* 2026-09-26（CJ「也可以由用戶自行定義卡片名稱和內容」）：放最上面，
                  因為「我要的那張不在清單裡」正是使用者打開這個選單的主要原因之一。 */}
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
                    <Button size="sm" variant="light" color="primary" className="ml-auto shrink-0"
                      onPress={() => { onAddCard(a.key); setPickerOpen(false); setOpenKey(a.key); }}>
                      {L("加入", "Add")}
                    </Button>
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
