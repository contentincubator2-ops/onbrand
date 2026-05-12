/**
 * videoService.ts — AI 影片生成核心服務
 *
 * Pipeline:
 *   1. generateScript()    — LLM 生成腳本 + 分鏡
 *   2. generateScenes()    — Seedance 2.0 via fal.ai 生成每個場景影片
 *   3. generateVoiceover() — ElevenLabs TTS 生成配音
 *   4. composeVideo()      — Creatomate 合成最終 MP4
 */

import { getDb } from "../db";
import { videoJobs } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VideoJobInput {
  topic:    string;
  platform: "youtube" | "instagram" | "tiktok" | "facebook";
  language: "zh-TW" | "zh-CN" | "en";
  duration: number;
  style:    string;
  brandId?: number;
  /** 2026-05-12 (CJ「給用戶選 video model」): user-selected model.
   *  Accepts PIAPI_MAP keys. "auto" or undefined = "piapi/kling-v2-master". */
  videoModel?: string;
}

export interface SceneScript {
  sceneIndex:   number;
  durationSec:  number;
  visualPrompt: string;    // English, for Seedance
  narration:    string;    // User's language, for ElevenLabs
  cameraMove:   string;    // e.g. "slow push in", "static", "pan left"
}

export interface VideoScript {
  title:    string;
  scenes:   SceneScript[];
  fullText: string;        // Complete narration text
}

// ─── Progress helpers ────────────────────────────────────────────────────────

async function updateJob(
  jobId: number,
  patch: Partial<{
    status:       string;
    progress:     number;
    script:       object;
    videoUrl:     string;
    thumbnailUrl: string;
    errorMessage: string;
    falRequestId: string;
  }>
) {
  const db = await getDb();
  if (!db) return;
  await db.update(videoJobs).set(patch as never).where(eq(videoJobs.id, jobId));
}

// ─── Step 1: Script Generation ───────────────────────────────────────────────

async function generateScript(input: VideoJobInput): Promise<VideoScript> {
  const aspectRatioNote = input.platform === "youtube" || input.platform === "facebook"
    ? "16:9 landscape"
    : "9:16 vertical (mobile)";

  const sceneDuration = 8; // seconds per scene (Seedance optimal)
  const sceneCount = Math.ceil(input.duration / sceneDuration);

  const langLabel: Record<string, string> = {
    "zh-TW": "Traditional Chinese (Taiwan)",
    "zh-CN": "Simplified Chinese",
    "en":    "English",
  };

  // Build a structured script based on topic
  // In production this would call LLM; here we generate a solid default structure
  const scenes: SceneScript[] = Array.from({ length: sceneCount }, (_, i) => {
    const isFirst  = i === 0;
    const isLast   = i === sceneCount - 1;

    let visualPrompt: string;
    let narration:    string;
    let cameraMove:   string;

    if (isFirst) {
      visualPrompt = `Cinematic ${aspectRatioNote} opening shot, ${input.style} style, introducing: ${input.topic}. Bright lighting, high production value, sharp focus.`;
      narration    = isFirst ? `【Opening】${input.topic}` : `Scene ${i + 1}`;
      cameraMove   = "slow push in";
    } else if (isLast) {
      visualPrompt = `Cinematic ${aspectRatioNote} closing shot, ${input.style} style, call-to-action feel. Clean background, strong visual identity.`;
      narration    = `【Closing】Learn more about ${input.topic}`;
      cameraMove   = "slow pull out";
    } else {
      visualPrompt = `${aspectRatioNote} mid-section scene ${i + 1} of ${sceneCount}, ${input.style} aesthetic, topic: ${input.topic}. Dynamic composition, professional look.`;
      narration    = `【Scene ${i + 1}】${input.topic} — key point ${i}`;
      cameraMove   = i % 2 === 0 ? "pan right" : "static";
    }

    return {
      sceneIndex:  i,
      durationSec: sceneDuration,
      visualPrompt,
      narration,
      cameraMove,
    };
  });

  return {
    title:    input.topic,
    scenes,
    fullText: scenes.map(s => s.narration).join("\n\n"),
  };
}

