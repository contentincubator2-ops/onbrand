import { useState } from "react";
import { trpc } from "../lib/trpc";
import BrandCard from "../components/BrandCard";
import LoadingSpinner from "../components/LoadingSpinner";

interface FormData {
  brandName: string;
  websiteUrl: string;
  industry: string;
  targetMarket: string;
  competitors: string;
}

export default function BrandAnalysis() {
  const [form, setForm] = useState<FormData>({
    brandName: "",
    websiteUrl: "",
    industry: "",
    targetMarket: "",
    competitors: "",
  });

  const mutation = trpc.brand.analyzeBrand.useMutation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      brandName:    form.brandName,
      websiteUrl:   form.websiteUrl || undefined,
      industry:     form.industry   || undefined,
      targetMarket: form.targetMarket || undefined,
      competitors:  form.competitors
        ? form.competitors.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">品牌分析</h1>
        <p className="text-gray-500 mt-1">輸入品牌資訊，AI 自動生成定位與競爭策略分析</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            品牌名稱 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="brandName"
            required
            value={form.brandName}
            onChange={handleChange}
            placeholder="例：SoWork"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">官方網站</label>
          <input
            type="url"
            name="websiteUrl"
            value={form.websiteUrl}
            onChange={handleChange}
            placeholder="https://sowork.ai"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">產業</label>
          <input
            type="text"
            name="industry"
            value={form.industry}
            onChange={handleChange}
            placeholder="例：AI SaaS、電商、金融科技"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">目標市場</label>
          <input
            type="text"
            name="targetMarket"
            value={form.targetMarket}
            onChange={handleChange}
            placeholder="例：台灣中小企業主"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            競爭對手（逗號分隔）
          </label>
          <input
            type="text"
            name="competitors"
            value={form.competitors}
            onChange={handleChange}
            placeholder="例：HubSpot, Marketo, Buffer"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <button
          type="submit"
          disabled={mutation.isPending || !form.brandName.trim()}
          className="w-full bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {mutation.isPending ? "分析中..." : "🎯 開始分析"}
        </button>
      </form>

      {/* Loading */}
      {mutation.isPending && (
        <LoadingSpinner size="lg" message="AI 正在分析您的品牌..." />
      )}

      {/* Error */}
      {mutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          <strong>分析失敗：</strong> {mutation.error.message}
        </div>
      )}

      {/* Result */}
      {mutation.isSuccess && mutation.data && (
        <BrandCard result={mutation.data as any} brandName={form.brandName} />
      )}
    </div>
  );
}
