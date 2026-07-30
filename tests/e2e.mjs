import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const temporary = await mkdtemp(path.join(os.tmpdir(), "tavi-montage-e2e-"));
const port = 8799;
const base = `http://127.0.0.1:${port}`;
let worker;
let workerLogs = "";

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${executable} failed (${code}): ${stderr}`));
    });
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Worker did not become healthy.");
}

async function waitForJob(statusUrl) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const response = await fetch(`${base}${statusUrl}`);
    assert.equal(response.status, 200);
    const status = await response.json();
    if (status.phase === "error") {
      throw new Error(`Job failed: ${JSON.stringify(status.error)}`);
    }
    if (status.phase === "complete") return status;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Job timed out.");
}

try {
  const clipOne = path.join(temporary, "one.mp4");
  const clipTwo = path.join(temporary, "two.mp4");
  const music = path.join(temporary, "beat.wav");
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=30:duration=4",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=420:sample_rate=48000:duration=4",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    clipOne,
  ]);
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=640x360:rate=30:duration=4",
    "-vf",
    "hue=H=2*PI*t",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    clipTwo,
  ]);
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=180:sample_rate=48000:duration=12",
    "-af",
    "volume='if(lt(mod(t,0.5),0.08),1,0.18)':eval=frame",
    music,
  ]);

  worker = spawn(
    process.execPath,
    ["--import", "tsx", "video-worker/src/server.ts"],
    {
      cwd: root,
      env: {
        ...process.env,
        WORKER_HOST: "127.0.0.1",
        WORKER_PORT: String(port),
        STORAGE_ROOT: path.join(temporary, "storage"),
        RENDER_WIDTH: "360",
        RENDER_HEIGHT: "640",
        RENDER_FPS: "24",
        X264_PRESET: "ultrafast",
        X264_CRF: "28",
        TEMP_FILE_TTL_HOURS: "48",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  worker.stdout.on("data", (chunk) => (workerLogs += chunk));
  worker.stderr.on("data", (chunk) => (workerLogs += chunk));

  const health = await waitForHealth();
  assert.equal(health.ok, true);

  const settings = {
    style: "tavi-esports",
    targetDuration: 15,
    effectIntensity: "medium",
    cameraShake: true,
    flash: true,
    zoom: true,
    slowMotion: true,
    speedRamp: true,
    text: true,
    intro: true,
    outro: true,
    gameAudioVolume: 65,
    musicVolume: 60,
  };
  const form = new FormData();
  form.append("settings", JSON.stringify(settings));
  form.append(
    "clips",
    new Blob([await readFile(clipOne)], { type: "video/mp4" }),
    "one.mp4",
  );
  form.append(
    "clips",
    new Blob([await readFile(clipTwo)], { type: "video/mp4" }),
    "two.mp4",
  );
  form.append(
    "music",
    new Blob([await readFile(music)], { type: "audio/wav" }),
    "beat.wav",
  );

  const createResponse = await fetch(`${base}/api/projects`, {
    method: "POST",
    body: form,
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 202, JSON.stringify(created));
  const completed = await waitForJob(created.statusUrl);
  assert.equal(completed.progress, 100);

  const renderResponse = await fetch(
    `${base}/api/projects/${created.projectId}/render`,
  );
  assert.equal(renderResponse.status, 200);
  const renderedPath = path.join(temporary, "result.mp4");
  await writeFile(
    renderedPath,
    Buffer.from(await renderResponse.arrayBuffer()),
  );
  const probe = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=codec_name,width,height,pix_fmt",
    "-of",
    "json",
    renderedPath,
  ]);
  const metadata = JSON.parse(probe.stdout).streams[0];
  assert.deepEqual(
    {
      codec_name: metadata.codec_name,
      width: metadata.width,
      height: metadata.height,
      pix_fmt: metadata.pix_fmt,
    },
    {
      codec_name: "h264",
      width: 360,
      height: 640,
      pix_fmt: "yuv420p",
    },
  );

  const rangeResponse = await fetch(
    `${base}/api/projects/${created.projectId}/render`,
    { headers: { Range: "bytes=0-1023" } },
  );
  assert.equal(rangeResponse.status, 206);
  assert.match(rangeResponse.headers.get("content-range") ?? "", /^bytes 0-/);

  const downloadResponse = await fetch(
    `${base}/api/projects/${created.projectId}/render?download=1`,
    { method: "HEAD" },
  );
  assert.match(
    downloadResponse.headers.get("content-disposition") ?? "",
    /^attachment;/,
  );

  const rerenderResponse = await fetch(
    `${base}/api/projects/${created.projectId}/rerender`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: { ...settings, style: "cinematic", intro: false, outro: false },
      }),
    },
  );
  const rerendered = await rerenderResponse.json();
  assert.equal(rerenderResponse.status, 202);
  await waitForJob(rerendered.statusUrl);
  const planResponse = await fetch(
    `${base}/api/projects/${created.projectId}/plan`,
  );
  const plan = await planResponse.json();
  assert.equal(plan.style, "cinematic");
  assert.ok(plan.clips.every((clip) => Array.isArray(clip.reasons)));

  console.log("E2E montage workflow passed.");
} catch (error) {
  if (workerLogs) console.error(workerLogs);
  console.error(error);
  throw error;
} finally {
  if (worker && !worker.killed) worker.kill("SIGTERM");
  await rm(temporary, { recursive: true, force: true });
}
