# SongStudy: Build Plan (~12 focused hours)

All times **Pacific**. Deadline **Fri Nov 20, 10:00 AM PT**. Target: **submitted by 8:30 AM PT**.
Commit + push at the end of every block.

---

## Block 0: Accounts + repo (Wed, ~45 min)

- [ ] Devpost: https://ubc-hackathon-2026.devpost.com → **Join hackathon** → start a draft project named "SongStudy"
- [ ] Telegram: https://t.me/+Q0hy2P7nbIk2YWIx
- [ ] ElevenLabs credits: Discord https://discord.com/invite/VnBvbbcdEC → #coupon-codes → Start Redemption (Devpost email). **Confirm your plan includes Music API access** (try one 10-second generation)
- [ ] Keys: Anthropic, ElevenLabs, Vercel (Blob store)
- [ ] MetaMask: add Arc testnet (chain 5042002, RPC https://rpc.testnet.arc.network, symbol USDC). Make 2 accounts (creator + classmate), fund both at https://faucet.circle.com
- [ ] Create the repo and push this starter (commands in the chat / README)

**Claude Code prompt:**
> Read CLAUDE.md. Scaffold the repo: Foundry project in contracts/, Next.js App Router + TypeScript + Tailwind + shadcn/ui in web/. Add .env.example entries as needed. No feature code yet. Show me the tree, then commit.

## Block 1: The magic pipeline (Wed, ~3.5 h)

- [ ] `/api/extract` (PDF + text), `/api/lyrics` (Claude → zod schema), `/api/song` (ElevenLabs composition plan → compose → Vercel Blob)
- [ ] A bare page that runs the whole flow and plays the result
- [ ] Generate 2 seed songs from your real notes (e.g., EC 320 econometrics, and one other class)

**Claude Code prompt:**
> Implement the lyrics and song pipeline exactly per "Lyrics generation spec" and "Song generation spec" in CLAUDE.md. Read the current ElevenLabs Music docs first (composition plans, compose, timestamps, bad_prompt handling) and the Vercel Blob docs. Build a temporary page at /dev that takes pasted notes plus a vibe and plays the generated song. Handle the reference-song case by converting it to neutral descriptors, and never send artist names or titles to ElevenLabs.

**Stop for the night once a song plays.**

## Block 2: Contract on Arc (Thu morning, ~1.5 h)

- [ ] `SongStudyMarket.sol` + Foundry tests per CLAUDE.md
- [ ] Deploy to Arc testnet, verify on arcscan, put the address in `.env.local` and README

**Claude Code prompt:**
> Implement contracts/src/SongStudyMarket.sol per CLAUDE.md with custom errors and the listed events. USDC is the ERC-20 at 0x3600000000000000000000000000000000000000 with 6 decimals. Write Foundry tests (publish, unlock pays creator exactly, double unlock reverts, free track, tip, hasAccess) and run forge test -vv until green. Add script/Deploy.s.sol and give me the exact forge command to deploy and verify on Arc testnet (chain 5042002).

## Block 3: Real UI (Thu, ~3.5 h)

- [ ] Landing + "Make a song" flow: drop zone → vibe chips / "like a song I love" → length → generate with staged progress
- [ ] Song page: player with **synced karaoke lyrics**, fact → lyric map, Publish (price $0.00–$0.25)
- [ ] Library: published tracks from `Published` events; locked = preview + Unlock (approve USDC → unlock); unlocked = full song
- [ ] RainbowKit with Arc testnet; "Receipt" link to arcscan
- [ ] Deploy to Vercel; test on your phone

**Claude Code prompt:**
> Build the real UI per "UI direction" in CLAUDE.md: landing/make-a-song flow, song page with synced lyrics from the stored word timestamps (highlight the current line), and the library page reading Published events from SongStudyMarket on Arc testnet. Use wagmi/viem/RainbowKit with a custom Arc testnet chain. Publish hashes audio+lyrics into contentHash. Unlock does USDC approve then unlock(). Make it warm and polished, mobile friendly, with crypto details tucked away. Then deploy to Vercel and give me the env vars to set there.

## Block 4: README + video + submit (Thu night ~1.5 h, Fri morning ~1 h)

- [ ] Fill every TODO in README.md (address, txs, screenshots, architecture)
- [ ] Clean-clone test following README
- [ ] Record the video per docs/DEVPOST.md (song audio must be audible)
- [ ] Upload YouTube unlisted / Drive "anyone with link"; check it in an incognito window
- [ ] Devpost: paste answers from docs/DEVPOST.md; track = Consumer Applications; chain award = Arc; bounty = ElevenLabs; opt in; **Submit by 8:30 AM PT Fri**

---

## Cut list (if short on time)

1. Tips → keep publish/unlock only
2. Karaoke sync → show static lyrics with the current section highlighted
3. PDF upload → paste text only
4. "Like a song I love" → presets only
5. Library previews → show title + vibe only

**Never cut:** the notes → song moment, deployed contract with a real unlock tx, deployed frontend, README, video.
