import type { MusicAnalysis, MusicBeat } from "../../../lib/contracts";
import { probeAudioDuration } from "../media";
import type { StorageProvider } from "../storage/storage-provider";
import { detectAudioEnergy } from "./ffmpeg-signals";
import { percentile, robustNormalize } from "./series";

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

export async function analyzeMusic(
  projectId: string,
  storedName: string,
  storage: StorageProvider,
): Promise<MusicAnalysis> {
  const filePath = storage.getUploadPath(projectId, storedName);
  const duration = await probeAudioDuration(filePath);
  const normalized = robustNormalize(
    await detectAudioEnergy(projectId, "music", filePath),
  );
  const threshold = Math.max(
    0.58,
    percentile(
      normalized.map((sample) => sample.value),
      0.72,
    ),
  );
  const beats: MusicBeat[] = [];

  for (let index = 1; index < normalized.length - 1; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    const next = normalized[index + 1];
    if (
      current.value < threshold ||
      current.value < previous.value ||
      current.value < next.value
    ) {
      continue;
    }

    const lastBeat = beats.at(-1);
    if (lastBeat && current.time - lastBeat.time < 0.28) {
      if (current.value > lastBeat.strength) {
        beats[beats.length - 1] = {
          time: round(current.time),
          strength: round(current.value),
          kind: current.value > 0.86 ? "drop" : "beat",
        };
      }
      continue;
    }

    beats.push({
      time: round(current.time),
      strength: round(current.value),
      kind: current.value > 0.86 ? "drop" : "beat",
    });
  }

  return { duration: round(duration), beats };
}
