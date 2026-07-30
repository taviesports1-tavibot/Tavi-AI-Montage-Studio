import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  EditPlanClip,
  EffectName,
  StoredClip,
} from "../lib/contracts";
import { DEFAULT_SETTINGS } from "../lib/contracts";
import { runProcess } from "../video-worker/src/process";
import { renderSegment } from "../video-worker/src/video-engine/render-segment";

const temporary = await mkdtemp(path.join(os.tmpdir(), "tavi-effects-"));
const input = path.join(temporary, "input.mp4");
const effects: EffectName[] = [
  "zoom",
  "punch_zoom",
  "shake",
  "flash",
  "slow_motion",
  "speed_ramp",
  "fade",
  "blur_transition",
  "glitch",
  "text_overlay",
];

try {
  await runProcess(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=24:duration=4",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=500:sample_rate=48000:duration=4",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      input,
    ],
    { timeoutMs: 60_000 },
  );

  const storedClip: StoredClip = {
    id: randomUUID(),
    originalName: "input.mp4",
    storedName: `${randomUUID()}.mp4`,
    mimeType: "video/mp4",
    order: 0,
    metadata: {
      duration: 4,
      width: 640,
      height: 360,
      fps: 24,
      size: 1,
      videoCodec: "h264",
      audioCodec: "aac",
      hasAudio: true,
    },
  };

  for (const [index, effect] of effects.entries()) {
    const playbackRate =
      effect === "slow_motion" ? 0.88 : effect === "speed_ramp" ? 1.12 : 1;
    const planClip: EditPlanClip = {
      id: randomUUID(),
      sourceClipId: storedClip.id,
      source: storedClip.storedName,
      start: 0.3,
      end: 1.3 * playbackRate,
      outputDuration: 1,
      timelineStart: 0,
      importance: 0.9,
      playbackRate,
      effects: [effect],
      text: effect === "text_overlay" ? "INSANE" : null,
      syncBeat: null,
      reasons: ["effect compatibility smoke test"],
    };
    const output = path.join(
      temporary,
      `${String(index).padStart(2, "0")}-${effect}.mp4`,
    );
    await renderSegment(
      input,
      output,
      planClip,
      storedClip,
      DEFAULT_SETTINGS,
    );
    const probe = await runProcess(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height",
        "-of",
        "json",
        output,
      ],
      { timeoutMs: 20_000 },
    );
    const metadata = JSON.parse(probe.stdout).streams?.[0];
    assert.equal(metadata?.codec_name, "h264", `${effect} did not render H.264`);
    assert.equal(metadata?.width, 360, `${effect} width mismatch`);
    assert.equal(metadata?.height, 640, `${effect} height mismatch`);
  }

  console.log(`FFmpeg effects passed: ${effects.join(", ")}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
