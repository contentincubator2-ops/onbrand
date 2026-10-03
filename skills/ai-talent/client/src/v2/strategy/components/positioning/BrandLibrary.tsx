/**
 * BrandLibrary — 素材庫：這個品牌在網站任何地方上傳過的圖，集中在一處挑、傳、刪、拿去作圖。
 *
 * 2026-09-30（CJ「增加一個常駐的任務卡，是點進去，可以儲存各種他上傳的照片，他可以自己
 * 選取，當成在這邊作圖使用的。也要包括客戶在網站任何地方上傳的視覺，都要集結起來處理」）。
 *
 * 資料來自 assetPhoto.library（server/strategy/core/assetPhotos.ts listBrandLibrary）：
 * 不分品牌／產品的 asset_photos，加上不在那張表裡的標誌與產品主圖網址。這裡上傳的一律
 * 進品牌 scope；產品照仍在產品卡裡傳（要掛在哪個產品底下，只有那裡知道）。
 *
 * 兩種用法：
 *   manage  視覺頁的「素材庫」卡——多選、設為標誌、刪除、用這張作圖（選圖片卡後跳過去）
 *   pick    圖片任務卡的「從素材庫挑」——點一張就回傳，不做管理動作
 */
import React from "react";
import { Button, Chip, Modal, ModalBody, ModalContent, ModalHeader, Spinner } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCloudArrowUp, faCheck } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../../lib/trpc";
import { showToastGlobal } from "../../../platform/components/Toast";
import { IllustratedEmpty } from "../../../platform/components/EmptyIllustration";
import { uploadBrandPhoto, IMAGE_ACCEPT } from "../../lib/uploadBrandPhoto";
import { imageCardHref, saveImageSubjectHandoff } from "../../../platform/lib/imageCardHandoff";
import type { ImageCardInfo } from "../../../platform/lib/imageCardHandoff";

export interface LibraryItem {
  key: string;
  photoId: string | null;
  url: string;
  filename: string;
  source: "brand" | "product" | "logo";
  sourceLabel: string;
  scope: "brand" | "product";
  scopeId: number;
  isLogo: boolean;
  createdAt: string | null;
}

type Filter = "all" | "brand" | "product" | "logo";

const CHANNEL_LABEL: Record<string, { zh: string; en: string }> = {
  facebook: { zh: "Facebook", en: "Facebook" },
  instagram: { zh: "Instagram", en: "Instagram" },
  threads: { zh: "Threads", en: "Threads" },
  line: { zh: "LINE", en: "LINE" },
  tiktok: { zh: "TikTok", en: "TikTok" },
  email: { zh: "電子報", en: "Email" },
  website: { zh: "官網", en: "Website" },
};

/** 其他元件也要讀素材庫（圖片卡挑選器、風格卡）——同一個 query key，上傳後一起更新。 */
export function useBrandLibrary(brandId: number | null) {
  const q = (trpc as any).assetPhoto.library.useQuery(
    { brandId: brandId ?? 0 }, { enabled: !!brandId, staleTime: 30_000, refetchOnWindowFocus: false },
  ) ?? { data: undefined, isLoading: false };
  return { items: ((q.data ?? []) as LibraryItem[]), isLoading: !!brandId && !!q.isLoading };
}

