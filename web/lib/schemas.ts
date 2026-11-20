import { z } from "zod";

export const SECTION_NAMES = ["Verse 1", "Chorus", "Verse 2", "Bridge", "Outro"] as const;
export const LENGTHS = [60, 90, 120] as const;

/** Raw notes we accept before summarizing. Above this we ask the user to trim. */
export const MAX_NOTES_CHARS = 200_000;
/** Notes longer than this get condensed to key facts before lyric writing. */
export const NOTES_SUMMARIZE_THRESHOLD = 6_000;

// ---------- Claude output (lyrics) ----------

export const DescriptorsSchema = z.object({
  genre: z.string().describe("Genre and sub-genre, e.g. 'upbeat pop-punk'. No artist names or song titles."),
  bpm: z.number().describe("Tempo in beats per minute, 60-200."),
  key: z.string().optional().describe("Key and mode, e.g. 'E major'."),
  mood: z.array(z.string()).describe("2-4 mood words."),
  instruments: z.array(z.string()).describe("3-6 instruments or production elements."),
  vocals: z.string().describe("Vocal style, e.g. 'energetic male lead vocals'."),
});
export type Descriptors = z.infer<typeof DescriptorsSchema>;

export const SectionSchema = z.object({
  name: z.enum(SECTION_NAMES),
  lines: z.array(z.string()),
});
export type Section = z.infer<typeof SectionSchema>;

export const FactMapItemSchema = z.object({
  fact: z.string().describe("The fact from the notes, stated plainly."),
  lyricLine: z.string().describe("The exact lyric line (copied verbatim from sections) that teaches this fact."),
});
export type FactMapItem = z.infer<typeof FactMapItemSchema>;

export const LyricsResultSchema = z.object({
  title: z.string(),
  descriptors: DescriptorsSchema,
  sections: z.array(SectionSchema),
  factMap: z.array(FactMapItemSchema),
});
export type LyricsResult = z.infer<typeof LyricsResultSchema>;

// ---------- API inputs ----------

export const VibeSchema = z
  .object({
    preset: z.string().trim().min(1).max(40).optional(),
    reference: z.string().trim().min(1).max(200).optional(),
  })
  .refine((v) => v.preset || v.reference, { message: "Pick a preset or describe a song you love." });
export type Vibe = z.infer<typeof VibeSchema>;

const LengthSchema = z.union([z.literal(60), z.literal(90), z.literal(120)]);

export const LyricsRequestSchema = z.object({
  notesText: z.string().trim().min(40, "Paste at least a few sentences of notes.").max(MAX_NOTES_CHARS),
  vibe: VibeSchema,
  lengthSec: LengthSchema,
});
export type LyricsRequest = z.infer<typeof LyricsRequestSchema>;

/** Stricter re-validation of Claude's output before it reaches ElevenLabs (API line/section limits). */
export const SongRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  descriptors: DescriptorsSchema.extend({ bpm: z.number().min(40).max(220) }),
  sections: z
    .array(SectionSchema.extend({ lines: z.array(z.string().trim().min(1).max(200)).min(1).max(30) }))
    .min(2)
    .max(10),
  factMap: z.array(FactMapItemSchema).max(20),
  lengthSec: LengthSchema,
});
export type SongRequest = z.infer<typeof SongRequestSchema>;

// ---------- Stored metadata ----------

export type WordTimestamp = { word: string; startMs: number; endMs: number };

export type SongMeta = {
  id: string;
  createdAt: string;
  title: string;
  vibeLabel?: string;
  lengthSec: number;
  /** Descriptors actually used for generation (after any fallback). */
  descriptors: Descriptors;
  sections: Section[];
  factMap: FactMapItem[];
  /** Word timestamps from ElevenLabs (empty if the API returned none). */
  timestamps: WordTimestamp[];
  /** How the music style was resolved: as written, ElevenLabs' suggestion, or a preset fallback. */
  styleSource: "descriptors" | "elevenlabs_suggestion" | `preset:${string}`;
  model: string;
  audioFile: string;
};
