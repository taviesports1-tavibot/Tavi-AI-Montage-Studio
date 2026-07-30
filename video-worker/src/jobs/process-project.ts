import { randomUUID } from "node:crypto";
import { analyzeClip } from "../analysis/clip-analysis";
import { analyzeMusic } from "../analysis/music-analysis";
import { createEditPlan } from "../director/edit-director";
import { asStudioError, StudioError } from "../errors";
import { logEvent } from "../logger";
import type { StorageProvider } from "../storage/storage-provider";
import { renderMontage } from "../video-engine/render-montage";
import { JobStore } from "./job-store";

export async function processProject(
  projectId: string,
  jobId: string,
  storage: StorageProvider,
  jobs: JobStore,
) {
  try {
    const project = await storage.readProject(projectId);
    let analyses = await storage.readClipAnalysis(projectId);
    if (!analyses) {
      analyses = [];
      for (const [index, clip] of project.clips.entries()) {
        await jobs.update(jobId, {
          phase: "analyzing",
          progress: 10 + Math.round((index / project.clips.length) * 27),
          message: `Аналіз кліпу ${index + 1} з ${project.clips.length}.`,
        });
        logEvent("ANALYSIS", "Analyzing source clip", {
          projectId,
          jobId,
          clipId: clip.id,
          order: clip.order,
        });
        analyses.push(await analyzeClip(projectId, clip, storage));
      }
      await storage.writeClipAnalysis(projectId, analyses);
    } else {
      await jobs.update(jobId, {
        phase: "analyzing",
        progress: 37,
        message: "Використовуємо збережений аналіз кліпів.",
      });
    }

    let musicAnalysis = null;
    if (project.music) {
      await jobs.update(jobId, {
        phase: "syncing",
        progress: 42,
        message: "Аналіз ритму та сильних точок музики.",
      });
      musicAnalysis =
        (await storage.readMusicAnalysis(projectId)) ??
        (await analyzeMusic(projectId, project.music.storedName, storage));
      await storage.writeMusicAnalysis(projectId, musicAnalysis);
    }

    await jobs.update(jobId, {
      phase: "selecting",
      progress: 49,
      message: "Пошук найактивніших ігрових моментів.",
    });
    await jobs.update(jobId, {
      phase: "directing",
      progress: 55,
      message: "AI Director створює монтажний план.",
    });
    const plan = createEditPlan(project, analyses, musicAnalysis);
    await storage.writeEditPlan(projectId, plan);
    logEvent("DIRECTOR", "Edit decision list created", {
      projectId,
      jobId,
      selectedSegments: plan.clips.length,
      requestedDuration: plan.requestedDuration,
      actualDuration: plan.duration,
    });

    if (!plan.clips.length || plan.duration < 1) {
      throw new StudioError(
        "INSUFFICIENT_MATERIAL",
        "Недостатньо придатного матеріалу для монтажу.",
        422,
      );
    }

    await jobs.update(jobId, {
      phase: "effects",
      progress: 62,
      message: "Підготовка осмислених ефектів і переходів.",
      planUrl: `/api/projects/${projectId}/plan`,
    });

    const renderName = `${randomUUID()}.mp4`;
    const renderPath = storage.getRenderPath(projectId, renderName);
    await jobs.update(jobId, {
      phase: "rendering",
      progress: 66,
      message: "Рендер вертикального відео.",
    });
    logEvent("RENDER", "Montage render started", {
      projectId,
      jobId,
      renderName,
    });

    await renderMontage(project, plan, renderPath, storage, {
      onSegmentComplete: async (completed, total) => {
        await jobs.update(jobId, {
          phase: "rendering",
          progress: 66 + Math.round((completed / Math.max(1, total)) * 29),
          message: `Рендер фрагмента ${completed} з ${total}.`,
        });
      },
    });

    const updatedProject = {
      ...project,
      latestRender: renderName,
      updatedAt: new Date().toISOString(),
    };
    await storage.writeProject(updatedProject);
    await jobs.update(jobId, {
      phase: "complete",
      progress: 100,
      message: "AI-монтаж готовий.",
      resultUrl: `/api/projects/${projectId}/render`,
      planUrl: `/api/projects/${projectId}/plan`,
    });
    logEvent("COMPLETE", "Montage render completed", {
      projectId,
      jobId,
      duration: plan.duration,
    });
  } catch (error) {
    const studioError = asStudioError(error);
    await jobs.fail(jobId, studioError.code, studioError.message);
    logEvent("ERROR", "Project processing failed", {
      projectId,
      jobId,
      code: studioError.code,
      detail: studioError.details ?? studioError.message,
    });
  }
}