export default function BrandLibrary({
  brandId, lang, readOnly, mode = "manage", onPick,
}: {
  brandId: number;
  lang: "zh-TW" | "en";
  readOnly?: boolean;
  mode?: "manage" | "pick";
  onPick?: (item: LibraryItem) => void;
}) {
  const en = lang === "en";
  const L = (zh: string, e: string) => (en ? e : zh);
  const navigate = useNavigate();
  const utils = (trpc as any).useUtils?.();
  const { items, isLoading } = useBrandLibrary(brandId);

  const [filter, setFilter] = React.useState<Filter>("all");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [chooserFor, setChooserFor] = React.useState<LibraryItem | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const refresh = () => {
    utils?.assetPhoto?.library?.invalidate?.();
    utils?.assetPhoto?.list?.invalidate?.();
    utils?.media?.listProductImages?.invalidate?.();
  };

  const removeMut = (trpc as any).assetPhoto?.remove?.useMutation?.();
  const setLogoMut = (trpc as any).brand?.setLogo?.useMutation?.();

  const counts: Record<Filter, number> = {
    all: items.length,
    brand: items.filter((i) => i.source === "brand").length,
    product: items.filter((i) => i.source === "product").length,
    logo: items.filter((i) => i.source === "logo").length,
  };
  const shown = filter === "all" ? items : items.filter((i) => i.source === filter);
  const picked = items.filter((i) => selected.includes(i.key));

  async function uploadFiles(files: FileList | File[] | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/") || !f.type);
    if (list.length === 0) return;
    setUploading(true);
    let ok = 0; let lastError = "";
    for (const f of list) {
      try { await uploadBrandPhoto(brandId, f); ok += 1; }
      catch (e: any) { lastError = String(e?.message ?? e); }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (ok > 0) { showToastGlobal(L(`已上傳 ${ok} 張`, `Uploaded ${ok}`), "success"); refresh(); }
    if (lastError) showToastGlobal(lastError.slice(0, 200), "error");
  }

  async function removeSelected() {
    const deletable = picked.filter((i) => i.photoId);
    if (deletable.length === 0) return;
    const msg = L(`刪除 ${deletable.length} 張？刪了就找不回來。`, `Delete ${deletable.length}? This can't be undone.`);
    if (!confirm(msg)) return;
    for (const i of deletable) {
      try {
        await removeMut?.mutateAsync?.({ brandId, scope: i.scope, scopeId: i.scopeId, photoId: i.photoId });
      } catch (e: any) { showToastGlobal(String(e?.message ?? e).slice(0, 200), "error"); }
    }
    setSelected([]);
    refresh();
  }

  async function makeLogo(item: LibraryItem) {
    try {
      // 伺服器端 setLogo 會一起寫 brands.logoUrl 與視覺頁標誌卡（_assets.logo.primaryUrl）。
      await setLogoMut?.mutateAsync?.({ brandId, logoUrl: item.url });
      utils?.brand?.get?.invalidate?.();
      utils?.scope?.active?.invalidate?.();
      refresh();
      showToastGlobal(L("已設為主標誌", "Set as your logo"), "success");
    } catch (e: any) {
      showToastGlobal(String(e?.message ?? e).slice(0, 200), "error");
    }
  }

  const toggle = (item: LibraryItem) => {
    if (mode === "pick") { onPick?.(item); return; }
    setSelected((cur) => cur.includes(item.key) ? cur.filter((k) => k !== item.key) : [...cur, item.key]);
  };

  const filters: Array<{ id: Filter; zh: string; en: string }> = [
    { id: "all", zh: "全部", en: "All" },
    { id: "brand", zh: "品牌", en: "Brand" },
    { id: "product", zh: "產品", en: "Products" },
    { id: "logo", zh: "標誌", en: "Logo" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 上傳區：點或拖進來都可以 */}
      {!readOnly && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); void uploadFiles(e.dataTransfer.files); }}
          className={`flex items-center gap-3 rounded-medium border border-dashed px-4 py-3 cursor-pointer transition ${dragOver ? "border-default-700 bg-default-100" : "border-default-300 hover:border-default-500"}`}
        >
          {uploading ? <Spinner size="sm" /> : <FontAwesomeIcon icon={faCloudArrowUp} className="text-default-500" />}
          <div className="min-w-0">
            <p className="text-small font-medium">{uploading ? L("上傳中…", "Uploading…") : L("上傳圖片", "Upload images")}</p>
            <p className="text-tiny text-default-500">
              {L("點這裡或把檔案拖進來，可以一次多張。PNG／JPEG／WebP，單張上限 15MB。",
                 "Click or drop files here — several at once. PNG / JPEG / WebP, up to 15MB each.")}
            </p>
          </div>
          <input ref={fileRef} type="file" hidden multiple accept={IMAGE_ACCEPT}
            onChange={(e) => void uploadFiles(e.target.files)} />
        </div>
      )}

      <p className="text-tiny text-default-500">
        {L("在網站任何地方上傳的圖都會收在這裡：標誌、品牌照片、各產品的照片、存下來的 AI 圖。",
           "Everything uploaded anywhere on the site lands here: logos, brand photos, product photos, saved AI images.")}
      </p>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-tiny transition ${filter === f.id ? "border-default-900 bg-default-900 text-white" : "border-divider text-default-600 hover:border-default-400"}`}>
              {en ? f.en : f.zh} <span className="opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner size="sm" /></div>
      ) : items.length === 0 ? (
        <IllustratedEmpty kind="photo" size="sm" title={L("素材庫還是空的", "Your library is empty")} />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {shown.map((item) => {
            const on = selected.includes(item.key);
            return (
              <button key={item.key} type="button" onClick={() => toggle(item)} title={item.filename || item.sourceLabel}
                className={`group relative aspect-square rounded-lg overflow-hidden border-2 bg-default-50 transition ${on ? "border-default-900" : "border-transparent hover:border-default-300"}`}>
                <img src={item.url} alt={item.filename || item.sourceLabel} loading="lazy"
                  className={`w-full h-full ${item.source === "logo" ? "object-contain p-2" : "object-cover"}`} />
                <span className="absolute left-1 bottom-1 max-w-[90%] truncate rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">
                  {item.source === "logo" ? L("標誌", "Logo") : item.source === "brand" ? L("品牌", "Brand") : item.sourceLabel || L("產品", "Product")}
                </span>
                {on && (
                  <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-default-900 text-white flex items-center justify-center">
                    <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 選了以後才出現的動作列 */}
      {mode === "manage" && picked.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-divider bg-content1 pt-3">
          <span className="text-tiny text-default-600 mr-auto">{L(`已選 ${picked.length} 張`, `${picked.length} selected`)}</span>
          <Button size="sm" color="primary" radius="md" isDisabled={picked.length !== 1}
            onPress={() => setChooserFor(picked[0]!)}>
            {L("用這張作圖", "Make an image with it")}
          </Button>
          {!readOnly && (
            <Button size="sm" variant="flat" radius="md"
              isDisabled={picked.length !== 1 || !picked[0]?.photoId || !picked[0]?.url.startsWith("/static/asset-photos/")}
              isLoading={setLogoMut?.isPending}
              onPress={() => void makeLogo(picked[0]!)}>
              {L("設為主標誌", "Set as logo")}
            </Button>
          )}
          {!readOnly && (
            <Button size="sm" variant="light" color="danger" radius="md"
              isDisabled={!picked.some((i) => i.photoId)} isLoading={removeMut?.isPending}
              onPress={() => void removeSelected()}>
              {L("刪除", "Delete")}
            </Button>
          )}
          <Button size="sm" variant="light" radius="md" onPress={() => setSelected([])}>{L("取消", "Clear")}</Button>
        </div>
      )}

      <ImageCardChooser
        item={chooserFor}
        lang={lang}
        onClose={() => setChooserFor(null)}
        onChoose={(cardId) => {
          if (!chooserFor) return;
          saveImageSubjectHandoff({ url: chooserFor.url, label: chooserFor.source === "product" ? chooserFor.sourceLabel : L("素材庫", "Library") });
          setChooserFor(null);
          navigate(imageCardHref(cardId));
        }}
      />
    </div>
  );
}

/** 「用這張作圖」要先決定做哪一種圖——列出各通路預設擺出來的圖片卡。 */
function ImageCardChooser({
  item, lang, onClose, onChoose,
}: {
  item: LibraryItem | null;
  lang: "zh-TW" | "en";
  onClose: () => void;
  onChoose: (cardId: string) => void;
}) {
  const en = lang === "en";
  const listQ = (trpc as any).imageCard.list.useQuery(undefined, { enabled: !!item, staleTime: 5 * 60_000 });
  const cards = ((listQ.data?.cards ?? []) as ImageCardInfo[]).filter((c) => c.pinned);
  const byChannel = new Map<string, ImageCardInfo[]>();
  for (const c of cards) byChannel.set(c.channel, [...(byChannel.get(c.channel) ?? []), c]);

  return (
    <Modal isOpen={!!item} onClose={onClose} size="lg" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex items-center gap-3">
          {item && <img src={item.url} alt="" className="w-10 h-10 rounded-md object-cover border border-divider" />}
          <span className="text-medium font-semibold">{en ? "What are you making?" : "要做哪一種圖？"}</span>
        </ModalHeader>
        <ModalBody className="pb-6">
          {!listQ.data ? (
            <div className="flex justify-center py-6"><Spinner size="sm" /></div>
          ) : (
            <div className="flex flex-col gap-4">
              {[...byChannel.entries()].map(([ch, list]) => (
                <div key={ch}>
                  <p className="text-tiny text-default-500 mb-1.5">{en ? CHANNEL_LABEL[ch]?.en ?? ch : CHANNEL_LABEL[ch]?.zh ?? ch}</p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((c) => (
                      <Chip key={c.id} as="button" variant="bordered" radius="md" className="cursor-pointer hover:bg-default-100"
                        onClick={() => onChoose(c.id)}>
                        {en ? c.labelEn : c.labelZh} <span className="text-default-400 ml-1">{c.ratio}</span>
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
