# SongStudy 🎧

**Turn your study notes into songs you can't get out of your head.**
Built solo for the University Blockchain Conference 2026 Hackathon (Austin).

> NotebookLM made your notes into a podcast. SongStudy makes them into a song, and lets your classmates pay you a few cents to study with it.

| | |
|---|---|
| Track | Consumer Applications |
| Chain award | Best use of Arc |
| Bounty | ElevenLabs |
| Run it | Locally in ~2 minutes: see [Run it locally](#run-it-locally) |
| Demo video | TODO: link (shows the full flow end to end) |
| SongStudyMarket (Arc testnet) | [`0x5F7e6da30480Fc92190d17b3F51C7559c9F04A0F`](https://testnet.arcscan.app/address/0x5F7e6da30480Fc92190d17b3F51C7559c9F04A0F) (verified) |

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
             web/public/generated/<id>/ (audio.mp3 + meta.json) ──► Player with synced lyrics
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
- **Publish:** stores the creator, price, metadata URI, and `contentHash = keccak256(audio bytes ‖ JSON.stringify({ title, sections, factMap }))` as a timestamped proof of authorship. Anyone with the files can recompute it (`web/lib/onchain.ts`).
- **Unlock:** USDC `approve` then `unlock(id)` moves USDC (ERC-20 at `0x3600000000000000000000000000000000000000`) from the listener directly to the creator. No platform fee, no custody. `hasAccess(id, who)` keeps tracks unlocked across reloads; the creator always has access.
- **Class library:** built from `Published` events (viem `getLogs`, chunked to Arc's 10k-block limit); earnings come from `Unlocked` + `Tipped` events.
- Contract (verified source): [`0x5F7e6da30480Fc92190d17b3F51C7559c9F04A0F`](https://testnet.arcscan.app/address/0x5F7e6da30480Fc92190d17b3F51C7559c9F04A0F)
- Deploy tx: [`0xf664d75f…def9cc`](https://testnet.arcscan.app/tx/0xf664d75f6732f7079a1adea495ec0a7e3757a191a177dfa07b94184af8def9cc)
- Example publish tx: TODO
- Example unlock tx: TODO

## Tech stack

Next.js · TypeScript · Tailwind · shadcn/ui · Claude API · ElevenLabs Music API · Solidity · Foundry · viem · wagmi · RainbowKit · Arc testnet · USDC

## Run it locally

> **The demo video shows the full flow end to end** (notes → song → publish → a classmate unlocking with USDC). These steps let you run the same thing on your machine.

### What you need

- **Node.js 20.9+** and npm
- **MetaMask** (or another browser wallet) in Chrome. The app adds Arc testnet for you when you connect.
- **Testnet USDC** on Arc for gas and unlocks: <https://faucet.circle.com> (choose Arc Testnet). Two accounts (a "creator" and a "classmate") make the demo clearer.
- Optional, only to generate **new** songs: an Anthropic API key and an ElevenLabs API key with Music API access
- Optional, only to run the contract tests: [Foundry](https://book.getfoundry.sh/getting-started/installation)

### Start the app

```bash
git clone --recursive https://github.com/DiegoCarpenter/songstudy.git
cd songstudy
cp .env.example web/.env.local
cd web
npm install
npm run dev
```

Open <http://localhost:3000>.

**Two demo songs ship with the repo** (`web/public/generated/`), so you can play them, see the synced lyrics, and publish/unlock them with no API keys at all.

### Environment variables (`web/.env.local`)

| Variable | Needed for | Value |
|---|---|---|
| `ANTHROPIC_API_KEY` | Generating new songs (lyrics) | Your key from console.anthropic.com |
| `ANTHROPIC_MODEL` | Generating new songs | Prefilled: `claude-sonnet-5-5` |
| `ELEVENLABS_API_KEY` | Generating new songs (music) | Your key; the plan must include Music API access |
| `NEXT_PUBLIC_ARC_RPC_URL` | Onchain features | Prefilled: `https://rpc.testnet.arc.network` |
| `NEXT_PUBLIC_USDC_ADDRESS` | Onchain features | Prefilled: `0x3600000000000000000000000000000000000000` |
| `NEXT_PUBLIC_SONGSTUDY_MARKET_ADDRESS` | Onchain features | Prefilled: our deployed contract |
| `NEXT_PUBLIC_SONGSTUDY_MARKET_DEPLOY_BLOCK` | Class library | Prefilled: `73102727` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional | Adds mobile/QR wallets; MetaMask works without it |

Everything onchain is prefilled to point at the deployed `SongStudyMarket` on Arc testnet, so you don't need to deploy anything.

### Try the flow

1. **Play a seed song.** In **Your songs**, open *Dual Mandate Flow* and press play. The current lyric line stays centered and bold, and the fact cards below show what each line teaches.
2. **Publish it (creator account).** Click **Connect wallet**, then **Share with your class** → pick a price → **Publish**, and confirm in MetaMask. You get a *Published* badge, a **Receipt** link to arcscan, and an earnings counter.
3. **Unlock it (classmate account).** Switch MetaMask to your second account, open the **Class library** tab, play the 10-second preview, then **Unlock for $0.05**: approve USDC, then unlock. The full song and synced lyrics play, and it stays unlocked after a reload.
4. **See the payment.** Switch back to the creator account; the earnings counter shows the $0.05.
5. **Make your own song** (needs the two API keys). Paste notes or upload a PDF/.md/.txt, pick a vibe (or type "something like <a song you love>"), choose a length, and click **Make my song**. New songs are saved to `web/public/generated/`.

> Note: songs are stored on the machine running the app, so a "classmate" needs to use the same running instance (e.g. two MetaMask accounts in one browser, as above).

### Contracts (optional)

```bash
cd contracts
forge test -vv        # 17 tests, including a fuzz test
```

To deploy your own copy (not needed to run the app):

```bash
cd contracts
printf 'DEPLOYER_PRIVATE_KEY=\nARC_RPC_URL=https://rpc.testnet.arc.network\n' > .env   # add your key; fund it at faucet.circle.com
set -a && source .env && set +a
forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast
forge verify-contract <ADDRESS> src/SongStudyMarket.sol:SongStudyMarket \
  --chain 5042002 --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/ \
  --constructor-args $(cast abi-encode 'constructor(address)' 0x3600000000000000000000000000000000000000)
```

Then set `NEXT_PUBLIC_SONGSTUDY_MARKET_ADDRESS` and `NEXT_PUBLIC_SONGSTUDY_MARKET_DEPLOY_BLOCK` in `web/.env.local` to your deployment.

## What's next

- Hosted deployment with cloud storage for songs, so classmates can join from their own devices
- Email-login wallets (Circle user-controlled wallets) so classmates never see a seed phrase
- Quiz mode that turns the fact map into flashcards
- Class spaces: a professor or TA curates the official song pack for an exam
- Revenue splits for co-authored songs

## Acknowledgements

Built during UBC 2026 (Nov 18–20). Uses the ElevenLabs and Anthropic SDKs, RainbowKit/wagmi/viem, and Circle's Arc testnet.
