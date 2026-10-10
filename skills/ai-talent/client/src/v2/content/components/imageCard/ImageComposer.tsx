/**
 * 圖片卡的輸入框與圖上標題（2026-10-10 CJ「就像人們用 Claude／ChatGPT 生圖的過程，
 * 我要把這個體驗感用到 onBrand 上，但更便利」）。
 *
 * ImageComposer：一個輸入框＋一個「＋」附圖。生成前（貼文案）和生成後（說想怎麼改）是同一個元件；
 *   每張附圖旁邊只問一件事——這張圖要怎麼用（照這張畫／放進畫面／直接當底圖）。
 * TitleOverlay／TitleBar：圖上標題是疊層，點圖上的字就能改文字、字型、版式；即時、不扣點。
 *
 * 這個檔只管畫面與選擇；生成、扣點、存版本都在 ImageCardPage。
 */
import React, { useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { Icon } from "../../../platform/components/icons";
import { showToastGlobal } from "../../../platform/components/Toast";
import { uploadBrandPhoto, IMAGE_ACCEPT } from "../../../strategy/lib/uploadBrandPhoto";
import { addAttachment, setAttachmentRole, MAX_FOLLOW, type AttachRole, type Attachment } from "../../lib/imageAttachments";
import {
  TITLE_FONTS, TITLE_LAYOUTS, TITLE_BOTTOM, TITLE_LEFT_W, TITLE_LEFT_X, TITLE_LINE, TITLE_PAD, TITLE_SIDE, TITLE_SIZE, TITLE_TOP,
  ensureTitleFont, titleFont, titleFontFamily, titleInk, titlePlate, type TitleStyle, type TitleZone,
} from "../../lib/imageTitleStyle";

const ROLE_LABEL: Record<AttachRole, [string, string]> = {
  follow: ["照這張畫", "Follow this image"],
  subject: ["放進畫面", "Put it in the picture"],
  base: ["直接當底圖", "Use as the background"],
};
const ROLE_HINT: Record<AttachRole, [string, string]> = {
  follow: ["AI 會照它的畫法、配色與構圖來畫，內容換成你的。", "AI follows its medium, colours and layout, with your content."],
  subject: ["這張的產品或人物會原樣放進新畫面。", "The product or person in it goes into the new picture unchanged."],
  base: ["不經 AI，直接放進畫布（免點數）。", "No AI — placed on the canvas as is (no points)."],
};

export function ImageComposer({
  lang, brandId, label, placeholder, value, onChange, attachments, setAttachments, products, onOpenLibrary,
  allowBase = true, minRows = 2, busy, submitLabel, onSubmit, canSubmit, footer,
}: {
  lang: string; brandId: number | null;
  label?: string; placeholder: string;
  value: string; onChange: (v: string) => void;
  attachments: Attachment[]; setAttachments: (a: Attachment[]) => void;
  products: Array<{ name: string; imageUrl: string }>;
  onOpenLibrary: () => void;
  /** 「直接當底圖」只適用單張。 */
  allowBase?: boolean;
  minRows?: number; busy?: boolean;
  /** 有給就是聊天式：Enter 送出、右下角有送出鈕。沒給＝單純的輸入區（由頁面的主按鈕送）。 */
  submitLabel?: string; onSubmit?: () => void; canSubmit?: boolean;
  /** 「＋」選單裡額外的項目（例如純色底）。 */
  footer?: React.ReactNode;
}) {
  const en = lang === "en";
  const [menu, setMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const full = () => showToastGlobal(en ? `Up to ${MAX_FOLLOW} images to follow.` : `「照這張畫」最多 ${MAX_FOLLOW} 張。`);

  function add(a: Attachment, from = attachments): Attachment[] {
    const next = addAttachment(from, a);
    if (!next) { full(); return from; }
    return next;
  }
  async function upload(files: FileList | null) {
    const picked = Array.from(files ?? []).filter((x) => x.type.startsWith("image/") || !x.type);
    if (!picked.length || !brandId) return;
    setUploading(true); setMenu(false);
    let next = attachments;
    try {
      for (const f of picked) {
        const up = await uploadBrandPhoto(brandId, f);
        // 自己上傳的圖預設「照這張畫」——這是大家用 AI 生圖最常做的事；要當主體點一下就能換。
        next = add({ url: up.url, name: f.name, role: "follow" }, next);
      }
    } catch (e: any) {
      showToastGlobal(String(e?.message ?? e).slice(0, 200), "error");
    } finally {
      setAttachments(next);
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function changeRole(url: string, role: AttachRole) {
    const next = setAttachmentRole(attachments, url, role);
    if (!next) { full(); return; }
    setAttachments(next);
  }
  const roles = (["follow", "subject", ...(allowBase ? ["base"] : [])] as AttachRole[]);
  const hints = roles.filter((r) => attachments.some((a) => a.role === r));

  return (
    <div>
      {label && <p className="text-tiny text-default-500 mb-1.5">{label}</p>}
      <div className="rounded-xl border border-default-300 bg-white focus-within:border-default-600 transition">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.map((a) => (
              <div key={a.url} className="w-[80px]">
                <div className="relative w-[80px] h-[60px] rounded-lg overflow-hidden border border-default-200 bg-default-50">
                  <img src={a.url} alt={a.name} className="w-full h-full object-cover" />
                  <button type="button" disabled={busy} onClick={() => setAttachments(attachments.filter((x) => x.url !== a.url))}
                    title={en ? "Remove" : "移除"} aria-label={en ? "Remove this image" : "移除這張圖"}
                    className="absolute top-1 right-1 w-4 h-4 rounded-full bg-default-900/80 text-white flex items-center justify-center">
                    <Icon name="close" size={9} />
                  </button>
                </div>
                <select value={a.role} disabled={busy} onChange={(e) => changeRole(a.url, e.target.value as AttachRole)}
                  aria-label={en ? "How to use this image" : "這張圖怎麼用"}
                  className="mt-1 w-full text-[11px] border border-default-200 rounded-md px-1 py-0.5 bg-white text-default-700">
                  {(a.role === "base" && !allowBase ? [...roles, "base" as AttachRole] : roles).map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r][en ? 1 : 0]}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={value} rows={minRows} placeholder={placeholder} disabled={busy && !!onSubmit}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (onSubmit && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (canSubmit) onSubmit(); }
          }}
          className="block w-full resize-y bg-transparent px-3 py-2.5 text-small text-default-900 placeholder:text-default-400 outline-none"
          style={{ maxHeight: 320 }}
        />
        <div className="flex items-center gap-2 px-2 pb-2">
          <button type="button" onClick={() => setMenu((m) => !m)} disabled={!brandId || uploading}
            aria-expanded={menu} title={en ? "Add an image" : "附上圖片"}
            className={`h-8 px-2.5 rounded-lg border text-tiny flex items-center gap-1.5 ${menu ? "border-default-900 text-default-900" : "border-default-200 text-default-600 hover:border-default-400"}`}>
            {uploading ? <Spinner size="sm" /> : <Icon name="add" size={12} />}
            {en ? "Image" : "附圖"}
          </button>
          <span className="flex-1" />
          {onSubmit && (
            <Button size="sm" color="primary" onPress={onSubmit} isLoading={busy} isDisabled={!canSubmit}>{submitLabel}</Button>
          )}
        </div>
        {menu && (
          <div className="border-t border-default-200 px-3 py-2.5 space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="h-8 px-2.5 rounded-lg border border-default-200 text-tiny text-default-700 hover:border-default-400 flex items-center gap-1.5">
                <Icon name="upload" size={12} />{en ? "Upload" : "上傳圖片"}
              </button>
              <button type="button" onClick={() => { setMenu(false); onOpenLibrary(); }}
                className="h-8 px-2.5 rounded-lg border border-default-200 text-tiny text-default-700 hover:border-default-400 flex items-center gap-1.5">
                <Icon name="images" size={12} />{en ? "Asset library" : "從素材庫挑"}
              </button>
            </div>
            {products.length > 0 && (
              <div>
                <p className="text-[11px] text-default-400 mb-1">{en ? "Product photos" : "產品照"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {products.map((p) => {
                    const on = attachments.some((a) => a.url === p.imageUrl);
                    return (
                      <button key={p.imageUrl} type="button" title={p.name}
                        onClick={() => { setAttachments(on ? attachments.filter((a) => a.url !== p.imageUrl) : add({ url: p.imageUrl, name: p.name, role: "subject" })); setMenu(false); }}
                        className={`relative w-12 h-12 rounded-md overflow-hidden border-2 bg-white ${on ? "border-default-900" : "border-default-200 hover:border-default-400"}`}>
                        <img src={p.imageUrl} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {footer}
          </div>
        )}
        <input ref={fileRef} type="file" hidden multiple accept={IMAGE_ACCEPT} onChange={(e) => void upload(e.target.files)} />
      </div>
      {hints.length > 0 && (
        <p className="text-[11px] text-default-400 leading-relaxed mt-1.5">
          {hints.map((r) => `${ROLE_LABEL[r][en ? 1 : 0]}${en ? ": " : "："}${ROLE_HINT[r][en ? 1 : 0]}`).join(en ? " " : "")}
          {hints.includes("follow") && (en ? " Use images you have the right to use." : "請用你有權使用的圖。")}
        </p>
      )}
    </div>
  );
}

// ── 圖上標題 ───────────────────────────────────────────────────────────

/**
 * 預覽上的標題疊層。外層容器要有 container-type: size——字級用 cqmin，跟成品（canvas）同一個比例。
 * 幾何與 imageTitleStyle.drawTitle 一致：改一邊要改另一邊。
 */
export function TitleOverlay({ zone, title, style, onClick, hint }: { zone: TitleZone; title: string; style: TitleStyle; onClick?: () => void; hint?: string }) {
  useEffect(() => { void ensureTitleFont(style.font, title); }, [style.font, title]);
  if (zone === "none" || !title.trim()) return null;
  const left = zone === "left";
  const pad = `${TITLE_PAD}em`;
  const plate = titlePlate(style);
  const pct = (n: number) => `${n * 100}%`;
  const text: React.CSSProperties = {
    display: "inline-block", maxWidth: left ? `${TITLE_LEFT_W * 100}cqw` : `${(1 - TITLE_SIDE * 2) * 100}cqw`,
    whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: TITLE_LINE,
    color: titleInk(style),
    textShadow: plate ? "none" : style.dark ? "0 0 0.25em rgba(255,255,255,.5)" : "0 0 0.25em rgba(0,0,0,.45)",
    ...(style.layout === "block" ? { background: plate!, padding: pad } : {}),
  };
  const v: React.CSSProperties = zone === "top" ? { top: pct(TITLE_TOP) }
    : zone === "bottom" ? { bottom: pct(TITLE_BOTTOM) }
    : { top: "50%", transform: "translateY(-50%)" };
  const box: React.CSSProperties = style.layout === "band"
    ? (left
      ? { position: "absolute", left: 0, top: 0, bottom: 0, width: `calc(${pct(TITLE_LEFT_X + TITLE_LEFT_W)} + ${pad})`, background: plate!, display: "flex", alignItems: "center", paddingLeft: pct(TITLE_LEFT_X), textAlign: "left" }
      : { position: "absolute", left: 0, right: 0, ...v, background: plate!, padding: `${pad} 0`, textAlign: "center" })
    : (left
      ? { position: "absolute", left: style.layout === "block" ? `calc(${pct(TITLE_LEFT_X)} - ${pad})` : pct(TITLE_LEFT_X), ...v, textAlign: "left" }
      : { position: "absolute", left: 0, right: 0, ...v, textAlign: "center" });
  return (
    <div onClick={onClick} title={hint}
      style={{ ...box, fontSize: `${TITLE_SIZE * 100}cqmin`, fontFamily: titleFontFamily(style.font), fontWeight: titleFont(style.font).weight, cursor: onClick ? "text" : undefined }}>
      <span style={text}>{title}</span>
    </div>
  );
}

/** 圖片正下方的標題列：文字、字型、版式、黑白字。全部即時生效、不扣點。 */
export function TitleBar({ lang, title, setTitle, style, setStyle, show, setShow, inputRef }: {
  lang: string; title: string; setTitle: (v: string) => void;
  style: TitleStyle; setStyle: (s: TitleStyle) => void;
  show: boolean; setShow: (b: boolean) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const en = lang === "en";
  const sel = "h-8 text-tiny border border-default-200 rounded-md px-1.5 bg-white text-default-700 disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input ref={inputRef} value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder={en ? "Title on the image" : "圖上標題（點圖上的字也能改）"} aria-label={en ? "Title on the image" : "圖上標題"}
        className="h-8 flex-1 min-w-[160px] text-small border border-default-200 rounded-md px-2 bg-white outline-none focus:border-default-600" />
      <select className={sel} value={style.font} disabled={!show} aria-label={en ? "Font" : "字型"}
        onChange={(e) => setStyle({ ...style, font: e.target.value })}>
        {TITLE_FONTS.map((f) => <option key={f.id} value={f.id}>{en ? f.en : f.zh}</option>)}
      </select>
      <select className={sel} value={style.layout} disabled={!show} aria-label={en ? "Layout" : "版式"}
        onChange={(e) => setStyle({ ...style, layout: e.target.value as TitleStyle["layout"] })}>
        {TITLE_LAYOUTS.map((l) => <option key={l.id} value={l.id}>{en ? l.en : l.zh}</option>)}
      </select>
      <select className={sel} value={style.dark ? "dark" : "light"} disabled={!show} aria-label={en ? "Text colour" : "字色"}
        onChange={(e) => setStyle({ ...style, dark: e.target.value === "dark" })}>
        <option value="light">{en ? "White text" : "白字"}</option>
        <option value="dark">{en ? "Black text" : "黑字"}</option>
      </select>
      <label className="flex items-center gap-1 text-tiny text-default-600">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />{en ? "Show" : "顯示"}
      </label>
    </div>
  );
}
