/**
 * Facebook mockups.
 * PR2.1: feed (rest fall back to feed)
 * Reference: Flowbite Card + Reactions row (themesberg/flowbite, MIT)
 */
import React from "react";
import { Skeleton, User } from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook } from "@fortawesome/free-brands-svg-icons";
import { faImages, faThumbsUp, faComment, faShare, faGlobe } from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, dicebear } from "./shared";

export function FBFeed({ title, brandName, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faFacebook} label="Facebook" variantLabel={variantLabel} />
      <div className="bg-content1 border border-divider rounded-xl overflow-hidden shadow-lg">
        <div className="px-4 py-3 flex items-center gap-3">
          <User
            name={<span className="text-small font-semibold">{brandName ?? "Your Brand"}</span>}
            description={
              <span className="text-tiny text-default-500 flex items-center gap-1">
                贊助 · 剛剛 · <FontAwesomeIcon icon={faGlobe} className="text-tiny" />
              </span>
            }
            avatarProps={{ src: dicebear(brandName ?? "brand"), size: "md", isBordered: true, color: "primary" }}
          />
        </div>
        <div className="px-4 py-2 space-y-2">
          <p className="text-small">{title}</p>
          <Skeleton className="h-2.5 w-[88%] rounded" />
          <Skeleton className="h-2.5 w-[75%] rounded" />
        </div>
        <div className="aspect-[16/9] bg-default-100 flex items-center justify-center text-default-400 relative">
          <Skeleton className="absolute inset-0" />
          <div className="text-center relative z-10">
            <FontAwesomeIcon icon={faImages} className="text-4xl mb-2" />
            <p className="text-tiny">主圖 · 等待 craft agent</p>
          </div>
        </div>
        <div className="px-4 py-2 border-t border-divider flex items-center justify-between text-default-500 text-tiny">
          <span>👍❤️🎉 1,234</span>
          <span>87 留言 · 23 分享</span>
        </div>
        <div className="px-4 py-1 border-t border-divider flex items-center justify-around text-default-700 text-small">
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faThumbsUp} /> 讚
          </button>
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faComment} /> 留言
          </button>
          <button className="flex-1 py-1.5 hover:bg-default-100 rounded-medium flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faShare} /> 分享
          </button>
        </div>
      </div>
    </div>
  );
}
