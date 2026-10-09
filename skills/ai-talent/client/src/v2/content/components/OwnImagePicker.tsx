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
import { trpc } from "../../../lib/trpc";

/** 「在 Canva 編輯」要知道是哪一篇的哪一格、現在是哪張圖、新設計要開多大。 */
export interface CanvaEditTarget {
  outputId: number;
  locator: { variantIndex?: number; contentKind?: string; contentIndex?: number };
  imageUrl?: string | null;
  platform?: string | null;
  title?: string | null;
}

/**
 * 從 onBrand 開新設計時的畫布尺寸（px）。這幾個是我依各平台常用的貼文比例定的預設值，
 * 用戶進 Canva 後仍可自己調整；不認得的通路用正方形。
 */
export function canvaCanvasFor(platform: string | null | undefined): { width: number; height: number } {
  switch (String(platform ?? "").toLowerCase()) {
    case "instagram": case "facebook": case "threads": return { width: 1080, height: 1350 };
    case "tiktok": return { width: 1080, height: 1920 };
    case "line": return { width: 1040, height: 1040 };
    case "email": case "website": return { width: 1200, height: 630 };
    default: return { width: 1080, height: 1080 };
  }
}

/**
 * 存進貼文時記在圖上的「模型」：這張不是 AI 畫的，是用戶自己給的。
 * 鏡像 server/content/core/image/variantImageUpdate.ts 的同名常數（client 不能 import server）。
 */
export const USER_SUPPLIED_IMAGE_MODEL = "user-supplied";

export function useOwnImageEntries({
  brandId, lang, onPick, canvaEdit, onCanvaSynced,
}: {
  brandId: number;
  lang: "zh-TW" | "en";
  onPick: (url: string) => void | Promise<void>;
  /** 給了就多一顆「在 Canva 編輯」：跳去 Canva 改，回來自動把最新版帶回這一格。 */
  canvaEdit?: CanvaEditTarget | null;
  /** 回來後圖真的更新了（伺服器已寫回貼文）——呼叫端重新讀這一篇。 */
  onCanvaSynced?: () => void;
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

  // ── 在 Canva 編輯（來回）──
  // 這張圖能不能回 Canva 改：它是這個人從 Canva 匯入的，或這個環境可以替用戶開新設計。
  const editImage = (canvaEdit?.imageUrl ?? "").startsWith("/static/") ? String(canvaEdit!.imageUrl) : "";
  const canvaStatusQ = (trpc as any).canva.status.useQuery(undefined, { enabled: brandId > 0 && !!canvaEdit, staleTime: 60_000 });
  const canvaConnected = !!canvaStatusQ.data?.connected;
  const refQ = (trpc as any).assetPhoto.canvaRef.useQuery(
    { brandId, imageUrl: editImage }, { enabled: brandId > 0 && !!canvaEdit && canvaConnected, staleTime: 30_000 },
  );
  const canOpenInCanva = !!canvaEdit && canvaConnected
    && (editImage ? !!(refQ.data?.fromCanva || refQ.data?.canCreate) : !!refQ.data?.canCreate);
  const startEditMut = (trpc as any).assetPhoto.startCanvaEdit.useMutation();
  const syncEditMut = (trpc as any).assetPhoto.syncCanvaEdit.useMutation();
  const [opening, setOpening] = React.useState(false);
  const [pendingKey, setPendingKey] = React.useState<string | null>(null);
  const syncingRef = React.useRef(false);

  const openInCanva = async () => {
    if (!canvaEdit || opening) return;
    // 分頁要在點擊的當下開，等伺服器回來才開會被瀏覽器當成彈出視窗擋掉。
    const tab = window.open("", "_blank");
    setOpening(true);
    try {
      const size = canvaCanvasFor(canvaEdit.platform);
      const r = await startEditMut.mutateAsync({
        brandId, outputId: canvaEdit.outputId, locator: canvaEdit.locator,
        ...(editImage ? { imageUrl: editImage } : {}), ...size,
        ...(canvaEdit.title ? { title: String(canvaEdit.title).slice(0, 255) } : {}), lang,
      });
      setPendingKey(String(r.skey));
      if (tab) tab.location.href = String(r.editUrl); else window.location.href = String(r.editUrl);
      showToastGlobal(L("已在新分頁開啟 Canva。改好後回到這裡，圖會自動更新。", "Canva opened in a new tab. Come back when you're done — the image updates by itself."));
    } catch (e: any) {
      tab?.close();
      showToastGlobal(String(e?.message ?? e).slice(0, 240), "error");
    } finally { setOpening(false); }
  };

  // 切回這個分頁就問一次：Canva 那邊改過才會帶回新圖，沒改伺服器什麼都不做。
  React.useEffect(() => {
    if (!pendingKey) return;
    const sync = async () => {
      if (document.visibilityState !== "visible" || syncingRef.current) return;
      syncingRef.current = true;
      try {
        const r = await syncEditMut.mutateAsync({ brandId, skey: pendingKey, lang });
        if (r?.changed) {
          showToastGlobal(r.outputUpdated
            ? L("已換成 Canva 的最新版本（前一張有保留，可以切回去）。", "Updated to the latest from Canva (the previous image is kept).")
            : L("Canva 的最新版本已存進素材庫。", "The latest from Canva is in your library."), "success");
          onCanvaSynced?.();
        }
      } catch (e: any) {
        showToastGlobal(String(e?.message ?? e).slice(0, 240), "error");
        setPendingKey(null);
      } finally { syncingRef.current = false; }
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => { window.removeEventListener("focus", sync); document.removeEventListener("visibilitychange", sync); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, brandId, lang]);

  const editEntry: ImageAction[] = canOpenInCanva ? [{
    id: "canva-edit", icon: "edit",
    label: editImage ? L("在 Canva 編輯", "Edit in Canva") : L("Canva 新設計", "New in Canva"),
    onClick: () => { void openInCanva(); }, busy: opening,
  }] : [];

  const entries: ImageAction[] = brandId > 0 ? [
    { id: "upload", icon: "upload", label: L("上傳", "Upload"), onClick: () => fileRef.current?.click(), busy: uploading },
    { id: "library", icon: "images", label: L("素材庫", "Library"), onClick: () => setLibraryOpen(true) },
    { id: "canva", icon: "link", label: L("Canva 匯入", "From Canva"), onClick: () => setCanvaOpen(true) },
    ...editEntry,
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