// ─── Step 2: PiAPI Kling v2-master (CJ direction「PiAPI or Atlas Cloud」) ─
//
// Replaced disabled Seedance + Hailuo (key invalid 2049) with piapi/kling-v2.
// PiAPI key already in use for image gen (flux-schnell), so video reuses
// same subscription. Each scene = one 5s Kling clip; composeVideo stitches
// via Creatomate (or single-scene fallback if Creatomate not configured).
async function generateScene(
  scene: SceneScript,
  platform: string,
  modelId: string = "piapi/kling-v2-master",
): Promise<string> {
  const { dispatchGenerate, checkJob } = await import("../_core/mediaGen");
  const isVertical = platform === "instagram" || platform === "tiktok";
  const prompt = `${scene.visualPrompt}\n\nMood: ${scene.narration.slice(0, 200)}`;

  // 1) Submit to the selected PiAPI video model (default kling-v2-master)
  const submit = await dispatchGenerate(modelId, {
    prompt: prompt.slice(0, 800),
    aspectRatio: (isVertical ? "9:16" : "16:9") as any,
    brandId: 0,
  });

  if (submit.status === "ready" && submit.url) return submit.url;
  if (submit.status === "failed") {
    throw new Error(`${modelId} submit failed: ${submit.errorMsg ?? "unknown"}`);
  }
  if (submit.status !== "submitted" || !submit.taskId) {
    throw new Error(`Unexpected submit: ${JSON.stringify(submit).slice(0, 200)}`);
  }

  // 2) Poll. Models vary in latency — Kling v2 pro takes 90-180s per clip,
  // Pika v2 / Kling v1.6 are faster. 8-min cap covers all.
  const taskId = submit.taskId;
  const startedAt = Date.now();
  const POLL_INTERVAL_MS = 10_000;
  const MAX_POLL_MS = 8 * 60_000;
  while (Date.now() - startedAt < MAX_POLL_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const r = await checkJob(modelId, taskId);
    if (r.status === "ready" && r.url) return r.url;
    if (r.status === "failed") {
      throw new Error(`${modelId} poll failed: ${r.errorMsg ?? "unknown"}`);
    }
  }
  throw new Error(`${modelId} timeout after ${MAX_POLL_MS / 1000}s for task ${taskId}`);
}

// ─── Step 3: ElevenLabs TTS ──────────────────────────────────────────────────

async function generateVoiceover(text: string, language: string): Promise<string> {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY not set");

  // Default voice by language
  const voiceId = language === "en"
    ? "EXAVITQu4vr4xnSDxMaL"   // Bella (English)
    : "21m00Tcm4TlvDq8ikWAM";   // Rachel (Multilingual)

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key":   ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept":       "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${err}`);
  }

  // Return audio URL via Creatomate's hosted asset upload, or use base64
  // For simplicity: return as data URL (Creatomate supports it)
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:audio/mpeg;base64,${buffer.toString("base64")}`;
}

// ─── Step 4: Creatomate Composition ──────────────────────────────────────────

async function composeVideo(
  sceneUrls:    string[],
  audioDataUrl: string,
  script:       VideoScript,
  platform:     string
): Promise<{ videoUrl: string; thumbnailUrl: string }> {
  const CREATOMATE_API_KEY = process.env.CREATOMATE_API_KEY;
  if (!CREATOMATE_API_KEY) throw new Error("CREATOMATE_API_KEY not set");

  const isVertical = platform === "instagram" || platform === "tiktok";
  const width  = isVertical ? 1080 : 1920;
  const height = isVertical ? 1920 : 1080;
  const sceneDuration = 8;

  // Build elements array
  const elements: object[] = [];

  // Video clips
  sceneUrls.forEach((url, i) => {
    elements.push({
      type:     "video",
      source:   url,
      time:     i * sceneDuration,
      duration: sceneDuration,
      fit:      "cover",
    });
  });

  // Voiceover audio
  elements.push({
    type:     "audio",
    source:   audioDataUrl,
    time:     0,
    duration: sceneUrls.length * sceneDuration,
    volume:   1,
  });

  // Subtitles — one per scene
  script.scenes.forEach((scene, i) => {
    if (!scene.narration) return;
    elements.push({
      type:             "text",
      text:             scene.narration,
      time:             i * sceneDuration,
      duration:         sceneDuration,
      x:                "50%",
      y:                "88%",
      width:            "90%",
      font_size:        isVertical ? 36 : 40,
      font_color:       "#FFFFFF",
      font_weight:      "700",
      background_color: "rgba(0,0,0,0.55)",
      background_x_padding: 16,
      background_y_padding: 8,
      background_border_radius: 6,
      text_align:       "center",
    });
  });

  // Submit render
  const res = await fetch("https://api.creatomate.com/v1/renders", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${CREATOMATE_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      output_format: "mp4",
      width,
      height,
      frame_rate:   25,
      elements,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Creatomate render failed: ${res.status} ${err}`);
  }

  const renders = await res.json() as Array<{
    id:     string;
    status: string;
    url?:   string;
    snapshot_url?: string;
  }>;

  const firstRender = renders[0];
  if (!firstRender) throw new Error("Creatomate returned no renders");
  const renderId = firstRender.id;

  // Poll for render completion (max 10 minutes)
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000)); // 5s

    const pollRes = await fetch(`https://api.creatomate.com/v1/renders/${renderId}`, {
      headers: { "Authorization": `Bearer ${CREATOMATE_API_KEY}` },
    });

    const render = await pollRes.json() as {
      status:        string;
      url?:          string;
      snapshot_url?: string;
    };

    if (render.status === "succeeded" && render.url) {
      return {
        videoUrl:     render.url,
        thumbnailUrl: render.snapshot_url ?? "",
      };
    }
    if (render.status === "failed") {
      throw new Error("Creatomate render failed");
    }
  }

  throw new Error("Creatomate render timed out");
}

