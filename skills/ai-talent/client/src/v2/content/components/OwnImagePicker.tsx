/**
 * OwnImagePicker — 「這篇用我自己的圖」：上傳／素材庫／Canva 三個入口，挑好回一個網址。
 *
 * 2026-10-09（CJ「直接導入用戶在 CANVA 做好的圖…用戶就可以圖文一起送給客戶審查」）。
 * 在這之前，一篇貼文的圖只能是 AI 畫的；設計師在 Canva 做好的成品沒有地方放，
 * 送審時客戶只看得到文字或一張 AI 示意圖。
 *
 * 三個入口最後都落在素材庫（asset_photos），回傳的一律是本站的 /static/asset-photos/ 網址——
 * 呼叫端拿去存進貼文（output.updateVariantImage，modelId 帶 USER_SUPPLIED_IMAGE_MODEL）。
 */
import React from "react";
import { Modal, ModalBody, ModalContent, ModalHeader, Spinner } from "@heroui/react";
import { Icon, type IconName } from "../../platform/components/icons";
import { showToastGlobal } from "../../platform/components/Toast";
import { uploadBrandPhoto, IMAGE_ACCEPT } from "../../strategy/lib/uploadBrandPhoto";
import BrandLibrary from "../../strategy/components/assets/BrandLibrary";
import CanvaImportModal from "../../strategy/components/assets/CanvaImportModal";

/**
 * 存進貼文時記在圖上的「模型」：這張不是 AI 畫的，是用戶自己給的。
 * 鏡像 server/content/core/image/variantImageUpdate.ts 的同名常數（client 不能 import server）。
 */
export const USER_SUPPLIED_IMAGE_MODEL = "user-supplied";

export default function OwnImagePicker({
  brandId, lang, disabled, onPick,
}: {
  brandId: number;
  lang: "zh-TW" | "en";
  disabled?: boolean;
  onPick: (url: string) => void | Promise<void>;
}) {
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [libraryOpen, setLibraryOpen] = React.useState(false);
  const [canvaOpen, setCanvaOpen] = React.useState(false);

  async function upload(files: FileList | null) {
    const f = Array.from(files ?? []).find((x) => x.type.startsWith("image/") || !x.type);
    if (!f) return;
    setUploading(true);
    try {
      const up = await uploadBrandPhoto(brandId, f);
      await onPick(up.url);
    } catch (e: any) {
      showToastGlobal(String(e?.message ?? e).slice(0, 200), "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const entries: Array<{ id: string; icon: IconName; label: string; click: () => void }> = [
    { id: "upload", icon: "upload", label: L("上傳", "Upload"), click: () => fileRef.current?.click() },
    { id: "library", icon: "images", label: L("素材庫", "Library"), click: () => setLibraryOpen(true) },
    { id: "canva", icon: "link", label: "Canva", click: () => setCanvaOpen(true) },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-tiny text-default-500">{L("用自己的圖：", "Use your own image:")}</span>
      {entries.map((b) => (
        <button key={b.id} type="button" onClick={b.click} disabled={disabled || uploading}
          className="inline-flex items-center gap-1.5 rounded-full border border-divider px-2.5 py-1 text-tiny text-default-700 hover:border-default-500 disabled:opacity-50 transition">
          {b.id === "upload" && uploading ? <Spinner size="sm" classNames={{ wrapper: "w-3 h-3" }} /> : <Icon name={b.icon} size={12} />}
          {b.label}
        </button>
      ))}
      <input ref={fileRef} type="file" hidden accept={IMAGE_ACCEPT} onChange={(e) => void upload(e.target.files)} />

      <Modal isOpen={libraryOpen} onClose={() => setLibraryOpen(false)} size="4xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader>{L("從素材庫挑一張", "Pick from your asset library")}</ModalHeader>
          <ModalBody className="pb-6">
            <BrandLibrary brandId={brandId} lang={lang} mode="pick"
              onPick={(it) => { setLibraryOpen(false); void onPick(it.url); }} />
          </ModalBody>
        </ModalContent>
      </Modal>

      <CanvaImportModal brandId={brandId} lang={lang} isOpen={canvaOpen} onClose={() => setCanvaOpen(false)}
        onImported={(photos) => {
          const first = photos[0];
          if (!first) return;
          if (photos.length > 1) {
            showToastGlobal(L(`這篇先放第 1 頁；其餘 ${photos.length - 1} 頁在素材庫，可以再換。`,
              `Page 1 is on this post; the other ${photos.length - 1} are in your library.`));
          }
          void onPick(first.url);
        }} />
    </div>
  );
}
