interface BrandAnalysisResult {
  positioning?: string;
  strengths?: string[];
  weaknesses?: string[];
  opportunities?: string[];
  recommendations?: string[];
}

interface BrandCardProps {
  result: BrandAnalysisResult;
  brandName: string;
}

function Section({ title, items, emoji }: { title: string; items?: string[]; emoji: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">
        {emoji} {title}
      </h3>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-gray-600 flex gap-2">
            <span className="text-gray-400 shrink-0">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BrandCard({ result, brandName }: BrandCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">
          品牌分析結果：{brandName}
        </h2>
        {result.positioning && (
          <p className="mt-2 text-sm text-gray-600 bg-indigo-50 rounded-lg p-3 border border-indigo-100">
            <span className="font-medium text-indigo-700">定位：</span>
            {result.positioning}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Section title="優勢" items={result.strengths} emoji="💪" />
        <Section title="劣勢" items={result.weaknesses} emoji="⚠️" />
        <Section title="機會" items={result.opportunities} emoji="🚀" />
        <Section title="建議" items={result.recommendations} emoji="💡" />
      </div>
    </div>
  );
}
