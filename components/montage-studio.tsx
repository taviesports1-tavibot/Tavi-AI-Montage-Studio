"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  Clapperboard,
  Code2,
  Download,
  Film,
  GripVertical,
  LoaderCircle,
  Music2,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  Video,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  TARGET_DURATIONS,
  type EditPlan,
  type JobPhase,
  type JobStatus,
  type MontageSettings,
  type MontageStyle,
} from "@/lib/contracts";

function runtimeApiBase() {
  if (process.env.NEXT_PUBLIC_MONTAGE_API_URL) {
    return process.env.NEXT_PUBLIC_MONTAGE_API_URL.replace(/\/+$/, "");
  }
  if (
    typeof window !== "undefined" &&
    window.location.hostname === "terminal.local"
  ) {
    return "http://terminal.local:8788";
  }
  if (process.env.NODE_ENV === "production") {
    return "https://tavi-ai-montage-studio-production.up.railway.app";
  }
  return "http://localhost:8788";
}

interface ClientClip {
  id: string;
  file: File;
  previewUrl: string;
  duration: number | null;
}

interface CreatedJob {
  projectId: string;
  jobId: string;
  statusUrl: string;
}

let clientClipCounter = 0;

function createClientClipId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  clientClipCounter += 1;
  const entropy = new Uint32Array(2);
  globalThis.crypto?.getRandomValues?.(entropy);
  return `clip-${Date.now().toString(36)}-${clientClipCounter.toString(
    36,
  )}-${Array.from(entropy, (value) => value.toString(36)).join("")}`;
}

const STYLE_CARDS: Array<{
  id: MontageStyle;
  name: string;
  eyebrow: string;
  description: string;
  accent: string;
  icon: typeof Zap;
}> = [
  {
    id: "hype-esports",
    name: "Hype Esports",
    eyebrow: "Impact mode",
    description: "Punch zoom, короткий shake, flash та speed ramp на піках.",
    accent: "violet",
    icon: Zap,
  },
  {
    id: "tiktok-viral",
    name: "TikTok Viral",
    eyebrow: "Fast hook",
    description: "Сильний старт у перші секунди й максимально щільний темп.",
    accent: "cyan",
    icon: Sparkles,
  },
  {
    id: "cinematic",
    name: "Cinematic",
    eyebrow: "Story mode",
    description: "Довші фрагменти, slow motion, fade та драматичні паузи.",
    accent: "rose",
    icon: Film,
  },
  {
    id: "tavi-esports",
    name: "TaVi Esports",
    eyebrow: "Signature",
    description: "Cyber-neon стиль, glitch, фірмове коротке intro та outro.",
    accent: "brand",
    icon: WandSparkles,
  },
];

const PHASES: Array<{
  id: JobPhase;
  label: string;
}> = [
  { id: "uploading", label: "Завантаження файлів" },
  { id: "analyzing", label: "Аналіз кліпів" },
  { id: "selecting", label: "Пошук найкращих моментів" },
  { id: "directing", label: "AI Director створює монтаж" },
  { id: "syncing", label: "Синхронізація з музикою" },
  { id: "effects", label: "Додавання ефектів" },
  { id: "rendering", label: "Рендер відео" },
];

