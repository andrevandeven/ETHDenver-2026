"use client";

import Link from "next/link";
import { formatEther } from "viem";

interface AgentCardProps {
  tokenId: bigint;
  name: string;
  categories: string;
  regions: string;
  feePerRFQWei: bigint;
  owner: string;
}

export function AgentCard({ tokenId, name, categories, regions, feePerRFQWei, owner }: AgentCardProps) {
  return (
    <Link
      href={`/agent/${tokenId}`}
      className="block p-5 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-600 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-zinc-100">{name}</h3>
          <p className="text-xs text-zinc-500 mt-0.5 font-mono">#{String(tokenId)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-indigo-400">
            {formatEther(feePerRFQWei)} A0GI / RFQ
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {categories.split(",").map((c) => (
          <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
            {c.trim()}
          </span>
        ))}
      </div>
      <p className="text-xs text-zinc-500 mt-2">Regions: {regions}</p>
      <p className="text-xs text-zinc-600 mt-1 font-mono truncate">
        Owner: {owner.slice(0, 8)}…{owner.slice(-4)}
      </p>
    </Link>
  );
}
