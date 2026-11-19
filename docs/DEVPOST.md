# Devpost submission draft

**Name:** SongStudy
**Tagline:** Turn your study notes into songs you can't forget, and let classmates unlock them for a few cents in USDC.

**Main track:** Consumer Applications
**Chain award:** Best use of Arc
**Bounties:** ElevenLabs (opt in)
**Built with:** ElevenLabs Music API, Claude, Next.js, TypeScript, Tailwind, Vercel, Solidity, Foundry, viem, wagmi, Arc, USDC

## What did you build?
SongStudy turns lecture notes or a PDF into an original song. Claude extracts the key facts and writes accurate, singable lyrics; ElevenLabs Music composes the track in the style the student picks; and the app plays it with synced karaoke lyrics plus a map of which fact each line teaches. Students can publish songs to their class on Arc, where classmates unlock them for a few cents of USDC paid directly to the creator.

## What problem does it solve?
Re-reading notes is a weak way to study, and songs are one of the strongest memory aids we have, but making one takes skill and hours. Good study material is also stuck in individual notebooks with no way for students to share it and get paid.

## How does it work?
TODO: 4–5 sentences on extract → lyrics (zod-validated JSON) → ElevenLabs composition plan + timestamps → Vercel Blob → SongStudyMarket on Arc (publish with content hash, unlock pays creator in USDC). Include the contract address.

## What makes it unique?
- Music, not a podcast: the format that actually sticks for memorization.
- "Sounds like a song I love," done in a copyright-safe way (style descriptors, never copies).
- Every lyric is traceable to a fact in your notes.
- Micro-prices that only make sense on a chain where USDC is the gas: study content for 5 cents, straight to the student who made it.

## What would you build next?
Email-login wallets, quiz mode from the fact map, class spaces curated by TAs, co-author revenue splits.

---

## Demo video script (target 2:30)

| Time | Show | Say |
|---|---|---|
| 0:00–0:15 | Landing page | "I can remember every word of a song from ten years ago, but not my econometrics notes from Tuesday. So I built SongStudy." |
| 0:15–0:40 | Paste/upload real EC 320 notes; pick a vibe; type "something like <a song you like>"; show the generated descriptors | "I drop in my notes and pick a vibe. If I name a song I like, SongStudy matches the feel, not the song itself." |
| 0:40–1:00 | Generation progress → lyrics + fact map appear | "Claude pulls out the key facts and writes the lyrics. Every line maps back to something in my notes." |
| 1:00–1:35 | **Play the song with audio**, synced lyrics highlighting | (let ~20 seconds of the chorus play) "That's ElevenLabs Music, with lyrics synced word by word." |
| 1:35–2:05 | Publish for $0.05 → switch to the classmate account → Library → Unlock → plays | "I publish it to my class. A classmate unlocks it for five cents of USDC on Arc, and it goes straight to me, with no platform in the middle." |
| 2:05–2:20 | Receipt → arcscan tx | "The song's fingerprint and the payment are onchain. Gas is paid in USDC, so it all stays in dollars." |
| 2:20–2:30 | Closing card | "SongStudy. Study songs you can't forget." |

Recording tips: use the seeded songs so you're not waiting on generation; record system audio (QuickTime screen recording with audio routed, or Loom/OBS); keep the browser zoomed to ~125%.
