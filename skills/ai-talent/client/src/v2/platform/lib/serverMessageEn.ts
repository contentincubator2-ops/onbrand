/**
 * 登入／註冊相關的伺服器訊息以中文回傳（authRouter）。英文介面在顯示時換成英文；
 * 查不到的原樣顯示，所以新增訊息不會壞，只是暫時沒有英文。
 */
const AUTH_MESSAGE_EN: Record<string, string> = {
  "Google OAuth 未配置": "Google sign-in isn't set up",
  "Google 登入失敗": "Google sign-in failed",
  "伺服器錯誤": "Server error",
  "伺服器錯誤，請稍後再試": "Server error. Please try again later.",
  "使用者不存在": "User not found",
  "帳號不存在": "Account not found",
  "未登入": "Not signed in",
  "此電子郵件已註冊": "This email is already registered",
  "如果此電子郵件已註冊，您將收到重設密碼的連結": "If this email is registered, you'll get a reset link.",
  "如果此電子郵件還沒驗證，新的驗證信已寄出": "If this email isn't verified yet, a new verification email has been sent.",
  "密碼重設成功！請使用新密碼登入": "Password reset. Sign in with your new password.",
  "無效或過期的重設連結": "Invalid or expired reset link",
  "無效或過期的驗證連結": "Invalid or expired verification link",
  "無效的 OAuth 狀態": "Invalid sign-in state",
  "無效的登入狀態": "Invalid sign-in state",
  "登入狀態無效": "Sign-in session is invalid",
  "目前密碼不正確": "Current password is incorrect",
  "缺少授權碼": "Missing authorization code",
  "註冊失敗，請稍後再試": "Sign-up failed. Please try again later.",
  "請先驗證您的電子郵件後再登入": "Please verify your email before signing in",
  "重設連結已使用過或已失效，請重新申請": "This reset link was already used or has expired. Please request a new one.",
  "重設連結已過期，請重新申請": "This reset link has expired. Please request a new one.",
  "電子郵件或密碼錯誤": "Incorrect email or password",
  "電子郵件驗證成功！": "Email verified!",
  "驗證信寄送失敗，請稍後再試": "Couldn't send the verification email. Please try again later.",
  "驗證連結已過期，請重新註冊": "Verification link expired. Please sign up again.",
};

/** 英文介面回英文；找不到或中文介面原樣回傳。 */
export function serverMessageText(msg: string | null | undefined, lang: "en" | "zh-TW"): string {
  const m = msg ?? "";
  return lang === "en" ? (AUTH_MESSAGE_EN[m] ?? m) : m;
}

/** 方案名稱由伺服器以中文回傳（plans.ts）；英文介面顯示時換成英文，查不到原樣顯示。 */
const PLAN_NAME_EN: Record<string, string> = {
  "onBrand Studio 基礎版": "onBrand Studio Starter",
  "onBrand Studio 專業版": "onBrand Studio Pro",
  "7 天免費試用": "7-day free trial",
  "企業客製版": "Enterprise",
};

export function planNameText(name: string, lang: "en" | "zh-TW"): string {
  return lang === "en" ? (PLAN_NAME_EN[name] ?? name) : name;
}
