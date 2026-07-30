import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS,
  type ClipAnalysis,
  type ProjectRecord,
} from "../lib/contracts";
import { createEditPlan } from "../video-worker/src/director/edit-director";

const project: ProjectRecord = {
  id: "6bc1b25f-595e-4bc5-86cc-3ad37f3cc160",
  jobId: "86ae1fa2-a8da-4751-9f23-9b7412d6ae31",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
  settings: { ...DEFAULT_SETTINGS, targetDuration: 15 },
  music: null,
  latestRender: null,
  clips: [
    {
      id: "798ca3ac-348a-4ee1-82b3-834346ba20f3",
      originalName: "first.mp4",
      storedName: "3f12c31e-6f50-4b79-b29a-b9d120644c64.mp4",
      mimeType: "video/mp4",
      order: 0,
      metadata: {
        duration: 8,
        width: 1280,
        height: 720,
        fps: 30,
        size: 100,
        videoCodec: "h264",
        audioCodec: "aac",
        hasAudio: true,
      },
    },
    {
      id: "e3cc6f1d-7ca9-484a-b249-3501df7dd3cc",
      originalName: "second.mp4",
      storedName: "c1cbcc0e-dc8f-41d4-acb0-a8ab541b923b.mp4",
      mimeType: "video/mp4",
      order: 1,
      metadata: {
        duration: 7,
        width: 1280,
        height: 720,
        fps: 30,
        size: 100,
        videoCodec: "h264",
        audioCodec: null,
        hasAudio: false,
      },
    },
  ],
};

const analyses: ClipAnalysis[] = [
  {
    clipId: project.clips[0].id,
    duration: 8,
    samples: [],
    candidates: [
      {
        start: 1,
        end: 3.8,
        score: 0.91,
        motionScore: 0.9,
        audioScore: 0.8,
        sceneScore: 0.5,
        reasons: ["висока рухливість у кадрі"],
      },
      {
        start: 4.2,
        end: 7.2,
        score: 0.7,
        motionScore: 0.8,
        audioScore: 0.4,
        sceneScore: 0.2,
        reasons: ["стабільно активна ділянка"],
      },
    ],
  },
  {
    clipId: project.clips[1].id,
    duration: 7,
    samples: [],
    candidates: [
      {
        start: 0.4,
        end: 3.4,
        score: 0.83,
        motionScore: 0.9,
        audioScore: 0,
        sceneScore: 0.4,
        reasons: ["висока рухливість у кадрі"],
      },
    ],
  },
];

test("AI Director selects measured candidates and never invents MLBB events", () => {
  const plan = createEditPlan(project, analyses, null);
  assert.ok(plan.clips.length >= 2);
  assert.ok(plan.duration <= project.settings.targetDuration);
  assert.ok(
    plan.clips.every((clip) =>
      analyses.some(
        (analysis) =>
          analysis.clipId === clip.sourceClipId &&
          analysis.candidates.some(
            (candidate) =>
              candidate.start === clip.start && clip.end <= candidate.end,
          ),
      ),
    ),
  );
  assert.ok(
    plan.clips.every(
      (clip) => !["SAVAGE", "MANIAC", "TRIPLE KILL"].includes(clip.text ?? ""),
    ),
  );
  assert.ok(
    plan.warnings.some((warning) => warning.includes("не розтягувалися")),
  );
});

test("AI Director uses music points only when they are near a cut", () => {
  const plan = createEditPlan(project, analyses, {
    duration: 20,
    beats: [
      { time: 2.9, strength: 0.9, kind: "drop" },
      { time: 8.2, strength: 0.7, kind: "beat" },
    ],
  });
  assert.ok(plan.music.supplied);
  assert.equal(
    plan.music.beatsUsed,
    plan.clips.filter((clip) => clip.syncBeat !== null).length,
  );
});
