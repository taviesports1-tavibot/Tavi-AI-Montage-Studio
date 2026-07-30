import { copyFile, rm } from "node:fs/promises";
import type {
  EditPlan,
  ProjectRecord,
} from "../../../lib/contracts";
import type { StorageProvider } from "../storage/storage-provider";
import { STYLE_PROFILES } from "../director/styles";
import { concatenateSegments, mixMusic } from "./assemble";
import { renderSegment } from "./render-segment";
import { renderTitleCard } from "./title-card";

interface RenderCallbacks {
  onSegmentComplete?: (completed: number, total: number) => Promise<void> | void;
}

export async function renderMontage(
  project: ProjectRecord,
  plan: EditPlan,
  outputPath: string,
  storage: StorageProvider,
  callbacks: RenderCallbacks = {},
) {
  const workDirectory = storage.getProjectWorkPath(
    project.id,
    `render-${Date.now()}`,
  );
  const { mkdir } = await import("node:fs/promises");
  await mkdir(workDirectory, { recursive: true });

  const segments: string[] = [];
  const profile = STYLE_PROFILES[project.settings.style];
  const hasIntro =
    project.settings.style === "tavi-esports" && project.settings.intro;
  const hasOutro =
    project.settings.style === "tavi-esports" && project.settings.outro;

  try {
    if (hasIntro) {
      const introPath = `${workDirectory}/000-intro.mp4`;
      await renderTitleCard(
        introPath,
        profile.introDuration,
        "TAVI",
        "AI MONTAGE",
        "intro",
      );
      segments.push(introPath);
    }

    const clipById = new Map(project.clips.map((clip) => [clip.id, clip]));
    for (const [index, planClip] of plan.clips.entries()) {
      const sourceClip = clipById.get(planClip.sourceClipId);
      if (!sourceClip) {
        throw new Error(`Missing source clip ${planClip.sourceClipId}`);
      }
      const segmentPath = `${workDirectory}/${String(index + 1).padStart(
        3,
        "0",
      )}-${planClip.id}.mp4`;
      await renderSegment(
        storage.getUploadPath(project.id, sourceClip.storedName),
        segmentPath,
        planClip,
        sourceClip,
        project.settings,
      );
      segments.push(segmentPath);
      await callbacks.onSegmentComplete?.(index + 1, plan.clips.length);
    }

    if (hasOutro) {
      const outroPath = `${workDirectory}/999-outro.mp4`;
      await renderTitleCard(
        outroPath,
        profile.outroDuration,
        "TaVi Esports",
        "GG · PLAY AGAIN",
        "outro",
      );
      segments.push(outroPath);
    }

    const concatPath = `${workDirectory}/assembled.mp4`;
    await concatenateSegments(
      segments,
      `${workDirectory}/segments.txt`,
      concatPath,
    );

    if (project.music) {
      await mixMusic(
        concatPath,
        storage.getUploadPath(project.id, project.music.storedName),
        outputPath,
        plan.duration,
        project.settings.gameAudioVolume,
        project.settings.musicVolume,
      );
    } else {
      await copyFile(concatPath, outputPath);
    }
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
}
