import { logEvent } from "../logger";

type JobTask = () => Promise<void>;

export class JobQueue {
  private readonly waiting: Array<{
    jobId: string;
    task: JobTask;
  }> = [];
  private running = false;

  enqueue(jobId: string, task: JobTask) {
    this.waiting.push({ jobId, task });
    void this.drain();
  }

  get pendingCount() {
    return this.waiting.length + (this.running ? 1 : 0);
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.waiting.length) {
        const queued = this.waiting.shift();
        if (!queued) continue;
        try {
          await queued.task();
        } catch (error) {
          logEvent("ERROR", "Unhandled queue task failure", {
            jobId: queued.jobId,
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      this.running = false;
    }
  }
}
