/**
 * ProductSceneModal — 用產品照片做場景圖，而且讓用戶看得到、確認每一步。
 *
 * 2026-09-21（CJ「用戶參與過程應該不錯」＋「失敗立刻重新嘗試，不能出現錯誤」）：
 *   1. 選一張產品照片、寫想要的場景（選填）
 *   2. 預覽去背（不扣點）。去背失敗伺服器會自動重試；仍拿不到可用的去背時，
 *      這裡不是報錯，而是告訴用戶「這張會改用 AI 重繪版」，讓他決定要不要繼續
 *   3. 用戶確認去背沒問題 → 才合成（才扣點）；用的就是他確認過的那張去背圖
 *   4. 結果會標明是怎麼出的：合成（產品像素沒被重畫）／AI 重繪版／原照片放中性背景
 *
 * 產品像素是否被動到、去背準不準，是這個產品最在意的事，所以每一種「不是最精準」
 * 的結果都要明講，不能讓用戶以為拿到的都是同一種東西。
 */
import { useEffect, useMemo, useState } from "react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";

const INK = "#171717";
const MUTED = "#737373";
const LINE = "#E5E5E5";
const WARN = "#B45309";

type Step = "setup" | "previewing" | "review" | "generating" | "done";

interface Photo { id: string; url: string; filename: string; isPrimary: boolean }

const ISSUE_ZH: Record<string, string> = {
  cropped_at_edge: "產品貼到照片邊緣，可能被裁到一部分。",
  fragmented: "去背結果有分離的碎塊，可能混進了其他物件或雜點。",
  fuzzy_edges: "邊緣有大片半透明區域（毛邊或光暈；透明玻璃製品也會這樣）。",
};
const ISSUE_EN: Record<string, string> = {
  cropped_at_edge: "The product touches the photo edge and may be cropped.",
  fragmented: "The cutout has separate fragments — other objects or specks may be included.",
  fuzzy_edges: "Large semi-transparent edges (fuzz or halo; transparent glass looks like this too).",
};

const CHECKER = {
  backgroundColor: "#fff",
  backgroundImage:
    "linear-gradient(45deg,#e8e8e8 25%,transparent 25%,transparent 75%,#e8e8e8 75%)," +
    "linear-gradient(45deg,#e8e8e8 25%,transparent 25%,transparent 75%,#e8e8e8 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 8px 8px",
} as const;

const btn = (primary = false) => ({
  fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
  border: primary ? "0" : `1px solid ${LINE}`, background: primary ? INK : "#fff", color: primary ? "#fff" : INK,
}) as const;

