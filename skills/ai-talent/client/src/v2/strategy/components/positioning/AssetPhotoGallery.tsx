/**
 * AssetPhotoGallery — 品牌或產品的照片庫：上傳、預覽、設主圖、刪除。
 *
 * 2026-09-10 (CJ「允許用戶上傳照片到品牌或個別產品。我們的 AI 不用再從網站
 * 爬產品照片了，因為這不容易，所有品牌／產品的照片都應該由用戶上傳」)。
 *
 * scope 通用（brand／product），同一個元件放兩個地方：ProductDetailModal
 * 用它取代原本「貼網址」的欄位；BrandsPage 用它當品牌照片庫。產品的主圖會
 * 鏡射進 products.positioning.imageUrl（server 端做，見 assetPhotos.ts），
 * 所以既有的「產品圖」讀取點（RunPage 選圖、成效層、品牌色票…）全部不必改。
 *
 * 上傳位元組走 /api/asset-photo/upload（express.raw，不是 tRPC——tRPC 只吃
 * JSON），list／setPrimary／remove 走 tRPC。
 */
import { IllustratedEmpty } from "../../../platform/components/EmptyIllustration";
import { useRef, useState } from "react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { showToastGlobal } from "../../../../components/ui/Toast";

interface Props {
  brandId: number;
  scope: "brand" | "product";
  scopeId: number;
  /** 空狀態與說明文字用；例如「這個產品」／「這個品牌」。 */
  scopeLabel?: string;
  /** 上傳／設主圖／刪除成功後呼叫——讓外層（例如產品縮圖）知道要重抓。 */
  onChange?: () => void;
}

const INK = "#171717";
const MUTED = "#737373";
const LINE = "#E5E5E5";

export default function AssetPhotoGallery({ brandId, scope, scopeId, scopeLabel, onChange }: Props) {
  const { lang } = useLang();
  const en = lang === "en";
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const utils = (trpc as any).useUtils?.();

  const q = (trpc as any).assetPhoto?.list?.useQuery
    ? (trpc as any).assetPhoto.list.useQuery({ brandId, scope, scopeId }, { staleTime: 30_000 })
    : { data: undefined, isLoading: false, refetch: () => {} };
  const photos = (q.data ?? []) as Array<{ id: string; url: string; filename: string; isPrimary: boolean; sizeBytes: number; createdAt: string }>;

  const refetch = () => { try { utils?.assetPhoto?.list?.invalidate?.(); } catch { /* noop */ } q.refetch?.(); onChange?.(); };
  const setPrimaryMut = (trpc as any).assetPhoto?.setPrimary?.useMutation?.({ onSuccess: refetch, onError: (e: any) => showToastGlobal(String(e?.message ?? "error"), "error") });
  const removeMut = (trpc as any).assetPhoto?.remove?.useMutation?.({ onSuccess: refetch, onError: (e: any) => showToastGlobal(String(e?.message ?? "error"), "error") });

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0; let lastError = "";
    for (const file of Array.from(files)) {
      try {
        const res = await fetch("/api/asset-photo/upload", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-brand-id": String(brandId),
            "x-scope": scope,
            "x-scope-id": String(scopeId),
            "x-filename": encodeURIComponent(file.name),
          },
          body: file,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) { lastError = json?.error ?? `HTTP ${res.status}`; continue; }
        ok += 1;
      } catch (e: any) {
        lastError = String(e?.message ?? e);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (ok > 0) {
      showToastGlobal(en ? `Uploaded ${ok}` : `已上傳 ${ok} 張`, "success");
      refetch();
    }
    // ok === 0：什麼都沒變，refetch() 不必呼叫；lastError 的 toast 已經在下面處理。
    if (lastError) showToastGlobal(lastError, "error");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {photos.map((p) => (
          <div
            key={p.id}
            style={{
              position: "relative", width: 96, height: 96, borderRadius: 8, overflow: "hidden",
              border: `1px solid ${p.isPrimary ? INK : LINE}`,
              boxShadow: p.isPrimary ? `0 0 0 1px ${INK}` : undefined,
              background: "#FAFAFA", flexShrink: 0,
            }}
          >
            <img src={p.url} alt={p.filename} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {p.isPrimary && (
              <span style={{ position: "absolute", top: 4, left: 4, fontSize: 10, fontWeight: 600, color: "#fff", background: INK, borderRadius: 4, padding: "1px 5px" }}>
                {en ? "Primary" : "主圖"}
              </span>
            )}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 4, padding: 4, background: "linear-gradient(transparent 50%, rgba(0,0,0,0.55))", opacity: 0, transition: "opacity 0.15s" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = "0"; }}
            >
              {!p.isPrimary && (
                <button
                  onClick={() => setPrimaryMut?.mutate?.({ brandId, scope, scopeId, photoId: p.id })}
                  title={en ? "Set as primary" : "設為主圖"}
                  style={{ fontSize: 11, color: "#fff", background: "rgba(0,0,0,0.5)", border: 0, borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}
                >
                  {en ? "Set" : "設主圖"}
                </button>
              )}
              <button
                onClick={() => removeMut?.mutate?.({ brandId, scope, scopeId, photoId: p.id })}
                title={en ? "Delete" : "刪除"}
                style={{ fontSize: 11, color: "#fff", background: "rgba(0,0,0,0.5)", border: 0, borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}
              >
                {en ? "Delete" : "刪除"}
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{
            width: 96, height: 96, borderRadius: 8, flexShrink: 0,
            border: `1px dashed ${LINE}`, background: "#FFFFFF", color: MUTED,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
            cursor: uploading ? "default" : "pointer", fontSize: 12,
          }}
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>{uploading ? "…" : "+"}</span>
          {uploading ? (en ? "Uploading" : "上傳中") : (en ? "Upload" : "上傳照片")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          multiple
          hidden
          onChange={(e) => void uploadFiles(e.target.files)}
        />
      </div>

      {photos.length === 0 && !q.isLoading && (
        <IllustratedEmpty
          kind="photo"
          size="sm"
          title={en ? "The album is still empty" : "相簿還是空的"}
          /* 2026-09：不再從官網抓圖——這句是用戶必須知道的規則，不是說明副標 */
          note={en ? "Real photos only — we no longer pull images from your website." : "請上傳真實照片，我們不再從網站抓圖了。"}
          action={{ label: en ? "Upload photos" : "上傳照片", onPress: () => fileRef.current?.click() }}
        />
      )}
      <p style={{ fontSize: 11.5, color: MUTED, margin: 0 }}>
        {en ? "PNG / JPEG / WebP, up to 15MB each. First photo becomes the primary." : "PNG／JPEG／WebP，單張上限 15MB。第一張自動當主圖。"}
      </p>
    </div>
  );
}
