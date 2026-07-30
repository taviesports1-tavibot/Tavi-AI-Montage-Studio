import type { EffectBuilder } from "./types";

export const shakeEffect: EffectBuilder = ({ width, height }) =>
  `scale=${width + 48}:${height + 86},crop=${width}:${height}:x='24+7*sin(58*t)':y='43+7*cos(51*t)'`;