export default function ProductSceneModal({
  brandId, productId, onClose,
}: { brandId: number; productId: number; onClose: () => void }) {
  const { lang } = useLang();
  const en = lang === "en";
  const [step, setStep] = useState<Step>("setup");
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [scene, setScene] = useState("");
  const [errorText, setErrorText] = useState("");

  const photosQ = (trpc as any).assetPhoto.list.useQuery({ brandId, scope: "product", scopeId: productId }, { staleTime: 30_000 });
  const photos = (photosQ.data ?? []) as Photo[];
  useEffect(() => {
    if (!photoUrl && photos.length) setPhotoUrl((photos.find((p) => p.isPrimary) ?? photos[0]!).url);
  }, [photos, photoUrl]);

  const previewMut = (trpc as any).image.previewProductCutout.useMutation();
  const generateMut = (trpc as any).image.generateProductScene.useMutation();
  const preview = previewMut.data as
    | { ok: true; needsReview: boolean; issues: string[]; cutoutUrl: string; attempts: number }
    | { ok: false; attempts: number; issues: string[] }
    | undefined;
  const result = generateMut.data as
    | { url: string; method: "composite" | "generative" | "original-on-backdrop"; needsReview: boolean }
    | undefined;

  const absolute = useMemo(() => (photoUrl ? new URL(photoUrl, window.location.origin).href : ""), [photoUrl]);

  const generic = en ? "Something went wrong. Please try again." : "暫時無法處理，請再試一次。";

  function runPreview() {
    setErrorText("");
    setStep("previewing");
    previewMut.mutate({ brandId, productImageUrl: absolute }, {
      onSuccess: () => setStep("review"),
      onError: (e: any) => { setErrorText(e?.message || generic); setStep("setup"); },
    });
  }

  function runGenerate(useGenerative: boolean) {
    setErrorText("");
    setStep("generating");
    generateMut.mutate({
      brandId, productImageUrl: absolute,
      scenePrompt: scene.trim() || undefined,
      approvedCutoutUrl: !useGenerative && preview?.ok ? preview.cutoutUrl : undefined,
      useGenerative: useGenerative || undefined,
    }, {
      onSuccess: () => setStep("done"),
      onError: (e: any) => { setErrorText(e?.message || generic); setStep("review"); },
    });
  }

  const label = (zh: string, enText: string) => (en ? enText : zh);

  return (
    <div
      role="dialog" aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 720, maxHeight: "92vh", overflowY: "auto", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: INK }}>{label("用產品照片做場景圖", "Make a scene from a product photo")}</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              {label("先預覽去背、確認沒問題再合成。預覽不扣點，合成才扣點。", "Preview the cutout and confirm before compositing. Preview is free; compositing uses points.")}
            </div>
          </div>
          <button onClick={onClose} aria-label="close" style={{ ...btn(), padding: "4px 10px" }}>✕</button>
        </div>

        {(step === "setup" || step === "previewing") && (
          <div style={{ display: "grid", gap: 14 }}>
            {photosQ.isLoading ? (
              <p style={{ fontSize: 13, color: MUTED }}>{label("載入中…", "Loading…")}</p>
            ) : photos.length === 0 ? (
              <p style={{ fontSize: 13, color: WARN }}>{label("這個產品還沒有照片，請先在上面的「產品照片」上傳。", "This product has no photos yet — upload one under “Product photos” first.")}</p>
            ) : (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>{label("選一張照片", "Pick a photo")}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {photos.map((p) => (
                    <button key={p.id} onClick={() => setPhotoUrl(p.url)} aria-label={p.filename}
                      style={{ padding: 0, border: `2px solid ${photoUrl === p.url ? INK : LINE}`, borderRadius: 8, overflow: "hidden", cursor: "pointer", background: "#fff" }}>
                      <img src={p.url} alt={p.filename} style={{ width: 88, height: 88, objectFit: "cover", display: "block" }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{label("場景（選填）", "Scene (optional)")}</label>
              <textarea
                value={scene} onChange={(e) => setScene(e.target.value)} rows={2} maxLength={600}
                placeholder={label("例：淺色木紋桌面，早晨自然光", "e.g. light wood table, morning daylight")}
                style={{ width: "100%", marginTop: 4, fontSize: 13, padding: "8px 10px", border: `1px solid ${LINE}`, borderRadius: 8, resize: "vertical" }}
              />
            </div>
            {errorText && <p style={{ fontSize: 12, color: "#B91C1C" }}>{errorText}</p>}
            <div>
              <button onClick={runPreview} disabled={!photoUrl || step === "previewing"} style={{ ...btn(true), opacity: !photoUrl || step === "previewing" ? 0.5 : 1 }}>
                {step === "previewing" ? label("正在去背…（失敗會自動重試）", "Removing background… (retries automatically)") : label("預覽去背", "Preview cutout")}
              </button>
            </div>
          </div>
        )}

        {step === "review" && preview && (
          <div style={{ display: "grid", gap: 14 }}>
            {preview.ok ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <figure style={{ margin: 0 }}>
                    <img src={photoUrl} alt="" style={{ width: "100%", borderRadius: 8, border: `1px solid ${LINE}`, display: "block" }} />
                    <figcaption style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{label("原照片", "Original")}</figcaption>
                  </figure>
                  <figure style={{ margin: 0 }}>
                    <div style={{ ...CHECKER, borderRadius: 8, border: `1px solid ${LINE}`, overflow: "hidden" }}>
                      <img src={preview.cutoutUrl} alt="" style={{ width: "100%", display: "block" }} />
                    </div>
                    <figcaption style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{label("去背結果（棋盤格＝透明）", "Cutout (checkerboard = transparent)")}</figcaption>
                  </figure>
                </div>
                {preview.needsReview && (
                  <div style={{ border: `1px solid #FDE68A`, background: "#FFFBEB", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#92400E" }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{label("請看一下去背有沒有問題：", "Please check the cutout:")}</div>
                    {preview.issues.map((i) => <div key={i}>• {(en ? ISSUE_EN : ISSUE_ZH)[i] ?? i}</div>)}
                  </div>
                )}
                {errorText && <p style={{ fontSize: 12, color: "#B91C1C" }}>{errorText}</p>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => runGenerate(false)} style={btn(true)}>{label("這樣可以，開始合成", "Looks good — compose")}</button>
                  <button onClick={() => setStep("setup")} style={btn()}>{label("換一張照片", "Pick another photo")}</button>
                  <button onClick={() => runGenerate(true)} style={btn()}>{label("改用 AI 重繪版", "Use AI redraw instead")}</button>
                </div>
                <p style={{ fontSize: 11, color: MUTED }}>
                  {label("AI 重繪版不需要去背，但產品的細節（標籤、比例、顏色）可能與原照片有些差異。", "The AI redraw needs no cutout, but product details (label, proportions, colour) may differ from your photo.")}
                </p>
              </>
            ) : (
              <>
                <div style={{ border: `1px solid #FDE68A`, background: "#FFFBEB", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#92400E" }}>
                  {label(
                    `這張照片沒辦法精準去背（已自動重試 ${preview.attempts} 次）。我們會改用 AI 重繪版，產品的細節可能與原照片有些差異。你也可以換一張背景單純、產品完整入鏡的照片再試。`,
                    `We couldn't cut this photo out cleanly (retried ${preview.attempts} times). We'll use the AI redraw instead — product details may differ slightly. You can also try a photo with a plain background and the whole product in frame.`,
                  )}
                </div>
                {errorText && <p style={{ fontSize: 12, color: "#B91C1C" }}>{errorText}</p>}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => runGenerate(true)} style={btn(true)}>{label("繼續（AI 重繪版）", "Continue (AI redraw)")}</button>
                  <button onClick={() => setStep("setup")} style={btn()}>{label("換一張照片", "Pick another photo")}</button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "generating" && (
          <p style={{ fontSize: 13, color: MUTED, padding: "24px 0" }}>{label("合成中…通常需要十幾秒。", "Composing… usually takes a few seconds.")}</p>
        )}

        {step === "done" && result && (
          <div style={{ display: "grid", gap: 12 }}>
            <img src={result.url} alt="" style={{ width: "100%", borderRadius: 10, border: `1px solid ${LINE}`, display: "block" }} />
            <div style={{ fontSize: 12, color: result.method === "composite" ? "#047857" : WARN }}>
              {result.method === "composite"
                ? label("合成完成：產品像素沒有被重畫，只有背景是 AI 生成的。", "Composited: your product pixels were not redrawn — only the background is AI-generated.")
                : result.method === "generative"
                  ? label("這是 AI 重繪版：產品細節（標籤、比例、顏色）可能與原照片有些差異，請確認後再使用。", "This is the AI redraw: product details may differ from your photo — please check before using it.")
                  : label("AI 場景暫時生不出來，已把你的原照片放在中性背景上。產品沒有被改動，但沒有場景。", "The AI scene couldn't be generated, so your original photo is placed on a neutral backdrop. The product is untouched, but there is no scene.")}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href={result.url} download style={{ ...btn(true), textDecoration: "none", display: "inline-block" }}>{label("下載", "Download")}</a>
              <button onClick={() => setStep("setup")} style={btn()}>{label("再做一張", "Make another")}</button>
              <button onClick={onClose} style={btn()}>{label("關閉", "Close")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
