import type {
  JobPhase,
  JobStatus,
} from "../../../lib/contracts";
import type { StorageProvider } from "../storage/storage-provider";

export class JobStore {
  constructor(private readonly storage: StorageProvider) {}

  async create(jobId: string, projectId: string) {
    const now = new Date().toISOString();
    const job: JobStatus = {
      jobId,
      projectId,
      phase: "queued",
      progress: 0,
      message: "Завдання додано до черги.",
      createdAt: now,
      updatedAt: now,
      error: null,
      resultUrl: null,
      planUrl: null,
    };
    await this.storage.writeJob(job);
    return job;
  }

  async update(
    jobId: string,
    patch: {
      phase?: JobPhase;
      progress?: number;
      message?: string;
      resultUrl?: string | null;
      planUrl?: string | null;
    },
  ) {
    const current = await this.storage.readJob(jobId);
    const updated: JobStatus = {
      ...current,
      ...patch,
      progress:
        patch.progress === undefined
          ? current.progress
          : Math.max(0, Math.min(100, Math.round(patch.progress))),
      updatedAt: new Date().toISOString(),
      error: null,
    };
    await this.storage.writeJob(updated);
    return updated;
  }

  async fail(jobId: string, code: string, message: string) {
    const current = await this.storage.readJob(jobId);
    const failed: JobStatus = {
      ...current,
      phase: "error",
      message,
      updatedAt: new Date().toISOString(),
      error: { code, message },
    };
    await this.storage.writeJob(failed);
    return failed;
  }
}
