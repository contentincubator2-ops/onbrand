/**
 * useOwnImageEntries — 「這篇用我自己的圖」的三個入口：上傳／素材庫／Canva，挑好回一個網址。
 *
 * 2026-10-09（CJ「直接導入用戶在 CANVA 做好的圖…用戶就可以圖文一起送給客戶審查」）。
 * 在這之前，一篇貼文的圖只能是 AI 畫的；設計師在 Canva 做好的成品沒有地方放，
 * 送審時客戶只看得到文字或一張 AI 示意圖。
 *
 * 2026-10-10（CJ「圖示直接做在圖像示意的旁邊」）：入口不再是右欄的一列文字，改成疊在預覽的
 * 圖片格上（PlatformMockup 的 imageActions）。這支只負責三個入口「按下去做什麼」，以及它們
 * 需要的隱藏檔案輸入與兩個視窗（portal）——呼叫端把 entries 交給預覽、把 portal 放在頁面任一處。
 *
 * 三個入口最後都落在素材庫（asset_photos），回傳的一律是本站的 /static/asset-photos/ 網址——
 * 呼叫端拿去存進貼文（output.updateVariantImage，modelId 帶 USER_SUPPLIED_IMAGE_MODEL）。
 */
import React from "react";
import { Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { showToastGlobal } from "../../platform/components/Toast";
import { uploadBrandPhoto, IMAGE_ACCEPT } from "../../strategy/lib/uploadBrandPhoto";
import BrandLibrary from "../../strategy/components/assets/BrandLibrary";
import CanvaImportModal from "../../strategy/components/assets/CanvaImportModal";
import type { ImageAction } from "./PlatformMockup/imageActions";

/**
 * 存進貼文時記在圖上的「模型」：這張不是 AI 畫的，是用戶自己給的。
 * 鏡像 server/content/core/image/variantImageUpdate.ts 的同名常數（client 不能 import server）。
 */
export const USER_SUPPLIED_IMAGE_MODEL = "user-supplied";

export function useOwnImageEntries({
  brandId, lang, onPick,
}: {
  brandId: number;
  lang: "zh-TW" | "en";
  onPick: (url: string) => void | Promise<void>;
}): { entries: ImageAction[]; portal: React.ReactNode } {
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

  const entries: ImageAction[] = brandId > 0 ? [
    { id: "upload", icon: "upload", label: L("上傳", "Upload"), onClick: () => fileRef.current?.click(), busy: uploading },
    { id: "library", icon: "images", label: L("素材庫", "Library"), onClick: () => setLibraryOpen(true) },
    { id: "canva", icon: "link", label: "Canva", onClick: () => setCanvaOpen(true) },
  ] : [];

  const portal = brandId > 0 ? (
    <>
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
    </>
  ) : null;

  return { entries, portal };
}
