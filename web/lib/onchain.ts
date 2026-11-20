import {
  BaseError,
  concat,
  ContractFunctionRevertedError,
  keccak256,
  toBytes,
  UserRejectedRequestError,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
} from "viem";
import { getAbiItem } from "viem";
import { LOG_CHUNK, MARKET_ADDRESS, MARKET_DEPLOY_BLOCK } from "./arc";
import { songStudyMarketAbi } from "./marketAbi";
import type { SongMeta } from "./schemas";

export type PublishedTrack = {
  id: bigint;
  creator: Address;
  contentHash: Hex;
  price: bigint;
  metadataURI: string;
  txHash: Hash;
  blockNumber: bigint;
};

const publishedEvent = getAbiItem({ abi: songStudyMarketAbi, name: "Published" });
const unlockedEvent = getAbiItem({ abi: songStudyMarketAbi, name: "Unlocked" });
const tippedEvent = getAbiItem({ abi: songStudyMarketAbi, name: "Tipped" });

/** Block ranges from deploy to head, each within Arc's 10k-block eth_getLogs limit. */
async function ranges(client: PublicClient) {
  const head = await client.getBlockNumber();
  const out: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let from = MARKET_DEPLOY_BLOCK; from <= head; from += LOG_CHUNK + 1n) {
    const to = from + LOG_CHUNK > head ? head : from + LOG_CHUNK;
    out.push({ fromBlock: from, toBlock: to });
  }
  return out;
}

/** Run chunked queries with limited concurrency, flatten in block order. */
async function chunked<T>(client: PublicClient, fn: (r: { fromBlock: bigint; toBlock: bigint }) => Promise<T[]>): Promise<T[]> {
  const rs = await ranges(client);
  const results: T[][] = new Array(rs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, rs.length) }, async () => {
      while (next < rs.length) {
        const i = next++;
        results[i] = await fn(rs[i]);
      }
    }),
  );
  return results.flat();
}

export async function fetchPublished(client: PublicClient, filter?: { contentHash?: Hex; creator?: Address }): Promise<PublishedTrack[]> {
  const logs = await chunked(client, (r) =>
    client.getLogs({ address: MARKET_ADDRESS, event: publishedEvent, args: filter, ...r }),
  );
  return logs.map((l) => ({
    id: l.args.id!,
    creator: l.args.creator!,
    contentHash: l.args.contentHash!,
    price: BigInt(l.args.price!),
    metadataURI: l.args.metadataURI!,
    txHash: l.transactionHash,
    blockNumber: l.blockNumber,
  }));
}

/** Total USDC (6-dec units) a track has earned: unlock payments + tips. */
export async function fetchEarnings(client: PublicClient, id: bigint): Promise<{ total: bigint; unlocks: number }> {
  const [unlocks, tips] = await Promise.all([
    chunked(client, (r) => client.getLogs({ address: MARKET_ADDRESS, event: unlockedEvent, args: { id }, ...r })),
    chunked(client, (r) => client.getLogs({ address: MARKET_ADDRESS, event: tippedEvent, args: { id }, ...r })),
  ]);
  const total =
    unlocks.reduce((a, l) => a + BigInt(l.args.price ?? 0), 0n) + tips.reduce((a, l) => a + (l.args.amount ?? 0n), 0n);
  return { total, unlocks: unlocks.length };
}

/**
 * contentHash = keccak256(audio bytes ‖ lyrics JSON), where lyrics JSON is
 * JSON.stringify({ title, sections, factMap }) from the song's meta. Anyone with the files can recompute it.
 */
export function lyricsJson(meta: Pick<SongMeta, "title" | "sections" | "factMap">): string {
  return JSON.stringify({ title: meta.title, sections: meta.sections, factMap: meta.factMap });
}
export async function computeContentHash(audioUrl: string, meta: SongMeta): Promise<Hex> {
  const res = await fetch(audioUrl);
  if (!res.ok) throw new Error("Couldn't load the song audio to fingerprint it.");
  const buf: ArrayBuffer = await res.arrayBuffer();
  return keccak256(concat([new Uint8Array(buf), toBytes(lyricsJson(meta))]));
}

/** Resolve a metadataURI (relative in dev, absolute Blob URL later) and derive the audio URL beside it. */
export function resolveSongUrls(metadataURI: string, audioFile = "audio.mp3") {
  const metaUrl = metadataURI;
  const audioUrl = metadataURI.replace(/[^/]+$/, audioFile);
  return { metaUrl, audioUrl };
}

// ---------- Friendly errors ----------

export type TxErrorKind = "rejected" | "insufficient_usdc" | "insufficient_gas" | "wrong_network" | "already" | "other";

export function friendlyTxError(err: unknown): { kind: TxErrorKind; message: string } {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError) || /user (rejected|denied)|rejected the request/i.test(err.message)) {
      return { kind: "rejected", message: "You cancelled the request in your wallet. Nothing was charged." };
    }
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = revert?.data?.errorName;
    if (name === "AlreadyPublished") return { kind: "already", message: "This song is already published." };
    if (name === "AlreadyHasAccess") return { kind: "already", message: "You already have access to this song." };
    if (name === "TransferFailed") return { kind: "insufficient_usdc", message: "The USDC payment didn't go through. Check your USDC balance and try again." };
    if (/insufficient funds|exceeds balance|gas required exceeds/i.test(err.message)) {
      return { kind: "insufficient_gas", message: "Not enough USDC for network fees. Get testnet USDC at faucet.circle.com." };
    }
    if (/chain mismatch|does not match the target chain|wrong network|switch.*chain/i.test(err.message)) {
      return { kind: "wrong_network", message: "Your wallet is on a different network. Switch to Arc testnet and try again." };
    }
    return { kind: "other", message: err.shortMessage || "Something went wrong with the transaction." };
  }
  return { kind: "other", message: err instanceof Error ? err.message : "Something went wrong." };
}
