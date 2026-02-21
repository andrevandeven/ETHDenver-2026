"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract } from "wagmi";
import { formatEther, decodeEventLog } from "viem";
import { ADDRESSES, NEGOTIATOR_INFT_ABI, RFQ_MARKET_ABI, USAGE_CREDITS_ABI } from "@/lib/contracts";
import { zgGalileo } from "@/lib/wagmi";
import { uploadRFQData } from "@/lib/zero-g";
import { Header } from "@/components/Header";
import { TxLink } from "@/components/TxLink";

function useAgentOptions() {
  const { data: totalSupply } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "totalSupply",
  });

  const total = Number(totalSupply ?? 0n);
  return { total };
}

function Step({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3">
      {done ? (
        <span className="w-4 h-4 flex items-center justify-center text-green-400 text-xs">✓</span>
      ) : active ? (
        <span className="w-4 h-4 flex-shrink-0">
          <span className="block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </span>
      ) : (
        <span className="w-4 h-4 rounded-full border border-zinc-600" />
      )}
      <span className={`text-sm ${done ? "text-zinc-400 line-through" : active ? "text-zinc-100" : "text-zinc-500"}`}>
        {label}
      </span>
    </div>
  );
}

function AgentOption({ index, selected }: { index: number; selected: boolean }) {
  const { data: tokenId } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "tokenByIndex",
    args: [BigInt(index)],
  });

  const { data: profile } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "getProfile",
    args: tokenId !== undefined ? [tokenId] : undefined,
    query: { enabled: tokenId !== undefined },
  });

  if (tokenId === undefined || !profile) return null;

  return (
    <option value={String(tokenId)}>
      #{String(tokenId)} — {profile.name} ({profile.categories || "general"})
    </option>
  );
}

export default function NewRFQPage() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { total } = useAgentOptions();
  const [form, setForm] = useState({
    agentId: "",
    item: "",
    quantity: "1000",
    region: "US",
    budget: "",
    supplierName: "",
    supplierPhone: "",
  });
  const [isUploading, setIsUploading] = useState(false);

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess: confirmed, data: receipt } = useWaitForTransactionReceipt({ hash: txHash });

  // Once tx confirmed, parse RFQ ID from logs and redirect
  useEffect(() => {
    if (!confirmed || !receipt) return;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: RFQ_MARKET_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "RFQCreated") {
          const rfqId = (decoded.args as { rfqId: bigint }).rfqId;
          router.push(`/rfq/${String(rfqId)}`);
          return;
        }
      } catch {}
    }
  }, [confirmed, receipt, router]);

  const agentIdBn = form.agentId !== "" ? BigInt(form.agentId) : undefined;

  // Load agent profile for the selected agent
  const { data: agentProfile } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "getProfile",
    args: agentIdBn !== undefined ? [agentIdBn] : undefined,
    query: { enabled: agentIdBn !== undefined },
  });

  // Load credit price for the selected agent
  const { data: creditPrice } = useReadContract({
    address: ADDRESSES.usageCredits,
    abi: USAGE_CREDITS_ABI,
    functionName: "pricePerCredit",
    args: agentIdBn !== undefined ? [agentIdBn] : undefined,
    query: { enabled: agentIdBn !== undefined },
  });

  // Load user's credits for the selected agent
  const { data: myCredits } = useReadContract({
    address: ADDRESSES.usageCredits,
    abi: USAGE_CREDITS_ABI,
    functionName: "getCredits",
    args: address && agentIdBn !== undefined ? [address, agentIdBn] : undefined,
    query: { enabled: !!address && agentIdBn !== undefined },
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsUploading(true);

    try {
      const rfqData = {
        item: form.item,
        quantity: parseInt(form.quantity),
        region: form.region,
        budget: form.budget || undefined,
        supplierName: form.supplierName,
        supplierPhone: form.supplierPhone,
        timestamp: Date.now(),
      };

      const { rootHash, uri } = await uploadRFQData(rfqData);

      writeContract({
        address: ADDRESSES.rfqMarket,
        abi: RFQ_MARKET_ABI,
        functionName: "createRFQ",
        args: [BigInt(form.agentId), rootHash, uri],
        chainId: zgGalileo.id,
      });
    } finally {
      setIsUploading(false);
    }
  }

  const hasCredits = myCredits !== undefined && myCredits > 0n;

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Create New RFQ</h1>
        <p className="text-zinc-400 text-sm mb-8">
          The agent will call your supplier and negotiate the best price via voice.
        </p>

        {!isConnected ? (
          <p className="text-zinc-400">Connect your wallet first.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Agent Select */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Select Agent</label>
              <select
                name="agentId"
                value={form.agentId}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-indigo-500 text-sm"
              >
                <option value="">Choose an agent…</option>
                {Array.from({ length: total }, (_, i) => (
                  <AgentOption key={i} index={i} selected={form.agentId === String(i)} />
                ))}
              </select>

              {/* Credits info */}
              {agentIdBn !== undefined && (
                <div className="mt-2 flex items-center gap-3 text-xs">
                  {creditPrice !== undefined && (
                    <span className="text-zinc-500">
                      Cost: <span className="text-zinc-300">{formatEther(creditPrice)} A0GI</span> / use
                    </span>
                  )}
                  {myCredits !== undefined && (
                    <span className={hasCredits ? "text-green-400" : "text-red-400"}>
                      Your credits: {String(myCredits)}
                    </span>
                  )}
                  {myCredits !== undefined && !hasCredits && (
                    <a
                      href={`/agent/${form.agentId}`}
                      className="text-indigo-400 hover:text-indigo-300 underline"
                    >
                      Buy credits
                    </a>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Item Description</label>
              <input
                name="item"
                type="text"
                value={form.item}
                onChange={handleChange}
                required
                placeholder="e.g. 1000 units of corrugated packaging boxes, 30×20×15cm"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Quantity</label>
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={handleChange}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Region</label>
                <input
                  name="region"
                  type="text"
                  value={form.region}
                  onChange={handleChange}
                  placeholder="US, EU, APAC..."
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Budget (optional)
              </label>
              <input
                name="budget"
                type="text"
                value={form.budget}
                onChange={handleChange}
                placeholder="e.g. under $5/unit"
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>

            <div className="pt-2 border-t border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">Supplier to Call</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Supplier Name</label>
                  <input
                    name="supplierName"
                    type="text"
                    value={form.supplierName}
                    onChange={handleChange}
                    required
                    placeholder="e.g. ValueSource Inc"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Phone Number</label>
                  <input
                    name="supplierPhone"
                    type="tel"
                    value={form.supplierPhone}
                    onChange={handleChange}
                    required
                    placeholder="+1234567890"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error.message}</p>}

            {/* Progress steps */}
            {(isUploading || txHash) && (
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 space-y-3">
                <Step done={!isUploading && !!txHash} active={isUploading} label="Uploading RFQ data to 0G Storage" />
                <Step done={confirmed} active={!!txHash && !confirmed} label="Confirming transaction on-chain" />
                <Step done={false} active={confirmed} label="Agent is calling the supplier…" />
                {txHash && (
                  <p className="text-xs text-zinc-500 pt-1">
                    Tx: <TxLink hash={txHash} />
                  </p>
                )}
              </div>
            )}

            {!txHash && (
              <button
                type="submit"
                disabled={isPending || isUploading || !form.agentId || !form.item || !form.supplierName || !form.supplierPhone || !hasCredits}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold text-white transition-colors"
              >
                Create RFQ (uses 1 credit)
              </button>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
