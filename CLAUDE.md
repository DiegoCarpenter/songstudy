# CLAUDE.md — SongStudy (UBC 2026 Hackathon)

Solo builder, **low time budget (~12 focused hours)**. Goal: a complete, polished submission that meets every UBC requirement. Not chasing every prize.
Hard deadline: **Fri Nov 20, 12:00 PM CST (10:00 AM PT)** on Devpost. Internal target: **submitted by 8:30 AM PT Fri.**
Prefer the simplest thing that looks great. No speculative features. If a choice is between "more features" and "smoother demo," pick the demo.

## What we're building

**SongStudy turns your study notes into songs you can't get out of your head.**

1. A student pastes notes or uploads a PDF/.md/.txt.
2. They pick a vibe: a preset (lo-fi, pop-punk, country, hip-hop, etc.) or "something like <a song I love>".
3. Claude pulls out the key facts and writes mnemonic lyrics (verse = details, chorus = the core concept), keeping a fact → lyric map.
4. **ElevenLabs Music** generates the song from a composition plan, with word timestamps, and the app plays it with **synced karaoke lyrics**.
5. The student can **publish** the song to their class: its content hash and price go onchain on **Arc**, and classmates **unlock it for a few cents in USDC** that go straight to the creator.

Pitch line: *"NotebookLM made your notes into a podcast. SongStudy makes them into a song, and lets your classmates pay you a few cents to study with it."*

## Hackathon targeting

- **Main track:** Consumer Applications. Requirements: interact with the blockchain + working user-facing frontend. Theme: crypto invisible to the user.
- **Chain award:** Best use of Arc. Requirements: core onchain functionality on Arc testnet, Foundry, contract address + "how we use Arc" in README.
- **Bounty:** ElevenLabs. Requirements: API/SDK as a core feature, demo video shows it with audio, README lists products used and how.
- Not entering Gemini, QuickNode, or Grok Bot.
- **Rules:** all code written during the hackathon (repo created Nov 18). Sponsor SDKs as dependencies are fine.

## "Similar to a song" (copyright-safe by design)

ElevenLabs Music rejects artist names, song titles, and copyrighted lyrics (`bad_prompt` / `bad_composition_plan` errors with a suggestion).
So: when the user types a reference song, **Claude converts it into neutral descriptors only**: genre, sub-genre, BPM range, key/mode, mood, instrumentation, vocal style, era/production feel.
**Never send artist names, song titles, or lyrics to ElevenLabs.** If ElevenLabs still returns a bad-prompt error, retry once with its returned suggestion, then fall back to the preset closest to the descriptors. Show the user the descriptors ("Vibe: upbeat pop-punk, ~160 BPM, palm-muted guitars, energetic male vocals") so it's transparent.

## Stack

