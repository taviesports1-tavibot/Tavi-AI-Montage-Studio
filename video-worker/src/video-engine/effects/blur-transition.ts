import type { EffectBuilder } from "./types";

export const blurTransitionEffect: EffectBuilder = ({ clip }) => {
  const start = Math.max(0, clip.outputDuration - 0.14).toFixed(3);
  return `boxblur=8:2:enable='gte(t,${start})'`;
};
