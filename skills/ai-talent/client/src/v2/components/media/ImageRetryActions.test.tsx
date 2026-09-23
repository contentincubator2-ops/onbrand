import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import { ImageRetryActions } from "./ImageRetryActions";

describe("image retry controls", () => {
  it("runs nothing until the user chooses a model and prevents busy clicks", async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const retry = vi.fn();
    await act(async () => root.render(<ImageRetryActions en={false} label="圖片失敗" onRetry={retry} />));
    expect(retry).not.toHaveBeenCalled();
    const buttons = host.querySelectorAll("button");
    expect(buttons[1].textContent).toBe("改用 Nano Banana");
    await act(async () => buttons[1].click());
    expect(retry).toHaveBeenCalledWith("nano-banana");
    await act(async () => root.render(<ImageRetryActions en={false} disabled label="產圖中" onRetry={retry} />));
    host.querySelectorAll("button")[0].click();
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    host.remove();
  });
});
