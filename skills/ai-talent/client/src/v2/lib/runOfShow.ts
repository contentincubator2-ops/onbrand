/**
 * Run-of-show parsing — 2026-08-22 (CJ「IG 直播配套…應該是指完整的直播
 * 範本，目前的寫法比較像是貼文的預告」).
 *
 * Sequence tasks (ig-60-live-suite) deliver ONE timeline split across
 * variants: each variant is a time block whose caption carries four
 * bracket fields written by the caption writer. RunPage renders them as a
 * rundown table, so the fields have to come back out of the caption.
 */

export interface RunOfShowRow {
  /** e.g. "00:00-03:00" */
  time: string;
  /** e.g. "黃金開場" */
  stage: string;
  /** 畫面／動作指示 — what the host physically does on camera */
  cues: string;
  /** 主播口白 — the lines the host reads out */
  script: string;
}

/**
 * Split one segment caption into the 4 columns of the rundown table.
 * Tolerant on purpose: a segment the model formatted loosely still shows
 * up, with whatever it wrote landing in the script column rather than
 * vanishing from the table. Time/stage fall back to the variant label
 * ("00:00-03:00 黃金開場"), which is generated from config, not the LLM.
 */
export function parseRunOfShow(caption: string, label: string): RunOfShowRow {
  const grab = (re: RegExp) => caption.match(re)?.[1]?.trim() ?? "";
  const time = grab(/【時間】([\s\S]*?)(?=【|$)/);
  const stage = grab(/【流程階段】([\s\S]*?)(?=【|$)/);
  // 畫面／動作指示 — full-width slash may come back as "/" or be dropped.
  const cues = grab(/【畫面[^】]*】([\s\S]*?)(?=【|$)/);
  const script = grab(/【主播口白】([\s\S]*?)(?=【|$)/);
  const [labelTime, ...labelRest] = label.trim().split(/\s+/);
  return {
    time: time || labelTime || "",
    stage: stage || labelRest.join(" "),
    cues,
    script: script || (cues ? "" : caption.trim()),
  };
}