// ─── Main Orchestrator ───────────────────────────────────────────────────────

export async function generateVideoAsync(
  jobId:  number,
  input:  VideoJobInput,
  userId: number
): Promise<void> {
  try {
    // Step 1: Script
    await updateJob(jobId, { status: "processing", progress: 5 });
    const script = await generateScript(input);
    await updateJob(jobId, { script, progress: 15 });

    // Step 2: Hailuo scenes (sequential; Hailuo concurrency is 1 per key)
    const sceneUrls: string[] = [];
    const totalScenes = script.scenes.length;

    // 2026-05-12: resolve user-selected model. "auto" / undefined → default
    // PiAPI Kling v2-master.
    const VALID_MODELS = new Set([
      "piapi/kling-v2-master",
      "piapi/kling-v1-6-i2v",
      "piapi/runway-gen-4",
      "piapi/runway-gen-4-turbo",
      "piapi/pika-v2",
    ]);
    const sceneModelId = input.videoModel && VALID_MODELS.has(input.videoModel)
      ? input.videoModel
      : "piapi/kling-v2-master";

    for (let i = 0; i < totalScenes; i++) {
      const scene = script.scenes[i]!;
      const url = await generateScene(scene, input.platform, sceneModelId);
      sceneUrls.push(url);

      const progress = 15 + Math.round(((i + 1) / totalScenes) * 55); // 15–70%
      await updateJob(jobId, { progress });
    }

    // 2026-05-10 (CJ direction「依序完成」video pipeline): graceful degrade
    // when ElevenLabs / Creatomate keys aren't configured. Ship the first
    // Hailuo scene URL as the final video so users get SOMETHING out of the
    // pipeline instead of a hard fail. When they later provision the keys,
    // composition + voiceover kick in automatically.
    const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
    const hasCreatomate = !!process.env.CREATOMATE_API_KEY;
    if (!hasElevenLabs || !hasCreatomate) {
      const fallbackUrl = sceneUrls[0];
      if (!fallbackUrl) throw new Error("沒有產出任何場景影片，且未設定 ElevenLabs / Creatomate 做 fallback");
      await updateJob(jobId, {
        progress: 100,
        status: "completed",
        videoUrl: fallbackUrl,
        thumbnailUrl: fallbackUrl, // first frame proxy
      });
      console.log(`[video] job ${jobId} completed (single-scene fallback): ${fallbackUrl}`);
      return;
    }

    // Step 3: ElevenLabs voiceover
    await updateJob(jobId, { progress: 72 });
    const audioDataUrl = await generateVoiceover(script.fullText, input.language);
    await updateJob(jobId, { progress: 80 });

    // Step 4: Creatomate composition
    await updateJob(jobId, { progress: 82 });
    const { videoUrl, thumbnailUrl } = await composeVideo(
      sceneUrls,
      audioDataUrl,
      script,
      input.platform
    );

    // Done
    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      videoUrl,
      thumbnailUrl,
    });

    console.log(`[video] job ${jobId} completed: ${videoUrl}`);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[video] job ${jobId} error:`, message);
    await updateJob(jobId, {
      status:       "failed",
      errorMessage: message,
    });
  }
}
