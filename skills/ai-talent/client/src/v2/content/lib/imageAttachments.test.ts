import { describe, expect, it } from "vitest";
import { addAttachment, baseOf, followUrls, setAttachmentRole, subjectOf, MAX_FOLLOW, type Attachment } from "./imageAttachments";

const att = (n: number, role: Attachment["role"] = "follow"): Attachment => ({ url: `/u/${n}.png`, name: `${n}`, role });

describe("imageAttachments", () => {
  it("「照這張畫」最多 MAX_FOLLOW 張，滿了就放不進去", () => {
    let list: Attachment[] = [];
    for (let i = 0; i < MAX_FOLLOW; i++) list = addAttachment(list, att(i))!;
    expect(followUrls(list)).toHaveLength(MAX_FOLLOW);
    expect(addAttachment(list, att(99))).toBeNull();
  });
  it("主體同時只能有一張：新的當主體，舊的退成「照這張畫」", () => {
    let list = addAttachment([], att(1, "subject"))!;
    list = addAttachment(list, att(2, "subject"))!;
    expect(subjectOf(list)?.url).toBe("/u/2.png");
    expect(followUrls(list)).toEqual(["/u/1.png"]);
  });
  it("「直接當底圖」和「放進畫面」互斥", () => {
    let list = addAttachment([], att(1, "subject"))!;
    list = setAttachmentRole(list, "/u/1.png", "base")!;
    expect(baseOf(list)?.url).toBe("/u/1.png");
    expect(subjectOf(list)).toBeNull();
    list = addAttachment(list, att(2, "subject"))!;
    expect(baseOf(list)).toBeNull();
    expect(subjectOf(list)?.url).toBe("/u/2.png");
  });
  it("「照這張畫」已滿時換主體：舊主體退不下去就拿掉", () => {
    let list: Attachment[] = [att(0, "subject")];
    for (let i = 1; i <= MAX_FOLLOW; i++) list = addAttachment(list, att(i))!;
    list = addAttachment(list, att(9, "subject"))!;
    expect(subjectOf(list)?.url).toBe("/u/9.png");
    expect(list.some((a) => a.url === "/u/0.png")).toBe(false);
    expect(followUrls(list)).toHaveLength(MAX_FOLLOW);
  });
  it("同一張再加一次只改用途，不重複", () => {
    let list = addAttachment([], att(1))!;
    list = addAttachment(list, att(1, "subject"))!;
    expect(list).toHaveLength(1);
    expect(list[0]!.role).toBe("subject");
  });
  it("主體改回「照這張畫」但已滿：拒絕", () => {
    let list: Attachment[] = [att(0, "subject")];
    for (let i = 1; i <= MAX_FOLLOW; i++) list = addAttachment(list, att(i))!;
    expect(setAttachmentRole(list, "/u/0.png", "follow")).toBeNull();
  });
});
