import { useState } from "react";
import { getUserId } from "../lib/utils";

interface Settings {
  apiKey: string;
  language: string;
  targetMarket: string;
}

export default function Settings() {
  const userId = getUserId();
  const [settings, setSettings] = useState<Settings>({
    apiKey:       localStorage.getItem("apiKey")       ?? "",
    language:     localStorage.getItem("language")     ?? "zh-TW",
    targetMarket: localStorage.getItem("targetMarket") ?? "",
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem("apiKey",       settings.apiKey);
    localStorage.setItem("language",     settings.language);
    localStorage.setItem("targetMarket", settings.targetMarket);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        <p className="text-gray-500 mt-1">API Key、語言與市場偏好設定</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        {/* User ID (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">User ID</label>
          <input
            type="text"
            value={userId}
            readOnly
            className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
          />
          <p className="text-xs text-gray-400 mt-1">由瀏覽器自動產生，儲存於 localStorage</p>
        </div>

        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">語言</label>
          <select
            value={settings.language}
            onChange={(e) => setSettings((p) => ({ ...p, language: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="zh-TW">繁體中文</option>
            <option value="zh-CN">簡體中文</option>
            <option value="en">English</option>
          </select>
        </div>

        {/* Target Market */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">目標市場</label>
          <input
            type="text"
            value={settings.targetMarket}
            onChange={(e) => setSettings((p) => ({ ...p, targetMarket: e.target.value }))}
            placeholder="例：台灣、東南亞、日本"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={handleSave}
          className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {saved ? "✓ 已儲存" : "儲存設定"}
        </button>
      </div>
    </div>
  );
}
