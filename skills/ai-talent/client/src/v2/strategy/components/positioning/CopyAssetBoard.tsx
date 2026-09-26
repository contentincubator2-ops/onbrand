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
import { faPlus, faCheck } from "@fortawesome/free-solid-svg-icons";

import { TaskCardShell } from "../../../content/components/TaskCardShell";
import InlineAssetCard from "./InlineAssetCard";
import {
  COPY_ASSETS, specOf, countOf, previewOf, visibleKeys, type CopyAssetSpec, type CopyShape,
} from "../../lib/copyAssets";

export type { CopyAssetSpec, CopyShape };
export { COPY_ASSETS, specOf, countOf, previewOf, visibleKeys };

export default function CopyAssetBoard({
  brandId, drafts, added, onChange, onAddCard, readOnly, fillingKeys, lang,
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
}) {
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const keys = visibleKeys(added, drafts);
  const hidden = COPY_ASSETS.filter((a) => !keys.includes(a.key));
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

        {/* 新增卡片：刻意長得像一張卡而不是一顆按鈕——它跟卡片並排，做的是同一件事的延伸 */}
        {hidden.length > 0 && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-default-300 bg-content1 text-default-500 transition hover:border-default-500 hover:text-default-700"
          >
            <FontAwesomeIcon icon={faPlus} className="text-2xl" />
            <span className="text-small font-medium">{L("新增卡片", "Add a card")}</span>
            <span className="text-tiny text-default-400">{L(`還有 ${hidden.length} 種`, `${hidden.length} more`)}</span>
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
