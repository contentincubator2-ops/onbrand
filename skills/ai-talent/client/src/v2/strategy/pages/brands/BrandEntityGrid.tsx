/**
 * 產品卡片格（品牌下的產品列表）。
 */
import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBox } from "@fortawesome/free-solid-svg-icons";
import { IllustratedEmpty } from "../../../platform/components/EmptyIllustration";
import { pickProductImageUrl } from "../../lib/productImage";
import { CloseIcon } from "../../../platform/components/icons";

/* ─────────────────────── BrandEntityGrid ────────────────────────────
 * Shared card grid for 產品 and 活動 tabs.
 * Shows each entity's positioning preview (tagline / USP / audience).
 * Cards with no positioning show a placeholder state.
 * ─────────────────────────────────────────────────────────────────── */
/**
 * ProductCardThumbnail — 產品列表的縮圖。
 *
 * 2026-09-25（CJ「產品列表的縮圖，我想要用跟任務卡一樣的樣式」→ 看到結果後
 * 「如果要好好展現產品圖的話，應該要用哪一張任務卡的格式？…要如何可以不要旁邊
 * 都是馬賽克」）：
 *
 * 我們站上有兩種卡片格式，它們是為不同東西設計的：
 *
 *   (A) 任務卡（content/pages/PlatformTaskPage.tsx）：頂端是 130px 的中性色塊，
 *       中間放一顆 80×80 的 agent 頭像。那塊底色不是「背景」，是構圖的一部分——
 *       它**從來不是拿來放照片的**。把一張 4:3 的產品照塞進去，兩側必然留白。
 *
 *   (B) 作品卡（content/pages/ProjectsPage.tsx 的 MissionCard）：aspect-[4/3] 的
 *       圖片區 + object-cover 滿版，沒有任何留白；沒有圖時退回有顏色的圖示磚。
 *       這張卡的主角就是圖。
 *
 * 產品列表要「好好展現產品圖」，所以走 (B)。連帶解決馬賽克：先前為了不裁切用
 * object-contain，兩側空白就用同一張圖模糊放大去填——那圈模糊就是畫面上看到的
 * 「馬賽克」。滿版裁切之後不需要填補，模糊層整個拿掉。
 *
 * 取捨講明白：object-cover 會裁掉直式照片的上下。產品照多半是方形或橫式擺拍，
 * 4:3 裁掉的很少；而且縮圖的工作是「認得出這是哪支產品」，完整照片在產品視窗
 * 裡看得到。要改成不裁切就得回到留白，兩者只能選一個。
 */
