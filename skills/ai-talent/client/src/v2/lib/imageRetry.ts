export type RetryImageModel = "gpt-image-2" | "nano-banana";
export interface FailedImageSlot { cardIndex?: number; prompt: string }

/** Failed stored slots only: ordinary text-only tasks and pending images are not failures. */
export function failedImageSlots(slide: any): FailedImageSlot[] {
  if (!slide) return [];
  const failed = (status: unknown, error?: unknown) =>
    status === "failed" || status === "timeout" || (status === "skipped" && !!error);
  const seed = (image: any, fallback: string) =>
    String(image?.promptZh || image?.prompt || image?.style || fallback || "").trim();
  const slots: FailedImageSlot[] = [];
  if (!slide.imageUrl && failed(slide.imageStatus, slide.imageErrorMsg)) {
    slots.push({ prompt: seed({ promptZh: slide.imagePromptZh, prompt: slide.imagePrompt, style: slide.imageStyle }, slide.caption) });
  }
  for (const [cardIndex, card] of (slide.cards ?? []).entries()) {
    if (!card.image?.url && failed(card.image?.status, card.image?.errorMsg)) {
      slots.push({ cardIndex, prompt: seed(card.image, `${card.headline ?? ""} ${card.body ?? ""}`) });
    }
  }
  return slots;
}
