import type { EffectName } from "../../../../lib/contracts";
import { blurTransitionEffect } from "./blur-transition";
import { fadeEffect } from "./fade";
import { flashEffect } from "./flash";
import { glitchEffect } from "./glitch";
import { shakeEffect } from "./shake";
import { speedEffect } from "./speed";
import { textEffect } from "./text";
import type { EffectBuilder, EffectContext } from "./types";
import { punchZoomEffect, zoomEffect } from "./zoom";

const EFFECT_BUILDERS: Partial<Record<EffectName, EffectBuilder>> = {
  zoom: zoomEffect,
  punch_zoom: punchZoomEffect,
  shake: shakeEffect,
  flash: flashEffect,
  slow_motion: speedEffect,
  speed_up: speedEffect,
  speed_ramp: speedEffect,
  fade: fadeEffect,
  blur_transition: blurTransitionEffect,
  glitch: glitchEffect,
  text_overlay: textEffect,
};

export function buildEffectFilters(context: EffectContext) {
  const filters: string[] = [];
  const hasTimingEffect = context.clip.effects.some((effect) =>
    ["slow_motion", "speed_up", "speed_ramp"].includes(effect),
  );

  if (!hasTimingEffect && context.clip.playbackRate !== 1) {
    filters.push(speedEffect(context) ?? "");
  }

  for (const effect of context.clip.effects) {
    const builder = EFFECT_BUILDERS[effect];
    const filter = builder?.(context);
    if (filter && !filters.includes(filter)) filters.push(filter);
  }

  return filters.filter(Boolean);
}
