"use client";

import { ConnectButton, useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import type { Address, PublicClient } from "viem";
import { erc20Abi } from "viem";
import { useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { arcTestnet, formatUsd, MARKET_ADDRESS, shortAddr, USDC_ADDRESS } from "@/lib/arc";
import { fetchPublished, resolveSongUrls, type PublishedTrack } from "@/lib/onchain";
import { songStudyMarketAbi } from "@/lib/marketAbi";
import type { SongMeta } from "@/lib/schemas";

/** Top-bar wallet pill: connect / wrong network / connected (USDC balance + address). */
export function WalletPill() {
  const { address } = useAccount();
  const usdc = useUsdcBalance(address);
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openAccountModal, openChainModal, mounted }) => {
        if (!mounted) return <span className="h-9 w-32" aria-hidden />;
        if (!account) {
          return (
            <button onClick={openConnectModal} className="rounded-full border border-black/[.08] bg-white px-4 py-2 text-sm text-foreground/75 hover:bg-black/[.03]">
              Connect wallet
            </button>
          );
        }
        if (chain?.unsupported) {
          return (
            <button onClick={openChainModal} className="flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
              <span className="size-1.5 rounded-full bg-amber-500" /> Switch to Arc testnet
            </button>
          );
        }
        return (
          <button onClick={openAccountModal} className="flex items-center gap-2.5 rounded-full border border-black/[.08] bg-white py-1.5 pl-3 pr-1.5 text-sm hover:bg-black/[.03]">
            <span className="text-foreground/70 tabular-nums">{usdc.data !== undefined ? `${formatUsd(usdc.data).replace("Free", "$0.00")} USDC` : "…"}</span>
            <span className="flex items-center gap-1.5 rounded-full bg-app px-2.5 py-1 font-medium">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {shortAddr(account.address)}
            </span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

/** ERC-20 USDC balance (6 decimals). */
export function useUsdcBalance(address?: Address) {
  const client = usePublicClient({ chainId: arcTestnet.id });
  return useQuery({
    queryKey: ["usdc-balance", address],
    enabled: !!client && !!address,
    queryFn: () => client!.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [address!] }),
    refetchInterval: 20_000,
  });
}

/**
 * Wallet guard for write flows: opens the connect modal if needed, switches to Arc if on another
 * network, and checks there's USDC for gas. Returns the address, or null if the user must connect first.
 */
export function useArcWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const client = usePublicClient({ chainId: arcTestnet.id }) as PublicClient | undefined;
  const onArc = chainId === arcTestnet.id;

  async function ready(): Promise<Address | null> {
    if (!isConnected || !address) {
      openConnectModal?.();
      return null;
    }
    if (!onArc) {
      try {
        await switchChainAsync({ chainId: arcTestnet.id });
      } catch (e) {
        throw new WalletError("wrong_network", "Your wallet is on a different network. Switch to Arc testnet to continue.", e);
      }
    }
    // Arc pays gas in USDC (native balance, 18 decimals).
    const gas = await client!.getBalance({ address });
    if (gas < 1_000_000_000_000_000n) {
      throw new WalletError("insufficient_gas", "You need a little testnet USDC for network fees. Get some at faucet.circle.com.");
    }
    return address;
  }

  return { address, isConnected, onArc, client, ready };
}

export class WalletError extends Error {
  constructor(public kind: string, message: string, public cause?: unknown) {
    super(message);
  }
}

// ---------- Class library data ----------

export type LibraryTrack = PublishedTrack & {
  key: string;
  meta: SongMeta | null;
  metaUrl: string;
  audioUrl: string;
  access: boolean;
  isCreator: boolean;
};

/** All published tracks (from Published events), newest first, with metadata and the viewer's access. */
export function useLibrary() {
  const client = usePublicClient({ chainId: arcTestnet.id }) as PublicClient | undefined;
  const { address } = useAccount();
  return useQuery({
    queryKey: ["library", address ?? "anon"],
    enabled: !!client,
    staleTime: 15_000,
    queryFn: async (): Promise<LibraryTrack[]> => {
      const tracks = await fetchPublished(client!);
      const out = await Promise.all(
        tracks.map(async (t) => {
          const { metaUrl } = resolveSongUrls(t.metadataURI);
          const meta: SongMeta | null = await fetch(metaUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          const { audioUrl } = resolveSongUrls(t.metadataURI, meta?.audioFile);
          const isCreator = !!address && address.toLowerCase() === t.creator.toLowerCase();
          const access = address
            ? await client!.readContract({ address: MARKET_ADDRESS, abi: songStudyMarketAbi, functionName: "hasAccess", args: [t.id, address] })
            : false;
          return { ...t, key: t.id.toString(), meta, metaUrl, audioUrl, access, isCreator };
        }),
      );
      return out.reverse();
    },
  });
}
