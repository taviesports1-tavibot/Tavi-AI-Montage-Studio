import { stat } from "node:fs/promises";
import path from "node:path";
import type { MediaMetadata } from "../../lib/contracts";
import { config } from "./config";
import { StudioError } from "./errors";
import { runProcess } from "./process";

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov"]);
const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "application/octet-stream",
]);
const MUSIC_EXTENSIONS = new Set([".mp3", ".m4a", ".wav", ".aac", ".mp4"]);
const MUSIC_MIME_PREFIXES = [
  "audio/",
  "video/mp4",
  "application/octet-stream",
];
const SUPPORTED_VIDEO_CODECS = new Set([
  "h264",
  "hevc",
  "mpeg4",
  "prores",
  "vp8",
  "vp9",
  "av1",
]);

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
}

interface ProbeOutput {
  streams?: ProbeStream[];
  format?: {
    duration?: string;
    size?: string;
  };
}

function parseFps(value: string | undefined) {
  if (!value) return 0;
  if (!value.includes("/")) return Number.parseFloat(value) || 0;
  const [numerator, denominator] = value.split("/").map(Number);
  return denominator ? numerator / denominator : 0;
}

export function validateVideoUpload(filename: string, mimeType: string) {
  const extension = path.extname(filename).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(extension) || !VIDEO_MIME_TYPES.has(mimeType)) {
    throw new StudioError(
      "UNSUPPORTED_VIDEO_TYPE",
      "Підтримуються лише відеофайли MP4 та MOV.",
      415,
    );
  }
  return extension;
}

export function validateMusicUpload(filename: string, mimeType: string) {
  const extension = path.extname(filename).toLowerCase();
  if (
    !MUSIC_EXTENSIONS.has(extension) ||
    !MUSIC_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))
  ) {
    throw new StudioError(
      "UNSUPPORTED_MUSIC_TYPE",
      "Музика повинна бути у форматі MP3, M4A, WAV, AAC або MP4.",
      415,
    );
  }
  return extension;
}

export async function probeMedia(filePath: string): Promise<MediaMetadata> {
  let result;
  try {
    result = await runProcess(
      config.ffprobePath,
      [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        filePath,
      ],
      { timeoutMs: 30_000 },
    );
  } catch (error) {
    throw new StudioError(
      "CORRUPT_MEDIA",
      "Файл пошкоджений або не читається як відео.",
      422,
      error instanceof Error ? error.message : String(error),
    );
  }

  let parsed: ProbeOutput;
  try {
    parsed = JSON.parse(result.stdout) as ProbeOutput;
  } catch {
    throw new StudioError(
      "INVALID_MEDIA_METADATA",
      "Не вдалося прочитати метадані відео.",
      422,
    );
  }

  const video = parsed.streams?.find(
    (stream) => stream.codec_type === "video",
  );
  const audio = parsed.streams?.find(
    (stream) => stream.codec_type === "audio",
  );
  const duration = Number.parseFloat(parsed.format?.duration ?? "0");
  const fileDetails = await stat(filePath);
  const size = Number.parseInt(parsed.format?.size ?? "", 10) || fileDetails.size;

  if (!video || !video.codec_name || !duration || duration <= 0) {
    throw new StudioError(
      "NO_VIDEO_STREAM",
      "У файлі не знайдено коректного відеопотоку.",
      422,
    );
  }

  if (!SUPPORTED_VIDEO_CODECS.has(video.codec_name)) {
    throw new StudioError(
      "UNSUPPORTED_CODEC",
      `Відеокодек ${video.codec_name} поки не підтримується.`,
      415,
      { codec: video.codec_name },
    );
  }

  if (duration > config.maxClipDuration) {
    throw new StudioError(
      "CLIP_TOO_LONG",
      `Один кліп може тривати максимум ${config.maxClipDuration} секунд.`,
      413,
    );
  }

  return {
    duration,
    width: video.width ?? 0,
    height: video.height ?? 0,
    fps:
      parseFps(video.avg_frame_rate) ||
      parseFps(video.r_frame_rate) ||
      config.renderFps,
    size,
    videoCodec: video.codec_name,
    audioCodec: audio?.codec_name ?? null,
    hasAudio: Boolean(audio),
  };
}

export async function probeAudioDuration(filePath: string) {
  try {
    const result = await runProcess(
      config.ffprobePath,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { timeoutMs: 30_000 },
    );
    const duration = Number.parseFloat(result.stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("invalid duration");
    }
    return duration;
  } catch (error) {
    throw new StudioError(
      "CORRUPT_MUSIC",
      "Музичний файл пошкоджений або не містить аудіо.",
      422,
      error instanceof Error ? error.message : String(error),
    );
  }
}
