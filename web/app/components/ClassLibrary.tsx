"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { erc20Abi, type Hash } from "viem";
import { useWriteContract } from "wagmi";
import { arcTestnet, formatUsd, MARKET_ADDRESS, txUrl, USDC_ADDRESS } from "@/lib/arc";
import { songStudyMarketAbi } from "@/lib/marketAbi";
import { friendlyTxError } from "@/lib/onchain";
import { CheckIcon, ExternalIcon, FactCards, fmt, infoLine, LockIcon, NoteIcon, Player, PlayButton, SongTitle } from "./song-ui";
import { SharePanel } from "./SharePanel";
import { useArcWallet, useLibrary, WalletError, type LibraryTrack } from "./wallet";

const PREVIEW_MS = 10_000;

/** Left-panel list of published tracks (from Published events). */
export function ClassLibraryList({ selected, onSelect }: { selected: string | null; onSelect: (key: string) => void }) {
  const lib = useLibrary();

  if (lib.isPending) return <p className="px-1 py-6 text-sm text-muted-foreground">Loading your class library…</p>;
  if (lib.isError) {
    return (
      <div className="px-1 py-6 text-sm text-muted-foreground">
        Couldn&apos;t reach Arc testnet. <button onClick={() => lib.refetch()} className="font-medium text-brand hover:underline">Try again</button>
      </div>
    );
  }
  if (!lib.data.length) {
    return <p className="px-1 py-6 text-sm text-muted-foreground">No songs shared yet. Make one, then tap “Share with your class”.</p>;
  }

  return (
    <ul className="-mx-2">
      {lib.data.map((t) => {
        const on = selected === t.key;
        const badge = t.isCreator ? "Yours" : t.access ? "Unlocked" : formatUsd(t.price);
        return (
          <li key={t.key}>
            <button onClick={() => onSelect(t.key)} className={`flex w-full items-start gap-3 rounded-2xl px-2 py-2 text-left transition-colors ${on ? "bg-brand-soft" : "hover:bg-black/[.04]"}`}>
              <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl ${on ? "bg-brand text-brand-foreground" : "bg-muted text-foreground/60"}`}>
                {t.access ? <NoteIcon /> : <LockIcon />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{t.meta?.title ?? `Track #${t.key}`}</span>
                  <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] ${t.access ? "bg-emerald-50 text-emerald-700" : "bg-muted text-foreground/70"}`}>{badge}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">{t.meta?.vibeLabel ?? "Details unavailable"}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Main-area view for one library track: full player if the viewer has access, otherwise the locked preview + unlock. */
export function LibraryTrackView({ trackKey }: { trackKey: string }) {
  const lib = useLibrary();
  const track = lib.data?.find((t) => t.key === trackKey);
  if (!track) return <p className="m-auto text-sm text-muted-foreground">{lib.isPending ? "Loading…" : "That song isn't in the library."}</p>;
  if (!track.meta) return <p className="m-auto text-sm text-muted-foreground">This song&apos;s details couldn&apos;t be loaded.</p>;

  if (track.access) {
    const actions = track.isCreator ? (
      <SharePanel audioUrl={track.audioUrl} meta={track.meta} />
    ) : (
      <>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
          <CheckIcon className="size-3.5" /> Unlocked
        </span>
        <UnlockReceipt trackKey={track.key} />
      </>
    );
    return <Player key={track.key} audioUrl={track.audioUrl} meta={track.meta} actions={actions} />;
  }
  return <LockedTrack key={track.key} track={track} />;
}

/** Unlock tx hashes from this session, so the Receipt link survives the switch to the full player. */
const unlockReceipts = new Map<string, Hash>();
function UnlockReceipt({ trackKey }: { trackKey: string }) {
  const hash = unlockReceipts.get(trackKey);
  if (!hash) return null;
  return (
    <a href={txUrl(hash)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-black/[.04] hover:text-foreground">
      Receipt <ExternalIcon />
    </a>
  );
}

type UnlockStep = "idle" | "approve" | "approving" | "unlock" | "unlocking";

function LockedTrack({ track }: { track: LibraryTrack }) {
  const meta = track.meta!;
  const qc = useQueryClient();
  const { client, ready } = useArcWallet();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState<UnlockStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const free = track.price === 0n;

  async function unlock() {
    setError(null);
    try {
      const who = await ready();
      if (!who) return;

      if (!free) {
        const balance = await client!.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [who] });
        if (balance < track.price) {
          throw new WalletError("insufficient_usdc", `You need ${formatUsd(track.price)} USDC but have ${formatUsd(balance).replace("Free", "$0.00")}. Get testnet USDC at faucet.circle.com.`);
        }
        const allowance = await client!.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "allowance", args: [who, MARKET_ADDRESS] });
        if (allowance < track.price) {
          setStep("approve");
          const approveHash = await writeContractAsync({ chainId: arcTestnet.id, address: USDC_ADDRESS, abi: erc20Abi, functionName: "approve", args: [MARKET_ADDRESS, track.price] });
          setStep("approving");
          const r = await client!.waitForTransactionReceipt({ hash: approveHash });
          if (r.status !== "success") throw new Error("The USDC approval failed onchain.");
        }
      }

      setStep("unlock");
      const hash = await writeContractAsync({ chainId: arcTestnet.id, address: MARKET_ADDRESS, abi: songStudyMarketAbi, functionName: "unlock", args: [track.id] });
      setStep("unlocking");
      const r = await client!.waitForTransactionReceipt({ hash });
      if (r.status !== "success") throw new Error("The unlock transaction failed onchain.");
      unlockReceipts.set(track.key, hash);
      await qc.invalidateQueries({ queryKey: ["library"] });
      void qc.invalidateQueries({ queryKey: ["usdc-balance"] });
    } catch (e) {
      const f = e instanceof WalletError ? { kind: e.kind, message: e.message } : friendlyTxError(e);
      if (f.kind === "already") void qc.invalidateQueries({ queryKey: ["library"] });
      setError(f.message);
    } finally {
      setStep("idle");
    }
  }

  const busy = step !== "idle";
  const label =
    step === "approve" ? "Approve USDC in your wallet…" :
    step === "approving" ? "Approving USDC…" :
    step === "unlock" ? "Confirm unlock in your wallet…" :
    step === "unlocking" ? "Unlocking…" :
    free ? "Unlock for free" : `Unlock for ${formatUsd(track.price)}`;

  const steps = free
    ? [{ label: "Unlock", on: step === "unlock" || step === "unlocking" }]
    : [
        { label: "Approve USDC", on: step === "approve" || step === "approving", done: step === "unlock" || step === "unlocking" },
        { label: "Unlock", on: step === "unlock" || step === "unlocking" },
      ];

  return (
    <>
      <SongTitle title={meta.title} info={infoLine(meta.descriptors, meta.lengthSec, meta.factMap.length)} fullVibe={meta.vibeLabel} />
      <PreviewPlayer audioUrl={track.audioUrl} />

      <div className="grid min-h-0 flex-1 place-items-center">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand"><LockIcon className="size-6" /></div>
          <p className="text-lg font-medium">Unlock the full song</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Full audio, synced lyrics and all {meta.factMap.length} facts. {free ? "It's free." : `${formatUsd(track.price)} goes straight to the creator.`}
          </p>
          <button disabled={busy} onClick={unlock} className="mt-5 w-full rounded-full bg-brand py-3 text-[15px] font-medium text-brand-foreground transition hover:brightness-105 disabled:opacity-70">
            {label}
          </button>
          {(busy || !free) && (
            <p className="mt-3 text-xs text-muted-foreground">
              {steps.map((s, i) => (
                <span key={s.label} className={s.on ? "font-medium text-brand" : "done" in s && s.done ? "text-foreground/70" : ""}>
                  {i > 0 && <span className="mx-1.5 text-black/20">→</span>}
                  {"done" in s && s.done ? "✓ " : ""}{i + 1}. {s.label}
                </span>
              ))}
            </p>
          )}
          {error && <p className="mt-3 rounded-2xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">{error}</p>}
        </div>
      </div>

      <FactCards facts={meta.factMap} locked />
    </>
  );
}

/** First 10 seconds only. */
function PreviewPlayer({ audioUrl }: { audioUrl: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  return (
    <>
      <audio
        ref={ref}
        src={audioUrl}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const ms = e.currentTarget.currentTime * 1000;
          if (ms >= PREVIEW_MS) { e.currentTarget.pause(); e.currentTarget.currentTime = 0; setT(0); } else setT(ms);
        }}
        className="hidden"
      />
      <div className="mt-5 flex h-12 shrink-0 items-center gap-4 rounded-full bg-app pl-1.5 pr-5">
        <PlayButton playing={playing} onClick={() => { const a = ref.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); }} />
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{fmt(t)}</span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/[.08]">
          <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${(t / PREVIEW_MS) * 100}%` }} />
        </div>
        <span className="text-xs text-muted-foreground">10s preview</span>
      </div>
    </>
  );
}
