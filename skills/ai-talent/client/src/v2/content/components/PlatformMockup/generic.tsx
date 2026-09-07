import { Card, CardBody, Divider, Skeleton } from "@heroui/react";
import { faNewspaper } from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader, MarkdownText, titleEchoesCaption } from "./shared";

/**
 * GenericMockup — the universal "show the produced copy" card.
 *
 * 2026-05-16 (CJ「KOL邀約的mockup和產出結果，沒有顯示出來」):
 * was a pure skeleton stub that ignored liveCaption — so any task whose
 * taskId has no platform prefix (e.g. kl-30-invite-opener) fell to
 * RunPage's "generic:feed last resort" and rendered nothing. Now it
 * renders the actual generated text (slotMap caption → liveCaption →
 * brief), only showing skeletons while genuinely still generating.
 */
export function GenericMockup({
  title, brief, variantLabel, liveCaption, slotMap,
}: MockupFields) {
  const slotCap = slotMap?.caption;
  const captionLoading = slotCap?.status === "loading";
  const caption =
    (typeof slotCap?.value === "string" ? slotCap.value : undefined) ??
    liveCaption ??
    "";
  const hasContent = caption.trim().length > 0;
  // Avoid the title/caption sandwich (same fix as platform mockups).
  const showTitle = title && !titleEchoesCaption(title, caption || brief);

  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faNewspaper} label="輸出" variantLabel={variantLabel} />
      <Card shadow="lg" radius="lg" className="border border-divider">
        <CardBody className="p-6 gap-3">
          {showTitle && <h2 className="text-medium font-semibold">{title}</h2>}

          {hasContent ? (
            <MarkdownText content={caption} className="whitespace-pre-wrap" />
          ) : captionLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-[92%] rounded" />
              <Skeleton className="h-3 w-[80%] rounded" />
              <Skeleton className="h-3 w-[68%] rounded" />
              <div className="flex items-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse inline-block" />
                <span className="text-[10px] text-primary/70">Agent 生成中…</span>
              </div>
            </div>
          ) : brief ? (
            <p className="text-small text-default-500 whitespace-pre-wrap">{brief}</p>
          ) : (
            <p className="text-small text-default-400">尚無內容</p>
          )}

          {hasContent && brief && brief !== caption && (
            <>
              <Divider />
              <p className="text-tiny text-default-400 whitespace-pre-wrap">{brief}</p>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
