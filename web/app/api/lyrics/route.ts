import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { generateLyrics, LlmError } from "@/lib/claude";
import { describeVibe } from "@/lib/presets";
import { LyricsRequestSchema } from "@/lib/schemas";

export const maxDuration = 120;

/** notes + vibe → { title, descriptors, sections, factMap, vibeLabel } */
export async function POST(req: Request) {
  const parsed = LyricsRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  try {
    const { lyrics, condensed } = await generateLyrics(parsed.data);
    return NextResponse.json({ ...lyrics, vibeLabel: describeVibe(lyrics.descriptors), condensed });
  } catch (e) {
    if (e instanceof LlmError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "Busy right now. Try again in a minute." }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) {
      console.error("[lyrics] auth", e.message);
      return NextResponse.json({ error: "Lyrics service isn't configured." }, { status: 500 });
    }
    if (e instanceof Anthropic.APIError) {
      console.error("[lyrics] api", e.status, e.message);
      return NextResponse.json({ error: "The lyrics service had a problem. Try again." }, { status: 502 });
    }
    console.error("[lyrics]", e);
    return NextResponse.json({ error: "Something went wrong writing lyrics." }, { status: 500 });
  }
}
