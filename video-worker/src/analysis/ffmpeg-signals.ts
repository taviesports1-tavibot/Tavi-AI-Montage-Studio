import { config } from "../config";
import { logEvent } from "../logger";
import { runProcess } from "../process";
import type { TimedValue } from "./series";

function parseMetadataSeries(stderr: string, key: string) {
  const frames: TimedValue[] = [];
  let currentTime: number | null = null;

  for (const line of stderr.split(/\r?\n/)) {
    const timeMatch = line.match(/\bpts_time:([0-9.]+)/);
    if (timeMatch) {
      currentTime = Number.parseFloat(timeMatch[1]);
      continue;
    }

    if (currentTime === null) continue;
    const valueMatch = line.match(
      new RegExp(`${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=(-?[0-9.]+)`),
    );
    if (valueMatch) {
      const value = Number.parseFloat(valueMatch[1]);
      if (Number.isFinite(value)) {
        frames.push({ time: currentTime, value });
      }
    }
  }

  return frames;
}

async function safeSignal(
  projectId: string,
  clipId: string,
  name: string,
  args: string[],
  key: string,
) {
  try {
    const result = await runProcess(config.ffmpegPath, args, {
      timeoutMs: 120_000,
    });
    return parseMetadataSeries(result.stderr, key);
  } catch (error) {
    logEvent("ANALYSIS", `Signal ${name} unavailable; continuing`, {
      projectId,
      clipId,
      detail: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export function detectMotion(
  projectId: string,
  clipId: string,
  filePath: string,
) {
  return safeSignal(
    projectId,
    clipId,
    "motion",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      filePath,
      "-vf",
      "fps=2,scale=160:-2,format=yuv420p,signalstats,metadata=print",
      "-an",
      "-f",
      "null",
      "-",
    ],
    "lavfi.signalstats.YDIF",
  );
}

export function detectScenes(
  projectId: string,
  clipId: string,
  filePath: string,
) {
  return safeSignal(
    projectId,
    clipId,
    "scenes",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      filePath,
      "-vf",
      "select='gt(scene,0.10)',metadata=print",
      "-an",
      "-f",
      "null",
      "-",
    ],
    "lavfi.scene_score",
  );
}

export function detectAudioEnergy(
  projectId: string,
  clipId: string,
  filePath: string,
) {
  return safeSignal(
    projectId,
    clipId,
    "audio",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      filePath,
      "-vn",
      "-af",
      "aresample=8000,asetnsamples=n=4000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
      "-f",
      "null",
      "-",
    ],
    "lavfi.astats.Overall.RMS_level",
  );
}
