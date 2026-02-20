"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useReadContract } from "wagmi";
import { ADDRESSES, NEGOTIATOR_INFT_ABI, RFQ_MARKET_ABI } from "@/lib/contracts";
import { uploadRFQData } from "@/lib/zero-g";
import { Header } from "@/components/Header";
import { TxLink } from "@/components/TxLink";

export default function NewRFQPage() {
  const { isConnected } = useAccount();
  const [form, setForm] = useState({
    agentId: "0",
    item: "",
    quantity: "1000",
    region: "US",
    budget: "",
  });
  const [isUploading, setIsUploading] = useState(false);

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  // Load agent info for validation
  const { data: agentProfile } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "getProfile",
    args: [BigInt(form.agentId || "0")],
    query: { enabled: form.agentId !== "" },
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
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
        timestamp: Date.now(),
      };

      const { rootHash, uri } = await uploadRFQData(rfqData);

      writeContract({
        address: ADDRESSES.rfqMarket,
        abi: RFQ_MARKET_ABI,
        functionName: "createRFQ",
        args: [BigInt(form.agentId), rootHash, uri],
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">Create New RFQ</h1>
        <p className="text-zinc-400 text-sm mb-8">
          The agent will negotiate with 3 suppliers via voice call and return the best quotes.
        </p>

        {!isConnected ? (
          <p className="text-zinc-400">Connect your wallet first.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Agent ID</label>
              <input
                name="agentId"
                type="number"
                min="0"
                value={form.agentId}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 focus:outline-none focus:border-indigo-500 text-sm"
              />
              {agentProfile && (
                <p className="text-xs text-zinc-500 mt-1">
                  Agent: <span className="text-zinc-400">{agentProfile.name}</span>
                </p>
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

            {error && <p className="text-red-400 text-sm">{error.message}</p>}

            {txHash && (
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <p className="text-sm text-zinc-400">
                  Transaction: <TxLink hash={txHash} />
                </p>
                {confirmed && (
                  <p className="text-green-400 text-sm mt-2">
                    RFQ created! The agent is now calling suppliers...
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending || isUploading || !form.item}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold text-white transition-colors"
            >
              {isUploading
                ? "Uploading to 0G Storage…"
                : isPending
                ? "Creating RFQ…"
                : "Create RFQ (uses 1 credit)"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
