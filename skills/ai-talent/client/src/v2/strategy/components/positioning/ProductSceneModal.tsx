/**
 * ProductSceneModal — 用產品照片做場景圖：選照片 → 寫場景 → GPT Image 2 生成 → 跟原照片並排對照。
 *
 * 2026-09-21（CJ「按照你的建議，移除去背」）：不再有去背／合成／重繪三種做法。產品照片直接當
 * 參考圖交給 GPT Image 2（圖片編輯端點）；它不行時，用戶自己決定要不要改用 Nano Banana，
 * 不會自動換。走的是跟其他地方一樣的 image.generate（同一套點數、失敗退款、失敗重試一次）。
 *
 * AI 生成不是像素級保真——標籤小字、瓶蓋顏色都可能跟原照片有出入。所以結果永遠跟原照片並排，
 * 並明講這件事；每一張做過的圖都留在這次視窗裡，可以隨時選回來。
 */
import { useEffect, useState } from "react";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";

const INK = "#171717";
const MUTED = "#737373";
const LINE = "#E5E5E5";
const WARN = "#B45309";

type Step = "setup" | "generating" | "done";
type Model = "gpt-image-2" | "nano-banana";
type Size = "1024x1024" | "1536x1024" | "1024x1536";

interface Photo { id: string; url: string; filename: string; isPrimary: boolean }
// 2026-09-25（CJ「如果用戶針對產出的圖，還想要微調的話，我們在使用者介面上，應該如何設計，
// 讓用戶可以調整當前的提示詞?」）：每張圖都要記住**它自己**用的提示詞與版面，不能只留一份
// 全域的 scene。使用者在「這次做過的圖」之間切來切去，按下「調整提示詞」時要拿到的是眼前
// 這張圖的提示詞，不是最後一次輸入框裡的東西。
interface Made { url: string; model: Model; scene: string; size: Size }
interface Failure { message: string; canSwitchTo?: "nano-banana"; model: Model }

const DEFAULT_SCENE = "A clean, natural setting with soft natural light and a realistic contact shadow";
const MODEL_NAME: Record<Model, string> = { "gpt-image-2": "GPT Image 2", "nano-banana": "Nano Banana" };

/**
 * 微調用語。使用者看著一張圖說「就是哪裡不對」，但寫不出來——寫得出來的話一開始就寫了。
 * 所以不要只給他一個空白框，給他攝影棚裡最常喊的那幾句，點一下接在他自己那段後面。
 * （這裡刻意只放「調整」不放「加東西」——加東西會偏離產品保真的目的。）
 */
const TWEAKS: Array<{ zh: string; en: string }> = [
  { zh: "光線再柔一點", en: "softer light" },
  { zh: "整體再亮一點", en: "brighter overall" },
  { zh: "改成側光", en: "side lighting" },
  { zh: "背景再簡單一點", en: "simpler background" },
  { zh: "鏡頭拉遠、看得到更多環境", en: "pull back to show more of the room" },
  { zh: "鏡頭再近一點", en: "move in closer" },
  { zh: "改成俯角", en: "shoot from above" },
  { zh: "更有生活感、不要像擺拍", en: "more lived-in, less staged" },
];

const btn = (primary = false) => ({
  fontSize: 13, fontWeight: 600, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
  border: primary ? "0" : `1px solid ${LINE}`, background: primary ? INK : "#fff", color: primary ? "#fff" : INK,
}) as const;

