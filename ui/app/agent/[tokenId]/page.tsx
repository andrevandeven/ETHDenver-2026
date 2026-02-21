"use client";

import { use, useState, useEffect } from "react";
import {
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { parseEther, formatEther } from "viem";
import {
  ADDRESSES,
  NEGOTIATOR_INFT_ABI,
  USAGE_CREDITS_ABI,
} from "@/lib/contracts";
import { zgGalileo } from "@/lib/wagmi";
import { Header } from "@/components/Header";
import { TxLink } from "@/components/TxLink";

type NegotiationRecord = {
  date: string;
  rfqId: string;
  item: string;
  quantity: number;
  unitPriceUsd: number;
  moq: number;
  leadTimeDays: number;
  negotiatedDown: boolean;
  savingsPercent?: number;
};

type SupplierProfile = {
  name: string;
  phone: string;
  totalCalls: number;
  bestPriceUsd: number;
  avgPriceUsd: number;
  categories: string[];
  willingnessToNegotiate: "low" | "medium" | "high";
  lastContactedAt: number;
  negotiations: NegotiationRecord[];
  tacticsLog: string[];
};

type BrainData = {
  version: number;
  updatedAt: number;
  agentId: string;
  suppliers: Record<string, SupplierProfile>;
  totalNegotiations: number;
  totalSavingsPercent: number;
};

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";

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

  // Decode brain directly from the on-chain brainBundleURI — works from any machine
  // without needing the orchestrator API. Falls back to orchestrator for 0g:// URIs.
  const [brain, setBrain] = useState<BrainData | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const uri: string = profile.brainBundleURI ?? "";
    setBrainLoading(true);

    if (uri.startsWith("json://")) {
      // Brain embedded inline in the on-chain URI — decode directly in the browser
      try {
        const decoded = atob(uri.slice(7));
        const data = JSON.parse(decoded) as BrainData;
        setBrain(data);
      } catch {
        setBrain(null);
      }
      setBrainLoading(false);
    } else if (uri.startsWith("0g://") || !uri) {
      // Fall back to orchestrator API for 0g:// URIs or when URI not yet set
      const controller = new AbortController();
      fetch(`${AGENT_URL}/api/brain/${tokenId}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setBrain(data))
        .catch((err) => { if (err.name !== "AbortError") setBrain(null); })
        .finally(() => setBrainLoading(false));
      return () => controller.abort();
    } else {
      setBrain(null);
      setBrainLoading(false);
    }
  }, [tokenId, profile]);

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

  const supplierList = brain ? Object.values(brain.suppliers) : [];

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">{profile.name}</h1>
          <p className="text-sm text-zinc-500 mt-1 font-mono">
            Token #{tokenId} &middot; Owner: {owner?.slice(0, 8)}&hellip;{owner?.slice(-4)}
          </p>
        </div>

        {/* Profile Details */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-3">
          <h2 className="text-sm font-medium text-zinc-400">Agent Profile</h2>
          <InfoRow label="Categories" value={profile.categories} />
          <InfoRow label="Regions" value={profile.regions} />
          <InfoRow label="Fee per RFQ" value={creditPrice !== undefined ? `${formatEther(creditPrice)} A0GI` : "Not set"} />
          <InfoRow
            label="Max RFQ Value"
            value={`${formatEther(profile.maxRFQValueWei)} A0GI`}
          />
        </div>

        {/* Brain Bundle (ERC-7857 IntelligentData) */}
        {intelligentData && (
          <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-3">
            <h2 className="text-sm font-medium text-zinc-400">0G iNFT Brain (ERC-7857)</h2>
            <InfoRow label="Description" value={intelligentData.dataDescription} />
            <InfoRow label="Hash" value={intelligentData.dataHash} mono />
            {profile.brainBundleURI && (
              <InfoRow label="URI" value={profile.brainBundleURI} mono />
            )}
            {brain && (
              <div className="flex gap-4 pt-2 text-xs">
                <span className="text-indigo-400">{brain.totalNegotiations} negotiations</span>
                <span className="text-zinc-500">&middot;</span>
                <span className="text-green-400">{supplierList.length} suppliers known</span>
                {brain.totalSavingsPercent > 0 && (
                  <>
                    <span className="text-zinc-500">&middot;</span>
                    <span className="text-emerald-400">{brain.totalSavingsPercent.toFixed(1)}% avg savings</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Supplier Intelligence */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
          <h2 className="text-sm font-medium text-zinc-400">Supplier Intelligence</h2>

          {brainLoading && <p className="text-xs text-zinc-500">Loading...</p>}

          {!brainLoading && supplierList.length === 0 && (
            <div className="space-y-3">
              {(profile.categories ? profile.categories.split(",").map((c: string) => c.trim()).filter(Boolean) : ["General"]).map((cat: string) => (
                <div key={cat} className="p-4 rounded-lg bg-zinc-800/30 border border-zinc-700/50 border-dashed space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-500">{cat} Suppliers</h3>
                    <span className="text-xs text-zinc-600">0 calls</span>
                  </div>
                  <p className="text-xs text-zinc-600">
                    {profile.regions || "All regions"} · Intelligence builds after first negotiation
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-zinc-700" />
                    <span className="text-xs text-zinc-600">Negotiability — pending</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {supplierList.map((supplier) => (
            <SupplierCard key={supplier.name} supplier={supplier} isOwner={!!isOwner} />
          ))}

          {!isOwner && supplierList.length > 0 && (
            <p className="text-[11px] text-zinc-600">
              Full pricing details and negotiation tactics are only visible to the agent owner.
            </p>
          )}
        </div>

        {/* Credits */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
          <h2 className="text-sm font-medium text-zinc-400">Use This Agent</h2>
          <p className="text-xs text-zinc-400">
            Each RFQ costs 1 credit. Payment goes directly to the agent owner.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-300">
              Price per credit: {creditPrice ? `${formatEther(creditPrice)} A0GI` : "Not set"}
            </span>
            {address && (
              <span className="text-sm text-zinc-400">
                Your balance: <span className="text-zinc-100 font-medium">{String(myCredits ?? BigInt(0))}</span>
              </span>
            )}
          </div>
          {isOwner && creditPrice !== undefined && (
            <SetPriceForm tokenId={tokenIdBn} currentPrice={creditPrice} />
          )}
          {creditPrice !== undefined && creditPrice > BigInt(0) && (
            <BuyCreditsForm tokenId={tokenIdBn} pricePerCredit={creditPrice} />
          )}
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function SupplierCard({ supplier, isOwner }: { supplier: SupplierProfile; isOwner: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">{supplier.name}</h3>
          <p className="text-xs text-zinc-500">
            {supplier.totalCalls} call{supplier.totalCalls !== 1 ? "s" : ""} &middot;{" "}
            {supplier.categories.join(", ") || "general"}
          </p>
        </div>
        {isOwner && supplier.negotiations.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            {expanded ? "Hide" : "Details"}
          </button>
        )}
      </div>

      {/* Public info: categories + last contacted + negotiability dot */}
      <p className="text-xs text-zinc-500">
        {supplier.totalCalls} call{supplier.totalCalls !== 1 ? "s" : ""}
        {supplier.lastContactedAt ? ` · Last contacted ${new Date(supplier.lastContactedAt).toLocaleDateString()}` : ""}
      </p>

      {supplier.categories.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {supplier.categories.map((cat) => (
            <span key={cat} className="px-2 py-0.5 rounded-full bg-zinc-700 text-xs text-zinc-300">
              {cat}
            </span>
          ))}
        </div>
      )}

      {/* Negotiability dot — visible to all, label only to owner */}
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${
          { low: "bg-red-400", medium: "bg-yellow-400", high: "bg-green-400" }[supplier.willingnessToNegotiate]
        }`} />
        {isOwner
          ? <span className="text-xs text-zinc-400 capitalize">{supplier.willingnessToNegotiate} negotiability</span>
          : <span className="text-xs text-zinc-600">Negotiability (owner only)</span>
        }
      </div>

      {/* Owner-only: pricing and tactics */}
      {isOwner && (
        <div className="grid grid-cols-4 gap-3 text-xs pt-1">
          <div>
            <span className="text-zinc-500">Best Price</span>
            <p className="text-green-400 font-medium">
              {supplier.bestPriceUsd === Infinity ? "—" : `$${supplier.bestPriceUsd.toFixed(2)}`}
            </p>
          </div>
          <div>
            <span className="text-zinc-500">Avg Price</span>
            <p className="text-zinc-200 font-medium">${supplier.avgPriceUsd.toFixed(2)}</p>
          </div>
          <div>
            <span className="text-zinc-500">Negotiability</span>
            <p className={`font-medium capitalize ${
              { low: "text-red-400", medium: "text-yellow-400", high: "text-green-400" }[supplier.willingnessToNegotiate]
            }`}>
              {supplier.willingnessToNegotiate}
            </p>
          </div>
          <div>
            <span className="text-zinc-500">Phone</span>
            <p className="text-zinc-300 font-mono">{supplier.phone}</p>
          </div>
        </div>
      )}

      {/* Expanded details (owner only) */}
      {isOwner && expanded && (
        <div className="pt-2 space-y-3 border-t border-zinc-700">
          {supplier.tacticsLog.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-400 mb-1">What&apos;s Worked</h4>
              <ul className="space-y-1">
                {supplier.tacticsLog.map((t, i) => (
                  <li key={i} className="text-xs text-zinc-300">{t}</li>
                ))}
              </ul>
            </div>
          )}

          {supplier.negotiations.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-zinc-400 mb-1">Past Deals</h4>
              <div className="space-y-1">
                {supplier.negotiations.slice(-5).reverse().map((n, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-zinc-400">{n.date} &middot; {n.item}</span>
                    <span className="text-zinc-200">
                      ${n.unitPriceUsd.toFixed(2)}/unit &middot; MOQ {n.moq} &middot; {n.leadTimeDays}d
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className={`text-zinc-300 text-right truncate ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function SetPriceForm({ tokenId, currentPrice }: { tokenId: bigint; currentPrice: bigint }) {
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
            chainId: zgGalileo.id,
          })
        }
        disabled={isPending}
        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white"
      >
        {isPending ? "..." : "Set Price"}
      </button>
      {isSuccess && <p className="text-xs text-green-400">Updated</p>}
    </div>
  );
}

function BuyCreditsForm({ tokenId, pricePerCredit }: { tokenId: bigint; pricePerCredit: bigint }) {
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
            chainId: zgGalileo.id,
          })
        }
        disabled={isPending}
        className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-xs font-medium text-white"
      >
        {isPending ? "..." : "Buy Credits"}
      </button>
      {txHash && <TxLink hash={txHash} />}
    </div>
  );
}
