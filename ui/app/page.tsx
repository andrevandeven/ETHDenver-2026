"use client";

import { useReadContract, useAccount } from "wagmi";
import { ADDRESSES, NEGOTIATOR_INFT_ABI } from "@/lib/contracts";
import { AgentCard } from "@/components/AgentCard";
import { Header } from "@/components/Header";
import Link from "next/link";

function AgentList() {
  const { data: totalSupply } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "totalSupply",
  });

  const total = Number(totalSupply ?? 0n);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-zinc-100">
          Active Negotiator Agents ({total})
        </h2>
        <Link
          href="/mint"
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
        >
          + Mint New Agent
        </Link>
      </div>

      {total === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl">
          <p className="text-zinc-500">No agents minted yet.</p>
          <Link href="/mint" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
            Mint the first one →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: total }, (_, i) => (
            <AgentEntry key={i} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentEntry({ index }: { index: number }) {
  const { data: tokenId } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "tokenByIndex",
    args: [BigInt(index)],
  });

  const { data: owner } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "ownerOf",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: tokenId !== undefined },
  });

  const { data: profile } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "getProfile",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: tokenId !== undefined },
  });

  if (!tokenId || !profile || !owner) {
    return (
      <div className="h-32 rounded-xl border border-zinc-800 bg-zinc-900 animate-pulse" />
    );
  }

  return (
    <AgentCard
      tokenId={tokenId}
      name={profile.name}
      categories={profile.categories}
      regions={profile.regions}
      feePerRFQWei={profile.feePerRFQWei}
      owner={owner}
    />
  );
}

export default function Home() {
  const { isConnected } = useAccount();

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-zinc-100 tracking-tight">
            Procurement Negotiator iNFT
          </h1>
          <p className="mt-3 text-lg text-zinc-400 max-w-2xl mx-auto">
            AI-powered procurement agents on 0G Chain. Negotiate with suppliers via real voice calls,
            powered by 0G Compute LLM inference. Quotes stored on 0G Storage.
          </p>
          {!isConnected && (
            <p className="mt-4 text-sm text-indigo-400">
              Connect your wallet to get started
            </p>
          )}
        </div>

        {/* Agent list */}
        {ADDRESSES.negotiatorINFT ? (
          <AgentList />
        ) : (
          <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl">
            <p className="text-zinc-500">
              Contract not deployed yet. Set{" "}
              <code className="text-zinc-400">NEXT_PUBLIC_NEGOTIATOR_INFT_ADDRESS</code> in your{" "}
              <code className="text-zinc-400">.env</code>.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
