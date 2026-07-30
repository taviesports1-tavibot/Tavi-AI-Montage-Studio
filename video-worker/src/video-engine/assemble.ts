import { writeFile } from "node:fs/promises";
import { config } from "../config";
import { runProcess } from "../process";

export async function concatenateSegments(
  segmentPaths: string[],
  listPath: string,
  outputPath: string,
) {
  const lines = segmentPaths.map(
    (segmentPath) => `file '${segmentPath.replaceAll("'", "'\\''")}'`,
  );
  await writeFile(listPath, `${lines.join("\n")}\n`, "utf8");
  await runProcess(
    config.ffmpegPath,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { timeoutMs: 180_000 },
  );
}

export async function mixMusic(
  videoPath: string,
  musicPath: string,
  outputPath: string,
  duration: number,
  gameVolume: number,
  musicVolume: number,
) {
  const fadeOutStart = Math.max(0, duration - 0.65).toFixed(3);
  const filterGraph = [
    `[0:a]volume=${(gameVolume / 100).toFixed(3)}[game]`,
    `[1:a]atrim=duration=${duration.toFixed(
      3,
    )},asetpts=PTS-STARTPTS,volume=${(musicVolume / 100).toFixed(
      3,
    )},afade=t=out:st=${fadeOutStart}:d=0.65[music]`,
    "[game][music]amix=inputs=2:duration=first:dropout_transition=1.5[aout]",
  ].join(";");

  await runProcess(
    config.ffmpegPath,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      videoPath,
      "-stream_loop",
      "-1",
      "-i",
      musicPath,
      "-filter_complex",
      filterGraph,
      "-map",
      "0:v:0",
      "-map",
      "[aout]",
      "-t",
      duration.toFixed(3),
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { timeoutMs: 180_000 },
  );
}
