import { StudioError } from "../errors";

export interface MoneyPrinterTaskStatus {
  taskId: string;
  state: number;
  progress: number;
  videos: string[];
  error: string | null;
}

interface MoneyPrinterClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

function trimBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class MoneyPrinterClient {
  readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: MoneyPrinterClientOptions) {
    this.baseUrl = trimBaseUrl(options.baseUrl);
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  get enabled() {
    return Boolean(this.baseUrl);
  }

  async health() {
    if (!this.enabled) {
      return { enabled: false, available: false, status: "disabled" as const };
    }

    try {
      const response = await fetchWithTimeout(
        `${this.baseUrl}/health`,
        { method: "GET" },
        this.timeoutMs,
      );
      return {
        enabled: true,
        available: response.ok,
        status: response.ok ? ("ok" as const) : ("error" as const),
        httpStatus: response.status,
      };
    } catch (error) {
      return {
        enabled: true,
        available: false,
        status: "error" as const,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async createVideo(params: Record<string, unknown>) {
    if (!this.enabled) {
      throw new StudioError(
        "MONEYPRINTER_DISABLED",
        "MoneyPrinterTurbo engine is not configured.",
        503,
      );
    }

    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/videos`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params),
      },
      this.timeoutMs,
    );

    const body = (await response.json().catch(() => null)) as
      | { data?: { task_id?: string }; message?: string }
      | null;

    if (!response.ok || !body?.data?.task_id) {
      throw new StudioError(
        "MONEYPRINTER_CREATE_FAILED",
        body?.message || "MoneyPrinterTurbo could not create the video task.",
        502,
      );
    }

    return body.data.task_id;
  }

  async getTask(taskId: string): Promise<MoneyPrinterTaskStatus> {
    if (!this.enabled) {
      throw new StudioError(
        "MONEYPRINTER_DISABLED",
        "MoneyPrinterTurbo engine is not configured.",
        503,
      );
    }

    const response = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`,
      { method: "GET" },
      this.timeoutMs,
    );
    const body = (await response.json().catch(() => null)) as
      | {
          data?: {
            task_id?: string;
            state?: number;
            progress?: number;
            videos?: string[];
            error?: string;
          };
          message?: string;
        }
      | null;

    if (!response.ok || !body?.data?.task_id) {
      throw new StudioError(
        "MONEYPRINTER_STATUS_FAILED",
        body?.message || "MoneyPrinterTurbo task status is unavailable.",
        502,
      );
    }

    return {
      taskId: body.data.task_id,
      state: body.data.state ?? 0,
      progress: body.data.progress ?? 0,
      videos: body.data.videos ?? [],
      error: body.data.error ?? null,
    };
  }
}
