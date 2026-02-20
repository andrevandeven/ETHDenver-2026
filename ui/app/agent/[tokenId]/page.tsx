"use client";

import { use, useState } from "react";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { parseEther, formatEther, keccak256, toBytes, type Address } from "viem";
import {
  ADDRESSES,
  NEGOTIATOR_INFT_ABI,
  USAGE_CREDITS_ABI,
} from "@/lib/contracts";
import { Header } from "@/components/Header";
import { TxLink } from "@/components/TxLink";

export default function AgentProfilePage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const { tokenId } = use(params);
  const tokenIdBn = BigInt(tokenId);
  const { address } = useAccount();

  const { data: owner } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "ownerOf",
    args: [tokenIdBn],
  });

  const { data: profile } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "getProfile",
    args: [tokenIdBn],
  });

  const { data: intelligentData } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "intelligentDataOf",
    args: [tokenIdBn],
  });

  const { data: authorizedUsers } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "authorizedUsersOf",
    args: [tokenIdBn],
  });

  const { data: creditPrice } = useReadContract({
    address: ADDRESSES.usageCredits,
    abi: USAGE_CREDITS_ABI,
    functionName: "pricePerCredit",
    args: [tokenIdBn],
  });

  const { data: myCredits } = useReadContract({
    address: ADDRESSES.usageCredits,
    abi: USAGE_CREDITS_ABI,
    functionName: "getCredits",
    args: address ? [address, tokenIdBn] : undefined,
    query: { enabled: !!address },
  });

  const isOwner = owner && address && owner.toLowerCase() === address.toLowerCase();

  if (!profile) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Header />
        <main className="max-w-3xl mx-auto px-4 py-10">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-64 bg-zinc-800 rounded" />
            <div className="h-32 bg-zinc-800 rounded-xl" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{profile.name}</h1>
          <p className="text-sm text-zinc-500 mt-1 font-mono">
            Token #{tokenId} • Owner: {owner?.slice(0, 8)}…{owner?.slice(-4)}
          </p>
        </div>

        {/* Profile Details */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-3">
          <h2 className="text-sm font-medium text-zinc-400">Agent Profile</h2>
          <InfoRow label="Categories" value={profile.categories} />
          <InfoRow label="Regions" value={profile.regions} />
          <InfoRow label="Fee per RFQ" value={`${formatEther(profile.feePerRFQWei)} A0GI`} />
          <InfoRow
            label="Max RFQ Value"
            value={`${formatEther(profile.maxRFQValueWei)} A0GI`}
          />
        </div>

        {/* Brain Bundle (ERC-7857 IntelligentData) */}
        {intelligentData && (
          <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-3">
            <h2 className="text-sm font-medium text-zinc-400">Brain Bundle (0G Storage)</h2>
            <InfoRow label="Description" value={intelligentData.dataDescription} />
            <InfoRow label="Hash" value={intelligentData.dataHash} mono />
            <InfoRow label="URI" value={profile.brainBundleURI} mono />
          </div>
        )}

        {/* Authorized Operators */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-3">
          <h2 className="text-sm font-medium text-zinc-400">Authorized Operators</h2>
          {authorizedUsers && authorizedUsers.length > 0 ? (
            <ul className="space-y-1">
              {authorizedUsers.map((u) => (
                <li key={u} className="font-mono text-xs text-zinc-300">
                  {u}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500">No operators authorized (owner can commit quotes)</p>
          )}
          {isOwner && <AuthorizeForm tokenId={tokenIdBn} />}
        </div>

        {/* Credits */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-400">Credits</h2>
            <span className="text-sm text-zinc-300">
              Price: {creditPrice ? `${formatEther(creditPrice)} A0GI` : "Not set"}
            </span>
          </div>
          {address && (
            <p className="text-sm text-zinc-400">
              Your balance: <span className="text-zinc-100 font-medium">{String(myCredits ?? BigInt(0))}</span> credits
            </p>
          )}
          {isOwner && creditPrice !== undefined && (
            <SetPriceForm tokenId={tokenIdBn} currentPrice={creditPrice} />
          )}
          {!isOwner && creditPrice && creditPrice > BigInt(0) && (
            <BuyCreditsForm tokenId={tokenIdBn} pricePerCredit={creditPrice} />
          )}
        </div>
      </main>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className={`text-zinc-300 text-right truncate ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function AuthorizeForm({ tokenId }: { tokenId: bigint }) {
  const [addr, setAddr] = useState("");
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  return (
    <div className="flex gap-2 mt-2">
      <input
        type="text"
        value={addr}
        onChange={(e) => setAddr(e.target.value)}
        placeholder="0x... operator address"
        className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none focus:border-indigo-500"
      />
      <button
        onClick={() =>
          writeContract({
            address: ADDRESSES.negotiatorINFT,
            abi: NEGOTIATOR_INFT_ABI,
            functionName: "authorizeUsage",
            args: [tokenId, addr as Address],
          })
        }
        disabled={isPending || !addr.startsWith("0x")}
        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white"
      >
        {isPending ? "…" : "Authorize"}
      </button>
    </div>
  );
}

function SetPriceForm({
  tokenId,
  currentPrice,
}: {
  tokenId: bigint;
  currentPrice: bigint;
}) {
  const [price, setPrice] = useState(formatEther(currentPrice));
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  return (
    <div className="flex gap-2">
      <input
        type="number"
        step="0.0001"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
      />
      <button
        onClick={() =>
          writeContract({
            address: ADDRESSES.usageCredits,
            abi: USAGE_CREDITS_ABI,
            functionName: "setPrice",
            args: [tokenId, parseEther(price)],
          })
        }
        disabled={isPending}
        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white"
      >
        {isPending ? "…" : "Set Price"}
      </button>
    </div>
  );
}

function BuyCreditsForm({
  tokenId,
  pricePerCredit,
}: {
  tokenId: bigint;
  pricePerCredit: bigint;
}) {
  const [amount, setAmount] = useState("1");
  const { writeContract, data: txHash, isPending } = useWriteContract();

  const total = pricePerCredit * BigInt(parseInt(amount || "1"));

  return (
    <div className="flex items-center gap-3">
      <input
        type="number"
        min="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-20 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs focus:outline-none focus:border-indigo-500"
      />
      <span className="text-xs text-zinc-500">= {formatEther(total)} A0GI</span>
      <button
        onClick={() =>
          writeContract({
            address: ADDRESSES.usageCredits,
            abi: USAGE_CREDITS_ABI,
            functionName: "buyCredits",
            args: [tokenId, BigInt(parseInt(amount || "1"))],
            value: total,
          })
        }
        disabled={isPending}
        className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-xs font-medium text-white"
      >
        {isPending ? "…" : "Buy Credits"}
      </button>
      {txHash && <TxLink hash={txHash} />}
    </div>
  );
}
