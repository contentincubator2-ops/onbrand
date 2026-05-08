/**
 * taskSearchSynonyms — natural-language → task-keyword expansion.
 *
 * Test report (2026-05-08): "搜尋『活動公告』→ 0 結果。搜尋『TikTok 文案』
 * → 0 結果。搜尋『IG 貼文』→ 只找到 IG→Threads 改寫。對於初次使用的小編
 * 來說，如果不知道任務叫『FB 短貼文 caption』就根本找不到它。"
 *
 * Approach: don't rebuild the catalog — extend the search filter so a
 * user query is matched against (label + description + skill_slug +
 * synonyms[]). The synonyms list maps the user's natural phrasing to
 * keywords that DO appear in task data.
 *
 * Rule: if any synonym key is a substring of the user query, all the
 * mapped phrases are added to the match set.
 */

/** Map: user-typed phrase → list of phrases that appear in real task labels. */
const SYNONYM_MAP: Record<string, string[]> = {
  // Activities / announcements / launches
  "活動公告":   ["FB 短貼文", "活動 launch", "限定活動", "announcement", "活動", "公告"],
  "公告":       ["FB 短貼文", "活動 launch", "公告", "新品"],
  "新品上市":   ["FB 短貼文", "活動 launch", "新品", "launch"],
  "新品":       ["新品", "launch", "FB 短貼文"],
  "活動":       ["活動", "launch", "限定", "FB 短貼文"],
  "促銷":       ["促銷", "活動", "限定", "優惠"],
  "優惠":       ["促銷", "限定", "優惠", "活動"],

  // Format / channel aliases
  "貼文":       ["短貼文", "caption", "貼文"],
  "文案":       ["caption", "短貼文", "文案", "改寫"],
  "短文":       ["短貼文", "caption"],
  "長文":       ["長文", "完整貼文"],

  // Per-platform shortcuts
  "fb":         ["FB", "Facebook", "FB 短貼文"],
  "facebook":   ["FB", "Facebook", "FB 短貼文"],
  "ig":         ["IG", "Instagram", "IG 短貼文", "IG caption", "IG Reel"],
  "instagram":  ["IG", "Instagram", "IG 短貼文", "IG caption"],
  "tiktok":     ["TikTok", "TT", "ForYou", "TikTok 短"],
  "tt":         ["TikTok", "TT"],
  "yt":         ["YouTube", "YT", "Shorts"],
  "youtube":    ["YouTube", "YT", "Shorts"],
  "shorts":     ["Shorts", "YT"],
  "threads":    ["Threads", "TH"],
  "linkedin":   ["LinkedIn", "LI"],
  "li":         ["LinkedIn", "LI"],
  "edm":        ["EDM", "電子報", "Email", "信件"],
  "電子報":     ["EDM", "電子報", "Email"],
  "email":      ["EDM", "Email", "電子報"],
  "新聞稿":     ["新聞稿", "PR", "press"],
  "pr":         ["新聞稿", "press", "PR"],

  // Story / brand / community
  "品牌故事":   ["品牌故事", "故事", "心情文", "FB 短貼文"],
  "故事":       ["品牌故事", "故事", "心情文"],
  "見證":       ["見證", "客戶見證", "testimonial", "改寫"],
  "口碑":       ["見證", "口碑", "改寫"],
  "心情":       ["心情文", "故事"],

  // Crisis / customer service
  "危機":       ["危機", "公關", "crisis", "回覆"],
  "回應":       ["回應", "回覆", "客服"],
  "客服":       ["客服", "留言", "回覆", "Threads"],
  "留言":       ["留言回覆", "留言", "客服"],

  // Live / video
  "直播":       ["直播", "live", "live host", "Live"],
  "live":       ["直播", "live"],
  "影片":       ["影片", "video", "Reel", "Shorts"],
  "video":      ["影片", "video", "Reel"],
  "reel":       ["Reel", "IG Reel", "影片"],

  // Content calendar / multi-post
  "月曆":       ["月曆", "30天", "calendar", "30 days"],
  "行事曆":     ["月曆", "行事曆", "30天", "calendar"],
  "30天":       ["30天", "月曆"],
  "倒數":       ["倒數", "5 天倒數", "countdown", "活動"],
  "連載":       ["連載", "3 篇", "系列"],
  "系列":       ["系列", "連載", "倒數"],

  // EDM / newsletter
  "信件":       ["EDM", "信件", "Email"],
  "電郵":       ["EDM", "Email"],
};

/**
 * Match a user query against task fields PLUS synonym expansion.
 * Returns true if:
 *   - Query (or any of its synonym expansions) is found in any field, OR
 *   - Any field's content overlaps a synonym mapping that includes the query.
 */
export function matchTaskWithSynonyms(args: {
  query: string;
  label: string;
  description: string;
  agentName?: string;
  skillSlug?: string;
}): boolean {
  const q = args.query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    args.label ?? "",
    args.description ?? "",
    args.agentName ?? "",
    args.skillSlug ?? "",
  ].join(" ").toLowerCase();

  // Direct hit
  if (haystack.includes(q)) return true;

  // Synonym expansion — find all map keys that q contains OR contains q
  // (so "活動" matches "活動公告" key and pulls the expansion)
  const expansions = new Set<string>();
  for (const [key, vals] of Object.entries(SYNONYM_MAP)) {
    if (q.includes(key) || key.includes(q)) {
      vals.forEach((v) => expansions.add(v.toLowerCase()));
    }
  }
  for (const exp of expansions) {
    if (haystack.includes(exp)) return true;
  }
  return false;
}
