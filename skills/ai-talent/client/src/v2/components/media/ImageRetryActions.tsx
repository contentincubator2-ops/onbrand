import React from "react";
import type { RetryImageModel } from "../../lib/imageRetry";

/** Inline recovery, shared by a cover and each failed carousel/storyboard frame. */
export function ImageRetryActions({ en, disabled, canSwitch = true, label, onRetry }: {
  en: boolean; disabled?: boolean; canSwitch?: boolean; label: string;
  onRetry: (model: RetryImageModel) => void;
}) {
  return <div role="status" className="rounded-lg border border-warning-300 bg-warning-50 p-3 space-y-2">
    <p className="text-small text-warning-800">{label}</p>
    <div className="flex gap-2 flex-wrap">
      <button type="button" disabled={disabled} onClick={() => onRetry("gpt-image-2")}
        className="rounded border px-3 py-1 text-small disabled:opacity-50">
        {en ? "Retry GPT Image 2" : "重試 GPT Image 2"}
      </button>
      {canSwitch && <button type="button" disabled={disabled} onClick={() => onRetry("nano-banana")}
        className="rounded border px-3 py-1 text-small disabled:opacity-50">
        {en ? "Use Nano Banana" : "改用 Nano Banana"}
      </button>}
    </div>
  </div>;
}
