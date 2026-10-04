import { useCallback } from "react";
import { trpc } from "../../../lib/trpc";
import { useLang } from "../../../lib/i18n";

/**
 * Version/variant names are stored in outputs as Chinese strings. In the English UI
 * we look them up in the server dictionary (quickTask.variantLabelsEn) at display time.
 * Composed labels ("a · b") are translated segment by segment; unknown text is kept.
 */
export function useVariantLabel(): (zh: string) => string {
  const { lang } = useLang();
  const en = lang === "en";
  const q = trpc.quickTask.variantLabelsEn.useQuery(undefined, {
    enabled: en,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const dict = (q.data ?? null) as Record<string, string> | null;
  return useCallback(
    (zh: string) => {
      if (!en || !dict || !zh) return zh;
      const hit = dict[zh];
      if (hit) return hit;
      if (zh.includes(" · ")) {
        return zh.split(" · ").map((p) => dict[p.trim()] ?? p).join(" · ");
      }
      return zh;
    },
    [en, dict],
  );
}
