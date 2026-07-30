export const MONTAGE_STYLES = [
  "hype-esports",
  "tiktok-viral",
  "cinematic",
  "tavi-esports",
] as const;

export type MontageStyle = (typeof MONTAGE_STYLES)[number];

export const TARGET_DURATIONS = [15, 20, 30, 45, 60] as const;
export type TargetDuration = (typeof TARGET_DURATIONS)[number];

export const EFFECT_INTENSITIES = ["low", "medium", "high"] as const;
export type EffectIntensity = (typeof EFFECT_INTENSITIES)[number];

export type EffectName =
  | "zoom"
  | "punch_zoom"
  | "shake"
  | "flash"
  | "speed_up"
  | "slow_motion"
  | "speed_ramp"
  | "fade"
  | "blur_transition"
  | "glitch"
  | "text_overlay";

export interface MontageSettings {
  style: MontageStyle;
  targetDuration: TargetDuration;
  effectIntensity: EffectIntensity;
  cameraShake: boolean;
  flash: boolean;
  zoom: boolean;
  slowMotion: boolean;
  speedRamp: boolean;
  text: boolean;
  intro: boolean;
  outro: boolean;
  gameAudioVolume: number;
  musicVolume: number;
}

export const DEFAULT_SETTINGS: MontageSettings = {
  style: "tavi-esports",
  targetDuration: 20,
  effectIntensity: "medium",
  cameraShake: true,
  flash: true,
  zoom: true,
  slowMotion: true,
  speedRamp: true,
  text: true,
  intro: true,
  outro: true,
  gameAudioVolume: 70,
  musicVolume: 65,
};

export interface MediaMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  size: number;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
}

export interface StoredClip {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  order: number;
  metadata: MediaMetadata;
}

export interface AnalysisSample {
  time: number;
  motion: number;
  audio: number;
  scene: number;
  activity: number;
}

export interface HighlightCandidate {
  start: number;
  end: number;
  score: number;
  motionScore: number;
  audioScore: number;
  sceneScore: number;
  reasons: string[];
}

export interface ClipAnalysis {
  clipId: string;
  duration: number;
  samples: AnalysisSample[];
  candidates: HighlightCandidate[];
}

export interface MusicBeat {
  time: number;
  strength: number;
  kind: "beat" | "drop";
}

export interface MusicAnalysis {
  duration: number;
  beats: MusicBeat[];
}

export interface EditPlanClip {
  id: string;
  sourceClipId: string;
  source: string;
  start: number;
  end: number;
  outputDuration: number;
  timelineStart: number;
  importance: number;
  playbackRate: number;
  effects: EffectName[];
  text: string | null;
  syncBeat: number | null;
  reasons: string[];
}

export interface EditPlan {
  version: 1;
  projectId: string;
  style: MontageStyle;
  requestedDuration: number;
  duration: number;
  createdAt: string;
  clips: EditPlanClip[];
  music: {
    supplied: boolean;
    beatsUsed: number;
  };
  warnings: string[];
}

export const JOB_PHASES = [
  "queued",
  "uploading",
  "validating",
  "analyzing",
  "selecting",
  "directing",
  "syncing",
  "effects",
  "rendering",
  "complete",
  "error",
] as const;

export type JobPhase = (typeof JOB_PHASES)[number];

export interface JobStatus {
  jobId: string;
  projectId: string;
  phase: JobPhase;
  progress: number;
  message: string;
  createdAt: string;
  updatedAt: string;
  error: {
    code: string;
    message: string;
  } | null;
  resultUrl: string | null;
  planUrl: string | null;
}

export interface ProjectRecord {
  id: string;
  jobId: string;
  createdAt: string;
  updatedAt: string;
  settings: MontageSettings;
  clips: StoredClip[];
  music: {
    originalName: string;
    storedName: string;
    mimeType: string;
    size: number;
  } | null;
  latestRender: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
