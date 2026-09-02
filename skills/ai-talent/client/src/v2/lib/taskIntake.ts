/**
 * taskIntake（client 鏡像）— 一張任務卡到底要問使用者哪幾格。
 *
 * 這份是 `server/_core/taskIntake.ts` 的逐字鏡像。兩份不能互相 import
 * （client 的 vite root 是 client/，跨出去在 dev server 會被 fs.allow 擋掉），
 * 所以用 `server/_core/taskIntake.parity.test.ts` 把它們綁在一起：改了一邊
 * 沒改另一邊就會紅。前例：viralSourceGuard 的同名鏡像。
 *
 * 為什麼一定要同一份判斷：modal 照它渲染、server 照它驗 required。兩份漂移
 * 的結果就是「畫面上沒有那一格，但送出時說它必填」—— 使用者完全無解。
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
