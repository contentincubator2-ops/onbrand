import { describe, it, expect } from "vitest";
import { publicError } from "./taskAttachmentRoute";

describe("publicError — 給使用者看的失敗原因", () => {
  it("不帶伺服器路徑與指令列", () => {
    for (const raw of [
      "Command failed: python3 /opt/onbrand/current/skills/ai-talent/scripts/positioning/extract_doc.py /opt/onbrand/shared/storage/x.txt",
      "ENOENT: no such file or directory, open '/home/azureuser/x'",
      String.raw`spawn C:\Users\User\ffmpeg.exe EFTYPE`,
    ]) {
      const msg = publicError(new Error(raw));
      expect(msg).not.toMatch(/opt|home|python|Users|\.py/);
      expect(msg).toContain("讀不出內容");
    }
  });
  it("模型或轉錄服務掛掉時不把供應商錯誤原文丟給使用者", () => {
    expect(publicError(new Error("All LLM providers failed. Tried: anthropic: 401 – API key is invalid"))).toBe("AI 暫時讀不了這個檔案，請稍後再試一次");
    expect(publicError(new Error("transcription HTTP 429: quota"))).toBe("AI 暫時讀不了這個檔案，請稍後再試一次");
  });
  it("我們自己寫的說明照原樣給", () => {
    expect(publicError(new Error(".docx 的 zip 檔頭不對 — 檔案可能損毀或副檔名寫錯"))).toContain("zip 檔頭不對");
    expect(publicError(new Error("這支影片沒有聲音；抽不出畫面"))).toBe("這支影片沒有聲音；抽不出畫面");
  });
});
