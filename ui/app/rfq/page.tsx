"use client";

import { useReadContract, useAccount } from "wagmi";
import { ADDRESSES, RFQ_MARKET_ABI, NEGOTIATOR_INFT_ABI } from "@/lib/contracts";
import { StatusBadge } from "@/components/StatusBadge";
import { Header } from "@/components/Header";
import Link from "next/link";

function RFQRow({ rfqId }: { rfqId: bigint }) {
  const { data: rfq } = useReadContract({
    address: ADDRESSES.rfqMarket,
    abi: RFQ_MARKET_ABI,
    functionName: "getRFQ",
    args: [rfqId],
  });

  const { data: agentProfile } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "getProfile",
    args: [rfq?.agentId ?? 0n],
    query: { enabled: rfq !== undefined },
  });

  if (!rfq) return null;

  return (
    <Link
      href={`/rfq/${rfqId}`}
      className="flex items-center justify-between p-4 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-600 transition-colors"
    >
      <div>
        <p className="font-mono text-sm text-zinc-300">RFQ #{String(rfqId)}</p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {agentProfile?.name ?? `Agent #${String(rfq.agentId)}`} — {new Date(Number(rfq.createdAt) * 1000).toLocaleDateString()}
        </p>
      </div>
      <StatusBadge status={rfq.status} />
    </Link>
  );
}

export default function RFQInboxPage() {
  const { address, isConnected } = useAccount();

  const { data: nextId } = useReadContract({
    address: ADDRESSES.rfqMarket,
    abi: RFQ_MARKET_ABI,
    functionName: "nextRFQId",
  });

  const total = Number(nextId ?? BigInt(0));

  // We'll display all RFQs for simplicity — buyer filter happens in child component
  const allIds = Array.from({ length: total }, (_, i) => BigInt(i));

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">My RFQs</h1>
          <Link
            href="/rfq/new"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors"
          >
            + New RFQ
          </Link>
        </div>

        {!isConnected ? (
          <p className="text-zinc-400">Connect your wallet to view your RFQs.</p>
        ) : total === 0 ? (
          <div className="text-center py-16 border border-dashed border-zinc-800 rounded-xl">
            <p className="text-zinc-500">No RFQs yet.</p>
            <Link href="/rfq/new" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">
              Create your first RFQ →
            </Link>
          </div>
        ) : (
          <BuyerRFQList address={address ?? ""} allIds={allIds} />
        )}
      </main>
    </div>
  );
}

function BuyerRFQList({ address, allIds }: { address: string; allIds: bigint[] }) {
  // Render all — each RFQRow filters by checking if buyer == address
  return (
    <div className="space-y-3">
      {allIds.map((id) => (
        <BuyerRFQRow key={String(id)} rfqId={id} address={address} />
      ))}
    </div>
  );
}

function BuyerRFQRow({ rfqId, address }: { rfqId: bigint; address: string }) {
  const { data: rfq } = useReadContract({
    address: ADDRESSES.rfqMarket,
    abi: RFQ_MARKET_ABI,
    functionName: "getRFQ",
    args: [rfqId],
  });

  if (!rfq || rfq.buyer.toLowerCase() !== address.toLowerCase()) return null;

  return <RFQRow rfqId={rfqId} />;
}
