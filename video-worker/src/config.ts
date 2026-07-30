import path from "node:path";

const projectRoot = process.cwd();

function positiveInteger(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  host: process.env.WORKER_HOST ?? "0.0.0.0",
  port: positiveInteger("WORKER_PORT", positiveInteger("PORT", 8788)),
  storageRoot: path.resolve(
    process.env.STORAGE_ROOT ?? path.join(projectRoot, ".studio-data"),
  ),
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
  maxClips: positiveInteger("MAX_CLIPS", 10),
  maxClipBytes: positiveInteger("MAX_CLIP_MB", 250) * 1024 * 1024,
  maxMusicBytes: positiveInteger("MAX_MUSIC_MB", 40) * 1024 * 1024,
  maxClipDuration: positiveInteger("MAX_CLIP_DURATION_SECONDS", 180),
  maxQueueDepth: positiveInteger("MAX_QUEUE_DEPTH", 3),
  globalRateLimitMax: positiveInteger("RATE_LIMIT_MAX_PER_15_MINUTES", 1_200),
  uploadRateLimitMax: positiveInteger("UPLOAD_RATE_LIMIT_PER_HOUR", 10),
  rerenderRateLimitMax: positiveInteger("RERENDER_RATE_LIMIT_PER_HOUR", 20),
  ttlHours: positiveInteger("TEMP_FILE_TTL_HOURS", 24),
  renderWidth: positiveInteger("RENDER_WIDTH", 1080),
  renderHeight: positiveInteger("RENDER_HEIGHT", 1920),
  renderFps: positiveInteger("RENDER_FPS", 30),
  x264Preset: process.env.X264_PRESET ?? "veryfast",
  x264Crf: positiveInteger("X264_CRF", 20),
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS ??
    "http://localhost:3000,http://localhost:4173,http://terminal.local:4173"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};