export default function ProductSceneModal({
  brandId, productId, onClose,
}: { brandId: number; productId: number; onClose: () => void }) {
  const { lang } = useLang();
  const en = lang === "en";
  const label = (zh: string, enText: string) => (en ? enText : zh);

  const [step, setStep] = useState<Step>("setup");
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [scene, setScene] = useState("");
  const [size, setSize] = useState<Size>("1024x1024");
  const [made, setMade] = useState<Made[]>([]);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [errorText, setErrorText] = useState("");

  const photosQ = (trpc as any).assetPhoto.list.useQuery({ brandId, scope: "product", scopeId: productId }, { staleTime: 30_000 });
  const photos = (photosQ.data ?? []) as Photo[];
  useEffect(() => {
    if (!photoUrl && photos.length) setPhotoUrl((photos.find((p) => p.isPrimary) ?? photos[0]!).url);
  }, [photos, photoUrl]);

  // 2026-09-24（CJ「因為她的提示詞不夠好，所以合成的圖片很糟糕，很AI…請加入AI
  // 潤飾的按鈕」）：使用者通常只寫「餐桌」兩個字，模型缺的空間／光線／鏡頭／
  // 氛圍就自己補，補出來就是那種一眼看穿的 AI 感。這顆按鈕把他寫的補成一段
  // 具體場景——**是提案不是自動套用**：換上去之後可以一鍵復原回他原本寫的。
  const [sceneBefore, setSceneBefore] = useState<string | null>(null);
  const [refineError, setRefineError] = useState("");
  /** 正在微調的來源圖（url）。有值時 setup 會出現橫幅，說清楚會另存成新的一張。 */
  const [tweakOf, setTweakOf] = useState<string | null>(null);
  const refineMut = (trpc as any).image?.refineScenePrompt?.useMutation?.();

  const generateMut = (trpc as any).image.generate.useMutation();
  const generic = label("暫時無法處理，請再試一次。", "Something went wrong. Please try again.");

  function run(model: Model) {
    setErrorText("");
    setFailure(null);
    setStep("generating");
    // 真正送出去的那一段——存進 made 裡，之後「這張圖的提示詞」顯示的就是它，不是猜的。
    const usedScene = scene.trim() || DEFAULT_SCENE;
    generateMut.mutate({
      brandId,
      prompt: usedScene,
      subjectImageUrl: photoUrl,
      modelChoice: model,
      size,
    }, {
      onSuccess: (r: any) => {
        if (r?.status === "failed" || !r?.url) {
          // A failed generation is a result, not an error: the server already retried once and refunded the points.
          setFailure({ message: String(r?.friendlyMessage ?? generic), canSwitchTo: r?.canSwitchTo, model });
          setStep("setup");
          return;
        }
        const url = String(r.url);
        setMade((list) => [{ url, model, scene: usedScene, size }, ...list.filter((m) => m.url !== url)]);
        setCurrentUrl(url);
        setTweakOf(null);   // 這一輪改完了，橫幅要收掉
        setStep("done");
      },
      onError: (e: any) => { setErrorText(e?.message || generic); setStep("setup"); },
    });
  }

  const current = made.find((m) => m.url === currentUrl);
  const sizeOptions: Array<{ v: Size; zh: string; en: string }> = [
    { v: "1024x1024", zh: "方形", en: "Square" },
    { v: "1536x1024", zh: "橫式", en: "Landscape" },
    { v: "1024x1536", zh: "直式", en: "Portrait" },
  ];

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
              {label("用 GPT Image 2 以你的產品照片為基準生成。結果會跟原照片並排，方便你對照。", "GPT Image 2 builds the scene around your product photo. The result sits next to the original so you can compare.")}
            </div>
          </div>
          <button onClick={onClose} aria-label="close" style={{ ...btn(), padding: "4px 10px" }}>✕</button>
        </div>

        {step !== "done" && (
          <div style={{ display: "grid", gap: 14 }}>
            {tweakOf && (
              <div style={{ border: `1px solid ${LINE}`, background: "#FAFAFA", borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <img src={tweakOf} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, display: "block" }} />
                <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, flex: 1, minWidth: 180 }}>
                  {label(
                    "正在調整這張圖的提示詞。生成後會另存成新的一張，原圖不會被覆蓋。",
                    "Tweaking the prompt behind this image. The result is saved as a new image — the original stays.",
                  )}
                </div>
                <button onClick={() => { setTweakOf(null); setStep("done"); }} style={{ ...btn(), padding: "3px 10px", fontSize: 11 }}>
                  {label("取消", "Cancel")}
                </button>
              </div>
            )}
            {photosQ.isLoading ? (
              <p style={{ fontSize: 13, color: MUTED }}>{label("載入中…", "Loading…")}</p>
            ) : photos.length === 0 ? (
              <p style={{ fontSize: 13, color: WARN }}>{label("這個產品還沒有照片，請先在上面的「產品照片」上傳。", "This product has no photos yet — upload one under “Product photos” first.")}</p>
            ) : (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>{label("選一張照片", "Pick a photo")}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {photos.map((p) => (
                    <button key={p.id} onClick={() => setPhotoUrl(p.url)} aria-label={p.filename} disabled={step === "generating"}
                      style={{ padding: 0, border: `2px solid ${photoUrl === p.url ? INK : LINE}`, borderRadius: 8, overflow: "hidden", cursor: "pointer", background: "#fff" }}>
                      <img src={p.url} alt={p.filename} style={{ width: 88, height: 88, objectFit: "cover", display: "block" }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{label("場景（選填）", "Scene (optional)")}</label>
                <button
                  onClick={() => {
                    if (!refineMut || refineMut.isPending || step === "generating") return;
                    setRefineError("");
                    const before = scene;
                    refineMut.mutate(
                      { brandId, productId, scene: before.trim() },
                      {
                        onSuccess: (r: any) => {
                          const refined = String(r?.refined ?? "").trim();
                          if (!refined) { setRefineError(label("這次沒有潤出結果，直接用你原本寫的也可以。", "No refinement came back — your own text works too.")); return; }
                          setSceneBefore(before);   // 留著原文，讓使用者可以反悔
                          setScene(refined);
                        },
                        onError: (e: any) => setRefineError(e?.message || label("潤飾失敗，請再試一次。", "Couldn't refine — try again.")),
                      },
                    );
                  }}
                  disabled={!refineMut || refineMut.isPending || step === "generating"}
                  title={label(
                    "把你寫的場景補成具體的空間、光線、鏡頭與氛圍——不會動到產品本身的描述",
                    "Expands your scene into concrete space, light, framing and mood — it never describes the product itself",
                  )}
                  style={{ ...btn(), padding: "3px 10px", fontSize: 12, opacity: (!refineMut || refineMut.isPending || step === "generating") ? 0.5 : 1 }}
                >
                  {refineMut?.isPending ? label("潤飾中…", "Refining…") : label("✨ AI 潤飾", "✨ Refine with AI")}
                </button>
              </div>
              <textarea
                value={scene}
                onChange={(e) => { setScene(e.target.value); if (sceneBefore !== null) setSceneBefore(null); }}
                rows={sceneBefore !== null ? 4 : 2} maxLength={600} disabled={step === "generating"}
                placeholder={label("例：淺色木紋桌面，早晨自然光", "e.g. light wood table, morning daylight")}
                style={{ width: "100%", marginTop: 4, fontSize: 13, padding: "8px 10px", border: `1px solid ${LINE}`, borderRadius: 8, resize: "vertical" }}
              />
              {sceneBefore !== null && (
                <div style={{ marginTop: 4, fontSize: 11, color: MUTED, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>{label("已用 AI 潤飾。你可以直接改這段文字。", "Refined by AI — edit it freely.")}</span>
                  <button
                    onClick={() => { setScene(sceneBefore); setSceneBefore(null); }}
                    style={{ ...btn(), padding: "2px 8px", fontSize: 11 }}
                  >
                    {label("復原成我寫的", "Undo")}
                  </button>
                </div>
              )}
              {refineError && (
                <div style={{ marginTop: 4, fontSize: 11, color: WARN }}>{refineError.slice(0, 200)}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{label("微調", "Tweak")}</span>
              {TWEAKS.map((t) => (
                <button
                  key={t.zh}
                  disabled={step === "generating"}
                  onClick={() => {
                    const add = en ? t.en : t.zh;
                    setScene((prev) => {
                      const base = prev.trim().replace(/[。.，,、；;]+$/, "");
                      return base ? `${base}${en ? ", " : "，"}${add}` : add;
                    });
                    setSceneBefore(null);   // 使用者自己動過了，「復原成我寫的」不再成立
                  }}
                  style={{ ...btn(), padding: "3px 9px", fontSize: 11, fontWeight: 500, borderRadius: 999 }}
                >
                  {en ? t.en : t.zh}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{label("版面", "Shape")}</span>
              {sizeOptions.map((o) => (
                <button key={o.v} onClick={() => setSize(o.v)} disabled={step === "generating"}
                  style={{ ...btn(size === o.v), padding: "4px 10px", fontSize: 12 }}>{en ? o.en : o.zh}</button>
              ))}
            </div>

            {failure && (
              <div style={{ border: "1px solid #FDE68A", background: "#FFFBEB", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#92400E" }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {label(`${MODEL_NAME[failure.model]} 這次沒有產出（已自動重試一次，點數已退回）。`, `${MODEL_NAME[failure.model]} didn't produce an image (retried once automatically; points refunded).`)}
                </div>
                <div style={{ whiteSpace: "pre-line", lineHeight: 1.6 }}>{failure.message.slice(0, 300)}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <button onClick={() => run(failure.model)} disabled={!photoUrl} style={btn()}>{label("再試一次", "Try again")}</button>
                  {failure.canSwitchTo === "nano-banana" && (
                    <button onClick={() => run("nano-banana")} disabled={!photoUrl} style={btn()}>{label("改用 Nano Banana", "Try Nano Banana instead")}</button>
                  )}
                </div>
              </div>
            )}
            {errorText && <p style={{ fontSize: 12, color: "#B91C1C" }}>{errorText}</p>}

            {made.length > 0 && step === "setup" && (
              <button onClick={() => setStep("done")} style={{ ...btn(), justifySelf: "start" }}>
                {label(`回到這次做過的圖（${made.length} 張）`, `Back to the images made this time (${made.length})`)}
              </button>
            )}

            <div>
              <button onClick={() => run("gpt-image-2")} disabled={!photoUrl || step === "generating"}
                style={{ ...btn(true), opacity: !photoUrl || step === "generating" ? 0.5 : 1 }}>
                {step === "generating" ? label("生成中…通常約 20 秒", "Generating… usually about 20s") : label("生成場景圖", "Generate scene")}
              </button>
            </div>
          </div>
        )}

        {step === "done" && current && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <figure style={{ margin: 0 }}>
                <img src={photoUrl} alt="" style={{ width: "100%", borderRadius: 8, border: `1px solid ${LINE}`, display: "block" }} />
                <figcaption style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{label("原照片", "Original")}</figcaption>
              </figure>
              <figure style={{ margin: 0 }}>
                <img src={current.url} alt="" style={{ width: "100%", borderRadius: 8, border: `1px solid ${LINE}`, display: "block" }} />
                <figcaption style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{label(`生成結果（${MODEL_NAME[current.model]}）`, `Result (${MODEL_NAME[current.model]})`)}</figcaption>
              </figure>
            </div>
            <div style={{ fontSize: 12, color: WARN, lineHeight: 1.6 }}>
              {label(
                "AI 生成不是像素級保真：標籤上的小字、瓶蓋或包裝的顏色都可能跟原照片有出入。請對照左邊的原照片確認後再使用。",
                "AI generation isn't pixel-exact: small label text and cap or packaging colours can differ from your photo. Compare with the original before using it.",
              )}
            </div>
            {made.length > 1 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>{label("這次做過的圖 — 點一下切換", "Images made this time — click to switch")}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {made.map((m) => (
                    <button key={m.url} onClick={() => setCurrentUrl(m.url)} title={MODEL_NAME[m.model]}
                      style={{ padding: 0, border: `2px solid ${currentUrl === m.url ? INK : LINE}`, borderRadius: 8, overflow: "hidden", cursor: "pointer", background: "#fff" }}>
                      <img src={m.url} alt="" style={{ width: 72, height: 72, objectFit: "cover", display: "block" }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* 2026-09-25：把「這張圖是用哪段話做出來的」直接攤在圖下面。看不到提示詞的話
                使用者只能整段重寫，寫出來的又是另一張不相干的圖——微調的前提是看得到原文。 */}
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>
                  {label("這張圖用的提示詞", "The prompt behind this image")}
                  {current.scene === DEFAULT_SCENE && (
                    <span style={{ fontWeight: 400 }}>{label("（你沒寫場景，這是我們送出的預設）", " (you left the scene blank — this is our default)")}</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setScene(current.scene === DEFAULT_SCENE ? "" : current.scene);
                    setSize(current.size);
                    setSceneBefore(null);
                    setRefineError("");
                    setTweakOf(current.url);
                    setStep("setup");
                  }}
                  style={{ ...btn(true), padding: "4px 12px", fontSize: 12 }}
                >
                  {label("調整提示詞", "Adjust the prompt")}
                </button>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: INK, lineHeight: 1.7, whiteSpace: "pre-line" }}>{current.scene}</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a href={current.url} download style={{ ...btn(true), textDecoration: "none", display: "inline-block" }}>{label("下載", "Download")}</a>
              <button onClick={() => { setTweakOf(null); setStep("setup"); }} style={btn()}>{label("重新設定，再做一張", "Start over, make another")}</button>
              <button onClick={() => run("nano-banana")} style={btn()}>{label("同樣提示詞改用 Nano Banana", "Same prompt, try Nano Banana")}</button>
              <button onClick={onClose} style={btn()}>{label("關閉", "Close")}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
