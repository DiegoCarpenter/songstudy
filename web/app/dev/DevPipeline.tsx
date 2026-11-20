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

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Dev pipeline</p>
        <h1 className="text-3xl font-semibold tracking-tight">Notes → lyrics → song</h1>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <section className="space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium" htmlFor="notes">Notes</label>
              <label className="cursor-pointer text-sm text-primary underline-offset-4 hover:underline">
                Upload PDF / .md / .txt
                <input type="file" accept=".pdf,.md,.markdown,.txt,application/pdf,text/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              </label>
            </div>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={12}
              placeholder="Paste lecture notes here…"
              className="w-full rounded-lg border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">{notes.length.toLocaleString()} chars{notes.length > 6000 ? " (will be condensed to key facts first)" : ""}</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Vibe</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setPreset(p.id); setReference(""); }}
                  className={`rounded-full border px-3 py-1 text-sm transition ${!reference && preset === p.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder='…or "something like <a song I love>"'
              className="mt-3 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Length</span>
            {([60, 90, 120] as const).map((s) => (
              <button key={s} onClick={() => setLengthSec(s)} className={`rounded-md border px-3 py-1 text-sm ${lengthSec === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {s}s
              </button>
            ))}
          </div>

          <Button size="lg" disabled={busy || notes.trim().length < 40} onClick={generate} className="w-full">
            {busy ? "Working…" : "Make my song"}
          </Button>

          <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {STAGES.map((s, i) => {
              const cur = STAGES.findIndex((x) => x.key === stage);
              const state = stage === "error" ? "text-muted-foreground" : i < cur ? "text-foreground" : i === cur ? "font-semibold text-primary" : "text-muted-foreground";
              return <li key={s.key} className={state}>{i < cur || stage === "done" ? "✓" : i === cur ? "●" : "○"} {s.label}</li>;
            })}
            {busy && startedAt && <li className="text-muted-foreground tabular-nums">{elapsed}s</li>}
          </ol>
          {error && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

          {library.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Generated songs</p>
              <ul className="divide-y rounded-lg border text-sm">
                {library.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => openSaved(s)} className="w-full px-3 py-2 text-left hover:bg-muted">
                      <span className="font-medium">{s.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{s.vibeLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="space-y-5">
          {song ? <Player audioUrl={song.audioUrl} meta={song.meta} /> : lyrics ? <LyricsPreview lyrics={lyrics} /> : (
            <div className="grid h-full min-h-64 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground">Your song will show up here.</div>
          )}
        </section>
      </div>
    </main>
  );
}

function LyricsPreview({ lyrics }: { lyrics: LyricsResponse }) {
  return (
    <div className="space-y-4 rounded-xl border p-5">
      <div>
        <h2 className="text-xl font-semibold">{lyrics.title}</h2>
        <p className="text-sm text-muted-foreground">Vibe: {lyrics.vibeLabel}</p>
      </div>
      {lyrics.sections.map((s, i) => (
        <div key={i}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.name}</p>
          {s.lines.map((l, j) => <p key={j}>{l}</p>)}
        </div>
      ))}
    </div>
  );
}

function Player({ audioUrl, meta }: { audioUrl: string; meta: SongMeta }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(0);
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-5">
        <h2 className="text-xl font-semibold">{meta.title}</h2>
        <p className="text-sm text-muted-foreground">Vibe: {meta.vibeLabel}</p>
        <audio ref={audioRef} src={audioUrl} controls className="mt-4 w-full" />
        <p className="mt-2 text-xs text-muted-foreground">
          {meta.timestamps.length} word timestamps · {synced}/{lines.length} lines synced · style: {meta.styleSource}
        </p>
      </div>

      <div className="max-h-[28rem] space-y-1 overflow-y-auto rounded-xl border p-5">
        {lines.map((l, i) => {
          const header = i === 0 || lines[i - 1].section !== l.section ? l.section : null;
          return (
            <div key={i}>
              {header && <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{header}</p>}
              <button
                onClick={() => { if (audioRef.current && l.startMs !== null) { audioRef.current.currentTime = l.startMs / 1000; void audioRef.current.play(); } }}
                className={`block text-left text-lg transition ${i === active ? "font-semibold text-primary" : "text-foreground/70"}`}
              >
                {l.text}
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border p-5">
        <p className="mb-2 text-sm font-medium">What each line teaches</p>
        <ul className="space-y-2 text-sm">
          {meta.factMap.map((f, i) => (
            <li key={i}>
              <span className="italic">“{f.lyricLine}”</span>
              <span className="block text-muted-foreground">→ {f.fact}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
