import { describe, it, expect } from "vitest";
import { campaignPostState, canMarkPublished, firstCaption } from "./campaignPostStatus";

describe("campaignPostState", () => {
  it("剛寫好、沒送審 → 草稿", () => {
    expect(campaignPostState("draft", null)).toBe("draft");
    expect(campaignPostState(null, null)).toBe("draft");
  });
  it("送審中 → 待審核（審核佇列比 output.status 新）", () => {
    expect(campaignPostState("draft", "pending")).toBe("in_review");
    expect(campaignPostState("pending_review", "in_review")).toBe("in_review");
    expect(campaignPostState("pending_review", null)).toBe("in_review");
  });
  it("退回 → 退回修改；之後自己定稿就算核准", () => {
    expect(campaignPostState("draft", "revision_requested")).toBe("revision");
    expect(campaignPostState("approved", "revision_requested")).toBe("approved");
  });
  it("審核放行或個人定稿 → 已核准；排進行事曆也算核准", () => {
    expect(campaignPostState("draft", "approved")).toBe("approved");
    expect(campaignPostState("approved", null)).toBe("approved");
    expect(campaignPostState("scheduled", null)).toBe("approved");
  });
  it("已發布最大，不管審核紀錄", () => {
    expect(campaignPostState("published", "pending")).toBe("published");
    expect(campaignPostState("published", "revision_requested")).toBe("published");
  });
  it("核准過才能標已發布", () => {
    expect(canMarkPublished("draft")).toBe(false);
    expect(canMarkPublished("in_review")).toBe(false);
    expect(canMarkPublished("revision")).toBe(false);
    expect(canMarkPublished("approved")).toBe(true);
    expect(canMarkPublished("published")).toBe(true);
  });
});

describe("firstCaption", () => {
  it("版本陣列取第一個有字的", () => {
    expect(firstCaption(JSON.stringify([{ caption: "" }, { caption: "第二版\\n換行" }]))).toBe("第二版\n換行");
  });
  it("策略包讀 publicVariants", () => {
    expect(firstCaption({ planningArtifacts: [{ caption: "內部" }], publicVariants: [{ caption: "對外" }] })).toBe("對外");
  });
  it("輪播沒有 caption 就拼卡片", () => {
    expect(firstCaption([{ cards: [{ headline: "標", body: "內文" }, { headline: "二", body: "" }] }])).toBe("標\n內文\n\n二");
  });
  it("純文字、空值", () => {
    expect(firstCaption("就是一段字")).toBe("就是一段字");
    expect(firstCaption(null)).toBe("");
    expect(firstCaption("[]")).toBe("");
  });
});
