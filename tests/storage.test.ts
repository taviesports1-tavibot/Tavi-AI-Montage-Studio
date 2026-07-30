import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { JobStatus } from "../lib/contracts";
import { LocalStorageProvider } from "../video-worker/src/storage/local-storage";

test("worker restart marks an interrupted render as recoverable failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tavi-storage-"));
  try {
    const storage = new LocalStorageProvider(root);
    await storage.initialize();
    const job: JobStatus = {
      jobId: "7dcb7092-dd8d-4d5d-a31c-7c95e1c97411",
      projectId: "d5cc88dc-66cf-45ab-b3aa-40dc198f0c78",
      phase: "rendering",
      progress: 81,
      message: "Рендер відео.",
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:01.000Z",
      error: null,
      resultUrl: null,
      planUrl: null,
    };
    await storage.writeJob(job);
    assert.equal(await storage.markInterruptedJobsFailed(), 1);
    const recovered = await storage.readJob(job.jobId);
    assert.equal(recovered.phase, "error");
    assert.equal(recovered.error?.code, "WORKER_INTERRUPTED");
    assert.equal(recovered.progress, 81);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
