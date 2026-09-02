/**
 * taskIntake — 一張任務卡到底要問使用者哪幾格。
 *
 * 2026-09-02。在這之前，intake modal **只渲染也只送出 `primary_input` 那一格**，
 * `template.inputs[]` 其餘欄位是死的。實測 225 張卡裡有 24 張宣告了 primary 以外
 * 的欄位，其中 7 張還標成 `required`：
 *
 *   fb-60-link-full(context) / fb-60-countdown-5day(key_offer) /
 *   fb-60-launch-kit(event_when, event_why) / fb-60-live-suite(key_points) /
 *   ig-60-countdown-5day(key_offer) / fb-99-launch-toolkit(event_when, event_why) /
 *   fb-99-livestream-9seg(key_points)
 *
 * 那些欄位**沒有任何 UI 可以填**。使用者跑「新品上市全套」時系統從來不問活動
 * 什麼時候、為什麼辦，模型就自己編一個日期跟理由出來。而 server 端的通用 required
 * 檢查因此只能關著（`runOrchestra60` 的註解寫得很清楚：開了會把這 7 張全部擋死）。
 *
 * 這支把「要問哪幾格」變成單一答案，client 與 server 共用同一份判斷：
 *   · modal 照它渲染
 *   · server 照它驗 required —— 只驗渲染得出來的欄位，所以不可能出現
 *     「必填但沒地方填」這種死結
 *
 * client 有一份鏡像 `client/src/v2/lib/taskIntake.ts`（不能跨 vite root import），
 * 用 `taskIntake.parity.test.ts` 綁住。前例：viralSourceGuard。
 */

/** 只取這支用得到的形狀，避免把整個 FBTaskTemplate 的型別拖進 client 鏡像。 */
export interface IntakeTemplateLike {
  primary_input?: { key: string; placeholder?: string; type?: "text" | "textarea" } | null;
  inputs?: {
    key: string;
    label: string;
    type: "text" | "textarea";
    required?: boolean;
    placeholder?: string;
  }[] | null;
}

export interface IntakeField {
  key: string;
  label: string;
  type: "text" | "textarea";
  required: boolean;
  placeholder: string;
}

/**
 * primary 以外、要在 modal 上額外渲染的欄位。
 *
 * 排除規則：
 *  1. 跟 primary_input 同 key 的那格（那是主問題本身，已經有一個大輸入框）
 *  2. 重複的 key（同一個 key 宣告兩次時只認第一個）
 *  3. 沒有 key 或 label 的殘缺宣告 —— 渲染出來會是一個沒有標籤的空框
 */
export function intakeExtraFields(template: IntakeTemplateLike | null | undefined): IntakeField[] {
  const primaryKey = template?.primary_input?.key;
  const seen = new Set<string>(primaryKey ? [primaryKey] : []);
  const out: IntakeField[] = [];
  for (const f of template?.inputs ?? []) {
    const key = typeof f?.key === "string" ? f.key.trim() : "";
    const label = typeof f?.label === "string" ? f.label.trim() : "";
    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label,
      type: f.type === "textarea" ? "textarea" : "text",
      required: f.required === true,
      placeholder: typeof f.placeholder === "string" ? f.placeholder : "",
    });
  }
  return out;
}

/** primary 這一格是不是必填。沒宣告 primary_input 就沒有主問題。 */
export function intakePrimaryRequired(template: IntakeTemplateLike | null | undefined): boolean {
  if (!template?.primary_input?.key) return false;
  const pk = template.primary_input.key;
  const declared = (template.inputs ?? []).find((f) => f?.key === pk);
  // 沒有對應宣告時視為必填 —— 主問題就是這張卡的輸入，空著跑沒有意義。
  return declared ? declared.required !== false : true;
}

/**
 * 缺哪幾格必填。回傳空陣列代表可以跑。
 *
 * 只檢查 `intakeExtraFields` 會渲染出來的欄位 —— 這是關鍵：驗證範圍等於 UI
 * 範圍，所以不可能再出現「必填但畫面上沒有那一格」。
 */
export function missingRequiredInputs(
  template: IntakeTemplateLike | null | undefined,
  inputs: Record<string, string | undefined> | null | undefined,
): IntakeField[] {
  const bag = inputs ?? {};
  return intakeExtraFields(template).filter(
    (f) => f.required && !String(bag[f.key] ?? "").trim(),
  );
}

/** server 端的守門：缺必填就丟一個看得懂的中文訊息。 */
export function assertIntakeComplete(
  template: IntakeTemplateLike | null | undefined,
  inputs: Record<string, string | undefined> | null | undefined,
): void {
  const missing = missingRequiredInputs(template, inputs);
  if (missing.length === 0) return;
  throw new Error(`還缺必填欄位：${missing.map((f) => f.label).join("、")}`);
}
