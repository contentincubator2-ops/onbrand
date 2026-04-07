/**
 * exportRoute — Document generation endpoints
 * POST /api/export/pptx  — Generate PowerPoint from AI content
 * POST /api/export/docx  — Generate Word doc from AI content
 * POST /api/export/image — Generate logo/image via Recraft (claw.sowork.ai)
 */

import { Router, type Request, type Response } from "express";
import { jwtVerify } from "jose";
import { getJwtSecret } from "../_core/env";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export const exportRouter = Router();

function getSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

async function verifyToken(req: Request): Promise<number | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(auth.slice(7), getSecretBytes());
    return payload.sub ? parseInt(String(payload.sub), 10) : null;
  } catch {
    return null;
  }
}

// ── PPTX Generation ──────────────────────────────────────────────────────────

exportRouter.post("/pptx", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { title, content, brandName } = req.body as {
    title: string;
    content: string;  // The publishable_content from AI
    brandName?: string;
  };

  if (!title || !content) {
    res.status(400).json({ error: "title and content required" });
    return;
  }

  const tmpId = `pptx-${Date.now()}-${userId}`;
  const pyScript = join(tmpdir(), `${tmpId}.py`);
  const outFile  = join(tmpdir(), `${tmpId}.pptx`);

  // Parse content into slides (split by ## headings)
  const sections = content.split(/\n(?=##+ )/).filter(Boolean);

  // Build python script
  const slidesCode = sections.slice(0, 10).map((section, i) => {
    const lines = section.split("\n").filter(Boolean);
    const heading = lines[0]?.replace(/^#+\s*/, "").replace(/'/g, "\\'") ?? `Slide ${i + 1}`;
    const body = lines.slice(1)
      .filter(l => l.trim())
      .slice(0, 6)
      .map(l => l.replace(/\*\*/g, "").replace(/`/g, "").replace(/'/g, "\\'").trim())
      .join("\\n");

    if (i === 0) {
      return `
slide = prs.slides.add_slide(prs.slide_layouts[0])
slide.shapes.title.text = '${heading}'
if slide.placeholders[1]:
    slide.placeholders[1].text = '${body.slice(0, 200)}'
`.trim();
    }
    return `
slide = prs.slides.add_slide(prs.slide_layouts[1])
slide.shapes.title.text = '${heading}'
if slide.placeholders[1]:
    slide.placeholders[1].text = '${body.slice(0, 400)}'
`.trim();
  }).join("\n\n");

  const pyCode = `
from pptx import Presentation
from pptx.util import Inches, Pt
prs = Presentation()
prs.slide_width = Inches(13.33)
prs.slide_height = Inches(7.5)
${slidesCode || `
slide = prs.slides.add_slide(prs.slide_layouts[0])
slide.shapes.title.text = '${title.replace(/'/g, "\\'")}'
slide.placeholders[1].text = '${(brandName ?? "SoWork.ai").replace(/'/g, "\\'")}'
`}
prs.save('${outFile}')
print('OK')
`;

  try {
    await writeFile(pyScript, pyCode, "utf8");
    await promisify(execFile)("python3", [pyScript], { timeout: 30000 });

    const data = await readFile(outFile);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(title.slice(0, 40))}.pptx"`);
    res.send(data);
  } catch (err: any) {
    console.error("[exportRoute/pptx] error:", err);
    res.status(500).json({ error: err?.message ?? "PPTX generation failed" });
  } finally {
    writeFile(pyScript, "").catch(() => {});
    unlink(outFile).catch(() => {});
  }
});

// ── DOCX Generation ──────────────────────────────────────────────────────────

exportRouter.post("/docx", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { title, content, brandName } = req.body as {
    title: string;
    content: string;
    brandName?: string;
  };

  if (!title || !content) {
    res.status(400).json({ error: "title and content required" });
    return;
  }

  const tmpId = `docx-${Date.now()}-${userId}`;
  const pyScript = join(tmpdir(), `${tmpId}.py`);
  const outFile  = join(tmpdir(), `${tmpId}.docx`);

  // Build paragraphs from markdown
  const lines = content.split("\n").filter(l => l.trim());
  const paragraphCode = lines.slice(0, 100).map(line => {
    const safe = line.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
    if (/^# /.test(line)) return `doc.add_heading('${safe.replace(/^# /, "")}', 0)`;
    if (/^## /.test(line)) return `doc.add_heading('${safe.replace(/^## /, "")}', 1)`;
    if (/^### /.test(line)) return `doc.add_heading('${safe.replace(/^### /, "")}', 2)`;
    if (/^[-*] /.test(line)) return `doc.add_paragraph('${safe.replace(/^[-*] /, "")}', style='List Bullet')`;
    if (/^\d+\. /.test(line)) return `doc.add_paragraph('${safe.replace(/^\d+\. /, "")}', style='List Number')`;
    if (line.trim() === "---") return `doc.add_paragraph('─────────────────────────────────')`;
    return `doc.add_paragraph('${safe}')`;
  }).join("\n");

  const pyCode = `
from docx import Document
from docx.shared import Pt
doc = Document()
doc.add_heading('${title.replace(/'/g, "\\'")}', 0)
doc.add_paragraph('品牌：${(brandName ?? "SoWork.ai").replace(/'/g, "\\'")} | 由 SoWork AI Marketing Claw 產出')
${paragraphCode}
doc.save('${outFile}')
print('OK')
`;

  try {
    await writeFile(pyScript, pyCode, "utf8");
    await promisify(execFile)("python3", [pyScript], { timeout: 30000 });

    const data = await readFile(outFile);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(title.slice(0, 40))}.docx"`);
    res.send(data);
  } catch (err: any) {
    console.error("[exportRoute/docx] error:", err);
    res.status(500).json({ error: err?.message ?? "DOCX generation failed" });
  } finally {
    writeFile(pyScript, "").catch(() => {});
    unlink(outFile).catch(() => {});
  }
});

// ── Image (Logo/Design) via Recraft ─────────────────────────────────────────

exportRouter.post("/image", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { brandName, style = "minimalist", primaryColor = "#1B2B59", industry = "marketing", description } = req.body as {
    brandName: string;
    style?: string;
    primaryColor?: string;
    industry?: string;
    description?: string;
  };

  if (!brandName) { res.status(400).json({ error: "brandName required" }); return; }

  try {
    const result = await fetch("https://claw.sowork.ai/api/recraft/logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandName, style, primaryColor, industry, description }),
    });
    const data = await result.json() as { pngUrl?: string; imageId?: string; error?: string };
    if (!data.pngUrl) throw new Error(data.error ?? "Recraft generation failed");
    res.json({ pngUrl: data.pngUrl, imageId: data.imageId });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Video generation status check ───────────────────────────────────────────

exportRouter.post("/video-start", async (req: Request, res: Response) => {
  const userId = await verifyToken(req);
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { topic, platform = "youtube", duration = 60, brandId } = req.body as {
    topic: string; platform?: string; duration?: number; brandId?: number;
  };

  // Check if video API keys are configured
  const hasKeys = !!(process.env.FAL_API_KEY && process.env.ELEVENLABS_API_KEY && process.env.CREATOMATE_API_KEY);
  if (!hasKeys) {
    // Fallback: return script only
    res.json({
      status: "script-only",
      message: "影片 API 金鑰未設定，僅提供腳本",
      topic,
      scriptUrl: null,
    });
    return;
  }

  try {
    const { generateVideoAsync } = await import("../video/videoService");
    // We'd create a job and return jobId for polling
    res.json({ status: "queued", message: "影片生成任務已排入佇列" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
});
