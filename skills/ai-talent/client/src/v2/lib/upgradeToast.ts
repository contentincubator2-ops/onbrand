/**
 * upgradeToast — 撞到方案上限的錯誤，不能是死路。
 *
 * 2026-09-07。server 端的上限訊息寫著「升級後可以增加」「屬於專業方案」，
 * 但 toast 只印文字，使用者看完不知道要去哪。Toast 本身支援 action 按鈕
 * （2026-05-13 就有），這裡只是把「這是不是一則方案相關的錯誤」判斷
 * 收在一處，是的話掛上「方案與定價」。
 *
 * 判斷用關鍵字而不是錯誤碼：上限錯誤有的是 BAD_REQUEST（自建卡／產品），
 * 有的是 FORBIDDEN（執行閘門），碼不一致，但訊息裡一定有這幾個詞。
 */
import { showToastGlobal } from "../../components/ui/Toast";

const UPGRADE_HINT = /升級|專業方案|方案與定價|upgrade|Professional plan/i;

export function toastWithUpgrade(message: string, isEn = false): void {
  if (UPGRADE_HINT.test(message)) {
    showToastGlobal(message, "error", {
      label: isEn ? "Plans & pricing" : "方案與定價",
      onClick: () => { window.location.assign("/pricing"); },
    });
    return;
  }
  showToastGlobal(message, "error");
}
