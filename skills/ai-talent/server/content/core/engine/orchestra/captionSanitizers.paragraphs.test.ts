/**
 * stripPlaceholderBrackets 不可以把段落之間的空行吃掉。
 *
 * 2026-10-07：原本的清理寫 `\s{2,}` → " "，換行也算空白，於是每一篇單篇／套組文案的
 * 「\n\n」都被壓成一個空格，整篇黏成一段。「學品牌寫法」的試寫拿來跟原文左右對照時
 * 才被看出來：原文有分段、試寫沒有。
 */
import { describe, expect, it } from "vitest";
import { stripPlaceholderBrackets } from "./captionSanitizers";

describe("stripPlaceholderBrackets 保留分段", () => {
  it("段落之間的空行留著", () => {
    expect(stripPlaceholderBrackets("第一段。\n\n第二段。\n\n#標籤")).toBe("第一段。\n\n第二段。\n\n#標籤");
  });

  it("單一換行（條列、短句換行）留著", () => {
    expect(stripPlaceholderBrackets("一、起點\n二、命名\n三、成長")).toBe("一、起點\n二、命名\n三、成長");
  });

  it("三個以上的換行收成一個空行", () => {
    expect(stripPlaceholderBrackets("第一段。\n\n\n\n第二段。")).toBe("第一段。\n\n第二段。");
  });

  it("同一行裡多出來的空白照樣收成一個", () => {
    expect(stripPlaceholderBrackets("活動  從昨天　　開始")).toBe("活動 從昨天 開始");
  });

  it("佔位符拿掉之後不留下行尾空白，也不破壞分段", () => {
    expect(stripPlaceholderBrackets("活動在 [請補充：日期] 開始。\n\n歡迎來玩。")).toBe("活動在 開始。\n\n歡迎來玩。");
    expect(stripPlaceholderBrackets("第一段。 [待補]\n\n第二段。")).toBe("第一段。\n\n第二段。");
  });
});
