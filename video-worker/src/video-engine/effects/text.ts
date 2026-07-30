import type { EffectBuilder } from "./types";

function escapeDrawText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");
}

export const textEffect: EffectBuilder = ({ clip }) => {
  if (!clip.text) return null;
  return [
    `drawtext=font='DejaVu Sans'`,
    `text='${escapeDrawText(clip.text)}'`,
    "fontcolor=white",
    "fontsize=92",
    "borderw=5",
    "bordercolor=0x160725",
    "shadowcolor=0xB026FF",
    "shadowx=5",
    "shadowy=5",
    "x=(w-text_w)/2",
    "y=h*0.74",
    "enable='between(t,0.12,0.95)'",
  ].join(":");
};
