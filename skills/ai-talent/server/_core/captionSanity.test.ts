import { describe, expect, it } from "vitest";
import { detectNonDeliverable } from "./captionSanity";

describe("detectNonDeliverable", () => {
  it("rejects the English meta response from the FB link-post incident", () => {
    const text = `I need to analyze the URL content you've provided. However, I notice the extracted
content appears to be technical Facebook page markup rather than the actual article
content. I face a critical blocker: the brand context provided is unrelated to the URL.
I need clarification before proceeding: Is this URL meant for a different brand/account?`;

    expect(detectNonDeliverable(text, { isZhTW: true })).toEqual({
      bad: true,
      reason: "meta-clarification-en",
    });
  });

  it("accepts a normal Chinese Facebook caption", () => {
    const text = "孩子成長的每一步，都藏在每天的小小選擇裡。從均衡飲食到規律作息，陪他把活力準備好，一起迎接更多探索世界的驚喜。";
    expect(detectNonDeliverable(text, { isZhTW: true })).toBeNull();
  });

  it("accepts a normal English caption for a non-zh-TW market", () => {
    const text = "Small steps create brighter days. Discover simple nutrition ideas that help your family feel ready for every new adventure.";
    expect(detectNonDeliverable(text, { isZhTW: false })).toBeNull();
  });

  it("rejects an English weak signal combined with task vocabulary", () => {
    const text = "Let me know if you want me to revise the caption before publishing.";
    expect(detectNonDeliverable(text, { isZhTW: false })).toEqual({
      bad: true,
      reason: "meta-clarification-en",
    });
  });

  it("accepts English task vocabulary without a weak signal", () => {
    const text = "The post is live now, and the weekend collection is ready to explore.";
    expect(detectNonDeliverable(text, { isZhTW: false })).toBeNull();
  });

  it("rejects a Chinese clarification request", () => {
    expect(detectNonDeliverable("資訊不足，請補充活動日期與產品特色。", { isZhTW: true })).toEqual({
      bad: true,
      reason: "clarification-zh",
    });
  });

  it.each([
    "請提供更多產品資訊，才能撰寫符合定位的標題。",
    "請補充目標受眾與活動賣點。",
    "無法產出，缺少必要素材。",
    "因為資訊不足，請補充活動日期。",
    "目前資訊不足，請提供更多活動背景。",
    "抱歉，無法產出，缺少活動日期。",
  ])("rejects a strong Chinese clarification signal: %s", (text) => {
    expect(detectNonDeliverable(text, { isZhTW: true })).toEqual({
      bad: true,
      reason: "clarification-zh",
    });
  });

  it("accepts weak Chinese clarification phrases without a blocking request", () => {
    expect(detectNonDeliverable("需要更多產品背景，請確認活動日期。", { isZhTW: true })).toBeNull();
  });

  it.each([
    "有些味道，無法產出於工廠",
    "一個人無法完成的事，一群人可以",
    "活動日期：5/20，現場還有小驚喜等你",
    "目標受眾是誰？我們讓數據說話。",
  ])("accepts Chinese copy without independent task and blocking signals: %s", (text) => {
    expect(detectNonDeliverable(text, { isZhTW: true })).toBeNull();
  });

  it("accepts Chinese copy containing an English brand name and hashtag", () => {
    const text = "今天和 OpenAI 一起打開創意新視野，把腦中的靈感變成真正能分享的故事。現在就來看看：https://example.com #OpenAI #創意生活";
    expect(detectNonDeliverable(text, { isZhTW: true })).toBeNull();
  });

  it("does not reject a Chinese caption that quotes a short English line", () => {
    const text = "電影裡那句「I need to go」讓我記了很久，但真正打動人的，是角色終於勇敢面對選擇。今晚，也留一點時間聽聽自己的聲音。";
    expect(detectNonDeliverable(text, { isZhTW: true })).toBeNull();
  });

  it.each([
    ["更多資訊請見官網，我們準備了完整的春季新品指南，帶你一次看懂每一款的差別與適合的場合。", true],
    ["這週的靈感來自巷口那間老麵店。留言請告訴我你最想看哪一種口味，我們下週就試做給你看。", true],
    ["需要更多靈感嗎？我們把這季最受歡迎的五種穿搭整理成一份清單，滑到最後有小驚喜。", true],
    ["這篇文章請說明了三個重點，其實我們也想聽聽你的看法。", true],
    ["Let me know in the comments which flavour you want us to make next — we read every single one.", false],
    ["I can't believe how fast this sold out. Restock lands Friday, and the queue opens at 10am sharp.", false],
  ])("accepts normal CTA or narrative copy: %s", (text, isZhTW) => {
    expect(detectNonDeliverable(text, { isZhTW })).toBeNull();
  });

  it.each([
    ["Let me know what you think — I can't wait to hear which one you pick for the weekend.", false],
    ["請提供您的 email 以取得優惠，我們會寄出專屬折扣碼與新品試用資訊。", true],
    ["更多資訊請見官網，也請告訴我你的想法，留言區見。", true],
    ["很多家長擔心孩子的營養資訊不足，我們整理了三個最常被問到的問題，一次說清楚。", true],
    ["目前無法親自到店的朋友，也可以線上選購，宅配三天內就會送到家。", true],
    ["一個人無法完成的事，一群人可以。這次的活動就是最好的證明，謝謝每一位參與的夥伴。", true],
    ["在開始之前，先深呼吸一口氣。這款新品的設計靈感，就來自那個放慢下來的瞬間。", true],
    ["Ready for the weekend? Let me know which one you would pick — I can't decide. Which flavour wins?", false],
  ])("accepts adversarial but publishable copy: %s", (text, isZhTW) => {
    expect(detectNonDeliverable(text, { isZhTW })).toBeNull();
  });

  it("rejects a Chinese operator-facing refusal with a clarification request", () => {
    const text = "因為目前資訊不足，我無法直接產出這篇貼文，請先提供活動日期與受眾。";
    expect(detectNonDeliverable(text, { isZhTW: true })).toEqual({
      bad: true,
      reason: "clarification-zh",
    });
  });

  it("still rejects an English-only long caption for a zh-TW market", () => {
    const text = "Spring arrives with a fresh collection designed for slow mornings and bright afternoons. Explore breathable layers, thoughtful details, and versatile colors made to move through every part of your day. Visit our website to discover the full seasonal edit and find your new everyday favorites.";
    expect(detectNonDeliverable(text, { isZhTW: true })).toEqual({
      bad: true,
      reason: "language-not-zh-tw",
    });
  });

  it("accepts English-heavy calendar JSON when marked as structured", () => {
    const text = JSON.stringify([
      { day: 1, pillar: "UGC", hook: "Reels 新玩法", format: "Reels", cta: "tag your friend" },
      { day: 2, pillar: "Community", hook: "Story challenge", format: "Stories", cta: "share your moment" },
      { day: 3, pillar: "Education", hook: "Weekly tips", format: "Carousel", cta: "save this post" },
    ]);

    expect(detectNonDeliverable(text, { isZhTW: true, structured: true })).toBeNull();
  });

  it("still rejects the same English-heavy calendar JSON without the structured flag", () => {
    const text = JSON.stringify([
      { day: 1, pillar: "UGC", hook: "Reels 新玩法", format: "Reels", cta: "tag your friend" },
      { day: 2, pillar: "Community", hook: "Story challenge", format: "Stories", cta: "share your moment" },
      { day: 3, pillar: "Education", hook: "Weekly tips", format: "Carousel", cta: "save this post" },
    ]);

    expect(detectNonDeliverable(text, { isZhTW: true })).toEqual({
      bad: true,
      reason: "language-not-zh-tw",
    });
  });
});
