# SongStudy 🎧

**Turn your study notes into songs you can't get out of your head.**
Built solo for the University Blockchain Conference 2026 Hackathon (Austin).

> NotebookLM made your notes into a podcast. SongStudy makes them into a song, and lets your classmates pay you a few cents to study with it.

| | |
|---|---|
| Track | Consumer Applications |
| Chain award | Best use of Arc |
| Bounty | ElevenLabs |
| Live app | TODO: Vercel URL |
| Demo video | TODO: link |
| SongStudyMarket (Arc testnet) | TODO: `0x…` · [arcscan](https://testnet.arcscan.app) |

TODO: hero screenshot / GIF of the synced-lyrics player

---

## The problem

Re-reading notes is the least effective way to study, and everyone knows songs stick. You still remember jingles from when you were eight.
But turning a lecture into a song takes musical skill and hours of time. And good study material is trapped in individual notebooks, with no easy way for a student to share it and get paid for it.

## What SongStudy does

1. **Drop in your notes.** Paste text or upload a PDF.
2. **Pick a vibe.** Choose a preset, or say "something like a song I love." SongStudy turns that into a style (genre, tempo, mood, instruments, vocals) without copying the song.
3. **Get a song.** Claude pulls out the key facts and writes accurate, singable lyrics, with the core concept in the chorus. ElevenLabs Music sings it.
4. **Study with synced lyrics.** Karaoke-style lyrics, plus a map showing which fact each line teaches.
5. **Share with your class.** Publish your song for a few cents. Classmates unlock it with USDC that goes straight to you, and the song's fingerprint is recorded onchain as proof you made it.

## Architecture

```
TODO: replace with a final diagram

Notes (text / PDF) ──► /api/extract ──► /api/lyrics (Claude) ──► descriptors + lyrics + fact map
                                                   │
                                                   ▼
                         /api/song: ElevenLabs Music (composition plan + timestamps)
                                                   │
                                                   ▼
                              Vercel Blob (audio + metadata) ──► Player with synced lyrics
                                                   │ publish (contentHash, price, metadataURI)
                                                   ▼
                              SongStudyMarket.sol on Arc testnet ◄── classmates unlock with USDC
```

## How we use ElevenLabs

TODO: finalize. SongStudy uses the **Eleven Music API**: a **composition plan** built from Claude's lyrics (one section per verse/chorus, with global and per-section styles), then `compose` to generate the full vocal track, plus word **timestamps** to drive the synced-lyrics player. Music is the product, not an add-on.

### Copyright-safe "sounds like"

Users can name a song they love, but SongStudy never sends artist names, titles, or lyrics to the music model. Claude translates the reference into neutral style descriptors (genre, BPM, key, mood, instruments, vocal style), and the user sees those descriptors before generating. If the model still flags a prompt, SongStudy retries with ElevenLabs' suggested prompt, then falls back to the closest preset.

## How we use Arc

TODO: finalize. `SongStudyMarket` is deployed on Arc testnet.
- **USDC as the price and the gas.** Songs cost $0.05, and fees are dollar-denominated and predictable, so micro-prices make sense.
- **Publish:** stores the creator, price, metadata URI, and `contentHash = keccak256(audio ‖ lyrics)` as a timestamped proof of authorship.
- **Unlock:** moves USDC (ERC-20 at `0x3600000000000000000000000000000000000000`) from the listener directly to the creator. No platform fee, no custody.
- Contract: TODO address
- Example publish tx: TODO
- Example unlock tx: TODO

## Tech stack

Next.js · TypeScript · Tailwind · shadcn/ui · Claude API · ElevenLabs Music API · Vercel Blob · Solidity · Foundry · viem · wagmi · RainbowKit · Arc testnet · USDC

## Setup

```bash
git clone https://github.com/TODO/songstudy && cd songstudy

# contracts
cd contracts && forge install && forge test -vv && cd ..

# web
cd web && cp ../.env.example .env.local   # fill in keys
npm install && npm run dev                 # http://localhost:3000
```

TODO: deploy command and env vars for Vercel.

## What's next

- Email-login wallets (Circle user-controlled wallets) so classmates never see a seed phrase
- Quiz mode that turns the fact map into flashcards
- Class spaces: a professor or TA curates the official song pack for an exam
- Revenue splits for co-authored songs

## Acknowledgements

Built during UBC 2026 (Nov 18–20). Uses the ElevenLabs, Anthropic, and Vercel SDKs, and Circle's Arc testnet.
