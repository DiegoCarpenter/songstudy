"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { parseEventLogs, type Hash } from "viem";
import { useWriteContract } from "wagmi";
import { arcTestnet, formatUsd, MARKET_ADDRESS, PRICE_OPTIONS, shortAddr, txUrl } from "@/lib/arc";
import { songStudyMarketAbi } from "@/lib/marketAbi";
import { computeContentHash, fetchEarnings, fetchPublished, friendlyTxError } from "@/lib/onchain";
import type { SongMeta } from "@/lib/schemas";
import { CheckIcon, ExternalIcon, ShareIcon } from "./song-ui";
import { useArcWallet, WalletError } from "./wallet";

type Step = "idle" | "wallet" | "confirming";

/**
 * "Share with your class": fingerprints the song (keccak256(audio ‖ lyrics JSON)), checks whether that
 * hash is already on SongStudyMarket, and otherwise publishes it at the chosen price.
 */
export function SharePanel({ audioUrl, meta }: { audioUrl: string; meta: SongMeta }) {
  const qc = useQueryClient();
  const { address, client, ready } = useArcWallet();
  const { writeContractAsync } = useWriteContract();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState<bigint>(PRICE_OPTIONS[1].value);
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const metadataURI = audioUrl.replace(/[^/]+$/, "meta.json");

  // Is this exact song (by content hash) already published?
  const status = useQuery({
    queryKey: ["share-status", audioUrl],
    enabled: !!client,
    staleTime: 30_000,
    queryFn: async () => {
      const contentHash = await computeContentHash(audioUrl, meta);
      const [track] = await fetchPublished(client!, { contentHash });
      return { contentHash, track: track ?? null };
    },
  });
  const track = status.data?.track ?? null;

  const earnings = useQuery({
    queryKey: ["earnings", track?.id.toString()],
    enabled: !!client && !!track,
    refetchInterval: 20_000,
    queryFn: () => fetchEarnings(client!, track!.id),
  });

  // Close the popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (step === "idle" && panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, step]);

  async function publish() {
    if (!status.data) return;
    setError(null);
    try {
      setStep("wallet");
      const who = await ready();
      if (!who) { setStep("idle"); return; }
      const hash: Hash = await writeContractAsync({
        chainId: arcTestnet.id,
        address: MARKET_ADDRESS,
        abi: songStudyMarketAbi,
        functionName: "publish",
        args: [status.data.contentHash, price, metadataURI],
      });
      setStep("confirming");
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The publish transaction failed onchain.");
      const [ev] = parseEventLogs({ abi: songStudyMarketAbi, eventName: "Published", logs: receipt.logs });
      // Show the result immediately, then refresh from chain.
      qc.setQueryData(["share-status", audioUrl], {
        contentHash: status.data.contentHash,
        track: { id: ev.args.id, creator: ev.args.creator, contentHash: ev.args.contentHash, price: BigInt(ev.args.price), metadataURI, txHash: hash, blockNumber: receipt.blockNumber },
      });
      void qc.invalidateQueries({ queryKey: ["library"] });
      setOpen(false);
    } catch (e) {
      const f = e instanceof WalletError ? { message: e.message } : friendlyTxError(e);
      setError(f.message);
      if (friendlyTxError(e).kind === "already") void status.refetch();
    } finally {
      setStep("idle");
    }
  }

  if (status.isPending) {
    return <span className="rounded-full bg-app px-3.5 py-1.5 text-sm text-muted-foreground">Checking class library…</span>;
  }

  if (track) {
    const mine = address && address.toLowerCase() === track.creator.toLowerCase();
    return (
      <>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200">
          <CheckIcon className="size-3.5" /> Published · {formatUsd(track.price)}
        </span>
        <a href={txUrl(track.txHash)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-black/[.04] hover:text-foreground">
          Receipt <ExternalIcon />
        </a>
        <span className="ml-auto text-sm text-muted-foreground">
          {earnings.data
            ? <>Earned <span className="font-medium text-foreground">{formatUsd(earnings.data.total).replace("Free", "$0.00")}</span> · {earnings.data.unlocks} unlock{earnings.data.unlocks === 1 ? "" : "s"}</>
            : "Earned …"}
          {!mine && <span className="ml-2 text-xs">by {shortAddr(track.creator)}</span>}
        </span>
      </>
    );
  }

  const busy = step !== "idle";
  return (
    <div ref={panelRef} className="relative">
      <button onClick={() => { setOpen((v) => !v); setError(null); }} className="flex items-center gap-1.5 rounded-full bg-app px-3.5 py-1.5 text-sm text-foreground/80 hover:bg-black/[.06]">
        <ShareIcon className="size-3.5" /> Share with your class
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 rounded-3xl border border-black/[.06] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
          <p className="text-base font-medium">Share with your class</p>
          <p className="mt-1 text-sm text-muted-foreground">Classmates unlock it for a few cents, paid straight to you. The song&apos;s fingerprint is recorded as proof you made it.</p>
          <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Price</p>
          <div className="flex gap-1.5">
            {PRICE_OPTIONS.map((p) => (
              <button
                key={p.label}
                disabled={busy}
                onClick={() => setPrice(p.value)}
                className={`flex-1 rounded-full py-1.5 text-sm transition-colors ${price === p.value ? "bg-brand text-brand-foreground" : "bg-muted text-foreground/80 hover:bg-black/[.07]"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button disabled={busy} onClick={publish} className="mt-4 w-full rounded-full bg-brand py-2.5 text-sm font-medium text-brand-foreground transition hover:brightness-105 disabled:opacity-60">
            {step === "wallet" ? "Confirm in your wallet…" : step === "confirming" ? "Publishing…" : "Publish"}
          </button>
          {error && <p className="mt-3 rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
      )}
      {!open && error && <span className="ml-2 text-sm text-destructive">{error}</span>}
    </div>
  );
}
