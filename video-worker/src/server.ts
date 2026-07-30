import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { createReadStream, createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectRecord, StoredClip } from "../../lib/contracts";
import { config } from "./config";
import { asStudioError, StudioError } from "./errors";
import { JobQueue } from "./jobs/job-queue";
import { JobStore } from "./jobs/job-store";
import { processProject } from "./jobs/process-project";
import { logEvent } from "./logger";
import { probeMedia, validateMusicUpload, validateVideoUpload } from "./media";
import { runProcess } from "./process";
import { LocalStorageProvider } from "./storage/local-storage";
import type { StorageProvider } from "./storage/storage-provider";
import { parseSettings } from "./validation";

interface ServerDependencies {
  storage?: StorageProvider;
}

function safeOriginalName(filename: string) {
  return path.basename(filename).slice(0, 180) || "clip";
}

export async function buildServer(dependencies: ServerDependencies = {}) {
  const app = Fastify({
    logger: false,
    trustProxy: true,
    bodyLimit: config.maxClipBytes * config.maxClips + config.maxMusicBytes,
    requestTimeout: 0,
  });
  const storage =
    dependencies.storage ?? new LocalStorageProvider(config.storageRoot);
  const jobs = new JobStore(storage);
  const queue = new JobQueue();

  await storage.initialize();
  const interrupted = await storage.markInterruptedJobsFailed();
  const cleaned = await storage.cleanupExpired(config.ttlHours);
  if (interrupted || cleaned) {
    logEvent("SYSTEM", "Worker startup recovery completed", {
      interruptedJobs: interrupted,
      cleanedDirectories: cleaned,
    });
  }

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(
          new StudioError(
            "ORIGIN_NOT_ALLOWED",
            "Цей сайт не має доступу до Video Worker.",
            403,
          ),
          false,
        );
      }
    },
    methods: ["GET", "HEAD", "POST", "OPTIONS"],
  });
  await app.register(rateLimit, {
    global: true,
    max: config.globalRateLimitMax,
    timeWindow: "15 minutes",
    errorResponseBuilder: (_request, context) =>
      new StudioError(
        "RATE_LIMITED",
        `Забагато запитів. Спробуйте через ${context.after}.`,
        context.statusCode,
      ),
  });
  await app.register(multipart, {
    limits: {
      files: config.maxClips + 1,
      fileSize: config.maxClipBytes,
      fields: 5,
      parts: config.maxClips + 6,
    },
  });

  app.setErrorHandler((error, _request, reply) => {
    const errorRecord = error as {
      code?: unknown;
      message?: unknown;
    };
    const multipartCode =
      typeof errorRecord.code === "string" ? errorRecord.code : "";
    const normalized =
      multipartCode === "FST_REQ_FILE_TOO_LARGE"
        ? new StudioError(
            "FILE_TOO_LARGE",
            `Файл перевищує ліміт ${Math.round(
              config.maxClipBytes / 1024 / 1024,
            )} МБ.`,
            413,
          )
        : asStudioError(error);
    logEvent("ERROR", "API request failed", {
      code: normalized.code,
      detail:
        normalized.details ??
        (typeof errorRecord.message === "string"
          ? errorRecord.message
          : String(error)),
    });
    return reply.code(normalized.statusCode).send({
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
      },
    });
  });

  async function inspectMediaBinary(executable: string) {
    try {
      const result = await runProcess(executable, ["-version"], {
        timeoutMs: 10_000,
      });
      return {
        available: true,
        version: result.stdout.split(/\r?\n/)[0] || "available",
      };
    } catch {
      return {
        available: false,
        version: null,
      };
    }
  }

  async function healthHandler(_request: FastifyRequest, reply: FastifyReply) {
    const [ffmpeg, ffprobe] = await Promise.all([
      inspectMediaBinary(config.ffmpegPath),
      inspectMediaBinary(config.ffprobePath),
    ]);
    const healthy = ffmpeg.available && ffprobe.available;
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? "ok" : "error",
      ok: healthy,
      queueDepth: queue.pendingCount,
      ffmpeg,
      ffprobe,
      output: {
        width: config.renderWidth,
        height: config.renderHeight,
        fps: config.renderFps,
        codec: "H.264",
      },
    });
  }

  app.get("/health", { config: { rateLimit: false } }, healthHandler);
  app.get("/api/health", { config: { rateLimit: false } }, healthHandler);

  function ensureQueueCapacity() {
    if (queue.pendingCount >= config.maxQueueDepth) {
      throw new StudioError(
        "QUEUE_FULL",
        "Video Worker зараз зайнятий. Дочекайтеся завершення активних монтажів і спробуйте ще раз.",
        429,
      );
    }
  }

  app.post(
    "/api/projects",
    {
      config: {
        rateLimit: {
          max: config.uploadRateLimitMax,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      ensureQueueCapacity();
      if (!request.isMultipart()) {
        throw new StudioError(
          "MULTIPART_REQUIRED",
          "Відео потрібно передати як multipart/form-data.",
          415,
        );
      }

      const projectId = randomUUID();
      const jobId = randomUUID();
      await storage.createProjectDirectories(projectId);
      const clips: StoredClip[] = [];
      let settingsInput: unknown = null;
      let music: ProjectRecord["music"] = null;

      try {
        for await (const part of request.parts()) {
          if (part.type === "field") {
            if (part.fieldname === "settings") {
              try {
                settingsInput = JSON.parse(String(part.value));
              } catch {
                throw new StudioError(
                  "INVALID_SETTINGS_JSON",
                  "Не вдалося прочитати налаштування монтажу.",
                );
              }
            }
            continue;
          }

          if (part.fieldname === "clips") {
            if (clips.length >= config.maxClips) {
              throw new StudioError(
                "TOO_MANY_CLIPS",
                `Можна завантажити максимум ${config.maxClips} відео.`,
                413,
              );
            }
            const extension = validateVideoUpload(part.filename, part.mimetype);
            const clipId = randomUUID();
            const storedName = `${clipId}${extension}`;
            const target = storage.getUploadPath(projectId, storedName);
            await pipeline(
              part.file,
              createWriteStream(target, { flags: "wx" }),
            );
            if (part.file.truncated) {
              throw new StudioError(
                "FILE_TOO_LARGE",
                `Кліп ${safeOriginalName(part.filename)} перевищує ліміт.`,
                413,
              );
            }
            const metadata = await probeMedia(target);
            if (metadata.size > config.maxClipBytes) {
              throw new StudioError(
                "FILE_TOO_LARGE",
                `Кліп ${safeOriginalName(part.filename)} перевищує ліміт.`,
                413,
              );
            }
            clips.push({
              id: clipId,
              originalName: safeOriginalName(part.filename),
              storedName,
              mimeType: part.mimetype,
              order: clips.length,
              metadata,
            });
            logEvent("UPLOAD", "Source clip validated", {
              projectId,
              jobId,
              clipId,
              duration: metadata.duration,
              size: metadata.size,
            });
            continue;
          }

          if (part.fieldname === "music") {
            if (music) {
              throw new StudioError(
                "MULTIPLE_MUSIC_FILES",
                "Можна додати лише один музичний файл.",
              );
            }
            const extension = validateMusicUpload(part.filename, part.mimetype);
            const musicId = randomUUID();
            const storedName = `${musicId}${extension}`;
            const target = storage.getUploadPath(projectId, storedName);
            await pipeline(
              part.file,
              createWriteStream(target, { flags: "wx" }),
            );
            if (part.file.truncated) {
              throw new StudioError(
                "MUSIC_TOO_LARGE",
                `Музичний файл перевищує ${Math.round(
                  config.maxMusicBytes / 1024 / 1024,
                )} МБ.`,
                413,
              );
            }
            const details = await stat(target);
            if (details.size > config.maxMusicBytes) {
              throw new StudioError(
                "MUSIC_TOO_LARGE",
                `Музичний файл перевищує ${Math.round(
                  config.maxMusicBytes / 1024 / 1024,
                )} МБ.`,
                413,
              );
            }
            music = {
              originalName: safeOriginalName(part.filename),
              storedName,
              mimeType: part.mimetype,
              size: details.size,
            };
            continue;
          }

          part.file.resume();
        }

        if (!clips.length) {
          throw new StudioError(
            "CLIPS_REQUIRED",
            "Додайте хоча б один відеокліп.",
          );
        }
        const settings = parseSettings(settingsInput);
        const now = new Date().toISOString();
        const project: ProjectRecord = {
          id: projectId,
          jobId,
          createdAt: now,
          updatedAt: now,
          settings,
          clips,
          music,
          latestRender: null,
        };
        await storage.writeProject(project);
        await jobs.create(jobId, projectId);
        queue.enqueue(jobId, () =>
          processProject(projectId, jobId, storage, jobs),
        );

        return reply.code(202).send({
          projectId,
          jobId,
          statusUrl: `/api/jobs/${jobId}`,
        });
      } catch (error) {
        await storage.removeProject(projectId);
        throw error;
      }
    },
  );

  app.get<{ Params: { jobId: string } }>("/api/jobs/:jobId", async (request) =>
    storage.readJob(request.params.jobId),
  );

  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/plan",
    async (request) => storage.readEditPlan(request.params.projectId),
  );

  app.post<{
    Params: { projectId: string };
    Body: { settings?: unknown };
  }>(
    "/api/projects/:projectId/rerender",
    {
      config: {
        rateLimit: {
          max: config.rerenderRateLimitMax,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      ensureQueueCapacity();
      const project = await storage.readProject(request.params.projectId);
      const settings = parseSettings(request.body?.settings);
      const jobId = randomUUID();
      const updated: ProjectRecord = {
        ...project,
        jobId,
        settings,
        latestRender: project.latestRender,
        updatedAt: new Date().toISOString(),
      };
      await storage.writeProject(updated);
      await jobs.create(jobId, project.id);
      queue.enqueue(jobId, () =>
        processProject(project.id, jobId, storage, jobs),
      );
      return reply.code(202).send({
        projectId: project.id,
        jobId,
        statusUrl: `/api/jobs/${jobId}`,
        reusedAnalysis: true,
      });
    },
  );

  app.get<{
    Params: { projectId: string };
    Querystring: { download?: string };
  }>("/api/projects/:projectId/render", async (request, reply) => {
    const project = await storage.readProject(request.params.projectId);
    if (!project.latestRender) {
      throw new StudioError(
        "RENDER_NOT_READY",
        "Готовий рендер ще не створено.",
        404,
      );
    }
    const target = storage.getRenderPath(project.id, project.latestRender);
    const details = await stat(target);
    const range = request.headers.range;
    reply.type("video/mp4").header("Accept-Ranges", "bytes");
    reply.header(
      "Content-Disposition",
      `${
        request.query.download === "1" ? "attachment" : "inline"
      }; filename="tavi-ai-montage-${project.id.slice(0, 8)}.mp4"`,
    );

    if (!range) {
      reply.header("Content-Length", details.size);
      return reply.send(createReadStream(target));
    }

    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      return reply.code(416).send();
    }
    const start = match[1] ? Number.parseInt(match[1], 10) : 0;
    const requestedEnd = match[2]
      ? Number.parseInt(match[2], 10)
      : details.size - 1;
    const end = Math.min(requestedEnd, details.size - 1);
    if (start > end || start >= details.size) {
      return reply
        .code(416)
        .header("Content-Range", `bytes */${details.size}`)
        .send();
    }

    reply
      .code(206)
      .header("Content-Range", `bytes ${start}-${end}/${details.size}`)
      .header("Content-Length", end - start + 1);
    return reply.send(createReadStream(target, { start, end }));
  });

  return app;
}

async function start() {
  const app = await buildServer();
  await app.listen({ host: config.host, port: config.port });
  logEvent("SYSTEM", "TaVi AI Montage worker listening", {
    host: config.host,
    port: config.port,
    storageRoot: config.storageRoot,
  });
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  void start().catch((error) => {
    logEvent("ERROR", "Worker failed to start", {
      detail: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
}
