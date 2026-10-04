/**
 * 任務卡英文旁路檔（2026-10-04）。
 *
 * 目錄檔（quickTask*.ts）的使用者可見字串原本只有中文：輸入問題、佔位字、欄位標籤、
 * 爆款來源的 short／metric／caveat／takeaway、版本名稱。為了不去動那二十幾個常被同時修改的
 * 目錄檔，英文放在這個資料夾，用 task id 對上，合併後隨 catalogProcedures 一起給 client。
 *
 * 規則：沒有英文就不給（client 退回中文），絕不填空字串。
 */
export interface TaskEn {
  /** primary_question 的英文 */
  question?: string;
  /** primary_input.placeholder 的英文 */
  placeholder?: string;
  /** inputs[] 其餘欄位，key 對 inputs[].key */
  inputs?: Record<string, { label?: string; placeholder?: string }>;
  /** 爆款／得獎來源的英文；專有名詞（品牌、人名、作品名）保留原文 */
  source?: { short?: string; metric?: string; caveat?: string; takeaway?: string };
}
export type TaskEnMap = Record<string, TaskEn>;
/** 版本名稱：中文原文 → 英文。版本名稱存在產出裡是中文，顯示時查表。 */
export type VariantLabelEnMap = Record<string, string>;
