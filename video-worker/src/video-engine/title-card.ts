import { config } from "../config";
import { runProcess } from "../process";

function escape(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
}

export async function renderTitleCard(
  outputPath: string,
  duration: number,
  primary: string,
  secondary: string,
  variant: "intro" | "outro",
) {
  const fadeOut = Math.max(0, duration - 0.18).toFixed(3);
  const filter = [
    "format=yuv420p",
    "geq=r='18+18*sin(X/72+T*2.8)':g='4+7*sin(Y/95)':b='36+35*sin((X+Y)/120+T*2)'",
    `drawtext=font='DejaVu Sans':text='${escape(
      primary,
    )}':fontcolor=white:fontsize=94:borderw=4:bordercolor=0x17051F:x=(w-text_w)/2:y=(h-text_h)/2-85`,
    `drawtext=font='DejaVu Sans':text='${escape(
      secondary,
    )}':fontcolor=0xD946EF:fontsize=42:x=(w-text_w)/2:y=(h-text_h)/2+55`,
    variant === "intro"
      ? "fade=t=in:st=0:d=0.12"
      : "fade=t=in:st=0:d=0.18",
    `fade=t=out:st=${fadeOut}:d=0.18`,
  ].join(",");

  await runProcess(
    config.ffmpegPath,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=0x08050F:s=${config.renderWidth}x${config.renderHeight}:r=${config.renderFps}:d=${duration}`,
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=48000:cl=stereo:d=${duration}`,
      "-vf",
      filter,
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-t",
      duration.toFixed(3),
      "-c:v",
      "libx264",
      "-preset",
      config.x264Preset,
      "-crf",
      String(config.x264Crf),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { timeoutMs: 120_000 },
  );
}
