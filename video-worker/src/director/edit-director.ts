import { randomUUID } from "node:crypto";
import type {
  ClipAnalysis,
  EditPlan,
  EditPlanClip,
  EffectName,
  HighlightCandidate,
  MontageSettings,
  MusicAnalysis,
  ProjectRecord,
  StoredClip,
} from "../../../lib/contracts";
import { effectLimit, STYLE_PROFILES } from "./styles";

interface RankedCandidate {
  clip: StoredClip;
  analysis: ClipAnalysis;
  candidate: HighlightCandidate;
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function rankCandidates(
  project: ProjectRecord,
  analyses: ClipAnalysis[],
): RankedCandidate[] {
  const analysisMap = new Map(
    analyses.map((analysis) => [analysis.clipId, analysis]),
  );
  const ranked: RankedCandidate[] = [];

  for (const clip of [...project.clips].sort((a, b) => a.order - b.order)) {
    const analysis = analysisMap.get(clip.id);
    if (!analysis) continue;
    for (const candidate of analysis.candidates) {
      ranked.push({ clip, analysis, candidate });
    }
  }

  return ranked.sort(
    (a, b) =>
      b.candidate.score - a.candidate.score ||
      a.clip.order - b.clip.order ||
      a.candidate.start - b.candidate.start,
  );
}

function selectBalancedCandidates(
  project: ProjectRecord,
  ranked: RankedCandidate[],
  availableDuration: number,
  settings: MontageSettings,
) {
  const profile = STYLE_PROFILES[settings.style];
  const selected: RankedCandidate[] = [];
  const usedKeys = new Set<string>();
  let estimatedDuration = 0;

  // First pass gives every uploaded clip a chance to contribute its strongest
  // detected moment. Later passes fill the remaining timeline by score.
  for (const clip of [...project.clips].sort((a, b) => a.order - b.order)) {
    const best = ranked.find((item) => item.clip.id === clip.id);
    if (!best) continue;
    selected.push(best);
    usedKeys.add(`${best.clip.id}:${best.candidate.start}`);
    estimatedDuration += Math.min(
      profile.idealSegment,
      best.candidate.end - best.candidate.start,
    );
    if (estimatedDuration >= availableDuration) break;
  }

  for (const item of ranked) {
    if (estimatedDuration >= availableDuration) break;
    const key = `${item.clip.id}:${item.candidate.start}`;
    if (usedKeys.has(key)) continue;
    selected.push(item);
    usedKeys.add(key);
    estimatedDuration += Math.min(
      profile.idealSegment,
      item.candidate.end - item.candidate.start,
    );
  }

  if (profile.hookFirst) {
    selected.sort(
      (a, b) =>
        b.candidate.score - a.candidate.score ||
        a.clip.order - b.clip.order,
    );
  } else {
    selected.sort(
      (a, b) =>
        a.clip.order - b.clip.order ||
        a.candidate.start - b.candidate.start,
    );
  }

  return selected;
}

function chooseEffects(
  settings: MontageSettings,
  score: number,
  index: number,
): EffectName[] {
  const effects: EffectName[] = [];
  const isCinematic = settings.style === "cinematic";
  const isTavi = settings.style === "tavi-esports";

  if (settings.zoom && score >= 0.45) effects.push("zoom");
  if (settings.zoom && score >= 0.76 && !isCinematic) {
    effects.push("punch_zoom");
  }
  if (
    settings.cameraShake &&
    score >= 0.78 &&
    !isCinematic &&
    index % 2 === 0
  ) {
    effects.push("shake");
  }
  if (settings.flash && score >= 0.7 && !isCinematic) {
    effects.push("flash");
  }
  if (settings.slowMotion && score >= 0.86) effects.push("slow_motion");
  if (settings.speedRamp && score >= 0.61 && !isCinematic) {
    effects.push("speed_ramp");
  }
  if (isCinematic) {
    effects.push("fade");
    if (index % 2 === 1) effects.push("blur_transition");
  }
  if (isTavi && score >= 0.62 && index % 3 === 0) effects.push("glitch");
  if (settings.text && score >= 0.66 && index % 2 === 0) {
    effects.push("text_overlay");
  }

  return effects.slice(0, effectLimit(settings.effectIntensity));
}

function playbackRateFor(effects: EffectName[], style: MontageSettings["style"]) {
  if (effects.includes("slow_motion")) {
    return style === "cinematic" ? 0.82 : 0.88;
  }
  if (effects.includes("speed_ramp")) return 1.12;
  if (style === "tiktok-viral") return 1.06;
  return 1;
}

function nearestBeat(
  music: MusicAnalysis | null,
  time: number,
  tolerance: number,
) {
  if (!music?.beats.length) return null;
  let nearest = music.beats[0];
  for (const beat of music.beats) {
    if (Math.abs(beat.time - time) < Math.abs(nearest.time - time)) {
      nearest = beat;
    }
  }
  return Math.abs(nearest.time - time) <= tolerance
    ? round(nearest.time)
    : null;
}

export function createEditPlan(
  project: ProjectRecord,
  analyses: ClipAnalysis[],
  music: MusicAnalysis | null,
): EditPlan {
  const settings = project.settings;
  const profile = STYLE_PROFILES[settings.style];
  const introDuration =
    settings.style === "tavi-esports" && settings.intro
      ? profile.introDuration
      : 0;
  const outroDuration =
    settings.style === "tavi-esports" && settings.outro
      ? profile.outroDuration
      : 0;
  const availableDuration = Math.max(
    1,
    settings.targetDuration - introDuration - outroDuration,
  );
  const ranked = rankCandidates(project, analyses);
  const selected = selectBalancedCandidates(
    project,
    ranked,
    availableDuration,
    settings,
  );
  const clips: EditPlanClip[] = [];
  let timeline = introDuration;

  for (const [index, item] of selected.entries()) {
    const remaining = settings.targetDuration - outroDuration - timeline;
    if (remaining < profile.minSegment) break;
    const rawLength = item.candidate.end - item.candidate.start;
    const desiredOutput = Math.min(
      profile.maxSegment,
      Math.max(profile.minSegment, Math.min(profile.idealSegment, rawLength)),
      remaining,
    );
    const effects = chooseEffects(settings, item.candidate.score, index);
    const playbackRate = playbackRateFor(effects, settings.style);
    const sourceDuration = Math.min(rawLength, desiredOutput * playbackRate);
    let outputDuration = sourceDuration / playbackRate;

    const beat = nearestBeat(music, timeline + outputDuration, 0.23);
    if (
      beat !== null &&
      beat - timeline >= profile.minSegment &&
      beat - timeline <= profile.maxSegment
    ) {
      outputDuration = beat - timeline;
    }

    const sourceEnd = Math.min(
      item.candidate.end,
      item.candidate.start + outputDuration * playbackRate,
    );
    const text = effects.includes("text_overlay")
      ? profile.neutralTexts[index % profile.neutralTexts.length]
      : null;

    clips.push({
      id: randomUUID(),
      sourceClipId: item.clip.id,
      source: item.clip.storedName,
      start: round(item.candidate.start),
      end: round(sourceEnd),
      outputDuration: round((sourceEnd - item.candidate.start) / playbackRate),
      timelineStart: round(timeline),
      importance: item.candidate.score,
      playbackRate,
      effects,
      text,
      syncBeat: beat,
      reasons: [
        ...item.candidate.reasons,
        ...(beat !== null
          ? [`межу фрагмента синхронізовано з музичною точкою ${beat} с`]
          : []),
      ],
    });
    timeline += (sourceEnd - item.candidate.start) / playbackRate;
  }

  const sourceAvailable = clips.reduce(
    (sum, clip) => sum + clip.outputDuration,
    0,
  );
  const actualDuration = round(
    introDuration + sourceAvailable + outroDuration,
  );
  const warnings: string[] = [];
  if (actualDuration + 0.5 < settings.targetDuration) {
    warnings.push(
      `Активного матеріалу вистачило приблизно на ${actualDuration} с; кліпи не розтягувалися штучно.`,
    );
  }
  if (!music) {
    warnings.push(
      "Власну музику не додано: монтаж використовує ритм ігрового аудіо.",
    );
  }

  return {
    version: 1,
    projectId: project.id,
    style: settings.style,
    requestedDuration: settings.targetDuration,
    duration: actualDuration,
    createdAt: new Date().toISOString(),
    clips,
    music: {
      supplied: Boolean(music),
      beatsUsed: clips.filter((clip) => clip.syncBeat !== null).length,
    },
    warnings,
  };
}