function apiUrl(path: string) {
  return `${runtimeApiBase().replace(/\/$/, "")}${
    path.startsWith("/") ? path : `/${path}`
  }`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function formatDuration(duration: number | null) {
  if (duration === null) return "читаємо…";
  const minutes = Math.floor(duration / 60);
  const seconds = Math.round(duration % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function validateLocalVideo(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return (
    ["mp4", "mov"].includes(extension ?? "") &&
    (!file.type || ["video/mp4", "video/quicktime"].includes(file.type))
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="setting-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

function ClipCard({
  clip,
  index,
  total,
  onDelete,
  onMove,
  onDuration,
  onDragStart,
  onDrop,
}: {
  clip: ClientClip;
  index: number;
  total: number;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuration: (duration: number) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  return (
    <article
      className="clip-card"
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="clip-grip" aria-hidden="true">
        <GripVertical size={18} />
        <span>{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="clip-preview">
        <video
          src={clip.previewUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => onDuration(event.currentTarget.duration)}
        />
        <span>{formatDuration(clip.duration)}</span>
      </div>
      <div className="clip-info">
        <strong title={clip.file.name}>{clip.file.name}</strong>
        <small>{formatBytes(clip.file.size)} · MP4/MOV</small>
      </div>
      <div className="clip-actions">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label="Перемістити кліп вище"
        >
          <ArrowUp size={17} />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label="Перемістити кліп нижче"
        >
          <ArrowDown size={17} />
        </button>
        <button
          type="button"
          className="delete-button"
          onClick={onDelete}
          aria-label="Видалити кліп"
        >
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  );
}

export function MontageStudio() {
  const [clips, setClips] = useState<ClientClip[]>([]);
  const [music, setMusic] = useState<File | null>(null);
  const [settings, setSettings] = useState<MontageSettings>(DEFAULT_SETTINGS);
  const [screen, setScreen] = useState<"setup" | "processing" | "result">(
    "setup",
  );
  const [job, setJob] = useState<JobStatus | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState<EditPlan | null>(null);
  const [showPlan, setShowPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const clipInputRef = useRef<HTMLInputElement>(null);
  const styleSectionRef = useRef<HTMLElement>(null);
  const clipsRef = useRef<ClientClip[]>([]);

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  useEffect(() => {
    return () => {
      for (const clip of clipsRef.current) {
        URL.revokeObjectURL(clip.previewUrl);
      }
    };
  }, []);

  const totalSourceDuration = useMemo(
    () =>
      clips.reduce(
        (sum, clip) =>
          sum + (Number.isFinite(clip.duration) ? clip.duration! : 0),
        0,
      ),
    [clips],
  );

  const addFiles = useCallback((files: File[]) => {
    setError(null);
    const invalid = files.find((file) => !validateLocalVideo(file));
    if (invalid) {
      setError(`«${invalid.name}» не є підтримуваним MP4 або MOV.`);
      return;
    }
    setClips((current) => {
      const available = Math.max(0, 10 - current.length);
      const selected = files.slice(0, available).map((file) => ({
        id: createClientClipId(),
        file,
        previewUrl: URL.createObjectURL(file),
        duration: null,
      }));
      if (files.length > available) {
        setError("В один проєкт можна додати максимум 10 відео.");
      }
      return [...current, ...selected];
    });
    setProjectId(null);
  }, []);

  const moveClip = (index: number, direction: -1 | 1) => {
    setClips((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const updated = [...current];
      [updated[index], updated[target]] = [updated[target], updated[index]];
      return updated;
    });
    setProjectId(null);
  };

  const dropClip = (targetIndex: number) => {
    if (draggingIndex === null || draggingIndex === targetIndex) return;
    setClips((current) => {
      const updated = [...current];
      const [moved] = updated.splice(draggingIndex, 1);
      updated.splice(targetIndex, 0, moved);
      return updated;
    });
    setDraggingIndex(null);
    setProjectId(null);
  };

  const removeClip = (id: string) => {
    setClips((current) => {
      const target = current.find((clip) => clip.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((clip) => clip.id !== id);
    });
    setProjectId(null);
  };

  const updateSetting = <Key extends keyof MontageSettings>(
    key: Key,
    value: MontageSettings[Key],
  ) => setSettings((current) => ({ ...current, [key]: value }));

  const pollJob = useCallback(async (created: CreatedJob) => {
    for (;;) {
      const response = await fetch(apiUrl(created.statusUrl), {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Не вдалося отримати стан обробки.");
      }
      const status = (await response.json()) as JobStatus;
      setJob(status);
      if (status.phase === "error") {
        throw new Error(status.error?.message ?? status.message);
      }
      if (status.phase === "complete") {
        setProjectId(status.projectId);
        if (status.planUrl) {
          const planResponse = await fetch(apiUrl(status.planUrl), {
            cache: "no-store",
          });
          if (planResponse.ok) {
            setEditPlan((await planResponse.json()) as EditPlan);
          }
        }
        setScreen("result");
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1_000));
    }
  }, []);

  const uploadProject = async () => {
    if (!clips.length) {
      setError("Спочатку додайте хоча б один ігровий момент.");
      return;
    }
    setError(null);
    setJob(null);
    setEditPlan(null);
    setUploadProgress(0);
    setScreen("processing");

    const formData = new FormData();
    formData.append("settings", JSON.stringify(settings));
    for (const clip of clips)
      formData.append("clips", clip.file, clip.file.name);
    if (music) formData.append("music", music, music.name);

    try {
      const created = await new Promise<CreatedJob>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", apiUrl("/api/projects"));
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        xhr.onerror = () =>
          reject(
            new Error(
              "Video Worker недоступний. Перевірте з’єднання та спробуйте ще раз.",
            ),
          );
        xhr.onload = () => {
          let body: unknown = null;
          try {
            body = JSON.parse(xhr.responseText) as typeof body;
          } catch {
            body = null;
          }
          if (xhr.status < 200 || xhr.status >= 300) {
            reject(
              new Error(
                body &&
                  typeof body === "object" &&
                  "error" in body &&
                  body.error &&
                  typeof body.error === "object" &&
                  "message" in body.error &&
                  typeof body.error.message === "string"
                  ? body.error.message
                  : "Завантаження не вдалося.",
              ),
            );
            return;
          }
          setUploadProgress(100);
          if (
            !body ||
            typeof body !== "object" ||
            !("jobId" in body) ||
            !("projectId" in body) ||
            !("statusUrl" in body)
          ) {
            reject(new Error("Worker повернув некоректну відповідь."));
            return;
          }
          resolve(body as CreatedJob);
        };
        xhr.send(formData);
      });
      await pollJob(created);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Обробка не вдалася.",
      );
      setScreen("setup");
    }
  };

  const rerender = async () => {
    if (!projectId) return uploadProject();
    setError(null);
    setJob(null);
    setEditPlan(null);
    setUploadProgress(100);
    setScreen("processing");
    try {
      const response = await fetch(
        apiUrl(`/api/projects/${projectId}/rerender`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ settings }),
        },
      );
      const body = (await response.json()) as
        CreatedJob | { error?: { message?: string } };
      if (!response.ok || !("jobId" in body)) {
        throw new Error(
          "error" in body
            ? (body.error?.message ?? "Повторний рендер не вдалося запустити.")
            : "Повторний рендер не вдалося запустити.",
        );
      }
      await pollJob(body);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Повторний рендер не вдався.",
      );
      setScreen("setup");
    }
  };

  const resetProject = () => {
    setProjectId(null);
    setJob(null);
    setEditPlan(null);
    setShowPlan(false);
    setScreen("setup");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const changeStyle = () => {
    setScreen("setup");
    window.setTimeout(
      () => styleSectionRef.current?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  };

  const visiblePhaseIndex =
    job?.phase === "complete"
      ? PHASES.length
      : PHASES.findIndex((phase) => phase.id === job?.phase);
  const progress =
    job?.progress ?? (screen === "processing" ? uploadProgress * 0.08 : 0);

  return (
    <main className="studio-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="studio-header">
        <a
          className="studio-brand"
          href="#"
          aria-label="TaVi AI Montage Studio"
        >
          <span className="brand-mark">
            <Clapperboard size={22} />
          </span>
          <span>
            <strong>TaVi</strong>
            <small>AI Montage Studio</small>
          </span>
        </a>
        <div className="header-status">
          <span />
          Public MVP
        </div>
      </header>

      {screen === "setup" && (
        <>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <Sparkles size={15} />
                MLBB · AI VIDEO DIRECTOR
              </div>
              <h1>
                Завантаж моменти.
                <span> AI змонтує відео.</span>
              </h1>
              <p>
                Автоматичний вертикальний gaming montage для TikTok, YouTube
                Shorts та Instagram Reels — із реальним аналізом руху, сцен,
                звуку й музичних піків.
              </p>
              <div className="hero-badges">
                <span>
                  <ShieldCheck size={16} /> MP4 / MOV
                </span>
                <span>
                  <Video size={16} /> 1080 × 1920
                </span>
                <span>
                  <Zap size={16} /> H.264
                </span>
              </div>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <div className="phone-frame">
                <div className="phone-video">
                  <span className="scan-line" />
                  <div className="target-ring">
                    <Play size={24} fill="currentColor" />
                  </div>
                  <strong>ACTIVITY</strong>
                  <small>0.91 · IMPACT FOUND</small>
                </div>
              </div>
              <div className="timeline-card">
                <span />
                <span />
                <span />
                <i />
              </div>
            </div>
          </section>

          <section className="workspace-section upload-section">
            <div className="section-heading">
              <span className="section-index">01</span>
              <div>
                <h2>Ігрові моменти</h2>
                <p>До 10 коротких відео. Порядок можна змінити вручну.</p>
              </div>
              <span className="section-counter">{clips.length}/10</span>
            </div>

            <div
              className={`drop-zone ${clips.length ? "compact" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <input
                ref={clipInputRef}
                type="file"
                hidden
                multiple
                accept="video/mp4,video/quicktime,.mp4,.mov"
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
              <div className="upload-icon">
                <UploadCloud size={31} />
              </div>
              <div>
                <strong>
                  {clips.length
                    ? "Додати ще ігрові моменти"
                    : "Перетягніть кліпи сюди"}
                </strong>
                <span>або оберіть MP4 / MOV із пристрою</span>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => clipInputRef.current?.click()}
              >
                <Plus size={17} />
                Обрати відео
              </button>
            </div>

            {clips.length > 0 && (
              <div className="clips-list">
                {clips.map((clip, index) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    index={index}
                    total={clips.length}
                    onDelete={() => removeClip(clip.id)}
                    onMove={(direction) => moveClip(index, direction)}
                    onDragStart={() => setDraggingIndex(index)}
                    onDrop={() => dropClip(index)}
                    onDuration={(duration) =>
                      setClips((current) =>
                        current.map((item) =>
                          item.id === clip.id ? { ...item, duration } : item,
                        ),
                      )
                    }
                  />
                ))}
                <div className="source-summary">
                  <span>
                    Загальний матеріал
                    <strong>{formatDuration(totalSourceDuration)}</strong>
                  </span>
                  <span>
                    AI вибере лише активні ділянки
                    <strong>без штучного розтягування</strong>
                  </span>
                </div>
              </div>
            )}
          </section>

          <section className="workspace-section" ref={styleSectionRef}>
            <div className="section-heading">
              <span className="section-index">02</span>
              <div>
                <h2>Стиль монтажу</h2>
                <p>
                  Ефекти залежать від важливості події, а не ставляться
                  постійно.
                </p>
              </div>
            </div>
            <div className="styles-grid">
              {STYLE_CARDS.map((style) => {
                const Icon = style.icon;
                const active = settings.style === style.id;
                return (
                  <button
                    type="button"
                    key={style.id}
                    className={`style-card ${style.accent} ${active ? "active" : ""}`}
                    onClick={() => updateSetting("style", style.id)}
                  >
                    <span className="style-icon">
                      <Icon size={23} />
                    </span>
                    <small>{style.eyebrow}</small>
                    <strong>{style.name}</strong>
                    <p>{style.description}</p>
                    <span className="selection-mark">
                      {active ? <Check size={15} /> : <ArrowRight size={15} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="workspace-section split-section">
            <div className="duration-panel">
              <div className="section-heading">
                <span className="section-index">03</span>
                <div>
                  <h2>Тривалість</h2>
                  <p>
                    AI може зробити ролик коротшим, якщо матеріалу недостатньо.
                  </p>
                </div>
              </div>
              <div className="duration-options">
                {TARGET_DURATIONS.map((duration) => (
                  <button
                    type="button"
                    key={duration}
                    className={
                      settings.targetDuration === duration ? "active" : ""
                    }
                    onClick={() => updateSetting("targetDuration", duration)}
                  >
                    <strong>{duration}</strong>
                    <span>SEC</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="music-panel">
              <div className="section-heading">
                <span className="section-index">04</span>
                <div>
                  <h2>Музика</h2>
                  <p>
                    Необов’язково. Cuts та impact будуть прив’язані до піків.
                  </p>
                </div>
              </div>
              <label className={`music-upload ${music ? "has-file" : ""}`}>
                <input
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.aac"
                  onChange={(event) => {
                    setMusic(event.target.files?.[0] ?? null);
                    setProjectId(null);
                  }}
                />
                <Music2 size={25} />
                <span>
                  <strong>{music?.name ?? "Додати власний трек"}</strong>
                  <small>
                    {music ? formatBytes(music.size) : "MP3, M4A, WAV або AAC"}
                  </small>
                </span>
                {music && (
                  <button
                    type="button"
                    aria-label="Видалити музику"
                    onClick={(event) => {
                      event.preventDefault();
                      setMusic(null);
                      setProjectId(null);
                    }}
                  >
                    <X size={18} />
                  </button>
                )}
              </label>
            </div>
          </section>

          <section className="workspace-section advanced-section">
            <details>
              <summary>
                <span>
                  <Settings2 size={20} />
                  <strong>Advanced Settings</strong>
                  <small>Точне керування ефектами та звуком</small>
                </span>
                <ChevronDown size={20} />
              </summary>
              <div className="advanced-content">
                <div className="intensity-setting">
                  <span>Effect intensity</span>
                  <div>
                    {(["low", "medium", "high"] as const).map((value) => (
                      <button
                        type="button"
                        key={value}
                        className={
                          settings.effectIntensity === value ? "active" : ""
                        }
                        onClick={() => updateSetting("effectIntensity", value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="toggles-grid">
                  <Toggle
                    label="Camera shake"
                    checked={settings.cameraShake}
                    onChange={(value) => updateSetting("cameraShake", value)}
                  />
                  <Toggle
                    label="Flash"
                    checked={settings.flash}
                    onChange={(value) => updateSetting("flash", value)}
                  />
                  <Toggle
                    label="Zoom"
                    checked={settings.zoom}
                    onChange={(value) => updateSetting("zoom", value)}
                  />
                  <Toggle
                    label="Slow Motion"
                    checked={settings.slowMotion}
                    onChange={(value) => updateSetting("slowMotion", value)}
                  />
                  <Toggle
                    label="Speed Ramp"
                    checked={settings.speedRamp}
                    onChange={(value) => updateSetting("speedRamp", value)}
                  />
                  <Toggle
                    label="Text"
                    checked={settings.text}
                    onChange={(value) => updateSetting("text", value)}
                  />
                  <Toggle
                    label="Intro"
                    checked={settings.intro}
                    onChange={(value) => updateSetting("intro", value)}
                  />
                  <Toggle
                    label="Outro"
                    checked={settings.outro}
                    onChange={(value) => updateSetting("outro", value)}
                  />
                </div>
                <div className="volume-grid">
                  <label>
                    <span>
                      Original game audio
                      <strong>{settings.gameAudioVolume}%</strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.gameAudioVolume}
                      onChange={(event) =>
                        updateSetting(
                          "gameAudioVolume",
                          Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>
                      Music
                      <strong>{settings.musicVolume}%</strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.musicVolume}
                      onChange={(event) =>
                        updateSetting("musicVolume", Number(event.target.value))
                      }
                    />
                  </label>
                </div>
              </div>
            </details>
          </section>

          {error && (
            <div className="error-banner" role="alert">
              <CircleAlert size={20} />
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)}>
                <X size={17} />
              </button>
            </div>
          )}

          <section className="create-bar">
            <div>
              <WandSparkles size={22} />
              <span>
                <small>Selected engine</small>
                <strong>
                  {
                    STYLE_CARDS.find((style) => style.id === settings.style)
                      ?.name
                  }
                </strong>
              </span>
            </div>
            <button
              type="button"
              className="primary-button"
              disabled={!clips.length}
              onClick={projectId ? rerender : uploadProject}
            >
              <Sparkles size={20} />
              {projectId ? "ПОВТОРНО ЗМОНТУВАТИ" : "СТВОРИТИ AI-МОНТАЖ"}
              <ArrowRight size={20} />
            </button>
          </section>
        </>
      )}

      {screen === "processing" && (
        <section className="processing-screen">
          <div className="processing-visual">
            <div className="render-orbit">
              <span />
              <span />
              <WandSparkles size={38} />
            </div>
            <small>VIDEO WORKER · ACTIVE</small>
            <h1>Монтуємо твій момент</h1>
            <p>{job?.message ?? `Завантаження — ${uploadProgress}%`}</p>
          </div>

          <div className="progress-panel">
            <div className="overall-progress">
              <span>
                <strong>{Math.round(progress)}%</strong>
                <small>реальний статус обробки</small>
              </span>
              <div>
                <i style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="phase-list">
              {PHASES.map((phase, index) => {
                const isUpload =
                  !job && phase.id === "uploading" && uploadProgress < 100;
                const complete =
                  (!job &&
                    phase.id === "uploading" &&
                    uploadProgress === 100) ||
                  visiblePhaseIndex > index;
                const active =
                  isUpload ||
                  job?.phase === phase.id ||
                  (job?.phase === "queued" && phase.id === "analyzing");
                const skippedMusic =
                  phase.id === "syncing" && !music && visiblePhaseIndex > index;
                return (
                  <div
                    key={phase.id}
                    className={`${complete ? "complete" : ""} ${
                      active ? "active" : ""
                    }`}
                  >
                    <span className="phase-icon">
                      {complete ? (
                        <Check size={16} />
                      ) : active ? (
                        <LoaderCircle size={16} />
                      ) : (
                        <span />
                      )}
                    </span>
                    <strong>{phase.label}</strong>
                    <small>
                      {skippedMusic
                        ? "пропущено — трек не додано"
                        : active
                          ? "виконується"
                          : complete
                            ? "готово"
                            : "очікує"}
                    </small>
                  </div>
                );
              })}
            </div>
            <p className="processing-note">
              Не закривайте цю сторінку під час рендера. Усі відсотки надходять
              із backend job, а не імітуються інтерфейсом.
            </p>
          </div>
        </section>
      )}

      {screen === "result" && projectId && (
        <section className="result-screen">
          <button type="button" className="back-button" onClick={resetProject}>
            <ArrowLeft size={18} />
            Новий проєкт
          </button>
          <div className="result-heading">
            <div className="result-check">
              <Check size={28} />
            </div>
            <span>RENDER COMPLETE</span>
            <h1>Монтаж готовий</h1>
            <p>
              Вертикальний MP4 підготовлено у вибраному стилі. Перегляньте
              результат і монтажний план перед завантаженням.
            </p>
          </div>

          <div className="result-layout">
            <div className="result-player">
              <video
                key={projectId + (job?.updatedAt ?? "")}
                src={apiUrl(`/api/projects/${projectId}/render`)}
                controls
                playsInline
                preload="metadata"
              />
            </div>
            <div className="result-details">
              <div className="result-stats">
                <span>
                  <small>FORMAT</small>
                  <strong>9:16 · MP4</strong>
                </span>
                <span>
                  <small>STYLE</small>
                  <strong>
                    {
                      STYLE_CARDS.find((style) => style.id === settings.style)
                        ?.name
                    }
                  </strong>
                </span>
                <span>
                  <small>DURATION</small>
                  <strong>{editPlan?.duration ?? "—"} sec</strong>
                </span>
                <span>
                  <small>SELECTED</small>
                  <strong>{editPlan?.clips.length ?? "—"} moments</strong>
                </span>
              </div>
              {editPlan?.warnings.length ? (
                <div className="plan-warnings">
                  {editPlan.warnings.map((warning) => (
                    <p key={warning}>
                      <CircleAlert size={16} /> {warning}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="result-actions">
                <a
                  className="primary-button"
                  href={apiUrl(`/api/projects/${projectId}/render?download=1`)}
                  download={`tavi-ai-montage-${projectId.slice(0, 8)}.mp4`}
                >
                  <Download size={19} />
                  Завантажити MP4
                </a>
                <button type="button" onClick={rerender}>
                  <RotateCcw size={18} />
                  Створити ще раз
                </button>
                <button type="button" onClick={changeStyle}>
                  <Clapperboard size={18} />
                  Змінити стиль
                </button>
              </div>
              <button
                type="button"
                className="developer-toggle"
                onClick={() => setShowPlan((current) => !current)}
              >
                <Code2 size={18} />
                Developer · {showPlan ? "Hide" : "Show"} Edit Plan
                <ChevronDown size={18} className={showPlan ? "rotated" : ""} />
              </button>
            </div>
          </div>

          {showPlan && editPlan && (
            <div className="edit-plan">
              <div className="edit-plan-heading">
                <span>
                  <Code2 size={18} />
                  EDIT DECISION LIST · JSON
                </span>
                <small>
                  timestamps, effects, activity score та причина вибору
                </small>
              </div>
              <pre>{JSON.stringify(editPlan, null, 2)}</pre>
            </div>
          )}
        </section>
      )}

      <footer className="studio-footer">
        <span>TaVi AI Montage Studio</span>
        <span>Окремий експериментальний прототип · MLBB</span>
      </footer>
    </main>
  );
}
