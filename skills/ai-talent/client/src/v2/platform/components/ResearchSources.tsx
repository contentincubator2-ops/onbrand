/**
 * ResearchSources — 「這篇文案寫作前，AI 針對當次主題上網查到的案例與說法」。
 *
 * 2026-10-04（CJ「寫範例貼文與未來執行任務卡時，應主動搜尋相關案例或說法的資料，補充文案
 * 本身的內容」）。資料來自 metadata.references／researchNote（server cardResearch.ts）。
 * 網址一律是搜尋服務實際回傳的；沒查到就照實說，不拿沒有出處的內容充數。
 */
export interface ResearchReference {
  title: string;
  url: string;
  host: string;
  takeaway: string;
  retrievedAt: string;
}

export default function ResearchSources({ refs, note, en }: { refs: ResearchReference[]; note: string | null; en: boolean }) {
  // 沒有 refs 也沒有 note ＝ 這次根本沒開查資料（非 researchTopic 任務），不顯示。
  if (refs.length === 0 && !note) return null;
  return (
    <div className="rounded-medium border border-divider p-3 space-y-2">
      <p className="text-small font-medium">
        {en ? "Cases & claims the AI looked up for this topic" : "AI 針對這次主題查到的案例與說法"}
      </p>
      {refs.length === 0 ? (
        <p className="text-tiny text-default-500">{note}</p>
      ) : (
        <>
          <p className="text-tiny text-default-500">
            {en
              ? "Looked up fresh on every run to enrich the copy. Check the links before you rely on them."
              : "每次執行都會針對當次主題重新查，用來充實文案內容。引用前請點連結確認。"}
          </p>
          <ul className="space-y-2">
            {refs.map((r, i) => (
              <li key={r.url} className="flex gap-2 items-start">
                <span className="text-tiny text-default-400 mt-0.5">[{i + 1}]</span>
                <div className="min-w-0 flex-1">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-small font-medium underline break-words">
                    {r.title}
                  </a>
                  <p className="text-tiny text-default-400">{r.host}</p>
                  <p className="text-tiny text-default-600">{r.takeaway}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
