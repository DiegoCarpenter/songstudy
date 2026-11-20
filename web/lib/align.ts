import type { Section, WordTimestamp } from "./schemas";

export type TimedLine = { section: string; text: string; startMs: number | null; endMs: number | null };

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");

/**
 * Greedy, order-preserving alignment of lyric lines to ElevenLabs word timestamps.
 * Each lyric word looks a few timestamp words ahead for a match; a line's time span
 * comes from its first and last matched words. Lines with no matches get null times.
 */
export function alignLines(sections: Section[], words: WordTimestamp[]): TimedLine[] {
  const ts = words.map((w) => ({ ...w, n: norm(w.word) })).filter((w) => w.n);
  let cursor = 0;
  const LOOKAHEAD = 8;
  const out: TimedLine[] = [];
  for (const s of sections) {
    for (const line of s.lines) {
      let start: number | null = null;
      let end: number | null = null;
      for (const raw of line.split(/\s+/)) {
        const w = norm(raw);
        if (!w) continue;
        for (let j = cursor; j < Math.min(ts.length, cursor + LOOKAHEAD); j++) {
          if (ts[j].n === w) {
            start ??= ts[j].startMs;
            end = ts[j].endMs;
            cursor = j + 1;
            break;
          }
        }
      }
      out.push({ section: s.name, text: line, startMs: start, endMs: end });
    }
  }
  return out;
}

/** Index of the line being sung at time t (ms): the last line that has started. */
export function activeLineIndex(lines: TimedLine[], tMs: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    const st = lines[i].startMs;
    if (st !== null && st <= tMs) idx = i;
  }
  return idx;
}
