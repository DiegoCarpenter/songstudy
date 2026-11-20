import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { findPreset } from "./presets";
import {
  LyricsResultSchema,
  NOTES_SUMMARIZE_THRESHOLD,
  type LyricsRequest,
  type LyricsResult,
} from "./schemas";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

/** Server-side refusal fallback: if the model declines, the API reruns on a fallback model in the same call. */
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

/** Approximate sung lines per song length (keeps lyrics singable at the target duration). */
const LINE_BUDGET: Record<number, string> = { 60: "14-18", 90: "20-26", 120: "26-34" };

export class LlmError extends Error {}

async function condenseNotes(notes: string): Promise<string> {
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    system:
      "You condense study notes into the facts a student most needs to memorize. Keep definitions, formulas, names, dates, numbers and cause-effect relationships exactly as written. Never add facts that are not in the notes.",
    messages: [
      {
        role: "user",
        content: `<notes>\n${notes}\n</notes>\n\nCondense these notes into at most 25 short bullet points (under 4000 characters total), most important concepts first.`,
      },
    ],
    output_config: { format: betaZodOutputFormat(z.object({ bullets: z.array(z.string()) })) },
  });
  assertUsable(res.stop_reason);
  const bullets = res.parsed_output?.bullets;
  if (!bullets?.length) throw new LlmError("Couldn't summarize the notes.");
  return bullets.map((b) => `- ${b}`).join("\n");
}

function assertUsable(stop: string | null) {
  if (stop === "refusal") throw new LlmError("The model declined to write lyrics for these notes.");
  if (stop === "max_tokens") throw new LlmError("The lyrics response was cut off. Try shorter notes.");
}

const SYSTEM = `You are SongStudy's lyricist. You turn a student's study notes into a short, catchy, singable mnemonic song.

Accuracy rules (most important):
- Every factual claim in the lyrics must come from the notes. Never invent facts, numbers, names, or examples.
- Keep technical terms, formulas and numbers correct. Rephrase formulas into speakable words if needed ("beta hat equals covariance over variance").
- Pick the 5-10 facts that matter most for an exam.

Song rules:
- Structure: Verse 1 (details) -> Chorus (the single most important concept) -> Verse 2 (more details) -> Chorus (identical repeat) -> optional Bridge (a memory trick or contrast) -> optional Outro (1-2 lines recapping the core idea). Repeat the Chorus section verbatim each time it appears.
- Short lines (about 4-10 words), natural stress, rhymes or near-rhymes where possible. No line over 120 characters.
- No section labels, stage directions, or brackets inside lines.
- Title: short and catchy, about the topic.

Style descriptors rules (copyright safety):
- Describe the musical style ONLY with neutral descriptors: genre/sub-genre, BPM, key/mode, mood, instrumentation, vocal style, era/production feel.
- NEVER include artist names, band names, song titles, album titles, or lyrics from existing songs anywhere in the output, including the descriptors, the title and the lyrics.
- If the student names a reference song or artist, translate it into those neutral descriptors (e.g. a famous 2000s pop-punk band -> "upbeat pop-punk, ~160 BPM, palm-muted guitars, energetic male vocals").

factMap: one entry per fact taught; lyricLine must be copied verbatim from one of the lines in sections.`;

export async function generateLyrics(req: LyricsRequest): Promise<{ lyrics: LyricsResult; condensed: boolean }> {
  let notes = req.notesText.trim();
  let condensed = false;
  if (notes.length > NOTES_SUMMARIZE_THRESHOLD) {
    notes = await condenseNotes(notes);
    condensed = true;
  }

  const preset = findPreset(req.vibe.preset);
  const vibeText = req.vibe.reference
    ? `The student wants it to feel like: "${req.vibe.reference}". Convert that into neutral style descriptors only (no names or titles).`
    : `Preset vibe: ${preset?.label ?? req.vibe.preset}. Use these descriptors as the base (you may tweak mood words to fit the topic): ${JSON.stringify(preset?.descriptors ?? {})}`;

  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    ...FALLBACK,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `<notes>\n${notes}\n</notes>\n\n${vibeText}\n\nTarget length: ${req.lengthSec} seconds, so about ${LINE_BUDGET[req.lengthSec]} sung lines in total across all sections (count the repeated chorus each time).`,
      },
    ],
    output_config: { format: betaZodOutputFormat(LyricsResultSchema) },
  });
  assertUsable(res.stop_reason);
  if (!res.parsed_output) throw new LlmError("The lyrics came back in an unexpected format. Please try again.");

  const lyrics = res.parsed_output;
  // Preset path: keep the preset's sound stable even if the model drifted.
  if (preset && !req.vibe.reference) {
    lyrics.descriptors = { ...preset.descriptors, mood: lyrics.descriptors.mood.length ? lyrics.descriptors.mood : preset.descriptors.mood };
  }
  if (req.vibe.reference) lyrics.descriptors = scrubReference(lyrics.descriptors, req.vibe.reference);
  return { lyrics, condensed };
}

/**
 * Belt and braces: drop any descriptor that echoes words from the user's reference (artist/title).
 * Generic music words (e.g. "rock", "love") are allowed, since they are style, not identity.
 */
const GENERIC = new Set(
  "the a an by of and in on to my me you your i song songs like something feel feels vibe style music sound sounds love rock pop punk band".split(" "),
);
function scrubReference<T extends LyricsResult["descriptors"]>(d: T, reference: string): T {
  const refWords = (reference.toLowerCase().match(/[a-z0-9']+/g) ?? []).filter((w) => w.length > 2 && !GENERIC.has(w));
  if (!refWords.length) return d;
  const clean = (s: string) => {
    const lw = new Set(s.toLowerCase().match(/[a-z0-9']+/g) ?? []);
    return !refWords.some((w) => lw.has(w));
  };
  return {
    ...d,
    genre: clean(d.genre) ? d.genre : "upbeat pop",
    key: d.key && clean(d.key) ? d.key : undefined,
    mood: d.mood.filter(clean),
    instruments: d.instruments.filter(clean),
    vocals: clean(d.vocals) ? d.vocals : "clear lead vocals",
  };
}
