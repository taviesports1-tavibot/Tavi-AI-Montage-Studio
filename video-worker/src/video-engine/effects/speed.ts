import type { EffectBuilder } from "./types";

export const speedEffect: EffectBuilder = ({ clip }) =>
  `setpts=(PTS-STARTPTS)/${clip.playbackRate.toFixed(4)}`;
