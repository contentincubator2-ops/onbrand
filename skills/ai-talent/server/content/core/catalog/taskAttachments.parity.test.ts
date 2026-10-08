/**
 * 鏡像防漂移 — server 的 taskAttachments 與 client/src/v2/content/lib/taskAttachments
 * 對「哪些檔可以傳、多大、幾份」必須答得一樣。
 *
 * 漂移的後果：畫面讓使用者選了檔、傳了幾十 MB，伺服器才說不收；或反過來，伺服器
 * 明明讀得了的格式，畫面的選檔視窗卻不讓選。
 */
import { describe, it, expect } from "vitest";
import * as server from "./taskAttachments";
import * as client from "../../../../client/src/v2/content/lib/taskAttachments";

describe("taskAttachments client/server parity", () => {
  it("支援的副檔名與類型一致", () => {
    expect([...client.ATTACHMENT_EXTS].sort()).toEqual([...server.ATTACHMENT_EXTS].sort());
    for (const ext of server.ATTACHMENT_EXTS) {
      expect(client.attachmentKindOf(`檔案${ext}`)).toBe(server.attachmentKindOf(`檔案${ext}`));
    }
    expect(client.attachmentKindOf("a.exe")).toBe(server.attachmentKindOf("a.exe"));
  });

  it("大小、份數、字數上限一致", () => {
    expect(client.ATTACHMENT_MAX_BYTES).toEqual(server.ATTACHMENT_MAX_BYTES);
    expect(client.MAX_ATTACHMENTS).toBe(server.MAX_ATTACHMENTS);
    expect(client.ATTACHMENT_TEXT_MAX).toBe(server.ATTACHMENT_TEXT_MAX);
  });

  it("畫面送出的形狀過得了伺服器的輸入檢查", () => {
    const item = (over: Partial<client.AttachmentItem>): client.AttachmentItem => ({
      id: "x", name: "訪談.mp4", kind: "video", status: "done", progress: 1, stage: null,
      text: "逐字稿", chars: 3, truncated: false, error: null, ...over,
    });
    const ready = client.readyAttachments([
      item({}),
      item({ status: "processing", text: "" }),
      item({ status: "error", text: "" }),
      item({ name: "長".repeat(400) + ".docx", kind: "document", text: "字".repeat(client.ATTACHMENT_TEXT_MAX + 500) }),
    ]);
    expect(ready).toHaveLength(2);
    expect(server.TASK_ATTACHMENTS_INPUT.safeParse(ready).success).toBe(true);
    expect(client.attachmentsBusy([item({ status: "processing" })])).toBe(true);
    expect(client.attachmentsBusy([item({}), item({ status: "error" })])).toBe(false);
  });
});
