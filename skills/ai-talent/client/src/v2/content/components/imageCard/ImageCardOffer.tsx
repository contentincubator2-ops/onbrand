/**
 * 文字任務完成後的「要幫這篇做圖嗎？」（2026-09-29 CJ：底下不要說「此任務不包括生圖」，
 * 而是問要不要生圖；要的話打開該平台的圖片任務卡，直接帶入文案）。
 */
import { useNavigate } from "react-router-dom";
import { trpc } from "../../../../lib/trpc";
import { useLang } from "../../../../lib/i18n";
import { imageCardHref, imageChannelOf, saveImageCardHandoff } from "../../../platform/lib/imageCardHandoff";
import type { ImageCardInfo } from "../../../platform/lib/imageCardHandoff";

export const IMAGE_CARD_OFFER_ID = "image-card-offer";

export default function ImageCardOffer({ platform, copy, runId, hasImage, locator }: {
  platform: string | null | undefined;
  copy: string;
  runId?: string | number;
  hasImage?: boolean;
  /** 目前這一則在產出裡的位置——圖做好後寫回同一則。 */
  locator?: { variantIndex?: number; contentKind?: "planning" | "public"; contentIndex?: number };
}) {
  const { lang } = useLang();
  const navigate = useNavigate();
  const channel = imageChannelOf(platform);
  const q = trpc.imageCard.list.useQuery(
    { channel: (channel ?? "facebook") as any },
    { enabled: !!channel, staleTime: 5 * 60_000 },
  );
  const all = (q.data?.cards ?? []) as ImageCardInfo[];
  // 2026-10-04：尺寸補齊後一個平台有二三十張卡，全列出來會把這一區塞爆——
  // 只列預設的那兩張，其餘到圖片分類自己挑。
  const pinned = all.filter((c) => c.pinned);
  const cards = pinned.length ? pinned : all.slice(0, 2);
  if (!channel || !copy.trim() || !cards.length) return null;

  const handoff = () => saveImageCardHandoff({ copy, fromRunId: runId, locator });
  const open = (id: string) => {
    handoff();
    navigate(imageCardHref(id));
  };
  const SLUG: Record<string, string> = { facebook: "fb", instagram: "ig", threads: "threads", line: "line", tiktok: "tt", email: "email", website: "web" };

  return (
    <div id={IMAGE_CARD_OFFER_ID} className="mx-4 mt-3 rounded-lg border border-default-200 bg-white px-3.5 py-3 scroll-mt-24">
      <p className="text-small font-semibold text-default-900">
        {hasImage
          ? (lang === "en" ? "Need this image in other sizes?" : "要做其他尺寸的圖嗎？")
          : (lang === "en" ? "Want an image for this post?" : "要幫這篇做圖嗎？")}
      </p>
      <p className="text-tiny text-default-500 mt-0.5">
        {lang === "en"
          ? "Pick a size — the image card opens with this copy already filled in."
          : "選一種尺寸，會打開圖片任務卡，並自動帶入這篇文案。"}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {cards.map((c) => (
          <button key={c.id} onClick={() => open(c.id)}
            className="px-3 py-1.5 rounded-full text-tiny border border-default-200 hover:border-default-500 hover:bg-default-50 transition">
            {lang === "en" ? c.labelEn : c.labelZh}
            <span className="ml-1.5 text-default-400 tabular-nums">{c.ratio}</span>
          </button>
        ))}
        {all.length > cards.length && SLUG[channel] && (
          <button onClick={() => { handoff(); navigate(`/tasks/${SLUG[channel]}?view=images`); }}
            className="px-3 py-1.5 rounded-full text-tiny text-default-500 underline underline-offset-2 hover:text-default-800">
            {lang === "en" ? `More sizes (${all.length})` : `其他尺寸（共 ${all.length} 種）`}
          </button>
        )}
      </div>
    </div>
  );
}
