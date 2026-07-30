import type {
  EditPlanClip,
  MontageSettings,
  StoredClip,
} from "../../../lib/contracts";
import { config } from "../config";
import { runProcess } from "../process";
import { buildEffectFilters } from "./effects";

function format(value: number) {
  return value.toFixed(3);
}

function baseVideoGraph(
  planClip: EditPlanClip,
  settings: MontageSettings,
) {
  const { renderWidth: width, renderHeight: height, renderFps: fps } = config;
  const effects = buildEffectFilters({
    clip: planClip,
    settings,
    width,
    height,
    fps,
  });
  const effectChain = effects.length ? `,${effects.join(",")}` : "";

  return [
    `[0:v]trim=start=${format(planClip.start)}:end=${format(planClip.end)},setpts=PTS-STARTPTS,split=2[bgsrc][fgsrc]`,
    `[bgsrc]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=24:3[bg]`,
    `[fgsrc]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${fps}${effectChain},format=yuv420p[vout]`,
  ].join(";");
}

function audioGraph(planClip: EditPlanClip, sourceClip: StoredClip) {
  const duration = format(planClip.outputDuration);
  if (!sourceClip.metadata.hasAudio) {
    return `[1:a]atrim=duration=${duration},asetpts=PTS-STARTPTS[aout]`;
  }

  return `[0:a]atrim=start=${format(planClip.start)}:end=${format(
    planClip.end,
  )},asetpts=PTS-STARTPTS,atempo=${planClip.playbackRate.toFixed(
    4,
  )},aresample=48000,apad,atrim=duration=${duration}[aout]`;
}

export async function renderSegment(
  inputPath: string,
  outputPath: string,
  planClip: EditPlanClip,
  sourceClip: StoredClip,
  settings: MontageSettings,
) {
  const filterGraph = `${baseVideoGraph(planClip, settings)};${audioGraph(
    planClip,
    sourceClip,
  )}`;
  await runProcess(
    config.ffmpegPath,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-filter_complex",
      filterGraph,
      "-map",
      "[vout]",
      "-map",
      "[aout]",
      "-t",
      format(planClip.outputDuration),
      "-c:v",
      "libx264",
      "-preset",
      config.x264Preset,
      "-crf",
      String(config.x264Crf),
      "-profile:v",
      "high",
      "-level",
      "4.1",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(config.renderFps),
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "-threads",
      "2",
      outputPath,
    ],
    { timeoutMs: 10 * 60_000 },
  );
}
