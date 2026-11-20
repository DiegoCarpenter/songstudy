import { NextResponse } from "next/server";
import { composeSong, MUSIC_MODEL, MusicError } from "@/lib/elevenlabs";
import { describeVibe } from "@/lib/presets";
import { SongRequestSchema, type SongMeta } from "@/lib/schemas";
import { listSongs, newSongId, saveSong } from "@/lib/storage";

export const maxDuration = 300;

/**
 * lyrics + descriptors → ElevenLabs composition plan → compose (with word timestamps) → save audio + meta.
 * Only neutral descriptors and our own lyrics are sent to ElevenLabs; never the user's reference text.
 */
export async function POST(req: Request) {
  const parsed = SongRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: `Invalid song request: ${i?.path.join(".")} ${i?.message}` }, { status: 400 });
  }
  const { title, descriptors, sections, factMap, lengthSec } = parsed.data;

  try {
    const song = await composeSong(descriptors, sections, lengthSec);
    const meta: SongMeta = {
      id: newSongId(title),
      createdAt: new Date().toISOString(),
      title,
      vibeLabel: describeVibe(song.descriptors),
      lengthSec,
      descriptors: song.descriptors,
      sections,
      factMap,
      timestamps: song.timestamps,
      styleSource: song.styleSource,
      model: MUSIC_MODEL,
      audioFile: "audio.mp3",
    };
    const urls = await saveSong(meta, song.audio);
    return NextResponse.json({ id: meta.id, ...urls, meta });
  } catch (e) {
    const message = e instanceof MusicError ? e.message : "Music generation failed.";
    console.error("[song]", e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** List generated songs (newest first) so pages can reuse them instead of regenerating. */
export async function GET() {
  const songs = await listSongs();
  return NextResponse.json({
    songs: songs.map((m) => ({ id: m.id, title: m.title, vibeLabel: m.vibeLabel, createdAt: m.createdAt, audioUrl: `/generated/${m.id}/${m.audioFile}`, metaUrl: `/generated/${m.id}/meta.json` })),
  });
}