export function ProductCardThumbnail({ imageUrl, name, en }: { imageUrl?: string; name: string; en: boolean }) {
  const [failed, setFailed] = React.useState(false);
  const showImage = !!imageUrl && !failed;
  return (
    <div
      className="relative w-full aspect-[4/3] flex items-center justify-center overflow-hidden"
      style={{ background: showImage ? "#F4F4F5" : "#FAFAF9" }}
    >
      {showImage ? (
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          onError={() => setFailed(true)}
        />
      ) : (
        // 沒有圖也要顯示「某個東西」——整片空灰色的格子看起來像壞掉的。
        <div className={`flex flex-col items-center gap-1 px-3 text-center ${failed ? "text-amber-700" : "text-neutral-400"}`}>
          <FontAwesomeIcon icon={faBox} className="text-3xl opacity-60" />
          <span className="text-[12px] font-semibold tracking-wide">
            {failed
              ? (en ? "Image link expired" : "圖片連結已失效")
              : (en ? "No image" : "尚無圖片")}
          </span>
          <span className="text-[12px] opacity-80">
            {en ? "Open this product to fix it" : "點擊查看以修正"}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * 產品列表的卡片格。2026-10-02：活動改用 components/events/EventCardGrid（照 BrandCard 版型），
 * 這裡原本 product／event 兩用的分支拿掉，只剩產品。
 */
export function BrandEntityGrid({
  items, isLoading, lang, onAdd, onOpen, onDelete, onPosition, onUpload,
  runningIds, progressMap,
}: {
  items: any[];
  isLoading: boolean;
  lang: "zh-TW" | "en";
  onAdd: () => void;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  onPosition: (id: number) => void;
  /** 2026-10-03（CJ「每個產品也要能上傳定位文件或純文字」）：有傳才顯示「上傳定位」。 */
  onUpload?: (id: number) => void;
  /** 2026-07-24: entity ids with a positioning pipeline in flight. */
  runningIds?: number[];
  /** id-keyed (`product:id`) progress labels, e.g. "3/6". */
  progressMap?: Record<string, string>;
}) {
  const en = lang === "en";


  const extractField = (positioning: any, ...keys: string[]): string => {
    if (!positioning) return "";
    for (const key of keys) {
      const parts = key.split(".");
      let val: any = positioning;
      for (const p of parts) { val = val?.[p]; }
      if (typeof val === "string" && val.trim()) return val.trim();
    }
    return "";
  };

  const getPreview = (item: any) => {
    const p = item.positioning ?? {};
    const interim = p._interim ?? {};   // interim positioning from auto-discovery
    // 2026-10-02（CJ「請確保英文版能顯示正確的英文」）：定位每支產品都會產一句英文標語
    // （core.enTagline），英文介面先拿它；中文品牌的 zhTagline 在英文介面只當後備。
    const enTaglineKeys = en ? ["core.enTagline", "tagline.enTagline"] : [];
    return {
      tagline:  extractField(p, ...enTaglineKeys, "tagline", "tagline.zhTagline", "core.zhTagline", "core.oneLineValueProp", "differentiation.summary")
                  || interim.tagline || "",
      usp:      extractField(p, "usp", "competition.uniqueUsp", "core.oneLineValueProp", "differentiation.functional", "differentiation.summary")
                  || interim.usp || "",
      audience: extractField(p, "audience.primary", "targetAudience")
                  || interim.targetAudience || "",
      // 2026-09-25：售價的 canonical 位置改成 facts.price，舊資料仍在頂層。
      price: extractField(p, "facts.price", "price"),
    };
  };

  const hasPositioning = (item: any): boolean => {
    const p = item.positioning ?? {};
    const interim = p._interim ?? {};
    return !!(
      p.tagline || p.usp || p.differentiation?.summary ||
      p.core?.zhTagline || p.core?.oneLineValueProp || p.competition?.uniqueUsp ||
      p.audience?.primary || p.targetAudience ||
      interim.tagline || interim.usp || interim.targetAudience
    );
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-neutral-100 bg-neutral-50 animate-pulse h-36" />
        ))}
      </div>
    );
  }

  return (
    <div className="px-2">
      {items.length === 0 && (
        <IllustratedEmpty
          kind="product"
          title={en ? "This box is still empty" : "箱子還是空的"}
          action={{ label: en ? "+ New product" : "+ 新增產品", onPress: onAdd }}
        />
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {items.map((item, idx) => {
            const preview = getPreview(item);
            const positioned = hasPositioning(item);
            return (
              <button
                key={item.id}
                style={{
                  animation: `fadeSlideIn 0.35s ease both`,
                  animationDelay: `${Math.min(idx * 60, 400)}ms`,
                }}
                onClick={() => onOpen(item.id)}
                // 2026-09-25：外框跟著圖片格式一起走 ProjectsPage 作品卡那一套。
                className="text-left rounded-xl bg-white border border-default-100 p-0 overflow-hidden transition group flex flex-col hover:shadow-md hover:border-default-300"
              >
                {/* 2026-06-21 (CJ「產品頁籤加縮圖」): thumbnail at top.
                    2026-06-30 (prod bug): products.imageUrl column doesn't
                    exist — dig into positioning JSON for image locations. */}
                {(() => {
                  // 2026-09-25（CJ「有選擇一張主題，但沒有出現在產品列表的縮圖當中」）：
                  // 挑圖規則搬到 lib/productImage.ts 並補上測試——原因是舊的篩選只收
                  // http(s)，把使用者上傳主圖的根相對路徑（/static/asset-photos/…）
                  // 濾掉了，所以「設為主圖」寫進 DB 卻顯示「尚無圖片」。
                  const imgUrl = pickProductImageUrl(item.positioning, item.imageUrl);
                  return <ProductCardThumbnail key={imgUrl ?? "none"} imageUrl={imgUrl} name={item.name} en={en} />;
                })()}

                <div className="p-3">
                {/* Name */}
                <p className="text-sm font-semibold text-neutral-900 mb-2 truncate">{item.name}</p>
                {preview.price && (
                  <p className="text-[12px] font-medium text-neutral-500 -mt-1 mb-2">{preview.price}</p>
                )}

                {positioned ? (
                  <div className="space-y-1.5">
                    {preview.tagline && (
                      <div>
                        <span className="text-[12px] font-semibold uppercase tracking-widest text-neutral-400">
                          {en ? "Tagline" : "標語"}
                        </span>
                        <p className="text-[12px] text-neutral-700 leading-tight line-clamp-2 mt-0.5">{preview.tagline}</p>
                      </div>
                    )}
                    {preview.usp && (
                      <div>
                        <span className="text-[12px] font-semibold uppercase tracking-widest text-neutral-400">
                          USP
                        </span>
                        <p className="text-[12px] text-neutral-600 line-clamp-1 mt-0.5">{preview.usp}</p>
                      </div>
                    )}
                    {preview.audience && (
                      <div>
                        <span className="text-[12px] font-semibold uppercase tracking-widest text-neutral-400">
                          {en ? "Audience" : "受眾"}
                        </span>
                        <p className="text-[12px] text-neutral-500 line-clamp-1 mt-0.5">{preview.audience}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[12px] text-neutral-400">
                      {en ? "Positioning not yet run" : "尚未建立定位"}
                    </span>
                  </div>
                )}

                <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center gap-1.5 flex-wrap">
                  {/* Run positioning — running state shows live step progress */}
                  {(() => {
                    const isRunning = runningIds?.includes(item.id) ?? false;
                    const prog = progressMap?.[`product:${item.id}`];
                    return (
                      <button
                        onClick={(e) => { e.stopPropagation(); if (!isRunning) onPosition(item.id); }}
                        disabled={isRunning}
                        className={`text-[12px] font-medium px-2 py-1 rounded-md transition flex-1 min-w-0 text-center ${
                          isRunning
                            ? "bg-zinc-100 text-zinc-500 cursor-wait animate-pulse"
                            : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                        }`}
                      >
                        {isRunning
                          ? (en ? `Positioning… ${prog ?? ""}` : `定位中…${prog ? ` ${prog}` : ""}`)
                          : positioned ? (en ? "Re-position" : "重新定位") : (en ? "▶ Run positioning" : "▶ 開始定位")}
                      </button>
                    );
                  })()}
                  {onUpload && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onUpload(item.id); }}
                      className="text-[12px] font-medium px-2 py-1 rounded-md bg-zinc-50 text-zinc-700 hover:bg-zinc-100 transition"
                      title={en ? "Upload a positioning document or paste text" : "上傳定位文件，或直接貼上文字"}
                    >
                      {en ? "Upload" : "上傳定位"}
                    </button>
                  )}
                  {/* Open */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpen(item.id); }}
                    className="text-[12px] font-medium px-2 py-1 rounded-md bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition"
                  >
                    {en ? "View" : "查看"}
                  </button>
                  {/* Delete */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(en
                        ? `Delete "${item.name}"? This cannot be undone.`
                        : `確定刪除「${item.name}」？此操作無法復原。`)) {
                        onDelete(item.id);
                      }
                    }}
                    className="text-[12px] px-2 py-1 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 transition"
                    title={en ? "Delete" : "刪除"}
                  >
                    <CloseIcon size={12} />
                  </button>
                </div>
                </div>
              </button>
            );
          })}

          {/* Add new card */}
          <button
            onClick={onAdd}
            className="rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50/50 p-4 flex flex-col items-center justify-center gap-2 hover:border-neutral-400 hover:bg-neutral-50 transition min-h-[140px]"
          >
            <span className="text-2xl text-neutral-300">+</span>
            <span className="text-xs text-neutral-400 font-medium">
              {en ? "New product" : "新增產品"}
            </span>
          </button>
        </div>
      )}

    </div>
  );
}
