/**
 * Facebook quick-task mockups (2026-05-05).
 * Six new variants needed for the 快派 pivot beyond the original 7:
 *   FBLive, FBCover, FBPoll, FBComment, FBGroup, FBRecommendation, FBPinned, FBAlbum.
 *
 * All read MockupFields (especially liveImageStyle for the placeholder
 * style-direction text — actual image gen happens later in MediaGenFlow).
 */
import React from "react";
import { Avatar, Button, Skeleton, User } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook } from "@fortawesome/free-brands-svg-icons";
import {
  faImages, faComment, faShare, faVideo, faHeart, faXmark,
  faUserGroup, faCircle, faStar, faThumbtack, faReply, faChartColumn,
} from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, MarkdownText, dicebear } from "./shared";
import { FBFeed } from "./facebook";

/* ─────────────── FB Live (broadcast preview) ─────────────── */
export function FBLive({ title, brandName, variantLabel, liveCaption, liveImageStyle, liveImageDesc }: MockupFields) {
  return (
    <div className="w-full max-w-[420px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook Live" variantLabel={variantLabel} />
      <div className="bg-black border border-divider rounded-xl overflow-hidden shadow-lg relative aspect-[9/16]">
        {!liveImageStyle && !liveImageDesc && <Skeleton className="absolute inset-0" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70 z-10" />
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
          <span className="bg-red-600 text-white text-tiny font-bold px-2 py-0.5 rounded flex items-center gap-1">
            <FontAwesomeIcon icon={faCircle} className="text-[8px] animate-pulse" /> LIVE
          </span>
          <span className="bg-black/60 text-white text-tiny px-2 py-0.5 rounded">
            <FontAwesomeIcon icon={faUserGroup} className="text-[10px] mr-1" /> 觀看 1,234
          </span>
        </div>
        <button className="absolute top-3 right-3 z-20 bg-black/60 text-white w-7 h-7 rounded-full flex items-center justify-center">
          <FontAwesomeIcon icon={faXmark} className="text-tiny" />
        </button>
        <div className="absolute inset-0 flex items-center justify-center text-default-200 z-10 p-6">
          {liveImageStyle ? (
            <div className="text-center bg-black/40 backdrop-blur-sm rounded-medium p-4 max-w-[80%]">
              <FontAwesomeIcon icon={faVideo} className="text-3xl mb-2 text-default-100" />
              <p className="text-tiny font-semibold text-default-100 mb-1">直播畫面風格</p>
              <p className="text-tiny text-default-200 leading-relaxed line-clamp-5">{liveImageStyle}</p>
            </div>
          ) : (
            <div className="text-center">
              <FontAwesomeIcon icon={faVideo} className="text-4xl mb-2" />
              <p className="text-tiny line-clamp-3">{liveImageDesc ?? "直播畫面 · 等待開播"}</p>
            </div>
          )}
        </div>
        <div className="absolute bottom-12 left-3 right-3 z-20 space-y-1">
          {liveCaption ? (
            <div className="bg-black/40 backdrop-blur-sm rounded-medium px-3 py-2">
              <p className="text-white text-small font-semibold line-clamp-1">{brandName ?? "Your Brand"}</p>
              <MarkdownText content={liveCaption} lineClamp={2} className="text-white text-tiny" />
            </div>
          ) : (
            <Skeleton className="h-8 w-2/3 rounded" />
          )}
        </div>
        <div className="absolute bottom-2 left-3 right-3 z-20 flex items-center gap-2">
          <div className="flex-1 bg-black/40 rounded-full px-3 py-1.5 text-default-300 text-tiny">說點什麼…</div>
          <button className="text-white text-small"><FontAwesomeIcon icon={faHeart} /></button>
          <button className="text-white text-small"><FontAwesomeIcon icon={faShare} /></button>
        </div>
      </div>
      <p className="text-tiny text-default-500 mt-2 text-center">{title}</p>
    </div>
  );
}

/* ─────────────── FB Cover (851×315) ─────────────── */
export function FBCover({ title, brandName, variantLabel, liveCaption, liveImageStyle, liveImageDesc }: MockupFields) {
  return (
    <div className="w-full max-w-[680px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook Cover (851×315)" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="aspect-[851/315] bg-gradient-to-br from-blue-900 to-blue-600 relative flex items-center justify-center">
          {!liveImageStyle && !liveImageDesc && <Skeleton className="absolute inset-0" />}
          <div className="text-center text-white relative z-10 p-4 max-w-[80%]">
            {liveImageStyle ? (
              <div className="bg-black/40 backdrop-blur-sm rounded-medium p-3">
                <FontAwesomeIcon icon={faImages} className="text-2xl mb-1" />
                <p className="text-tiny font-semibold mb-0.5">封面風格方向</p>
                <p className="text-tiny line-clamp-3 leading-relaxed">{liveImageStyle}</p>
              </div>
            ) : (
              <>
                <FontAwesomeIcon icon={faImages} className="text-3xl mb-2" />
                <p className="text-tiny line-clamp-2">{liveImageDesc ?? "封面 · 等待 craft agent"}</p>
              </>
            )}
          </div>
        </div>
        <div className="px-6 pt-2 pb-4 -mt-8 relative">
          <div className="flex items-end gap-4">
            <div className="rounded-full border-4 border-content1 bg-default-100">
              <Avatar src={dicebear(brandName ?? "brand")} size="lg" />
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <h2 className="text-medium font-bold truncate">{brandName ?? "Your Brand"}</h2>
              <p className="text-tiny text-default-500">{title}</p>
            </div>
            <Button size="sm" color="primary" className="mb-2">+ 追蹤</Button>
          </div>
          {liveCaption && (
            <div className="mt-3 px-1">
              <MarkdownText content={liveCaption} lineClamp={3} className="text-small text-default-700" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Poll ─────────────── */
export function FBPoll({ title, brandName, variantLabel, liveCaption, liveHashtags, liveDescription }: MockupFields) {
  let options: { label: string; pct: number }[] = [
    { label: "選項一", pct: 42 },
    { label: "選項二", pct: 35 },
    { label: "選項三", pct: 23 },
  ];
  try {
    if (liveDescription) {
      const parsed = JSON.parse(liveDescription);
      if (Array.isArray(parsed)) {
        options = parsed.slice(0, 4).map((o: any, i: number) => ({
          label: typeof o === "string" ? o : (o.label ?? `選項 ${i + 1}`),
          pct: typeof o?.pct === "number" ? o.pct : Math.max(5, Math.round(100 / parsed.length - i * 5)),
        }));
      }
    }
  } catch { /* keep demo */ }
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook 投票" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 flex items-center gap-3">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={<span className="text-tiny text-default-500">投票 · 剛剛</span>}
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
        </div>
        <div className="px-4 py-2 space-y-3">
          {liveCaption ? <MarkdownText content={liveCaption} lineClamp={4} /> : <Skeleton className="h-3 w-3/4 rounded" />}
          <div className="space-y-2">
            {options.map((o, i) => (
              <div key={i} className="relative bg-default-100 rounded-medium overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-primary-100" style={{ width: `${Math.min(100, Math.max(0, o.pct))}%` }} />
                <div className="relative flex items-center justify-between px-3 py-2">
                  <span className="text-small font-medium text-default-900">{o.label}</span>
                  <span className="text-tiny font-semibold text-primary-700">{o.pct}%</span>
                </div>
              </div>
            ))}
          </div>
          {liveHashtags && liveHashtags.length > 0 && (
            <p className="text-tiny text-primary-500 pt-1">
              {liveHashtags.map(t => `#${t.replace(/^#/, "")}`).join(" ")}
            </p>
          )}
        </div>
        <div className="px-4 py-2 border-t border-divider text-tiny text-default-500">
          <FontAwesomeIcon icon={faChartColumn} className="mr-1" /> 1,234 票
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Comment Reply ─────────────── */
export function FBComment({ title, brandName, variantLabel, liveCaption, liveDescription }: MockupFields) {
  const userComment = liveDescription || "（用戶原始留言會顯示在這）";
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook 留言回覆" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg p-4 space-y-3">
        <p className="text-tiny font-semibold text-default-500">{title}</p>
        <div className="flex items-start gap-2">
          <Avatar src={dicebear("user-customer")} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="bg-default-100 rounded-2xl px-3 py-2">
              <p className="text-tiny font-semibold mb-0.5">某用戶</p>
              <p className="text-small text-default-800 break-words">{userComment}</p>
            </div>
            <div className="flex gap-3 px-3 mt-1 text-tiny text-default-500">
              <span>讚</span><span>回覆</span><span>2 小時前</span>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2 pl-6">
          <Avatar src={dicebear(brandName ?? "brand")} size="sm" isBordered color="primary" />
          <div className="flex-1 min-w-0">
            <div className="bg-primary-50 rounded-2xl px-3 py-2 border border-primary-200">
              <p className="text-tiny font-semibold mb-0.5 text-primary-700">
                {brandName ?? "Your Brand"} <FontAwesomeIcon icon={faStar} className="text-[8px] text-warning-500 ml-1" /> 商家
              </p>
              {liveCaption ? <MarkdownText content={liveCaption} className="text-small text-default-800" /> : <Skeleton className="h-3 w-3/4 rounded" />}
            </div>
            <div className="flex gap-3 px-3 mt-1 text-tiny text-default-500">
              <span className="text-primary-600 font-medium">
                <FontAwesomeIcon icon={faReply} className="mr-1" /> 已回覆
              </span>
              <span>剛剛</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Group post ─────────────── */
export function FBGroup({ title, brandName, variantLabel, liveCaption, liveImageStyle, liveImageDesc, liveHashtags }: MockupFields) {
  const styleText = liveImageStyle || liveImageDesc;
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook 社團" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="bg-blue-50 px-4 py-2 border-b border-divider flex items-center gap-2 text-tiny">
          <FontAwesomeIcon icon={faUserGroup} className="text-blue-600" />
          <span className="font-semibold text-blue-900 truncate flex-1">{title || "行銷交流社團"}</span>
          <span className="text-default-500">12.3K 成員</span>
        </div>
        <div className="px-4 py-3 flex items-center gap-3">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={<span className="text-tiny text-default-500">在社團中發文 · 剛剛</span>}
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true }}
          />
        </div>
        <div className="px-4 py-2 space-y-2">
          {liveCaption ? <MarkdownText content={liveCaption} lineClamp={6} /> : (
            <><Skeleton className="h-2.5 w-[88%] rounded" /><Skeleton className="h-2.5 w-[75%] rounded" /></>
          )}
          {liveHashtags && liveHashtags.length > 0 && (
            <p className="text-tiny text-primary-500">
              {liveHashtags.map(t => `#${t.replace(/^#/, "")}`).join(" ")}
            </p>
          )}
        </div>
        {styleText && (
          <div className="aspect-[16/9] bg-default-100 flex items-center justify-center text-default-400 relative">
            {!liveImageStyle && <Skeleton className="absolute inset-0" />}
            <div className="text-center relative z-10 p-4">
              <FontAwesomeIcon icon={faImages} className="text-3xl mb-2 text-default-400" />
              {liveImageStyle ? (
                <>
                  <p className="text-tiny font-semibold text-default-600 mb-1">圖片風格方向</p>
                  <p className="text-tiny line-clamp-3 text-default-700">{liveImageStyle}</p>
                </>
              ) : <p className="text-tiny line-clamp-3">{liveImageDesc}</p>}
            </div>
          </div>
        )}
        <div className="px-4 py-2 border-t border-divider flex items-center gap-4 text-default-500 text-tiny">
          <span>👍 156</span>
          <span><FontAwesomeIcon icon={faComment} className="mr-1" /> 23 留言</span>
          <span className="ml-auto bg-warning-50 text-warning-700 px-2 py-0.5 rounded-full">需符合社團規範</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Recommendation Reply ─────────────── */
export function FBRecommendation({ title, brandName, variantLabel, liveCaption, liveDescription }: MockupFields) {
  const userReview = liveDescription || "（用戶評價內容會顯示在這）";
  const rating = (() => {
    const m = userReview.match(/(\d)\s*星/);
    return m ? Math.min(5, Math.max(1, Number(m[1]))) : 5;
  })();
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook 推薦評價" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg p-4 space-y-3">
        <p className="text-tiny font-semibold text-default-500">{title}</p>
        <div className="flex items-start gap-2">
          <Avatar src={dicebear("user-reviewer")} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-small font-semibold">某客戶</p>
            <div className="flex items-center gap-1 my-1">
              {[1,2,3,4,5].map(i => (
                <FontAwesomeIcon key={i} icon={faStar}
                  className={`text-tiny ${i <= rating ? "text-warning-500" : "text-default-300"}`} />
              ))}
              <span className="text-tiny text-default-500 ml-1">{rating}/5 推薦</span>
            </div>
            <p className="text-small text-default-800 break-words">{userReview}</p>
            <span className="text-tiny text-default-500">3 小時前</span>
          </div>
        </div>
        <div className="flex items-start gap-2 pl-6 pt-2 border-t border-divider">
          <Avatar src={dicebear(brandName ?? "brand")} size="sm" isBordered color="primary" />
          <div className="flex-1 min-w-0">
            <p className="text-tiny font-semibold text-primary-700">{brandName ?? "Your Brand"} 回覆</p>
            {liveCaption ? (
              <div className="bg-primary-50 rounded-medium px-3 py-2 mt-1 border border-primary-200">
                <MarkdownText content={liveCaption} className="text-small text-default-800" />
              </div>
            ) : <Skeleton className="h-3 w-3/4 rounded mt-1" />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── FB Pinned (variant of FBFeed) ─────────────── */
export function FBPinned(props: MockupFields) {
  return (
    <div className="relative">
      <div className="absolute -top-2 left-4 z-10 bg-default-900 text-white text-tiny px-2 py-1 rounded-full flex items-center gap-1 shadow-md">
        <FontAwesomeIcon icon={faThumbtack} className="text-[10px]" />
        <span className="font-semibold">釘選貼文</span>
      </div>
      <FBFeed {...props} variantLabel={`${props.variantLabel ?? ""}（釘選）`.trim()} />
    </div>
  );
}

/* ─────────────── FB Album (multi-image grid) ─────────────── */
export function FBAlbum({ title, brandName, variantLabel, liveCaption, liveImageStyle, liveImageDesc, liveHashtags }: MockupFields) {
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook Album" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 flex items-center gap-3">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={<span className="text-tiny text-default-500">新增了 4 張相片 · 剛剛</span>}
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
        </div>
        <div className="px-4 py-2 space-y-2">
          <p className="text-small">{title}</p>
          {liveCaption ? <MarkdownText content={liveCaption} lineClamp={5} /> : <Skeleton className="h-2.5 w-[80%] rounded" />}
          {liveHashtags && liveHashtags.length > 0 && (
            <p className="text-tiny text-primary-500">
              {liveHashtags.map(t => `#${t.replace(/^#/, "")}`).join(" ")}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-0.5 bg-default-200">
          {[0,1,2,3].map(i => (
            <div key={i} className="aspect-square bg-default-100 flex items-center justify-center text-default-400 relative">
              {!liveImageStyle && !liveImageDesc && <Skeleton className="absolute inset-0" />}
              <div className="text-center relative z-10 p-2">
                <FontAwesomeIcon icon={faImages} className="text-2xl text-default-400" />
                {i === 0 && liveImageStyle && (
                  <p className="text-[10px] line-clamp-3 mt-1 text-default-700">{liveImageStyle}</p>
                )}
                {i > 0 && liveImageStyle && (
                  <p className="text-[10px] mt-1 text-default-500">圖 {i + 1}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-divider flex items-center gap-4 text-default-500 text-tiny">
          <span>👍❤️ 856</span><span>42 留言</span>
        </div>
      </div>
    </div>
  );
}
