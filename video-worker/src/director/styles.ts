import type {
  EffectIntensity,
  MontageStyle,
} from "../../../lib/contracts";

export interface StyleProfile {
  label: string;
  minSegment: number;
  idealSegment: number;
  maxSegment: number;
  hookFirst: boolean;
  introDuration: number;
  outroDuration: number;
  neutralTexts: string[];
  color: string;
}

export const STYLE_PROFILES: Record<MontageStyle, StyleProfile> = {
  "hype-esports": {
    label: "Hype Esports",
    minSegment: 1.25,
    idealSegment: 2.05,
    maxSegment: 2.8,
    hookFirst: true,
    introDuration: 0,
    outroDuration: 0,
    neutralTexts: ["INSANE", "CLUTCH", "WOW", "GG"],
    color: "#a855f7",
  },
  "tiktok-viral": {
    label: "TikTok Viral",
    minSegment: 0.95,
    idealSegment: 1.55,
    maxSegment: 2.15,
    hookFirst: true,
    introDuration: 0,
    outroDuration: 0,
    neutralTexts: ["WAIT FOR IT", "NO WAY", "WOW", "GG"],
    color: "#22d3ee",
  },
  cinematic: {
    label: "Cinematic",
    minSegment: 2.6,
    idealSegment: 3.8,
    maxSegment: 5.2,
    hookFirst: false,
    introDuration: 0,
    outroDuration: 0,
    neutralTexts: ["THE MOMENT", "CLUTCH", "VICTORY", "GG"],
    color: "#f0abfc",
  },
  "tavi-esports": {
    label: "TaVi Esports",
    minSegment: 1.35,
    idealSegment: 2.25,
    maxSegment: 3.2,
    hookFirst: true,
    introDuration: 0.75,
    outroDuration: 0.75,
    neutralTexts: ["TAVI", "INSANE", "CLUTCH", "GG"],
    color: "#c026d3",
  },
};

export function effectLimit(intensity: EffectIntensity) {
  if (intensity === "low") return 2;
  if (intensity === "high") return 5;
  return 3;
}
