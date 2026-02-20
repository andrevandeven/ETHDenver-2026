"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseEther, keccak256, toBytes } from "viem";
import { ADDRESSES, NEGOTIATOR_INFT_ABI, USAGE_CREDITS_ABI } from "@/lib/contracts";
import { Header } from "@/components/Header";
import { TxLink } from "@/components/TxLink";

export default function MintPage() {
  const { isConnected } = useAccount();
  const [form, setForm] = useState({
    name: "",
    categories: "electronics,packaging",
    regions: "US,EU",
    maxRFQValue: "10",
    feePerRFQ: "0.001",
    pricePerCredit: "0.0005",
    brainBundleURI: "",
    profileURI: "",
  });

  const { writeContract, data: mintHash, isPending: isMinting, error: mintError } = useWriteContract();
  const { isSuccess: mintConfirmed } = useWaitForTransactionReceipt({ hash: mintHash });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();

    const brainBundleHash = keccak256(toBytes(form.brainBundleURI || "default-brain"));

    writeContract({
      address: ADDRESSES.negotiatorINFT,
      abi: NEGOTIATOR_INFT_ABI,
      functionName: "mint",
      args: [
        {
          name: form.name,
          categories: form.categories,
          regions: form.regions,
          maxRFQValueWei: parseEther(form.maxRFQValue),
          feePerRFQWei: parseEther(form.feePerRFQ),
          brainBundleHash,
          brainBundleURI: form.brainBundleURI || `local://${brainBundleHash}`,
          profileURI: form.profileURI,
        },
      ],
    });
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-zinc-100 mb-8">Mint Negotiator Agent</h1>

        {!isConnected ? (
          <p className="text-zinc-400">Connect your wallet first.</p>
        ) : (
          <form onSubmit={handleMint} className="space-y-5">
            <Field label="Agent Name" name="name" value={form.name} onChange={handleChange} required placeholder="e.g. ProcureBot Alpha" />
            <Field label="Categories (comma-separated)" name="categories" value={form.categories} onChange={handleChange} placeholder="electronics,packaging" />
            <Field label="Regions (comma-separated)" name="regions" value={form.regions} onChange={handleChange} placeholder="US,EU,APAC" />
            <Field label="Max RFQ Value (A0GI)" name="maxRFQValue" value={form.maxRFQValue} onChange={handleChange} type="number" step="0.001" />
            <Field label="Fee per RFQ (A0GI)" name="feePerRFQ" value={form.feePerRFQ} onChange={handleChange} type="number" step="0.0001" />
            <Field label="Price per Credit (A0GI)" name="pricePerCredit" value={form.pricePerCredit} onChange={handleChange} type="number" step="0.0001"
              hint="Merchants pay this per negotiation run" />
            <Field label="Brain Bundle URI (0G Storage)" name="brainBundleURI" value={form.brainBundleURI} onChange={handleChange} placeholder="0g://abc123... (optional)" />
            <Field label="Profile URI" name="profileURI" value={form.profileURI} onChange={handleChange} placeholder="https://... (optional)" />

            {mintError && (
              <p className="text-red-400 text-sm">{mintError.message}</p>
            )}

            {mintHash && (
              <div className="p-3 rounded-lg bg-zinc-800 text-sm">
                <p className="text-zinc-400">Mint tx: <TxLink hash={mintHash} /></p>
                {mintConfirmed && (
                  <p className="text-green-400 mt-1">Minted successfully!</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isMinting || !form.name}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold text-white transition-colors"
            >
              {isMinting ? "Minting…" : "Mint Agent"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

function Field({
  label, name, value, onChange, type = "text", step, placeholder, hint, required,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  step?: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1.5">
        {label}
      </label>
      <input
        name={name}
        type={type}
        step={step}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 text-sm"
      />
      {hint && <p className="text-xs text-zinc-500 mt-1">{hint}</p>}
    </div>
  );
}
