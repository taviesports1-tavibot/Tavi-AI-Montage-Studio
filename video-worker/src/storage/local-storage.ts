import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
  ClipAnalysis,
  EditPlan,
  JobStatus,
  MusicAnalysis,
  ProjectRecord,
} from "../../../lib/contracts";
import { StudioError } from "../errors";
import type { StorageProvider } from "./storage-provider";

function assertId(value: string, label: string) {
  if (!/^[a-f0-9-]{16,64}$/i.test(value)) {
    throw new StudioError(
      "INVALID_IDENTIFIER",
      `Некоректний ${label}.`,
      400,
    );
  }
}

export class LocalStorageProvider implements StorageProvider {
  private readonly uploadsRoot: string;
  private readonly projectsRoot: string;
  private readonly rendersRoot: string;
  private readonly jobsRoot: string;

  constructor(private readonly root: string) {
    this.uploadsRoot = path.join(root, "uploads");
    this.projectsRoot = path.join(root, "projects");
    this.rendersRoot = path.join(root, "renders");
    this.jobsRoot = path.join(root, "jobs");
  }

  async initialize() {
    await Promise.all(
      [
        this.root,
        this.uploadsRoot,
        this.projectsRoot,
        this.rendersRoot,
        this.jobsRoot,
      ].map((directory) => mkdir(directory, { recursive: true })),
    );
  }

  async createProjectDirectories(projectId: string) {
    assertId(projectId, "projectId");
    await Promise.all([
      mkdir(path.join(this.uploadsRoot, projectId), { recursive: true }),
      mkdir(path.join(this.projectsRoot, projectId, "work"), {
        recursive: true,
      }),
      mkdir(path.join(this.rendersRoot, projectId), { recursive: true }),
    ]);
  }

  async removeProject(projectId: string) {
    assertId(projectId, "projectId");
    await Promise.all([
      rm(path.join(this.uploadsRoot, projectId), {
        recursive: true,
        force: true,
      }),
      rm(path.join(this.projectsRoot, projectId), {
        recursive: true,
        force: true,
      }),
      rm(path.join(this.rendersRoot, projectId), {
        recursive: true,
        force: true,
      }),
    ]);
  }

  getUploadPath(projectId: string, storedName: string) {
    assertId(projectId, "projectId");
    assertId(storedName.split(".")[0] ?? "", "ім'я файлу");
    return path.join(this.uploadsRoot, projectId, storedName);
  }

  getProjectWorkPath(projectId: string, ...parts: string[]) {
    assertId(projectId, "projectId");
    if (parts.some((part) => part.includes("..") || path.isAbsolute(part))) {
      throw new StudioError(
        "INVALID_PATH",
        "Некоректний шлях робочого файлу.",
      );
    }
    return path.join(this.projectsRoot, projectId, "work", ...parts);
  }

  getRenderPath(projectId: string, renderName: string) {
    assertId(projectId, "projectId");
    assertId(renderName.split(".")[0] ?? "", "ім'я рендера");
    return path.join(this.rendersRoot, projectId, renderName);
  }

  async writeProject(project: ProjectRecord) {
    await this.writeJson(
      path.join(this.projectsRoot, project.id, "project.json"),
      project,
    );
  }

  async readProject(projectId: string) {
    assertId(projectId, "projectId");
    return this.readJson<ProjectRecord>(
      path.join(this.projectsRoot, projectId, "project.json"),
      "PROJECT_NOT_FOUND",
      "Проєкт не знайдено.",
    );
  }

  async writeJob(job: JobStatus) {
    await this.writeJson(path.join(this.jobsRoot, `${job.jobId}.json`), job);
  }

  async readJob(jobId: string) {
    assertId(jobId, "jobId");
    return this.readJson<JobStatus>(
      path.join(this.jobsRoot, `${jobId}.json`),
      "JOB_NOT_FOUND",
      "Завдання не знайдено.",
    );
  }

  async writeClipAnalysis(projectId: string, analysis: ClipAnalysis[]) {
    await this.writeJson(
      path.join(this.projectsRoot, projectId, "analysis.json"),
      analysis,
    );
  }

  async readClipAnalysis(projectId: string) {
    try {
      return await this.readJson<ClipAnalysis[]>(
        path.join(this.projectsRoot, projectId, "analysis.json"),
        "ANALYSIS_NOT_FOUND",
        "Аналіз ще не створено.",
      );
    } catch (error) {
      if (
        error instanceof StudioError &&
        error.code === "ANALYSIS_NOT_FOUND"
      ) {
        return null;
      }
      throw error;
    }
  }

  async writeMusicAnalysis(
    projectId: string,
    analysis: MusicAnalysis | null,
  ) {
    await this.writeJson(
      path.join(this.projectsRoot, projectId, "music-analysis.json"),
      analysis,
    );
  }

  async readMusicAnalysis(projectId: string) {
    try {
      return await this.readJson<MusicAnalysis | null>(
        path.join(this.projectsRoot, projectId, "music-analysis.json"),
        "MUSIC_ANALYSIS_NOT_FOUND",
        "Аналіз музики ще не створено.",
      );
    } catch (error) {
      if (
        error instanceof StudioError &&
        error.code === "MUSIC_ANALYSIS_NOT_FOUND"
      ) {
        return null;
      }
      throw error;
    }
  }

  async writeEditPlan(projectId: string, plan: EditPlan) {
    await this.writeJson(
      path.join(this.projectsRoot, projectId, "edit-plan.json"),
      plan,
    );
  }

  async readEditPlan(projectId: string) {
    return this.readJson<EditPlan>(
      path.join(this.projectsRoot, projectId, "edit-plan.json"),
      "PLAN_NOT_FOUND",
      "Монтажний план ще не створено.",
    );
  }

  async markInterruptedJobsFailed() {
    const entries = await readdir(this.jobsRoot, { withFileTypes: true });
    let recovered = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const target = path.join(this.jobsRoot, entry.name);
      try {
        const job = JSON.parse(await readFile(target, "utf8")) as JobStatus;
        if (job.phase === "complete" || job.phase === "error") continue;
        const updated: JobStatus = {
          ...job,
          phase: "error",
          progress: job.progress,
          message: "Попередню обробку перервано. Запустіть монтаж ще раз.",
          updatedAt: new Date().toISOString(),
          error: {
            code: "WORKER_INTERRUPTED",
            message:
              "Video Worker був перезапущений під час рендера. Дані проєкту збережено.",
          },
        };
        await this.writeJson(target, updated);
        recovered += 1;
      } catch {
        // Ignore malformed orphan records; regular API reads still report them.
      }
    }
    return recovered;
  }

  async cleanupExpired(ttlHours: number) {
    const cutoff = Date.now() - ttlHours * 60 * 60 * 1_000;
    let removed = 0;

    for (const root of [
      this.uploadsRoot,
      this.projectsRoot,
      this.rendersRoot,
    ]) {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const target = path.join(root, entry.name);
        const details = await stat(target);
        if (details.mtimeMs < cutoff) {
          await rm(target, { recursive: true, force: true });
          removed += 1;
        }
      }
    }
    return removed;
  }

  private async writeJson(target: string, value: unknown) {
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }

  private async readJson<T>(
    target: string,
    code: string,
    message: string,
  ): Promise<T> {
    try {
      return JSON.parse(await readFile(target, "utf8")) as T;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new StudioError(code, message, 404);
      }
      throw error;
    }
  }
}
