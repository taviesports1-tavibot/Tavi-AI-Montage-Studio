import type { EffectBuilder } from "./types";

export const fadeEffect: EffectBuilder = ({ clip }) => {
  const outStart = Math.max(0, clip.outputDuration - 0.18).toFixed(3);
  return `fade=t=in:st=0:d=0.16,fade=t=out:st=${outStart}:d=0.18`;
};
