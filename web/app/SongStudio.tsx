"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PRESETS } from "@/lib/presets";
import type { LyricsResult, SongMeta } from "@/lib/schemas";
import { ClassLibraryList, LibraryTrackView } from "./components/ClassLibrary";
import { SharePanel } from "./components/SharePanel";
import { infoLine, LogoMark, NoteIcon, PasteIcon, Player, SongTitle, UploadIcon } from "./components/song-ui";
import { WalletPill } from "./components/wallet";

type Stage = "idle" | "reading" | "writing" | "composing" | "done" | "error";
type LyricsResponse = LyricsResult & { vibeLabel: string; condensed: boolean };
type SongListItem = { id: string; title: string; vibeLabel?: string; createdAt: string; audioUrl: string; metaUrl: string };
type Tab = "create" | "library";

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
  const [tab, setTab] = useState<Tab>("create");
  const [libraryKey, setLibraryKey] = useState<string | null>(null);
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
    setTab("create");
    setSong(null);
    setLyrics(null);
    setError(null);
    setStage("idle");
    setTimeout(() => notesRef.current?.focus(), 0);
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
          <WalletPill />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-4">
        {/* ---------- Left panel ---------- */}
        <aside className="flex w-[30%] min-w-[340px] flex-col overflow-hidden rounded-3xl border border-black/[.06] bg-white">
          <div className="shrink-0 px-5 pt-4">
            <div className="grid grid-cols-2 gap-1 rounded-full bg-app p-1">
              {(["create", "library"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`rounded-full py-1.5 text-sm transition-colors ${tab === t ? "bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-foreground/60 hover:text-foreground"}`}>
                  {t === "create" ? "Create" : "Class library"}
                </button>
              ))}
            </div>
          </div>

          {tab === "library" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <h2 className="mb-1 text-base font-medium">Class library</h2>
              <p className="mb-3 text-sm text-muted-foreground">Songs your classmates shared. Unlock one for a few cents; it goes straight to them.</p>
              <ClassLibraryList selected={libraryKey} onSelect={setLibraryKey} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
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
          )}
        </aside>

        {/* ---------- Main ---------- */}
        <main className="min-w-0 flex-1 overflow-hidden rounded-3xl border border-black/[.06] bg-white">
          <div className="mx-auto flex h-full max-w-[900px] flex-col px-10 pt-8 pb-6">
            {tab === "library" ? (
              libraryKey ? (
                <LibraryTrackView key={libraryKey} trackKey={libraryKey} />
              ) : (
                <Placeholder title="Your class library" body="Pick a song on the left to preview it. Unlock it to hear the whole thing with synced lyrics." />
              )
            ) : song ? (
              <Player key={song.meta.id} audioUrl={song.audioUrl} meta={song.meta} actions={<SharePanel audioUrl={song.audioUrl} meta={song.meta} />} />
            ) : lyrics ? (
              <LyricsPreview lyrics={lyrics} lengthSec={lyricsLength} />
            ) : (
              <Placeholder
                title={busy ? "Reading your notes…" : "Turn your notes into a song"}
                body="Add your notes, pick a vibe, and SongStudy writes and sings a song that teaches the key facts."
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid flex-1 place-items-center text-center">
      <div>
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand"><NoteIcon className="size-7" /></div>
        <h1 className="text-2xl font-normal tracking-tight">{title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-[15px] text-muted-foreground">{body}</p>
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
