/**
 * boardroom_pdf tool — generate a consultancy-grade PDF deliverable.
 *
 * The LLM provides structured content (title, executive_summary, sections[],
 * recommendations[]). We render a templated PDF with:
 *   - Cover page (brand name, squad methodology, date)
 *   - Executive summary (callout card)
 *   - Numbered sections with headings
 *   - Recommendations (bullet list)
 *   - Appendix: full citation list (auto-pulled from citationStore)
 *
 * Returns a markdown link to the saved PDF + a one-paragraph summary so
 * the LLM can confirm back to the user. PDFs are saved to disk under
 * <APP_ROOT>/storage/boardroom-exports/{sessionId}/{slug}-{timestamp}.pdf
 * and served via /static/boardroom-exports/... (assumes express.static wire-up).
 */

import { registerTool } from "./index";
import { getCitations } from "./citationStore";
import { getTheme } from "./themeApply";
import PDFDocument from "pdfkit";
import * as fs from "node:fs";
import * as path from "node:path";

const EXPORT_ROOT = process.env.BOARDROOM_EXPORT_DIR
  ?? path.resolve(process.cwd(), "storage", "boardroom-exports");
const PUBLIC_URL_PREFIX = process.env.BOARDROOM_EXPORT_URL_PREFIX ?? "/static/boardroom-exports";

function slugify(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "deliverable";
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

registerTool({
  name: "boardroom_pdf",
  description:
    "Render a boardroom-grade PDF deliverable from structured content you provide. Call this as your FINAL step when the user has asked for a report/deliverable — after citation_bundler. Returns a downloadable URL. Every specific quote or statistic in the sections MUST correspond to a numbered citation from citation_bundler (cite as [1], [2], etc in your text).",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Document title (e.g. 'Brand Archetype Positioning — Acme Co').",
      },
      subtitle: {
        type: "string",
        description: "Optional subtitle (e.g. methodology name or engagement type).",
      },
      brandName: {
        type: "string",
        description: "Brand name for the cover page.",
      },
      executiveSummary: {
        type: "string",
        description: "150-300 word executive summary shown right after the cover.",
      },
      sections: {
        type: "array",
        description:
          "Main body sections in order. Each has a heading and markdown-style body (plain text paragraphs separated by blank lines, '-' for bullets).",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string" },
          },
          required: ["heading", "body"],
        },
      },
      recommendations: {
        type: "array",
        description: "Numbered recommendations. Each a single-sentence imperative.",
        items: { type: "string" },
      },
    },
    required: ["title", "brandName", "executiveSummary", "sections"],
  },
  async execute(args, ctx) {
    const title = String(args.title ?? "").trim();
    const subtitle = String(args.subtitle ?? "").trim();
    const brandName = String(args.brandName ?? "").trim() || (ctx.brand?.name ?? "Unnamed Brand");
    const executiveSummary = String(args.executiveSummary ?? "").trim();
    const sections: Array<{ heading: string; body: string }> =
      Array.isArray(args.sections) ? args.sections : [];
    const recommendations: string[] =
      Array.isArray(args.recommendations) ? args.recommendations.map(String) : [];

    if (!title || !executiveSummary || sections.length === 0) {
      return "[tool_error] title, executiveSummary, and at least 1 section are required";
    }

    const theme = getTheme(ctx.brand?.id);
    const citations = ctx.sessionId ? getCitations(ctx.sessionId) : [];

    // ── File paths ──
    const sessionDir = ctx.sessionId ? ctx.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_") : "anon";
    const exportDir = path.join(EXPORT_ROOT, sessionDir);
    ensureDir(exportDir);
    const filename = `${slugify(title)}-${Date.now()}.pdf`;
    const absPath = path.join(exportDir, filename);
    const publicUrl = `${PUBLIC_URL_PREFIX}/${sessionDir}/${encodeURIComponent(filename)}`;

    // ── Render PDF ──
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 64, bottom: 64, left: 64, right: 64 },
        info: {
          Title: title,
          Author: "SoWork Marketing OS",
          Subject: subtitle || "Boardroom Deliverable",
        },
      });
      const out = fs.createWriteStream(absPath);
      doc.pipe(out);
      out.on("finish", () => resolve());
      out.on("error", reject);

      const { colors, fonts } = theme;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // ── Cover ──
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(colors.background);
      doc.fillColor(colors.accent).rect(0, 0, 6, doc.page.height).fill();
      doc
        .fillColor(colors.textMuted)
        .font(fonts.body)
        .fontSize(10)
        .text(theme.footerText, 64, 60);
      doc
        .fillColor(colors.primary)
        .font(fonts.heading)
        .fontSize(30)
        .text(title, 64, 200, { width: pageWidth });
      if (subtitle) {
        doc
          .fillColor(colors.textMuted)
          .font(fonts.body)
          .fontSize(14)
          .text(subtitle, { width: pageWidth });
      }
      doc.moveDown(2);
      doc
        .fillColor(colors.accent)
        .font(fonts.heading)
        .fontSize(16)
        .text(brandName, { width: pageWidth });
      doc
        .fillColor(colors.textMuted)
        .font(fonts.body)
        .fontSize(11)
        .text(new Date().toISOString().slice(0, 10), { width: pageWidth });

      // ── Executive summary ──
      doc.addPage();
      sectionHeader(doc, theme, "Executive Summary");
      doc
        .fillColor(colors.text)
        .font(fonts.body)
        .fontSize(11)
        .text(executiveSummary, { width: pageWidth, lineGap: 3, align: "justify" });

      // ── Sections ──
      for (let i = 0; i < sections.length; i++) {
        const s = sections[i]!;
        doc.addPage();
        sectionHeader(doc, theme, `${i + 1}. ${s.heading}`);
        renderMarkdownLite(doc, theme, s.body, pageWidth);
      }

      // ── Recommendations ──
      if (recommendations.length > 0) {
        doc.addPage();
        sectionHeader(doc, theme, "Recommendations");
        doc.font(fonts.body).fontSize(11).fillColor(colors.text);
        recommendations.forEach((r, i) => {
          doc
            .font(fonts.heading)
            .fillColor(colors.accent)
            .text(`${i + 1}.  `, { continued: true })
            .font(fonts.body)
            .fillColor(colors.text)
            .text(r, { width: pageWidth });
          doc.moveDown(0.6);
        });
      }

      // ── Citations ──
      doc.addPage();
      sectionHeader(doc, theme, "Appendix — Sources");
      if (citations.length === 0) {
        doc
          .fillColor(colors.textMuted)
          .font(fonts.body)
          .fontSize(10)
          .text(
            "No external sources were fetched during this session. All findings above are synthesis-only and should be validated against primary sources before board presentation.",
            { width: pageWidth, lineGap: 2 },
          );
      } else {
        doc.font(fonts.body).fontSize(9).fillColor(colors.text);
        citations.forEach((c, i) => {
          doc
            .font(fonts.heading).fillColor(colors.accent)
            .text(`[${i + 1}] `, { continued: true })
            .font(fonts.body).fillColor(colors.text)
            .text(c.title ?? "(no title)", { width: pageWidth });
          doc
            .fillColor(colors.textMuted)
            .fontSize(8)
            .text(`${c.url}`, { width: pageWidth, link: c.url, underline: true });
          doc
            .text(
              `${c.kind}  ·  fetched ${c.fetchedAt}${c.excerpt ? `  ·  "${c.excerpt.slice(0, 160)}..."` : ""}`,
              { width: pageWidth },
            );
          doc.fontSize(9).fillColor(colors.text).moveDown(0.5);
        });
      }

      // ── Footer stamping on every page ──
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc
          .fillColor(colors.textMuted)
          .font(fonts.body)
          .fontSize(8)
          .text(
            `${theme.footerText}  ·  ${brandName}  ·  p. ${i - range.start + 1} / ${range.count}`,
            64,
            doc.page.height - 40,
            { width: pageWidth, align: "center" },
          );
      }

      doc.end();
    });

    const stat = fs.statSync(absPath);
    return [
      `Boardroom PDF generated.`,
      ``,
      `- File: ${publicUrl}`,
      `- Size: ${(stat.size / 1024).toFixed(1)} KB`,
      `- Sections: ${sections.length}`,
      `- Recommendations: ${recommendations.length}`,
      `- Citations in appendix: ${citations.length}`,
      ``,
      `Tell the user: "Your boardroom PDF is ready — open it here: ${publicUrl}"`,
    ].join("\n");
  },
});

