import { useState } from "react";
import { getUserId } from "../lib/utils";
import { useLang, type Lang } from "../lib/i18n";

interface SettingsState {
  apiKey: string;
  language: Lang;
  targetMarket: string;
}

export default function Settings() {
  const userId = getUserId();
  const { lang, setLang, t } = useLang();

  const [settings, setSettings] = useState<SettingsState>({
    apiKey:       localStorage.getItem("apiKey")       ?? "",
    language:     lang,
    targetMarket: localStorage.getItem("targetMarket") ?? "",
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem("apiKey",       settings.apiKey);
    localStorage.setItem("targetMarket", settings.targetMarket);
    // Language: delegate to LanguageProvider (also writes localStorage)
    setLang(settings.language);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("settings_title")}</h1>
        <p className="text-gray-500 mt-1">{t("settings_subtitle")}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {/* User ID (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("label_user_id")}</label>
          <input
            type="text"
            value={userId}
            readOnly
            className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">{t("user_id_hint")}</p>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("label_api_key")}</label>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => setSettings((p) => ({ ...p, apiKey: e.target.value }))}
            placeholder="sk-..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Language */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("label_language")}</label>
          <select
            value={settings.language}
            onChange={(e) => setSettings((p) => ({ ...p, language: e.target.value as Lang }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="zh-TW">{t("lang_zh")}</option>
            <option value="en">{t("lang_en")}</option>
          </select>
        </div>

        {/* Target Market */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t("label_target_market")}</label>
          <input
            type="text"
            value={settings.targetMarket}
            onChange={(e) => setSettings((p) => ({ ...p, targetMarket: e.target.value }))}
            placeholder={t("target_market_placeholder")}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={handleSave}
          className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {saved ? t("saved") : t("save_settings")}
        </button>
      </div>
    </div>
  );
}
