import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_SETTINGS } from "../lib/contracts";
import {
  probeMedia,
  validateMusicUpload,
  validateVideoUpload,
} from "../video-worker/src/media";
import { robustNormalize } from "../video-worker/src/analysis/series";
import { parseSettings } from "../video-worker/src/validation";

test("settings validation clamps audio volumes and preserves safe booleans", () => {
  const settings = parseSettings({
    ...DEFAULT_SETTINGS,
    gameAudioVolume: 180,
    musicVolume: -20,
  });
  assert.equal(settings.gameAudioVolume, 100);
  assert.equal(settings.musicVolume, 0);
});

test("upload validation accepts MP4/MOV and rejects shell-looking extensions", () => {
  assert.equal(validateVideoUpload("clip.mp4", "video/mp4"), ".mp4");
  assert.equal(validateVideoUpload("clip.mov", "video/quicktime"), ".mov");
  assert.throws(() =>
    validateVideoUpload("clip.mp4;touch hacked", "video/mp4"),
  );
  assert.throws(() => validateMusicUpload("beat.exe", "audio/mpeg"));
});

test("activity normalization is deterministic and bounded", () => {
  const input = [
    { time: 0, value: 10 },
    { time: 1, value: 20 },
    { time: 2, value: 40 },
  ];
  const first = robustNormalize(input);
  const second = robustNormalize(input);
  assert.deepEqual(first, second);
  assert.ok(first.every((item) => item.value >= 0 && item.value <= 1));
});

test("corrupt MP4 returns a clear media error", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tavi-corrupt-"));
  const target = path.join(directory, "broken.mp4");
  try {
    await writeFile(target, "this is not a real video", "utf8");
    await assert.rejects(
      () => probeMedia(target),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "CORRUPT_MEDIA",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
