import "server-only";
import { ElevenLabsClient, ElevenLabsError, type ElevenLabs } from "@elevenlabs/elevenlabs-js";
import { closestPreset } from "./presets";
import type { Descriptors, Section, SongMeta, WordTimestamp } from "./schemas";

const client = new ElevenLabsClient(); // reads ELEVENLABS_API_KEY
export const MUSIC_MODEL = "music_v2_5" as const;

const MIN_CHUNK_MS = 3_000;
const MAX_CHUNK_MS = 120_000;

export class MusicError extends Error {}

/** Global style list for the first chunk. ElevenLabs recommends 6-7+ styles to set the tone. */
function stylesFrom(d: Descriptors): string[] {
  return [
    d.genre,
    `${Math.round(d.bpm)} BPM`,
    d.key,
    ...d.mood,
    ...d.instruments,
    d.vocals,
    "clear, intelligible lyrics",
    "great production quality",
  ].filter((s): s is string => Boolean(s && s.trim()));
}

/** Split the total length across sections in proportion to their line counts. Sums exactly to totalMs. */
export function allocateDurations(sections: Section[], totalMs: number): number[] {
  const weights = sections.map((s) => Math.max(1, s.lines.length));
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => Math.min(MAX_CHUNK_MS, Math.max(MIN_CHUNK_MS, Math.round(((totalMs * w) / sum) / 100) * 100)));
  // Push rounding drift into the longest section.
  const drift = totalMs - raw.reduce((a, b) => a + b, 0);
  const i = raw.indexOf(Math.max(...raw));
  raw[i] = Math.min(MAX_CHUNK_MS, Math.max(MIN_CHUNK_MS, raw[i] + drift));
  return raw;
}

export function buildCompositionPlan(d: Descriptors, sections: Section[], lengthSec: number): ElevenLabs.CompositionPlan {
  const durations = allocateDurations(sections, lengthSec * 1000);
  const global = stylesFrom(d);
  return {
    chunks: sections.map((s, i) => ({
      text: `[${s.name}]\n${s.lines.join("\n")}`,
      durationMs: durations[i],
      // First chunk carries the full style; later chunks keep it plus a little section flavor.
      positiveStyles:
        i === 0
          ? global
          : [...global.slice(0, 6), s.name === "Chorus" ? "big, catchy chorus" : s.name === "Bridge" ? "stripped-back bridge" : s.name === "Outro" ? "satisfying outro" : "verse groove"],
      negativeStyles: ["mumbled vocals", "muddy mix"],
      contextAdherence: "high",
    })),
  };
}

type BadPlan = { kind: "bad_prompt" | "bad_composition_plan"; suggestion?: ElevenLabs.CompositionPlan };

/** Recognize ElevenLabs' copyright rejections and pull out the suggested plan when present. */
function parseBadPlan(err: unknown): BadPlan | null {
  if (!(err instanceof ElevenLabsError)) return null;
  const detail = (err.body as { detail?: { status?: string; data?: Record<string, unknown> } } | undefined)?.detail;
  const status = detail?.status;
  if (status !== "bad_prompt" && status !== "bad_composition_plan") return null;
  const raw = detail?.data?.composition_plan_suggestion ?? detail?.data?.compositionPlanSuggestion;
  const suggestion = raw && typeof raw === "object" ? (camelize(raw) as ElevenLabs.CompositionPlan) : undefined;
  return { kind: status, suggestion: suggestion?.chunks?.length ? suggestion : undefined };
}

function camelize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(camelize);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v).map(([k, val]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), camelize(val)]),
    );
  return v;
}

/**
 * At runtime `client.music` is the SDK's wrapper, whose composeDetailed parses the multipart
 * response into { json, audio }, but the client getter is typed as the generated stream client.
 * This describes the wrapper's actual return (see node_modules/@elevenlabs/elevenlabs-js/wrapper/music.d.ts).
 */
type DetailedResult = {
  json: { songMetadata?: unknown; wordsTimestamps?: WordTimestamp[] };
  audio: Buffer;
  filename: string;
};

async function compose(plan: ElevenLabs.CompositionPlan) {
  const res = (await client.music.composeDetailed(
    { compositionPlan: plan, modelId: MUSIC_MODEL, withTimestamps: true },
    { timeoutInSeconds: 290, maxRetries: 0 },
  )) as unknown as DetailedResult;
  if (!res?.audio?.length) throw new MusicError("ElevenLabs returned no audio.");
  return { audio: res.audio, timestamps: res.json?.wordsTimestamps ?? [] };
}

/**
 * Compose with the copyright-safe fallback chain:
 * 1) our descriptors → 2) ElevenLabs' suggested plan (once) → 3) closest preset's descriptors.
 * Lyrics always stay ours; only styles change.
 */
export async function composeSong(
  descriptors: Descriptors,
  sections: Section[],
  lengthSec: number,
): Promise<{ audio: Buffer; timestamps: WordTimestamp[]; descriptors: Descriptors; styleSource: SongMeta["styleSource"] }> {
  const plan = buildCompositionPlan(descriptors, sections, lengthSec);
  try {
    return { ...(await compose(plan)), descriptors, styleSource: "descriptors" };
  } catch (err) {
    const bad = parseBadPlan(err);
    if (!bad) throw toMusicError(err);

    if (bad.suggestion) {
      try {
        return { ...(await compose(bad.suggestion)), descriptors, styleSource: "elevenlabs_suggestion" };
      } catch (err2) {
        if (!parseBadPlan(err2)) throw toMusicError(err2);
      }
    }
    const preset = closestPreset(descriptors);
    const fallbackPlan = buildCompositionPlan(preset.descriptors, sections, lengthSec);
    try {
      return { ...(await compose(fallbackPlan)), descriptors: preset.descriptors, styleSource: `preset:${preset.id}` };
    } catch (err3) {
      throw toMusicError(err3);
    }
  }
}

function toMusicError(err: unknown): MusicError {
  if (err instanceof ElevenLabsError) {
    const detail = (err.body as { detail?: unknown } | undefined)?.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : (detail as { message?: string } | undefined)?.message ?? `ElevenLabs error (${err.statusCode ?? "network"})`;
    if (err.statusCode === 401) return new MusicError("ElevenLabs rejected the API key.");
    if (err.statusCode === 402 || /quota|credit/i.test(msg)) return new MusicError("Out of ElevenLabs credits for music generation.");
    if (bad(detail)) return new MusicError("ElevenLabs flagged the lyrics. Try different notes or a different vibe.");
    return new MusicError(msg);
  }
  return new MusicError(err instanceof Error ? err.message : "Music generation failed.");
}
function bad(detail: unknown) {
  const s = (detail as { status?: string } | undefined)?.status;
  return s === "bad_prompt" || s === "bad_composition_plan" || s === "bad_lyrics";
}
