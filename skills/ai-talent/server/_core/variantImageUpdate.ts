export interface VariantImageUpdateInput {
  imageUrl: string;
  cardIndex?: number;
  style?: string;
  prompt?: string;
  promptZh?: string;
  modelId?: string;
  requestedModelId?: string;
  fallbackUsed?: boolean;
}

/**
 * Keep the nested orchestra image contract and the historical flat fields in
 * lockstep. RunPage deliberately reads flat fields first for old outputs, so
 * leaving an old flat prompt behind makes a newly generated image appear to
 * have been driven by the previous prompt.
 */
export function applyVariantImageUpdate(
  item: Record<string, any>,
  input: VariantImageUpdateInput,
): Record<string, any> {
  if (input.cardIndex !== undefined) {
    const { cardIndex, ...imageInput } = input;
    if (!Number.isInteger(cardIndex) || cardIndex < 0 || !Array.isArray(item.cards) || !item.cards[cardIndex]) {
      throw new Error("Image card not found");
    }
    return { ...item, cards: item.cards.map((card: any, index: number) =>
      index === cardIndex ? applyVariantImageUpdate(card, imageInput) : card) };
  }
  const currentImage = item.image && typeof item.image === "object" && !Array.isArray(item.image)
    ? item.image
    : {};
  const style = input.style ?? currentImage.style ?? item.imageStyle ?? null;
  const prompt = input.prompt
    ?? currentImage.prompt
    ?? item.imagePrompt
    ?? input.style
    ?? currentImage.style
    ?? item.imageStyle
    ?? null;
  const promptZh = input.promptZh
    ?? currentImage.promptZh
    ?? item.imagePromptZh
    ?? null;
  const modelId = input.modelId ?? currentImage.modelId ?? item.imageModelId ?? null;
  const requestedModelId = input.requestedModelId
    ?? currentImage.requestedModelId
    ?? item.imageRequestedModelId
    ?? null;
  const fallbackUsed = input.fallbackUsed
    ?? currentImage.fallbackUsed
    ?? item.imageFallbackUsed
    ?? false;

  return {
    ...item,
    image: {
      ...currentImage,
      url: input.imageUrl,
      status: "ready",
      errorMsg: undefined,
      canSwitchTo: undefined,
      style,
      prompt,
      promptZh,
      modelId,
      requestedModelId,
      fallbackUsed,
    },
    imageUrl: input.imageUrl,
    imageStatus: "ready",
    imageStyle: style,
    imagePrompt: prompt,
    imagePromptZh: promptZh,
    imageModelId: modelId,
    imageRequestedModelId: requestedModelId,
    imageFallbackUsed: fallbackUsed,
  };
}
