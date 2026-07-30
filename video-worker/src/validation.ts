import {
  DEFAULT_SETTINGS,
  EFFECT_INTENSITIES,
  MONTAGE_STYLES,
  TARGET_DURATIONS,
  type MontageSettings,
} from "../../lib/contracts";
import { StudioError } from "./errors";

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function volumeValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : fallback;
}

export function parseSettings(input: unknown): MontageSettings {
  if (!input || typeof input !== "object") {
    throw new StudioError(
      "INVALID_SETTINGS",
      "Налаштування монтажу не передані.",
    );
  }

  const source = input as Record<string, unknown>;
  const style = MONTAGE_STYLES.includes(
    source.style as MontageSettings["style"],
  )
    ? (source.style as MontageSettings["style"])
    : null;
  const targetDuration = TARGET_DURATIONS.includes(
    source.targetDuration as MontageSettings["targetDuration"],
  )
    ? (source.targetDuration as MontageSettings["targetDuration"])
    : null;
  const effectIntensity = EFFECT_INTENSITIES.includes(
    source.effectIntensity as MontageSettings["effectIntensity"],
  )
    ? (source.effectIntensity as MontageSettings["effectIntensity"])
    : null;

  if (!style || !targetDuration || !effectIntensity) {
    throw new StudioError(
      "INVALID_SETTINGS",
      "Стиль, тривалість або інтенсивність ефектів мають некоректне значення.",
    );
  }

  return {
    style,
    targetDuration,
    effectIntensity,
    cameraShake: booleanValue(
      source.cameraShake,
      DEFAULT_SETTINGS.cameraShake,
    ),
    flash: booleanValue(source.flash, DEFAULT_SETTINGS.flash),
    zoom: booleanValue(source.zoom, DEFAULT_SETTINGS.zoom),
    slowMotion: booleanValue(
      source.slowMotion,
      DEFAULT_SETTINGS.slowMotion,
    ),
    speedRamp: booleanValue(
      source.speedRamp,
      DEFAULT_SETTINGS.speedRamp,
    ),
    text: booleanValue(source.text, DEFAULT_SETTINGS.text),
    intro: booleanValue(source.intro, DEFAULT_SETTINGS.intro),
    outro: booleanValue(source.outro, DEFAULT_SETTINGS.outro),
    gameAudioVolume: volumeValue(
      source.gameAudioVolume,
      DEFAULT_SETTINGS.gameAudioVolume,
    ),
    musicVolume: volumeValue(
      source.musicVolume,
      DEFAULT_SETTINGS.musicVolume,
    ),
  };
}
