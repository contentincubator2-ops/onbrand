/**
 * webFetch tool — single-URL readable text fetch.
 * Wraps the existing fetchReadable() from ../webFetcher for LLM-directed use.
 */

import { registerTool } from "./index";
import { fetchReadable } from "../webFetcher";
import { addCitation } from "./citationStore";

registerTool({
  name: "web_fetch",
  description:
    "Fetch a single web page and return its readable text (max ~8000 chars). Use when the user references a specific URL or you need to verify a claim against a specific page. Returns the page title + body text, or an error description.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Fully-qualified http(s) URL to fetch.",
      },
    },
    required: ["url"],
  },
  async execute(args, ctx) {
    const url = String(args.url ?? "").trim();
    if (!url) return "[tool_error] url is required";

    const res = await fetchReadable(url);
    if (!res.ok) return `[tool_error] fetch failed for ${url}: ${res.error ?? "unknown"}`;

    if (ctx.sessionId) {
      addCitation(ctx.sessionId, {
        kind: "web_fetch",
        url: res.finalUrl ?? url,
        title: res.title,
        fetchedAt: new Date().toISOString(),
        excerpt: (res.text ?? "").slice(0, 300),
      });
    }

    return [
      `URL: ${res.finalUrl ?? url}`,
      res.title ? `Title: ${res.title}` : "",
      "",
      res.text ?? "(empty body)",
    ].filter(Boolean).join("\n");
  },
});
