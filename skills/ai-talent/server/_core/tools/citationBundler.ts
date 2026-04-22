/**
 * citation_bundler tool — list all grounded sources gathered in this session.
 *
 * The Lead calls this right before synthesis to get the full footnote list
 * that must appear in the final deliverable. Returns numbered citations
 * grouped by kind + truncated excerpts.
 */

import { registerTool } from "./index";
import { getCitations } from "./citationStore";

registerTool({
  name: "citation_bundler",
  description:
    "Return the list of all web/video sources that have been fetched during this session (via web_fetch, web_search, site_crawl, youtube_fetch). Use this right before writing your final deliverable so every cited fact has a footnote with URL + fetched-at timestamp. If this returns empty, you MUST say so and avoid citing any specific quotes.",
  parameters: {
    type: "object",
    properties: {
      format: {
        type: "string",
        enum: ["numbered", "markdown", "json"],
        description: "Output format. Default 'numbered'.",
      },
    },
  },
  async execute(args, ctx) {
    if (!ctx.sessionId) {
      return "[tool_error] no session context — citation bundle unavailable";
    }
    const citations = getCitations(ctx.sessionId);
    if (citations.length === 0) {
      return "(no citations recorded in this session yet — you have NOT fetched any URLs; do not quote specific website text)";
    }

    const format = String(args.format ?? "numbered");

    if (format === "json") {
      return JSON.stringify(citations, null, 2);
    }

    if (format === "markdown") {
      return citations
        .map((c, i) =>
          `${i + 1}. [${c.title ?? c.url}](${c.url}) — _${c.kind}_ · ${c.fetchedAt}\n   > ${(c.excerpt ?? "").slice(0, 180)}`,
        )
        .join("\n\n");
    }

    // default: numbered plaintext
    const lines = [`Citation bundle — ${citations.length} source(s)`, ""];
    citations.forEach((c, i) => {
      lines.push(
        `[${i + 1}] ${c.title ?? "(no title)"}`,
        `    URL: ${c.url}`,
        `    Kind: ${c.kind}  ·  Fetched: ${c.fetchedAt}`,
        c.excerpt ? `    Excerpt: ${c.excerpt.slice(0, 240)}` : "",
        "",
      );
    });
    return lines.filter(l => l !== undefined).join("\n");
  },
});
