"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { activeLineIndex, alignLines } from "@/lib/align";
import { PRESETS } from "@/lib/presets";
import type { LyricsResult, SongMeta } from "@/lib/schemas";

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

export default function DevPipeline() {
  const [notes, setNotes] = useState("");
  const [preset, setPreset] = useState<string>("pop-punk");
  const [reference, setReference] = useState("");
  const [lengthSec, setLengthSec] = useState<60 | 90 | 120>(60);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LyricsResponse | null>(null);
  const [song, setSong] = useState<{ audioUrl: string; meta: SongMeta } | null>(null);
  const [library, setLibrary] = useState<SongListItem[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

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
  }

  const busy = stage === "reading" || stage === "writing" || stage === "composing";
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs transition ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`;

  return (
    <main className="flex h-dvh flex-col overflow-hidden px-6 py-4">
      <header className="mb-3 flex shrink-0 items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Notes → lyrics → song</h1>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Dev pipeline</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[35fr_65fr] gap-6">
        {/* ---------- Left: inputs ---------- */}
        <section className="min-h-0 space-y-4 overflow-y-auto pr-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium" htmlFor="notes">Notes</label>
              <label className="cursor-pointer text-xs text-primary underline-offset-4 hover:underline">
                Upload PDF / .md / .txt
                <input type="file" accept=".pdf,.md,.markdown,.txt,application/pdf,text/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              </label>
            </div>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={8}
              placeholder="Paste lecture notes here…"
              className="w-full resize-y rounded-lg border bg-background p-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">{notes.length.toLocaleString()} chars{notes.length > 6000 ? " · will be condensed to key facts first" : ""}</p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium">Vibe</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.id} onClick={() => { setPreset(p.id); setReference(""); }} className={chip(!reference && preset === p.id)}>
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder='…or "something like <a song I love>"'
              className="mt-2 w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Length</span>
            {([60, 90, 120] as const).map((s) => (
              <button key={s} onClick={() => setLengthSec(s)} className={chip(lengthSec === s)}>{s}s</button>
            ))}
          </div>

          <Button disabled={busy || notes.trim().length < 40} onClick={generate} className="w-full">
            {busy ? "Working…" : "Make my song"}
          </Button>

          <ol className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {STAGES.map((s, i) => {
              const cur = STAGES.findIndex((x) => x.key === stage);
              const state = stage === "error" ? "text-muted-foreground" : i < cur ? "text-foreground" : i === cur ? "font-semibold text-primary" : "text-muted-foreground";
              return <li key={s.key} className={state}>{i < cur || stage === "done" ? "✓" : i === cur ? "●" : "○"} {s.label}</li>;
            })}
            {busy && startedAt && <li className="text-muted-foreground tabular-nums">{elapsed}s</li>}
          </ol>
          {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">{error}</p>}

          {library.length > 0 && (
            <div>
              <p className="mb-1.5 text-sm font-medium">Generated songs</p>
              <ul className="divide-y rounded-lg border text-sm">
                {library.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => openSaved(s)} className={`w-full px-3 py-1.5 text-left hover:bg-muted ${song?.meta.id === s.id ? "bg-muted" : ""}`}>
                      <span className="font-medium">{s.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{s.vibeLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ---------- Right: the song ---------- */}
        <section className="flex min-h-0 flex-col gap-3">
          {song ? (
            <Player key={song.meta.id} audioUrl={song.audioUrl} meta={song.meta} />
          ) : lyrics ? (
            <LyricsPreview lyrics={lyrics} />
          ) : (
            <div className="grid flex-1 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">Your song will show up here.</div>
          )}
        </section>
      </div>
    </main>
  );
}

/** Title + description, clamped to 2 lines with a "more" toggle when it overflows. */
function SongHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setOverflows(el.scrollHeight > el.clientHeight + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [description]);

  return (
    <div className="shrink-0 rounded-xl border px-4 py-3">
      <h2 className="text-xl font-semibold leading-tight">{title}</h2>
      {description && (
        <div className="mt-0.5 text-sm text-muted-foreground">
          <p ref={descRef} className={expanded ? "" : "line-clamp-2"}>Vibe: {description}</p>
          {(overflows || expanded) && (
            <button onClick={() => setExpanded((v) => !v)} className="text-xs font-medium text-primary hover:underline">
              {expanded ? "less" : "more"}
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function LyricsPreview({ lyrics }: { lyrics: LyricsResponse }) {
  return (
    <>
      <SongHeader title={lyrics.title} description={lyrics.vibeLabel}>
        <p className="mt-2 text-xs text-muted-foreground">Composing the music…</p>
      </SongHeader>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-xl border px-6 py-5">
        {lyrics.sections.map((s, i) => (
          <div key={i}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.name}</p>
            {s.lines.map((l, j) => <p key={j} className="text-lg">{l}</p>)}
          </div>
        ))}
      </div>
    </>
  );
}

function Player({ audioUrl, meta }: { audioUrl: string; meta: SongMeta }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [t, setT] = useState(0);
  const [factsOpen, setFactsOpen] = useState(true);
  const lines = useMemo(() => alignLines(meta.sections, meta.timestamps), [meta]);
  const active = activeLineIndex(lines, t);
  const synced = lines.filter((l) => l.startMs !== null).length;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (audioRef.current) setT(audioRef.current.currentTime * 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keep the current line centered in the lyrics panel.
  useEffect(() => {
    const box = scrollRef.current;
    const el = lineRefs.current[Math.max(0, active)];
    if (!box || !el) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2, behavior: "smooth" });
  }, [active]);

  const lineClass = (i: number) => {
    const d = active < 0 ? i : Math.abs(i - active);
    if (i === active) return "text-3xl font-bold text-foreground";
    if (d === 1) return "text-xl font-medium text-foreground/75";
    return "text-xl text-foreground/25";
  };

  return (
    <>
      <SongHeader title={meta.title} description={meta.vibeLabel}>
        <audio ref={audioRef} src={audioUrl} controls className="mt-2 h-9 w-full" />
        <p className="mt-1 text-[11px] text-muted-foreground">
          {meta.timestamps.length} word timestamps · {synced}/{lines.length} lines synced · style: {meta.styleSource}
        </p>
      </SongHeader>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto rounded-xl border px-8 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]"
      >
        {/* Half-height spacers let the first and last lines reach the center. */}
        <div className="h-[45%]" aria-hidden />
        {lines.map((l, i) => {
          const header = i === 0 || lines[i - 1].section !== l.section ? l.section : null;
          return (
            <div key={i}>
              {header && <p className="mt-5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">{header}</p>}
              <button
                ref={(el) => { lineRefs.current[i] = el; }}
                onClick={() => { if (audioRef.current && l.startMs !== null) { audioRef.current.currentTime = l.startMs / 1000; void audioRef.current.play(); } }}
                className={`block py-1 text-left leading-snug transition-all duration-300 ${lineClass(i)}`}
              >
                {l.text}
              </button>
            </div>
          );
        })}
        <div className="h-[45%]" aria-hidden />
      </div>

      <div className="shrink-0 rounded-xl border">
        <button onClick={() => setFactsOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-2 text-sm font-medium">
          What each line teaches <span className="text-xs text-muted-foreground">{meta.factMap.length} facts {factsOpen ? "▾" : "▸"}</span>
        </button>
        {factsOpen && (
          <ul className="h-32 space-y-2 overflow-y-auto border-t px-4 py-3 text-sm">
            {meta.factMap.map((f, i) => {
              const isActive = active >= 0 && lines[active]?.text === f.lyricLine;
              return (
                <li key={i} className={isActive ? "rounded-md bg-muted px-2 py-1" : "px-2"}>
                  <span className="italic">“{f.lyricLine}”</span>
                  <span className="text-muted-foreground"> → {f.fact}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
