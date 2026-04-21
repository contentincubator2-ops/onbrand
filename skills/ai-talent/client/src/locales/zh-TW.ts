/**
 * zh-TW.ts — Traditional Chinese UI strings
 */
export const zh = {
  // ── Rail tabs ──────────────────────────────────────────────────────────────
  tab_tasks:    "任務",
  tab_chat:     "對話",
  tab_brain:    "大腦",
  tab_outputs:  "產出",
  tab_settings: "設定",

  // ── Drawer — brand ─────────────────────────────────────────────────────────
  loading_brands:   "載入品牌中…",
  create_brand:     "建立品牌",
  select_brand:     "選擇品牌",
  create_new_brand: "建立新品牌",
  delete_brand:     "刪除品牌",
  confirm_delete_brand: "確定刪除品牌「{name}」？",

  // ── Drawer — missions ──────────────────────────────────────────────────────
  section_impromptu:     "即興任務",
  start_impromptu:       "開始即興任務",
  new_mission:           "新任務",
  loading:               "載入中…",
  confirm_delete_mission: "刪除此任務？",
  delete_mission_btn:    "刪除任務",

  // ── Drawer — workspaces ────────────────────────────────────────────────────
  section_workspace:  "工作區",
  no_workspaces:      "暫無工作區",
  add_workspace:      "新增工作區",

  // ── Drawer — resources ────────────────────────────────────────────────────
  section_resources:  "可用資源",
  matching:           "配對中…",

  // ── MissionHomePage ────────────────────────────────────────────────────────
  mission_start:           "啟動任務",
  mission_subtitle:        "選擇執行方式，輸入任務需求",
  mission_placeholder:     "描述你的任務需求...",
  mission_submit_btn:      "啟動任務 →",
  mission_no_squad:        "建立任務後顯示推薦小隊",
  resource_matching:       "正在為此任務配對最佳 AI 代理人選…",
  resource_ready:          "語意配對完成",
  label_skills:            "技能",

  // ── Settings ──────────────────────────────────────────────────────────────
  settings_title:          "設定",
  settings_subtitle:       "API Key、語言與市場偏好設定",
  label_user_id:           "User ID",
  user_id_hint:            "由瀏覽器自動產生，儲存於 localStorage",
  label_api_key:           "API Key",
  label_language:          "語言",
  lang_zh:                 "繁體中文",
  lang_en:                 "English",
  label_target_market:     "目標市場",
  target_market_placeholder: "例：台灣、東南亞、日本",
  save_settings:           "儲存設定",
  saved:                   "✓ 已儲存",

  // ── Right panel ───────────────────────────────────────────────────────────
  section_workflow:        "執行流程",
  section_agents:          "協作成員",
  section_brand_brain:     "品牌大腦",
  squad_no_workflow:       "此小隊尚未設定執行流程",
  squad_no_agents:         "無成員資料",
  methodology_label:       "方法論",
  commercial_validation:   "Commercial Validation",
  label_agent_count:       "位成員",
} as const;
