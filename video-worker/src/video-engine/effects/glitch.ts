import type { EffectBuilder } from "./types";

export const glitchEffect: EffectBuilder = () =>
  "chromashift=cbh=5:crh=-5:enable='between(t,0.03,0.15)',hue=s=1.22:enable='between(t,0.03,0.15)'";