| Layer | Choice |
|---|---|
| App | **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui**, single app in `web/`, deploy to **Vercel** |
| LLM | `@anthropic-ai/sdk`, model from `ANTHROPIC_MODEL`. Structured JSON output, validated with zod |
| Music | `@elevenlabs/elevenlabs-js`: we build the `music_v2_5` composition plan (`chunks`: `[Section]\nlines`, `durationMs`, `positiveStyles`) ourselves, then `music.composeDetailed({ compositionPlan, modelId: "music_v2_5", withTimestamps: true })` → `{ audio, json.wordsTimestamps[{word,startMs,endMs}] }`. The SDK types `client.music` as the generated client; at runtime it's the wrapper (cast in `lib/elevenlabs.ts`) |
| Files | PDF text via `pdf-parse` (server route). Audio + metadata JSON stored in **Vercel Blob** |
| Chain | **Arc testnet**: chain ID `5042002`, RPC `https://rpc.testnet.arc.network` (alt `https://rpc.testnet.arc.io`), explorer `https://testnet.arcscan.app`, faucet `https://faucet.circle.com` |
| USDC | ERC-20 at `0x3600000000000000000000000000000000000000`, **6 decimals** (native gas view is 18 decimals; don't mix) |
| Contracts | Solidity ^0.8.24, **Foundry**, in `contracts/` |
| Wallet | wagmi + viem + RainbowKit (custom Arc chain). Stretch: Circle user-controlled wallets (email login) |

Verify every SDK call against current docs before coding (ElevenLabs Music, Arc, Vercel Blob). If reality differs from this file, follow the docs and update this file.

## Repo layout

```
contracts/  Foundry: src/SongStudyMarket.sol, test/SongStudyMarket.t.sol, script/Deploy.s.sol
web/        Next.js app
  app/page.tsx                 Landing + "Make a song" flow
  app/song/[id]/page.tsx       Player with synced lyrics, publish / unlock
  app/library/page.tsx         Published songs (from contract events)
  app/api/extract/route.ts     PDF/text → plain text
  app/api/lyrics/route.ts      notes + vibe → { descriptors, lyrics sections, factMap }
  app/api/song/route.ts        composition plan + ElevenLabs compose → Blob upload
  lib/arc.ts, lib/contract.ts, lib/elevenlabs.ts, lib/claude.ts, lib/schemas.ts
docs/       BUILD_PLAN.md, DEVPOST.md
```

## Lyrics generation spec (`/api/lyrics`)

Input: `{ notesText, vibe: { preset?: string, reference?: string }, lengthSec: 60|90|120 }` (cap notes at ~6k chars; summarize first if longer).
Claude returns (zod-validated):
```ts
{
  title: string,
  descriptors: { genre: string, bpm: number, key?: string, mood: string[], instruments: string[], vocals: string },
  sections: { name: "Verse 1"|"Chorus"|"Verse 2"|"Bridge"|"Outro", lines: string[] }[],
  factMap: { fact: string, lyricLine: string }[]
}
```
Rules for the prompt: lyrics must be **accurate to the notes** (no invented facts), singable, short lines, the chorus repeats the single most important concept, 5–10 facts total. Descriptors must contain **no artist names or song titles**.

## Song generation spec (`/api/song`)

1. Build a composition plan from `descriptors` (global positive styles) + `sections` (one chunk per section with its lines and a duration that sums to `lengthSec`).
2. Call ElevenLabs compose; get audio bytes (+ word timestamps if supported).
3. Upload `audio.mp3` and `meta.json` (title, descriptors, sections, factMap, timestamps) to Vercel Blob. (Dev: written to `web/public/generated/<id>/`, gitignored; swap `lib/storage.ts` for Blob at deploy.)
4. Return `{ id, audioUrl, metaUrl }`.
Generation takes a while: show a progress UI with stages (Reading notes → Writing lyrics → Composing → Mixing). Cache results; never regenerate on page reload.

## SongStudyMarket contract (Arc testnet)

```
struct Track { address creator; uint96 price; bytes32 contentHash; string metadataURI; uint64 createdAt; }
publish(bytes32 contentHash, uint96 price, string metadataURI) returns (uint256 id)
unlock(uint256 id)           // USDC transferFrom(listener → creator), records access; free if price == 0
hasAccess(uint256 id, address who) view returns (bool)   // creator always has access
tip(uint256 id, uint256 amount)
events: Published(id, creator, contentHash, price, metadataURI), Unlocked(id, listener, price), Tipped(id, from, amount)
```
- `contentHash = keccak256(audio bytes || lyrics JSON)`: proof of authorship and timestamp.
- Custom errors, no admin keys, no fees. Foundry tests: publish, unlock pays creator exactly, double-unlock reverts, free track, tip, hasAccess.
- Library page lists tracks from `Published` events (viem `getLogs`). Locked tracks show title, vibe, and a 10-second preview; full audio and lyrics after unlock.

## UI direction

Clean, warm, "study app," not "crypto app." Big drop zone, vibe chips, a satisfying generation progress state, and a player with large synced lyrics where the current line highlights. Show the fact → lyric map under the player ("this line teaches: …").
Crypto stays in the background: prices shown as "$0.05", wallet connect only when publishing/unlocking, explorer link tucked into a "Receipt" detail.

## Conventions

- TypeScript strict; zod at every API boundary; keys only server-side.
- Next 16 with `cacheComponents`: don't export `runtime` from routes (build error); Node is the default. Read `web/node_modules/next/dist/docs/` before using Next APIs.
- Secrets only in `.env.local` (gitignored); keep `.env.example` current. Never print or commit keys.
- Small commits, push after each milestone.
- Seed 2–3 demo songs (e.g., an econometrics one) so the demo never waits on generation.

## Definition of done

- [ ] Public GitHub repo; README setup works from a clean clone
- [ ] SongStudyMarket deployed on Arc testnet; address + example txs in README
- [ ] Notes → lyrics → ElevenLabs song works end to end on the deployed Vercel app
- [ ] Synced-lyrics player, publish, unlock with USDC
- [ ] README: architecture, how we use Arc, how we use ElevenLabs, copyright-safe vibe matching, setup, next steps
- [ ] 2–3 min demo video with audible song
- [ ] Devpost: Consumer Applications, chain award Arc, bounty ElevenLabs, all answers filled
