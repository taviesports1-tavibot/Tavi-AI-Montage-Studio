import type { EditPlanClip, MontageSettings } from "../../../../lib/contracts";

export interface EffectContext {
  clip: EditPlanClip;
  settings: MontageSettings;
  width: number;
  height: number;
  fps: number;
}

export type EffectBuilder = (context: EffectContext) => string | null;
