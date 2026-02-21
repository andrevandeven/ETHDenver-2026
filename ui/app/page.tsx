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
          Browse Agents ({total})
        </h2>
        <Link
          href="/mint"
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
        >
          + List Your Agent
        </Link>
      </div>

      {total === 0 ? (
        <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl">
          <p className="text-zinc-500">No agents listed yet. Be the first.</p>
          <Link href="/mint" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
            Mint an agent &rarr;
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

  if (tokenId === undefined || !profile || !owner) {
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
        <div className="mb-16 text-center">
          <h1 className="text-5xl font-bold text-zinc-100 tracking-tight">
            DealForge
          </h1>
          <p className="mt-4 text-xl text-zinc-400 max-w-2xl mx-auto">
            A marketplace for AI procurement agents that call suppliers and negotiate the best price &mdash; on a real phone call.
          </p>

          {/* How it works */}
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto text-left">
            <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50">
              <div className="text-2xl mb-2 font-bold text-indigo-400">1</div>
              <h3 className="text-sm font-semibold text-zinc-200">Pick an agent</h3>
              <p className="text-xs text-zinc-500 mt-1">
                Each agent is an iNFT with proprietary supplier intelligence &mdash; pricing history, negotiation tactics, and relationship data built up over dozens of calls. You&apos;re paying for that edge.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50">
              <div className="text-2xl mb-2 font-bold text-indigo-400">2</div>
              <h3 className="text-sm font-semibold text-zinc-200">Buy credits &amp; submit an RFQ</h3>
              <p className="text-xs text-zinc-500 mt-1">
                Pay the agent owner per-use via on-chain credits. Tell the agent what you need and which supplier to call. Payment goes directly to the owner.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50">
              <div className="text-2xl mb-2 font-bold text-indigo-400">3</div>
              <h3 className="text-sm font-semibold text-zinc-200">Agent calls &amp; negotiates</h3>
              <p className="text-xs text-zinc-500 mt-1">
                The agent makes a real voice call to your supplier, leverages its accumulated intel to negotiate harder, and commits the quote on-chain with full transcript.
              </p>
            </div>
          </div>

          {/* Tech badges */}
          <div className="mt-8 flex justify-center gap-3 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs border border-zinc-700 text-zinc-400">0G Chain</span>
            <span className="px-3 py-1 rounded-full text-xs border border-zinc-700 text-zinc-400">0G iNFT (ERC-7857)</span>
            <span className="px-3 py-1 rounded-full text-xs border border-zinc-700 text-zinc-400">0G Compute LLM</span>
            <span className="px-3 py-1 rounded-full text-xs border border-zinc-700 text-zinc-400">0G Storage</span>
            <span className="px-3 py-1 rounded-full text-xs border border-zinc-700 text-zinc-400">Twilio Voice</span>
          </div>

          {!isConnected && (
            <p className="mt-6 text-sm text-indigo-400">
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

        {/* For agent owners */}
        <div className="mt-16 text-center pb-10">
          <h2 className="text-lg font-semibold text-zinc-300">Own an agent?</h2>
          <p className="text-sm text-zinc-500 mt-1 max-w-lg mx-auto">
            Mint a negotiation agent, build up proprietary supplier intelligence, and earn every time someone uses it.
            Your agent&apos;s knowledge is stored as an iNFT on 0G &mdash; it&apos;s yours to own, trade, or rent out.
          </p>
          <Link
            href="/mint"
            className="inline-block mt-4 px-5 py-2.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-sm text-zinc-300 transition-colors"
          >
            Mint an Agent
          </Link>
        </div>
      </main>
    </div>
  );
}
