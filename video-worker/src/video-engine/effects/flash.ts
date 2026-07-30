import type { EffectBuilder } from "./types";

export const flashEffect: EffectBuilder = () =>
  "eq=brightness=0.72:saturation=0.2:enable='between(t,0.04,0.10)',eq=brightness=0.26:saturation=1.3:enable='between(t,0.10,0.16)'";
