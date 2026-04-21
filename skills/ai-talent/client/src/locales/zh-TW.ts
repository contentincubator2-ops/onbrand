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
  logout:       "登出",

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
  workspace_placeholder: "例：Instagram、電商、公關",
  create:             "建立",
  creating:           "建立中…",
  cancel:             "取消",

  // ── Drawer — resources ────────────────────────────────────────────────────
  section_resources:  "可用資源",
  matching:           "配對中…",
  footer_agents:      "Agents",
  footer_skills:      "Skills",
  footer_models:      "AI Models",
  footer_credits:     "credits",

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

  // ── Right panel — section headers ─────────────────────────────────────────
  section_tools_panel:     "工具面板",
  tools_panel_pill:        "面板",
  section_workflow:        "執行流程",
  section_agents:          "協作成員",
  section_brand_brain:     "品牌大腦",
  section_commercial_validation: "商業驗證",
  section_task_requirements: "任務需求",
  section_inbox:           "收件匣",
  section_basic_info:      "基本資訊",
  section_platform_auth:   "平台授權",
  section_deliverables:    "成果交付",
  squad_no_workflow:       "此小隊尚未設定執行流程",
  squad_no_agents:         "無成員資料",
  methodology_label:       "方法論",
  commercial_validation:   "Commercial Validation",
  label_agent_count:       "位成員",

  // ── Brand brain categories ────────────────────────────────────────────────
  bb_category_positioning: "品牌定位",
  bb_category_audience:    "目標受眾",
  bb_category_voice:       "品牌語調",
  bb_category_competitor:  "競品洞察",
  bb_category_other:       "其他知識",
  bb_item_label:           "知識項目",

  // ── Chat top bar ──────────────────────────────────────────────────────────
  summarize_chat:          "總結對話",
  clear_chat:              "清空對話",
  new_chat:                "新增對話",
  fullscreen:              "全螢幕",
  exit_fullscreen:         "退出全螢幕",
  view_summary:            "查看摘要",
  collapse_summary:        "收合摘要",

  // ── Chat input / hint ─────────────────────────────────────────────────────
  chat_placeholder:        "告訴我你想為「{brand}」完成什麼任務…",
  chat_placeholder_no_brand: "告訴我你想完成什麼任務…",
  chat_placeholder_agent:  "告訴 {agent} 你要完成的任務…",
  chat_placeholder_pick_brand: "選擇品牌後開始輸入任務…",
  enter_hint:              "Enter 送出 · Shift+Enter 換行",

  // ── Output / bubble / buttons ─────────────────────────────────────────────
  copy:                    "複製",
  copy_all_results:        "複製全部成果",
  expand_full:             "展開全文",
  save_to_brain:           "存入品牌大腦",
  saved_to_brain:          "已存入品牌大腦",
  saving:                  "存入中...",
  save_to_brain_choose:    "選擇存入哪個類別：",
  deliverable:             "交付物",
  level_direct:            "Level 1 · 直接即用",
  task_confirm:            "任務確認",
  step_total:              "共 {n} 步",
  step_prefix:             "Step",
  status_done:             "完成",
  status_running:          "執行中",
  continue_step_n:         "繼續第 {n} 步",
  continue_discuss_hint:   "可以繼續與 {agent} 深入討論此步驟的成果，或選擇執行方式繼續。",
  continue_discuss_placeholder: "或直接輸入問題與此 Agent 繼續對話",
  step_done_of_total:      "Step {n} 完成 · 共 {total} 步",
  label_done_of_total:     "{label} 完成 · 共 {total} 步",
  status_completed:        "已完成",
  status_running_ellipsis: "執行中...",
  status_pending:          "待執行",

  // ── PhaseTabs ─────────────────────────────────────────────────────────────
  phase_intake:            "初談",
  stale_phase_warning:     "此階段後有上游變動 — 可能需要重跑",

  // ── BrandBrainBar ─────────────────────────────────────────────────────────
  expand_brain:            "展開品牌大腦",
  collapse_brain:          "收合品牌大腦",
  estimating_positioning:  "正在推估品牌定位…",
  positioning_not_set:     "尚未設定品牌定位",
  brain_no_knowledge:      "尚無知識",
  brain_n_knowledge:       "{n} 筆知識",
  brain_items_pct:         "{n} 筆 · {pct}%",
  brain_near_limit:        "接近上限",
  view_arrow:              "查看 →",
  ai_estimate:             "AI推估",
  audience_label:          "受眾",
  emotional_label:         "情感",
  functional_label:        "功能",
  filter_all:              "全部",
  brain_empty_title:       "品牌知識庫是空的",
  brain_empty_hint:        "對話時點擊「存入品牌大腦」來累積品牌知識",
  brain_full_warning:      "⚠️ 大腦接近上限！AI 可能無法讀取所有知識。建議整合或刪除舊項目。",
  brain_tokens_used:       "{used} / {total} tokens",
  brain_auto_read_hint:    "AI 對話時自動讀取大腦內容",
  brain_add_hint:          "點擊訊息下方 ＋存入品牌大腦 來新增",
  no_content_yet:          "尚無內容",
  knowledge_item_fallback: "知識項目",
  section_basic_info_sub:     "讓 agents 開始研究",
  section_platform_auth_sub:  "授權後可代你操作",
  section_deliverables_sub:   "選擇輸出方式",
  collapse_sidebar:           "收合側欄",
  new_impromptu_title:        "新對話",

  // ── AgentBubbleHeader ─────────────────────────────────────────────────────
  a2a_handoff:             "接收上一步成果 · A2A 交接",
  second_opinion:          "第二意見",
  squad_lead:              "Squad Lead",
  agent_lead_tag:          "Lead",
} as const;
