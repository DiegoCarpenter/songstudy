"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { activeLineIndex, alignLines } from "@/lib/align";
import type { Descriptors, FactMapItem, SongMeta } from "@/lib/schemas";

export function infoLine(d: Descriptors, lengthSec: number, facts: number) {
  const mins = lengthSec === 60 ? "1 min" : lengthSec === 90 ? "1.5 min" : "2 min";
  return [d.genre, `${Math.round(d.bpm)} BPM`, mins, `${facts} facts`].join(" · ");
}

export function SongTitle({ title, info, fullVibe }: { title: string; info: string; fullVibe?: string }) {
  return (
    <div className="shrink-0">
      <h1 className="text-[2.6rem] font-normal leading-[1.1] tracking-tight">{title}</h1>
      <p className="mt-2 truncate text-[15px] text-muted-foreground" title={fullVibe}>{info}</p>
    </div>
  );
}

export function fmt(ms: number) {
  if (!Number.isFinite(ms)) return "0:00";
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Full player: pill transport, hero synced lyrics, fact cards. `actions` renders in a row under the transport. */
export function Player({ audioUrl, meta, actions }: { audioUrl: string; meta: SongMeta; actions?: React.ReactNode }) {
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
        <PlayButton playing={playing} onClick={toggle} />
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
      {actions && <div className="relative z-20 mt-3 flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}

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

      <FactCards facts={meta.factMap} activeIndex={activeFact} rowRef={cardsRef} cardRefs={cardRefs} />
    </>
  );
}

export function FactCards({
  facts,
  activeIndex = -1,
  rowRef,
  cardRefs,
  locked = false,
}: {
  facts: FactMapItem[];
  activeIndex?: number;
  rowRef?: React.RefObject<HTMLDivElement | null>;
  cardRefs?: React.RefObject<(HTMLDivElement | null)[]>;
  locked?: boolean;
}) {
  return (
    <div className="shrink-0 pt-3">
      <p className="mb-2 px-1 text-sm font-medium text-foreground/80">What each line teaches</p>
      <div ref={rowRef} className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        {facts.map((f, i) => (
          <div
            key={i}
            ref={(el) => { if (cardRefs) cardRefs.current[i] = el; }}
            className={`h-[104px] w-64 shrink-0 overflow-hidden rounded-2xl px-4 py-3 transition-colors ${i === activeIndex ? "bg-brand-soft ring-1 ring-brand/30" : "bg-app"}`}
          >
            {locked ? (
              <>
                <div className="h-3.5 w-4/5 rounded-full bg-black/[.07]" />
                <div className="mt-2 h-3.5 w-3/5 rounded-full bg-black/[.07]" />
                <p className="mt-3 line-clamp-2 text-xs leading-snug text-muted-foreground">Unlock to see this fact</p>
              </>
            ) : (
              <>
                <p className="line-clamp-2 text-sm italic leading-snug">“{f.lyricLine}”</p>
                <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{f.fact}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayButton({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={playing ? "Pause" : "Play"} className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground transition hover:brightness-105">
      {playing ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}

// ---------- Icons (inline, generic) ----------

export function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <rect x="8" y="13" width="3" height="9" rx="1.5" fill="white" opacity=".75" />
      <rect x="14.5" y="9" width="3" height="14" rx="1.5" fill="white" />
      <rect x="21" y="15" width="3" height="7" rx="1.5" fill="white" opacity=".75" />
    </svg>
  );
}
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export function NoteIcon({ className = "size-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>;
}
export function LockIcon({ className = "size-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>;
}
export function CheckIcon({ className = "size-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}
export function UploadIcon() {
  return <svg viewBox="0 0 24 24" className="size-4" {...stroke} aria-hidden><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>;
}
export function PasteIcon() {
  return <svg viewBox="0 0 24 24" className="size-4" {...stroke} aria-hidden><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /></svg>;
}
export function ShareIcon({ className = "size-4" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden><circle cx="7" cy="12" r="2.5" /><circle cx="17" cy="6" r="2.5" /><circle cx="17" cy="18" r="2.5" /><path d="m9.2 10.8 5.6-3.4M9.2 13.2l5.6 3.4" /></svg>;
}
export function ExternalIcon({ className = "size-3.5" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
}
export function PlayIcon() {
  return <svg viewBox="0 0 24 24" className="ml-0.5 size-4" fill="currentColor" aria-hidden><path d="M7 4.5v15l13-7.5z" /></svg>;
}
export function PauseIcon() {
  return <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>;
}
