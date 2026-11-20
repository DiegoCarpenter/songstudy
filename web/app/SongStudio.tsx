"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { activeLineIndex, alignLines } from "@/lib/align";
import { PRESETS } from "@/lib/presets";
import type { Descriptors, FactMapItem, LyricsResult, SongMeta } from "@/lib/schemas";

type Stage = "idle" | "reading" | "writing" | "composing" | "done" | "error";
type LyricsResponse = LyricsResult & { vibeLabel: string; condensed: boolean };
type SongListItem = { id: string; title: string; vibeLabel?: string; createdAt: string; audioUrl: string; metaUrl: string };

const STAGES: { key: Stage; label: string }[] = [
  { key: "reading", label: "Reading notes" },
  { key: "writing", label: "Writing lyrics" },
  { key: "composing", label: "Composing + mixing" },
  { key: "done", label: "Ready" },
];

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const pill = (on: boolean) =>
  `rounded-full px-3 py-1.5 text-sm transition-colors ${on ? "bg-brand text-brand-foreground" : "bg-muted text-foreground/80 hover:bg-black/[.07]"}`;

export default function SongStudio() {
  const [notes, setNotes] = useState("");
  const [preset, setPreset] = useState<string>("pop-punk");
  const [reference, setReference] = useState("");
  const [lengthSec, setLengthSec] = useState<60 | 90 | 120>(60);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LyricsResponse | null>(null);
  const [lyricsLength, setLyricsLength] = useState<number>(60);
  const [song, setSong] = useState<{ audioUrl: string; meta: SongMeta } | null>(null);
  const [library, setLibrary] = useState<SongListItem[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshLibrary = useCallback(async () => {
    const res = await fetch("/api/song").then((r) => r.json()).catch(() => ({ songs: [] }));
    setLibrary(res.songs ?? []);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/song")
      .then((r) => r.json())
      .then((res) => !cancelled && setLibrary(res.songs ?? []))
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!startedAt || stage === "done" || stage === "error") return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [startedAt, stage]);

  async function onFile(file: File) {
    setError(null);
    setStage("reading");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotes(data.text);
      setStage("idle");
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
    }
  }

  async function pasteNotes() {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) setNotes(text);
    } catch {
      // Clipboard blocked: just let them paste by hand.
    }
    notesRef.current?.focus();
  }

  function newSong() {
    setSong(null);
    setLyrics(null);
    setError(null);
    setStage("idle");
    notesRef.current?.focus();
  }

  async function generate() {
    setError(null);
    setSong(null);
    setLyrics(null);
    setStartedAt(Date.now());
    setElapsed(0);
    try {
      setStage("writing");
      const vibe = reference.trim() ? { reference: reference.trim() } : { preset };
      const l = await postJson<LyricsResponse>("/api/lyrics", { notesText: notes, vibe, lengthSec });
      setLyrics(l);
      setLyricsLength(lengthSec);

      setStage("composing");
      const s = await postJson<{ audioUrl: string; meta: SongMeta }>("/api/song", {
        title: l.title,
        descriptors: l.descriptors,
        sections: l.sections,
        factMap: l.factMap,
        lengthSec,
        vibeLabel: l.vibeLabel,
      });
      setSong(s);
      setStage("done");
      void refreshLibrary();
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
    }
  }

  async function openSaved(item: SongListItem) {
    const meta = (await fetch(item.metaUrl).then((r) => r.json())) as SongMeta;
    setLyrics(null);
    setError(null);
    setSong({ audioUrl: item.audioUrl, meta });
    setStage("done");
    setStartedAt(null); // opened from the list, not generated: hide the progress line
  }

  const busy = stage === "reading" || stage === "writing" || stage === "composing";
  const curStage = STAGES.findIndex((x) => x.key === stage);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* ---------- Top bar ---------- */}
      <header className="flex h-16 shrink-0 items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-[1.35rem] font-medium tracking-tight">SongStudy</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={newSong} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium hover:bg-black/[.05]">
            <span className="text-lg leading-none">+</span> New song
          </button>
          {/* Wallet connection lands with publish/unlock (Block 3). */}
          <button title="Wallet connect is coming with publishing" className="rounded-full border border-black/[.08] bg-white px-4 py-2 text-sm text-foreground/70 hover:bg-black/[.03]">
            Connect wallet
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-4">
        {/* ---------- Left panel: your notes ---------- */}
        <aside className="flex w-[30%] min-w-[340px] flex-col overflow-hidden rounded-3xl border border-black/[.06] bg-white">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
            <section>
              <h2 className="mb-3 text-base font-medium">Your notes</h2>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-2 rounded-full bg-muted px-4 py-2.5 text-sm font-medium hover:bg-black/[.07]">
                  <UploadIcon /> Upload file
                </button>
                <button onClick={pasteNotes} className="flex items-center justify-center gap-2 rounded-full bg-muted px-4 py-2.5 text-sm font-medium hover:bg-black/[.07]">
                  <PasteIcon /> Paste notes
                </button>
                <input ref={fileRef} type="file" accept=".pdf,.md,.markdown,.txt,application/pdf,text/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) void onFile(e.target.files[0]); e.target.value = ""; }} />
              </div>
              <textarea
                ref={notesRef}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={7}
                placeholder="Paste lecture notes, or upload a PDF, .md or .txt…"
                className="mt-3 w-full resize-none rounded-2xl bg-app px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-brand/30"
              />
              <p className="mt-1 px-1 text-xs text-muted-foreground">
                {notes.length ? `${notes.length.toLocaleString()} characters` : "PDF, Markdown or text"}
                {notes.length > 6000 ? " · we'll pull out the key facts first" : ""}
              </p>
            </section>

            <section>
              <h3 className="mb-2.5 text-sm font-medium">Vibe</h3>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p.id} onClick={() => { setPreset(p.id); setReference(""); }} className={pill(!reference && preset === p.id)}>
                    {p.emoji} {p.label}
                  </button>
                ))}
              </div>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="…or something like a song you love"
                className={`mt-2.5 w-full rounded-full px-4 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-brand/30 ${reference.trim() ? "bg-brand-soft ring-1 ring-brand/40" : "bg-app"}`}
              />
            </section>

            <section>
              <h3 className="mb-2.5 text-sm font-medium">Length</h3>
              <div className="flex gap-1.5">
                {([60, 90, 120] as const).map((s) => (
                  <button key={s} onClick={() => setLengthSec(s)} className={pill(lengthSec === s)}>
                    {s === 60 ? "1 min" : s === 90 ? "1.5 min" : "2 min"}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <button
                disabled={busy || notes.trim().length < 40}
                onClick={generate}
                className="w-full rounded-full bg-brand py-3 text-[15px] font-medium text-brand-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "Making your song…" : "Make my song"}
              </button>
              {stage !== "idle" && (startedAt || stage === "reading") && (
                <p className="mt-2.5 text-center text-xs text-muted-foreground">
                  {STAGES.map((s, i) => (
                    <span key={s.key} className={stage !== "error" && i === curStage && stage !== "done" ? "font-medium text-brand" : i < curStage || stage === "done" ? "text-foreground/70" : ""}>
                      {i > 0 && <span className="mx-1.5 text-black/20">·</span>}
                      {s.label}
                    </span>
                  ))}
                  {busy && startedAt && <span className="ml-2 tabular-nums">{elapsed}s</span>}
                </p>
              )}
              {error && <p className="mt-3 rounded-2xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p>}
            </section>

            {library.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-sm font-medium">Your songs</h3>
                <ul className="-mx-2">
                  {library.map((s) => {
                    const selected = song?.meta.id === s.id;
                    return (
                      <li key={s.id}>
                        <button onClick={() => openSaved(s)} className={`flex w-full items-start gap-3 rounded-2xl px-2 py-2 text-left transition-colors ${selected ? "bg-brand-soft" : "hover:bg-black/[.04]"}`}>
                          <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${selected ? "bg-brand text-brand-foreground" : "bg-muted text-foreground/60"}`}>
                            <NoteIcon />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{s.title}</span>
                            <span className="block truncate text-xs text-muted-foreground">{s.vibeLabel}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </aside>

        {/* ---------- Main: the song ---------- */}
        <main className="min-w-0 flex-1 overflow-hidden rounded-3xl border border-black/[.06] bg-white">
          <div className="mx-auto flex h-full max-w-[900px] flex-col px-10 pt-8 pb-6">
            {song ? (
              <Player key={song.meta.id} audioUrl={song.audioUrl} meta={song.meta} />
            ) : lyrics ? (
              <LyricsPreview lyrics={lyrics} lengthSec={lyricsLength} />
            ) : (
              <EmptyState busy={busy} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function infoLine(d: Descriptors, lengthSec: number, facts: number) {
  const mins = lengthSec === 60 ? "1 min" : lengthSec === 90 ? "1.5 min" : "2 min";
  return [d.genre, `${Math.round(d.bpm)} BPM`, mins, `${facts} facts`].join(" · ");
}

function SongTitle({ title, info, fullVibe }: { title: string; info: string; fullVibe?: string }) {
  return (
    <div className="shrink-0">
      <h1 className="text-[2.6rem] font-normal leading-[1.1] tracking-tight">{title}</h1>
      <p className="mt-2 truncate text-[15px] text-muted-foreground" title={fullVibe}>{info}</p>
    </div>
  );
}

function EmptyState({ busy }: { busy: boolean }) {
  return (
    <div className="grid flex-1 place-items-center text-center">
      <div>
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><NoteIcon className="size-7" /></div>
        <h1 className="text-2xl font-normal tracking-tight">{busy ? "Reading your notes…" : "Turn your notes into a song"}</h1>
        <p className="mx-auto mt-2 max-w-sm text-[15px] text-muted-foreground">
          Add your notes, pick a vibe, and SongStudy writes and sings a song that teaches the key facts.
        </p>
      </div>
    </div>
  );
}

function LyricsPreview({ lyrics, lengthSec }: { lyrics: LyricsResponse; lengthSec: number }) {
  return (
    <>
      <SongTitle title={lyrics.title} info={infoLine(lyrics.descriptors, lengthSec, lyrics.factMap.length)} fullVibe={lyrics.vibeLabel} />
      <div className="mt-5 flex h-12 shrink-0 items-center gap-3 rounded-full bg-app px-5 text-sm text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-brand" /> Composing the music…
      </div>
      <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto py-4">
        {lyrics.sections.map((s, i) => (
          <div key={i}>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/70">{s.name}</p>
            {s.lines.map((l, j) => <p key={j} className="text-2xl leading-snug text-foreground/45">{l}</p>)}
          </div>
        ))}
      </div>
    </>
  );
}

function fmt(ms: number) {
  if (!Number.isFinite(ms)) return "0:00";
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Player({ audioUrl, meta }: { audioUrl: string; meta: SongMeta }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(meta.lengthSec * 1000);
  const [playing, setPlaying] = useState(false);
  const lines = useMemo(() => alignLines(meta.sections, meta.timestamps), [meta]);
  const active = activeLineIndex(lines, t);
  const activeFact = active >= 0 ? meta.factMap.findIndex((f) => f.lyricLine === lines[active]?.text) : -1;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (audioRef.current) setT(audioRef.current.currentTime * 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keep the current line centered in the lyrics area.
  useEffect(() => {
    const box = scrollRef.current;
    const el = lineRefs.current[Math.max(0, active)];
    if (!box || !el) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2, behavior: "smooth" });
  }, [active]);

  // Bring the matching fact card into view (horizontal scroll only).
  useEffect(() => {
    const row = cardsRef.current;
    const card = activeFact >= 0 ? cardRefs.current[activeFact] : null;
    if (!row || !card) return;
    row.scrollTo({ left: card.offsetLeft - row.clientWidth / 2 + card.offsetWidth / 2, behavior: "smooth" });
  }, [activeFact]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play(); else a.pause();
  };
  const seek = (ms: number) => {
    if (audioRef.current) audioRef.current.currentTime = ms / 1000;
  };

  const lineClass = (i: number) => {
    if (i === active) return "text-[2.1rem] font-semibold text-foreground";
    if (active >= 0 && Math.abs(i - active) === 1) return "text-2xl text-foreground/70";
    return "text-2xl text-foreground/20";
  };

  return (
    <>
      <SongTitle title={meta.title} info={infoLine(meta.descriptors, meta.lengthSec, meta.factMap.length)} fullVibe={meta.vibeLabel} />

      {/* Slim pill player */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration * 1000)}
        className="hidden"
      />
      <div className="mt-5 flex h-12 shrink-0 items-center gap-4 rounded-full bg-app pl-1.5 pr-5">
        <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="grid size-9 place-items-center rounded-full bg-brand text-brand-foreground transition hover:brightness-105">
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{fmt(t)}</span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={100}
          value={Math.min(t, duration)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Seek"
          className="h-1 flex-1 cursor-pointer accent-[var(--brand)]"
        />
        <span className="w-10 text-xs tabular-nums text-muted-foreground">{fmt(duration)}</span>
      </div>

      {/* Synced lyrics (hero) */}
      <div
        ref={scrollRef}
        className="relative mt-2 min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_86%,transparent)]"
      >
        <div className="h-[45%]" aria-hidden />
        {lines.map((l, i) => {
          const header = i === 0 || lines[i - 1].section !== l.section ? l.section : null;
          return (
            <div key={i}>
              {header && <p className="mt-6 mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/60">{header}</p>}
              <button
                ref={(el) => { lineRefs.current[i] = el; }}
                onClick={() => { if (l.startMs !== null) { seek(l.startMs); void audioRef.current?.play(); } }}
                className={`block py-1 text-left leading-snug tracking-tight transition-all duration-300 ease-out ${lineClass(i)}`}
              >
                {l.text}
              </button>
            </div>
          );
        })}
        <div className="h-[45%]" aria-hidden />
      </div>

      {/* What each line teaches */}
      <div className="shrink-0 pt-3">
        <p className="mb-2 px-1 text-sm font-medium text-foreground/80">What each line teaches</p>
        <div ref={cardsRef} className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {meta.factMap.map((f: FactMapItem, i) => (
            <div
              key={i}
              ref={(el) => { cardRefs.current[i] = el; }}
              className={`h-[104px] w-64 shrink-0 overflow-hidden rounded-2xl px-4 py-3 transition-colors ${i === activeFact ? "bg-brand-soft ring-1 ring-brand/30" : "bg-app"}`}
            >
              <p className="line-clamp-2 text-sm italic leading-snug">“{f.lyricLine}”</p>
              <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{f.fact}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- Icons (inline, generic) ----------

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <rect x="8" y="13" width="3" height="9" rx="1.5" fill="white" opacity=".75" />
      <rect x="14.5" y="9" width="3" height="14" rx="1.5" fill="white" />
      <rect x="21" y="15" width="3" height="7" rx="1.5" fill="white" opacity=".75" />
    </svg>
  );
}
function NoteIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
    </svg>
  );
}
function PasteIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
    </svg>
  );
}
function PlayIcon() {
  return <svg viewBox="0 0 24 24" className="ml-0.5 size-4" fill="currentColor" aria-hidden><path d="M7 4.5v15l13-7.5z" /></svg>;
}
function PauseIcon() {
  return <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>;
}