function sectionHeader(doc: PDFKit.PDFDocument, theme: ReturnType<typeof getTheme>, text: string) {
  const { colors, fonts } = theme;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc
    .fillColor(colors.primary)
    .font(fonts.heading)
    .fontSize(18)
    .text(text, { width: pageWidth });
  doc
    .moveTo(doc.page.margins.left, doc.y + 4)
    .lineTo(doc.page.margins.left + 48, doc.y + 4)
    .lineWidth(2)
    .strokeColor(colors.accent)
    .stroke();
  doc.moveDown(1);
}

/** Very small markdown subset: "-" bullets, blank-line paragraphs. */
function renderMarkdownLite(
  doc: PDFKit.PDFDocument,
  theme: ReturnType<typeof getTheme>,
  body: string,
  pageWidth: number,
) {
  const { colors, fonts } = theme;
  const paras = body.split(/\n\s*\n/);
  doc.font(fonts.body).fontSize(11).fillColor(colors.text);
  for (const p of paras) {
    const lines = p.split("\n");
    const isBulletBlock = lines.every(l => l.trim().startsWith("-") || l.trim().startsWith("•"));
    if (isBulletBlock) {
      for (const l of lines) {
        const text = l.replace(/^\s*[-•]\s*/, "").trim();
        if (!text) continue;
        doc
          .fillColor(colors.accent).text("•  ", { continued: true })
          .fillColor(colors.text).text(text, { width: pageWidth });
        doc.moveDown(0.3);
      }
    } else {
      doc.text(p.trim(), { width: pageWidth, lineGap: 3, align: "justify" });
    }
    doc.moveDown(0.6);
  }
}
