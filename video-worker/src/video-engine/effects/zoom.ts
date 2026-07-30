import type { EffectBuilder } from "./types";

export const zoomEffect: EffectBuilder = ({ width, height, fps }) =>
  `zoompan=z='min(zoom+0.0007,1.045)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`;

export const punchZoomEffect: EffectBuilder = ({
  width,
  height,
  fps,
}) =>
  `zoompan=z='1+0.075*exp(-pow((on/${fps}-0.16)/0.105,2))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`;
