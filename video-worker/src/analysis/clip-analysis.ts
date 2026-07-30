import type {
  AnalysisSample,
  ClipAnalysis,
  HighlightCandidate,
  StoredClip,
} from "../../../lib/contracts";
import type { StorageProvider } from "../storage/storage-provider";
import {
  detectAudioEnergy,
  detectMotion,
  detectScenes,
} from "./ffmpeg-signals";
import { robustNormalize, valueNear } from "./series";

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function candidateReasons(sample: AnalysisSample) {
  const reasons: string[] = [];
  if (sample.motion >= 0.68) reasons.push("висока рухливість у кадрі");
  if (sample.audio >= 0.68) reasons.push("помітний сплеск ігрового звуку");
  if (sample.scene >= 0.45) reasons.push("різка візуальна зміна");
  if (!reasons.length) reasons.push("стабільно активна ділянка");
  return reasons;
}

function createCandidates(
  samples: AnalysisSample[],
  duration: number,
): HighlightCandidate[] {
  const ranked = [...samples]
    .filter((sample) => sample.time < duration - 0.15)
    .sort((a, b) => b.activity - a.activity);
  const candidates: HighlightCandidate[] = [];

  for (const sample of ranked) {
    const segmentDuration =
      sample.activity > 0.78 ? 2.2 : sample.activity > 0.55 ? 2.7 : 3.2;
    const start = Math.max(0, sample.time - segmentDuration * 0.42);
    const end = Math.min(duration, start + segmentDuration);
    const overlaps = candidates.some(
      (candidate) =>
        Math.max(candidate.start, start) <
        Math.min(candidate.end, end) - 0.35,
    );
    if (overlaps || end - start < 0.8) continue;

    candidates.push({
      start: round(start),
      end: round(end),
      score: round(sample.activity),
      motionScore: round(sample.motion),
      audioScore: round(sample.audio),
      sceneScore: round(sample.scene),
      reasons: candidateReasons(sample),
    });
    if (candidates.length >= 12) break;
  }

  if (!candidates.length) {
    const fallbackDuration = Math.min(3, duration);
    candidates.push({
      start: 0,
      end: round(fallbackDuration),
      score: 0.2,
      motionScore: 0,
      audioScore: 0,
      sceneScore: 0,
      reasons: ["безпечний початковий фрагмент через низьку активність"],
    });
  }

  return candidates.sort((a, b) => a.start - b.start);
}

export async function analyzeClip(
  projectId: string,
  clip: StoredClip,
  storage: StorageProvider,
): Promise<ClipAnalysis> {
  const filePath = storage.getUploadPath(projectId, clip.storedName);
  const [motionRaw, sceneRaw, audioRaw] = await Promise.all([
    detectMotion(projectId, clip.id, filePath),
    detectScenes(projectId, clip.id, filePath),
    clip.metadata.hasAudio
      ? detectAudioEnergy(projectId, clip.id, filePath)
      : Promise.resolve([]),
  ]);

  const motion = robustNormalize(motionRaw);
  const scene = robustNormalize(sceneRaw);
  const audio = robustNormalize(audioRaw);
  const sampleCount = Math.max(1, Math.ceil(clip.metadata.duration * 2));
  const samples: AnalysisSample[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const time = Math.min(clip.metadata.duration, index * 0.5);
    const motionScore = valueNear(motion, time);
    const audioScore = valueNear(audio, time);
    const sceneScore = valueNear(scene, time, 0.75);
    const activity =
      motionScore * 0.55 + audioScore * 0.28 + sceneScore * 0.17;
    samples.push({
      time: round(time),
      motion: round(motionScore),
      audio: round(audioScore),
      scene: round(sceneScore),
      activity: round(activity),
    });
  }

  return {
    clipId: clip.id,
    duration: round(clip.metadata.duration),
    samples,
    candidates: createCandidates(samples, clip.metadata.duration),
  };
}
