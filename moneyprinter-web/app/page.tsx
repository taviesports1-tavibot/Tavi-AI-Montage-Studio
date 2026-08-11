"use client";

import { useEffect, useMemo, useState } from "react";
import { Film, Sparkles, WandSparkles, Download, LoaderCircle, CircleCheck, CircleX } from "lucide-react";

const API = (process.env.NEXT_PUBLIC_MPT_API_URL ?? "").replace(/\/+$/, "");

type Task = {
  task_id: string;
  state: number;
  progress?: number;
  videos?: string[];
  error?: string | null;
};

function absUrl(value: string) {
  if (/^https?:\/\//.test(value)) return value;
  return `${API}${value.startsWith("/") ? value : `/${value}`}`;
}

export default function Page() {
  const [subject, setSubject] = useState("");
  const [script, setScript] = useState("");
  const [aspect, setAspect] = useState("9:16");
  const [source, setSource] = useState("pexels");
  const [voice, setVoice] = useState("ru-RU-SvetlanaNeural-Female");
  const [subtitles, setSubtitles] = useState(true);
  const [bgm, setBgm] = useState("random");
  const [status, setStatus] = useState<Task | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [backend, setBackend] = useState<"checking" | "online" | "offline">(API ? "checking" : "offline");

  useEffect(() => {
    if (!API) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    fetch(`${API}/health`, { cache: "no-store", signal: controller.signal })
      .then((response) => setBackend(response.ok ? "online" : "offline"))
      .catch(() => setBackend("offline"))
      .finally(() => window.clearTimeout(timer));
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const ready = useMemo(() => subject.trim().length >= 3 && !busy, [subject, busy]);

  async function generate() {
    if (!API) {
      setError("Backend MoneyPrinterTurbo ещё не подключён. Нужен NEXT_PUBLIC_MPT_API_URL.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus(null);
    try {
      const create = await fetch(`${API}/api/v1/videos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          video_subject: subject,
          video_script: script,
          video_aspect: aspect,
          video_source: source,
          voice_name: voice,
          subtitle_enabled: subtitles,
          bgm_type: bgm,
          video_count: 1,
          video_clip_duration: 5,
          match_materials_to_script: true,
        }),
      });
      const created = await create.json();
      const taskId = created?.data?.task_id;
      if (!create.ok || !taskId) throw new Error(created?.message || "Не удалось создать задачу.");

      for (;;) {
        const response = await fetch(`${API}/api/v1/tasks/${encodeURIComponent(taskId)}`, { cache: "no-store" });
        const body = await response.json();
        const task = body?.data as Task | undefined;
        if (!response.ok || !task) throw new Error(body?.message || "Не удалось получить статус генерации.");
        setStatus(task);
        if (task.state < 0) throw new Error(task.error || "Генерация завершилась ошибкой.");
        if (task.state === 1 && task.videos?.length) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка генерации.");
    } finally {
      setBusy(false);
    }
  }

  const video = status?.videos?.[0];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand"><span className="logo"><Film size={22}/></span><div><strong>AI Video Factory</strong><small>powered by MoneyPrinterTurbo</small></div></div>
        <div className={`backend ${backend}`}>
          {backend === "online" ? <CircleCheck size={16}/> : backend === "offline" ? <CircleX size={16}/> : <LoaderCircle className="spin" size={16}/>}
          {backend === "online" ? "Сервер готов" : backend === "offline" ? "Сервер не подключён" : "Проверка сервера"}
        </div>
      </header>

      <section className="hero">
        <div><span className="eyebrow"><Sparkles size={15}/> AI CONTENT ENGINE</span><h1>Тема → сценарий → материалы → голос → субтитры → <em>готовое видео</em></h1><p>Создавай вертикальные ролики для TikTok, Shorts и Reels практически автоматически.</p></div>
        <div className="heroCard"><WandSparkles size={34}/><strong>One-click pipeline</strong><span>LLM · Stock video · TTS · Captions · Music · Render</span></div>
      </section>

      <section className="grid">
        <div className="panel mainPanel">
          <label><span>Тема видео</span><input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Например: 5 фактов о космосе, которые звучат невероятно" /></label>
          <label><span>Сценарий <small>необязательно</small></span><textarea value={script} onChange={e=>setScript(e.target.value)} placeholder="Оставь пустым — AI напишет сценарий сам." /></label>
          <div className="row3">
            <label><span>Формат</span><select value={aspect} onChange={e=>setAspect(e.target.value)}><option>9:16</option><option>16:9</option><option>1:1</option></select></label>
            <label><span>Материалы</span><select value={source} onChange={e=>setSource(e.target.value)}><option value="pexels">Pexels</option><option value="pixabay">Pixabay</option><option value="coverr">Coverr</option><option value="local">Local</option></select></label>
            <label><span>Музыка</span><select value={bgm} onChange={e=>setBgm(e.target.value)}><option value="random">Авто</option><option value="none">Без музыки</option></select></label>
          </div>
          <label><span>Голос</span><input value={voice} onChange={e=>setVoice(e.target.value)} /></label>
          <label className="toggle"><input type="checkbox" checked={subtitles} onChange={e=>setSubtitles(e.target.checked)} /><span>Автоматические субтитры</span></label>
          {error && <div className="error">{error}</div>}
          <button className="primary" disabled={!ready || backend !== "online"} onClick={generate}>{busy ? <><LoaderCircle className="spin" size={20}/> Генерация…</> : <><Sparkles size={20}/> Создать видео</>}</button>
        </div>

        <aside className="panel statusPanel">
          <h2>Pipeline</h2>
          {status ? <><div className="progress"><i style={{width:`${Math.max(5,status.progress ?? 0)}%`}}/></div><strong>{status.progress ?? 0}%</strong><p>{status.state === 1 ? "Видео готово" : "MoneyPrinterTurbo выполняет задачу…"}</p></> : <p className="muted">После запуска здесь будет отображаться прогресс генерации.</p>}
          {video && <div className="result"><video src={absUrl(video)} controls playsInline /><a href={absUrl(video)} target="_blank" rel="noreferrer"><Download size={18}/> Открыть готовое MP4</a></div>}
        </aside>
      </section>
    </main>
  );
}
