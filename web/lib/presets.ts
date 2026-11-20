import type { Descriptors } from "./schemas";

export type Preset = { id: string; label: string; emoji: string; descriptors: Descriptors };

export const PRESETS: Preset[] = [
  {
    id: "lofi",
    label: "Lo-fi study",
    emoji: "🎧",
    descriptors: {
      genre: "lo-fi hip-hop with sung vocals",
      bpm: 82,
      key: "F major",
      mood: ["calm", "warm", "focused"],
      instruments: ["dusty drum loop", "mellow electric piano", "warm bass", "vinyl crackle"],
      vocals: "soft, relaxed female vocals",
    },
  },
  {
    id: "pop-punk",
    label: "Pop-punk",
    emoji: "🎸",
    descriptors: {
      genre: "upbeat pop-punk",
      bpm: 165,
      key: "E major",
      mood: ["energetic", "fun", "anthemic"],
      instruments: ["palm-muted distorted guitars", "driving drums", "punchy bass"],
      vocals: "energetic male lead vocals with gang-vocal chorus",
    },
  },
  {
    id: "country",
    label: "Country",
    emoji: "🤠",
    descriptors: {
      genre: "modern country pop",
      bpm: 100,
      key: "G major",
      mood: ["warm", "upbeat", "storytelling"],
      instruments: ["acoustic guitar", "banjo", "pedal steel", "steady drums"],
      vocals: "warm male country vocals",
    },
  },
  {
    id: "hip-hop",
    label: "Hip-hop",
    emoji: "🎤",
    descriptors: {
      genre: "boom-bap hip-hop with a sung hook",
      bpm: 92,
      key: "A minor",
      mood: ["confident", "rhythmic", "clever"],
      instruments: ["punchy boom-bap drums", "sampled piano", "deep bass", "scratches"],
      vocals: "clear, confident rap verses and a melodic sung chorus",
    },
  },
  {
    id: "pop",
    label: "Pop",
    emoji: "✨",
    descriptors: {
      genre: "bright modern pop",
      bpm: 118,
      key: "C major",
      mood: ["catchy", "bright", "uplifting"],
      instruments: ["synth pads", "four-on-the-floor drums", "plucky synth", "claps"],
      vocals: "bright, clear female pop vocals",
    },
  },
  {
    id: "folk",
    label: "Acoustic folk",
    emoji: "🪕",
    descriptors: {
      genre: "acoustic indie folk",
      bpm: 96,
      key: "D major",
      mood: ["gentle", "earnest", "cozy"],
      instruments: ["fingerpicked acoustic guitar", "soft hand percussion", "upright bass", "harmonies"],
      vocals: "gentle male and female duet vocals",
    },
  },
  {
    id: "edm",
    label: "EDM",
    emoji: "⚡",
    descriptors: {
      genre: "melodic EDM",
      bpm: 126,
      key: "A minor",
      mood: ["euphoric", "driving", "energetic"],
      instruments: ["supersaw synths", "punchy kick", "sidechained pads", "risers"],
      vocals: "clear, soaring female vocals",
    },
  },
  {
    id: "musical",
    label: "Musical theater",
    emoji: "🎭",
    descriptors: {
      genre: "Broadway-style musical theater show tune",
      bpm: 120,
      key: "Bb major",
      mood: ["theatrical", "joyful", "dramatic"],
      instruments: ["piano", "brass section", "strings", "show drums"],
      vocals: "powerful, expressive theatrical vocals",
    },
  },
];

export function findPreset(id?: string): Preset | undefined {
  if (!id) return undefined;
  const key = id.toLowerCase();
  return PRESETS.find((p) => p.id === key || p.label.toLowerCase() === key);
}

/** Pick the preset whose descriptors share the most words with the given ones (fallback when ElevenLabs rejects a style). */
export function closestPreset(d: Descriptors): Preset {
  const words = (s: string) => s.toLowerCase().match(/[a-z]+/g) ?? [];
  const target = new Set(words([d.genre, ...d.mood, ...d.instruments, d.vocals].join(" ")));
  let best = PRESETS.find((p) => p.id === "pop")!;
  let bestScore = -1;
  for (const p of PRESETS) {
    const pd = p.descriptors;
    const genreHits = words(pd.genre).filter((w) => target.has(w)).length * 3;
    const otherHits = words([...pd.mood, ...pd.instruments, pd.vocals].join(" ")).filter((w) => target.has(w)).length;
    const bpmPenalty = Math.abs(pd.bpm - d.bpm) / 40;
    const score = genreHits + otherHits - bpmPenalty;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

export function describeVibe(d: Descriptors): string {
  return [d.genre, `~${Math.round(d.bpm)} BPM`, d.key, ...d.instruments.slice(0, 2), d.vocals]
    .filter(Boolean)
    .join(", ");
}
