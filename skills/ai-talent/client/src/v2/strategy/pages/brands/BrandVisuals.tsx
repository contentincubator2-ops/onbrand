/**
 * 品牌視覺：Logo 設定與色票。
 */
import { trpc } from "../../../../lib/trpc";
import { useState, useRef } from "react";
import { useLang } from "../../../../lib/i18n";
import { HelpTip } from "../../../platform/components/HelpTip";
import { Avatar, Input, Button } from "@heroui/react";
import { CheckIcon } from "../../../platform/components/icons";
import AssetPhotoGallery from "../../components/assets/AssetPhotoGallery";

/* ─────────────────── BrandLogoSettings ─────────────────── */
/**
 * Brand logo block (2026-05-05): preview current logoUrl + 一鍵抓 FB 粉專
 * 大頭貼 + 換一張. Used in BrandsPage settings tab.
 */
export function BrandLogoSettings({ brandId, brandName }: { brandId: number; brandName: string | null }) {
  // 2026-09-10 (CJ「允許用戶上傳照片到品牌或個別產品」)：logo 也可以自己
  // 上傳，不必只靠 FB 粉專抓——單張圖，走 /api/asset-photo/upload 後把
  // 拿到的網址指定成 logoUrl（brand.setLogo），跟品牌照片庫共用同一支
  // 上傳端點，但這裡不用 AssetPhotoGallery（那是多張照片庫的元件），
  // logo 只有一張、也不需要「刪除／設主圖」這些操作。
  const setLogoMut = (trpc as any).brand?.setLogo?.useMutation?.();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const { lang } = useLang();
  const brandQuery = (trpc as any).brand?.get?.useQuery
    ? (trpc as any).brand.get.useQuery({ id: brandId }, { refetchOnWindowFocus: false, enabled: brandId > 0 })
    : { data: null, refetch: () => {} };
  const logoUrl: string | null = (brandQuery.data as any)?.logoUrl ?? null;

  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const fetchMut = (trpc as any).brand?.fetchFacebookAvatar?.useMutation();

  const submit = async () => {
    if (!handle.trim()) { setErr(lang === "en" ? "Paste a FB page URL or handle" : "請輸入 FB 粉專網址或 handle"); return; }
    setBusy(true); setErr(null); setOkMsg(null);
    try {
      const r = await fetchMut.mutateAsync({ brandId, handleOrUrl: handle.trim() });
      setOkMsg(lang === "en" ? `Fetched (${r.bytes.toLocaleString()} bytes)` : `已抓取 (${r.bytes.toLocaleString()} bytes)`);
      setHandle("");
      await brandQuery.refetch?.();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setBusy(false); }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploadingLogo(true); setErr(null); setOkMsg(null);
    try {
      const res = await fetch("/api/asset-photo/upload", {
        method: "POST",
        credentials: "include",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-brand-id": String(brandId), "x-scope": "brand", "x-scope-id": String(brandId),
          "x-filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      await setLogoMut?.mutateAsync?.({ brandId, logoUrl: json.photo.url });
      setOkMsg(lang === "en" ? "Logo updated" : "logo 已更新");
      await brandQuery.refetch?.();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setUploadingLogo(false);
      if (logoFileRef.current) logoFileRef.current.value = "";
    }
  };

  return (
    <div className="max-w-[640px] mx-auto space-y-4">
      <div>
        <h3 className="text-medium font-semibold flex items-center gap-1.5">
          {lang === "en" ? "Brand logo / avatar" : "品牌 logo / 頭像"}
          <HelpTip>
            {lang === "en"
              ? `The "${brandName ?? "brand"}" avatar used in mockups. Auto-fetch from the FB page, or upload manually later.`
              : `mockup 顯示用的「${brandName ?? "品牌"}」頭像。可以從 FB 粉專自動抓，或之後手動上傳。`}
          </HelpTip>
        </h3>
      </div>

      <div className="flex items-center gap-4 border border-default-200 rounded-medium p-4 bg-default-50">
        <Avatar
          src={logoUrl ?? `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(brandName ?? "brand")}`}
          size="lg"
          className="w-20 h-20"
        />
        <div className="flex-1 min-w-0">
          <p className="text-small font-medium">
            {logoUrl
              ? (lang === "en" ? "Current logo" : "目前 logo")
              : (lang === "en" ? "No logo yet (showing dicebear placeholder)" : "尚未設定 logo（顯示 dicebear 預設圖）")}
          </p>
          {logoUrl && (
            <p className="text-tiny text-default-600 truncate">{logoUrl}</p>
          )}
        </div>
      </div>

      <div className="space-y-2 border border-default-200 rounded-medium p-4">
        <p className="text-small font-medium">
          {logoUrl
            ? (lang === "en" ? "Swap (re-fetch from FB page)" : "換一張（從 FB 粉專重抓）")
            : (lang === "en" ? "Auto-fetch from FB page" : "從 FB 粉專自動抓")}
        </p>
        <p className="text-tiny text-default-700">
          {lang === "en"
            ? "Paste the page URL or handle. The page must be public. This overwrites your current logo."
            : "貼粉專網址或純 handle。粉專必須是公開的。會覆蓋現有 logo。"}
        </p>
        <Input
          size="sm"
          placeholder="https://www.facebook.com/yourbrand"
          value={handle}
          onValueChange={setHandle}
          isDisabled={busy}
        />
        <div className="flex items-center gap-2">
          <Button color="primary" size="sm" onPress={submit} isLoading={busy}>
            {logoUrl
              ? (lang === "en" ? "Re-fetch" : "重新抓取")
              : (lang === "en" ? "Fetch logo" : "抓取 logo")}
          </Button>
          {okMsg && <span className="text-tiny text-success-600 inline-flex items-center gap-1"><CheckIcon size={10} /> {okMsg}</span>}
          {err && <span className="text-tiny text-danger-600">{err}</span>}
        </div>
      </div>

      <div className="space-y-2 border border-default-200 rounded-medium p-4">
        <p className="text-small font-medium">{lang === "en" ? "Or upload your own" : "或自己上傳"}</p>
        <p className="text-tiny text-default-700">
          {lang === "en" ? "PNG / JPEG / WebP, up to 15MB. Overwrites your current logo." : "PNG／JPEG／WebP，上限 15MB。會覆蓋現有 logo。"}
        </p>
        <Button size="sm" variant="flat" isLoading={uploadingLogo} onPress={() => logoFileRef.current?.click()}>
          {lang === "en" ? "Choose file" : "選擇檔案"}
        </Button>
        <input
          ref={logoFileRef} type="file" hidden
          accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
          onChange={(e) => void uploadLogo(e.target.files?.[0])}
        />
      </div>

      <div className="pt-2">
        <h3 className="text-medium font-semibold flex items-center gap-1.5 mb-3">
          {lang === "en" ? "Brand photo library" : "品牌照片庫"}
          <HelpTip>
            {lang === "en"
              ? "Real photos of the brand — materials, storefront, packaging — used as reference for on-brand image generation and color extraction. We no longer scrape these from your website."
              : "品牌的真實照片——材質、門市、包裝——用來當 on-brand 生圖與取色的參考。我們不再從網站爬這些圖了。"}
          </HelpTip>
        </h3>
        <AssetPhotoGallery brandId={brandId} scope="brand" scopeId={brandId} scopeLabel={lang === "en" ? "this brand" : "這個品牌"} />
      </div>
    </div>
  );
}

/* ─────────────────────── BrandPaletteHero ────────────────────────────
 * 2026-06-21 (CJ「按 riverflow 標準」brand DNA): hero strip above the
 * Visual asset cards that surfaces the auto-extracted brand palette.
 * Calls brandColors.getCurrent for read + extractForBrand for trigger.
 * Empty-state / loading / locked / live-swatches states are all handled
 * inline so the host tab doesn't need to thread props.
 * ─────────────────────────────────────────────────────────────────── */
export function BrandPaletteHero({
  brandId, lang, locked,
}: { brandId: number; lang: "zh-TW" | "en"; locked: boolean }) {
  const en = lang === "en";
  const paletteQ = (trpc as any).brandColors?.getCurrent?.useQuery(
    { brandId },
    { enabled: !!brandId, staleTime: 30_000 },
  );
  const extractMut = (trpc as any).brandColors?.extractForBrand?.useMutation?.({
    onSuccess: () => paletteQ?.refetch?.(),
  });
  const data = paletteQ?.data as any;
  const swatches: Array<{
    hex: string; role: string; weight: number;
    lab: { L: number; a: number; b: number };
  }> = data?.swatches ?? [];
  const sourceCount = data?.sourceImageCount ?? 0;
  const userLocked = !!data?.userLocked;
  const isLoading = paletteQ?.isLoading || extractMut?.isPending;

  const handleExtract = () => {
    if (locked || !brandId) return;
    extractMut?.mutate?.({ brandId, targetSize: 7, force: userLocked });
  };

  // Pick text color (black / white) by luminance for contrast on each chip
  const pickFg = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? "#1a1a1a" : "#ffffff";
  };

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid #E5E7EB",
        background: "#FFFFFF",
        padding: 20,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <div>
          <p style={{
            fontSize: 12, fontWeight: 600, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "#78716C", margin: 0,
          }}>
            {en ? "Brand DNA · Color palette" : "品牌 DNA · 色彩"}
          </p>
          <h3 style={{
            fontSize: 17, fontWeight: 700, color: "#171717",
            margin: "4px 0 0", letterSpacing: "-0.01em",
          }}>
            {swatches.length > 0
              ? (en
                  ? `${swatches.length} core colors auto-extracted from ${sourceCount} product image${sourceCount === 1 ? "" : "s"}`
                  : `從 ${sourceCount} 張產品圖自動萃取出 ${swatches.length} 個核心色`)
              : (en ? "Not yet extracted" : "尚未萃取")}
          </h3>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {userLocked && (
            <span
              title={en ? "User-locked — re-extracting will overwrite manual edits" : "已鎖定 — 重新萃取會覆寫手動編輯"}
              style={{
                fontSize: 12, fontWeight: 600, padding: "3px 8px",
                borderRadius: 4, background: "#FEF3C7", color: "#92400E",
                letterSpacing: "0.08em", textTransform: "uppercase",
              }}
            >
              {en ? "Locked" : "已鎖定"}
            </span>
          )}
          <button
            onClick={handleExtract}
            disabled={locked || isLoading}
            style={{
              fontSize: 12, fontWeight: 600, padding: "7px 14px",
              borderRadius: 8, cursor: locked || isLoading ? "not-allowed" : "pointer",
              border: "1px solid #171717",
              background: swatches.length === 0 ? "#171717" : "#FFFFFF",
              color: swatches.length === 0 ? "#FFFFFF" : "#171717",
              opacity: locked ? 0.5 : 1,
              transition: "all 0.15s",
            }}
          >
            {isLoading
              ? (en ? "Extracting…" : "萃取中…")
              : swatches.length === 0
                ? (en ? "Extract from products" : "從產品圖萃取")
                : userLocked
                  ? (en ? "Re-extract (overwrites lock)" : "重新萃取（覆寫鎖定）")
                  : (en ? "Re-extract" : "重新萃取")}
          </button>
        </div>
      </div>

      {/* States */}
      {extractMut?.error && (
        <p style={{ fontSize: 12, color: "#DC2626", marginBottom: 10 }}>
          {String((extractMut.error as any)?.message ?? extractMut.error).slice(0, 200)}
        </p>
      )}
      {extractMut?.data?.ok === false && extractMut.data.reason === "no_product_images" && (
        <p style={{ fontSize: 12, color: "#92400E", marginBottom: 10 }}>
          {en
            ? "No photos yet. Upload a photo to a product or to the brand's photo library (Settings tab), then come back."
            : "目前還沒有照片。請先到「設定」上傳一張產品照片或品牌照片，再回來這裡。"}
        </p>
      )}

      {/* Empty hint */}
      {swatches.length === 0 && !isLoading && (
        <p style={{ fontSize: 13, color: "#737373", margin: 0, lineHeight: 1.6 }}>
          {en
            ? "Run the extractor to pull 5–7 core colors from your product photos. Generated content will use them."
            : "按「從產品圖萃取」，從產品照挑出 5–7 個核心色；之後生成的內容都會用這份色票。"}
        </p>
      )}

      {/* Swatches row */}
      {swatches.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(swatches.length, 7)}, minmax(0, 1fr))`,
          gap: 8,
          marginTop: 4,
        }}>
          {swatches.map((s, i) => {
            const fg = pickFg(s.hex);
            return (
              <div
                key={`${s.hex}-${i}`}
                title={`${s.hex} · ${s.role} · ${(s.weight * 100).toFixed(1)}%`}
                style={{
                  background: s.hex,
                  borderRadius: 10,
                  padding: 12,
                  minHeight: 96,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  border: "1px solid rgba(0,0,0,0.06)",
                  color: fg,
                  cursor: "default",
                }}
              >
                <span style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase", opacity: 0.85,
                }}>
                  {s.role}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.01em" }}>
                    {s.hex.toUpperCase()}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                    {(s.weight * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
