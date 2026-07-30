import { spawn } from "node:child_process";
import { StudioError } from "./errors";

interface RunProcessOptions {
  cwd?: string;
  timeoutMs?: number;
  onStderrLine?: (line: string) => void;
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

export async function runProcess(
  executable: string,
  args: readonly string[],
  options: RunProcessOptions = {},
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let stderrBuffer = "";
    let settled = false;

    const timeout =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            child.kill("SIGKILL");
            finish(
              new StudioError(
                "PROCESS_TIMEOUT",
                "Обробка відео перевищила дозволений час.",
                500,
              ),
            );
          }, options.timeoutMs)
        : null;

    function finish(error?: Error, result?: ProcessResult) {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (error) reject(error);
      else resolve(result ?? { stdout, stderr });
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stderr += text;
      stderrBuffer += text;
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() ?? "";
      for (const line of lines) {
        options.onStderrLine?.(line);
      }
    });

    child.once("error", (error) => {
      finish(
        new StudioError(
          "PROCESS_START_FAILED",
          `Не вдалося запустити ${executable}.`,
          500,
          error.message,
        ),
      );
    });

    child.once("close", (code, signal) => {
      if (stderrBuffer) options.onStderrLine?.(stderrBuffer);
      if (code === 0) {
        finish(undefined, { stdout, stderr });
        return;
      }

      finish(
        new StudioError(
          "MEDIA_PROCESS_FAILED",
          "FFmpeg не зміг обробити один із файлів.",
          422,
          {
            executable,
            exitCode: code,
            signal,
            stderr: stderr.slice(-4_000),
          },
        ),
      );
    });
  });
}
