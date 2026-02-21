"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseEther, keccak256, toBytes } from "viem";
import { ADDRESSES, NEGOTIATOR_INFT_ABI, USAGE_CREDITS_ABI } from "@/lib/contracts";
import { zgGalileo } from "@/lib/wagmi";
import { Header } from "@/components/Header";
import { TxLink } from "@/components/TxLink";

export default function MintPage() {
  const { isConnected } = useAccount();
  const [form, setForm] = useState({
    name: "",
    categories: "",
    regions: "US",
    pricePerCredit: "0.0005",
  });
  const [step, setStep] = useState<"mint" | "price" | "done">("mint");

  const { writeContract: mint, data: mintHash, isPending: isMinting, error: mintError } = useWriteContract();
  const { isSuccess: mintConfirmed, data: mintReceipt } = useWaitForTransactionReceipt({ hash: mintHash });

  const { writeContract: setPrice, data: priceHash, isPending: isSettingPrice } = useWriteContract();
  const { isSuccess: priceConfirmed } = useWaitForTransactionReceipt({ hash: priceHash });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  // Extract tokenId from mint receipt logs
  function getTokenIdFromReceipt(): bigint | null {
    if (!mintReceipt) return null;
    // AgentMinted event topic
    for (const log of mintReceipt.logs) {
      if (log.topics.length >= 2) {
        // tokenId is the first indexed param
        return BigInt(log.topics[1] as string);
      }
    }
    return BigInt(0);
  }

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();
    const brainBundleHash = keccak256(toBytes("empty-brain"));

    mint({
      address: ADDRESSES.negotiatorINFT,
      abi: NEGOTIATOR_INFT_ABI,
      functionName: "mint",
      args: [
        {
          name: form.name,
          categories: form.categories,
          regions: form.regions,
          maxRFQValueWei: parseEther("1000"),
          feePerRFQWei: BigInt(0),
          brainBundleHash,
          brainBundleURI: "",
          profileURI: "",
        },
      ],
      chainId: zgGalileo.id,
    });
  }

  function handleSetPrice() {
    const tokenId = getTokenIdFromReceipt();
    if (tokenId === null) return;

    setPrice({
      address: ADDRESSES.usageCredits,
      abi: USAGE_CREDITS_ABI,
      functionName: "setPrice",
      args: [tokenId, parseEther(form.pricePerCredit)],
      chainId: zgGalileo.id,
    });
  }

  // Advance to price step once mint confirms
  if (mintConfirmed && step === "mint") {
    setStep("price");
  }
  if (priceConfirmed && step === "price") {
    setStep("done");
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-zinc-100 mb-2">List a New Agent</h1>
        <p className="text-zinc-400 text-sm mb-8">
          Create an AI negotiation agent as a 0G iNFT (ERC-7857). It starts with an empty brain and gets smarter with every call.
        </p>

        {!isConnected ? (
          <p className="text-zinc-400">Connect your wallet first.</p>
        ) : step === "done" ? (
          <div className="p-6 rounded-xl border border-green-500/30 bg-green-500/5 text-center space-y-3">
            <h2 className="text-lg font-semibold text-green-300">Agent minted!</h2>
            <p className="text-sm text-zinc-400">
              Your agent &quot;{form.name}&quot; is live on the marketplace. Users can now buy credits and submit RFQs.
            </p>
            <div className="flex justify-center gap-4 text-sm">
              {mintHash && <TxLink hash={mintHash} />}
              {priceHash && <TxLink hash={priceHash} />}
            </div>
            <a
              href={`/agent/${getTokenIdFromReceipt()}`}
              className="inline-block mt-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white"
            >
              View Agent
            </a>
          </div>
        ) : (
          <form onSubmit={handleMint} className="space-y-5">
            <Field
              label="Agent Name"
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              placeholder="e.g. T-Shirt Supply Expert"
            />
            <Field
              label="Specialties"
              name="categories"
              value={form.categories}
              onChange={handleChange}
              placeholder="e.g. t-shirts, apparel, textiles"
              hint="Comma-separated categories this agent specializes in"
            />
            <Field
              label="Regions"
              name="regions"
              value={form.regions}
              onChange={handleChange}
              placeholder="US, EU, APAC"
            />
            <Field
              label="Price per Credit (A0GI)"
              name="pricePerCredit"
              value={form.pricePerCredit}
              onChange={handleChange}
              type="number"
              step="0.0001"
              hint="What users pay you per negotiation run"
            />

            {mintError && (
              <p className="text-red-400 text-sm">{mintError.message}</p>
            )}

            {/* Progress steps — shown once the process has started */}
            {(isMinting || mintHash) && (
              <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 space-y-3">
                <StepRow
                  state={mintConfirmed ? "done" : isMinting ? "waiting-wallet" : mintHash ? "confirming" : "pending"}
                  label="Mint agent NFT"
                  hash={mintHash}
                />
                <StepRow
                  state={
                    !mintConfirmed ? "pending"
                    : priceConfirmed ? "done"
                    : isSettingPrice ? "waiting-wallet"
                    : priceHash ? "confirming"
                    : "pending"
                  }
                  label={`Set credit price (${form.pricePerCredit} A0GI)`}
                  hash={priceHash}
                />
              </div>
            )}

            {/* Step 1: Mint */}
            {step === "mint" && !mintHash && (
              <button
                type="submit"
                disabled={isMinting || !form.name}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-semibold text-white transition-colors"
              >
                {isMinting ? "Check your wallet…" : "Mint Agent"}
              </button>
            )}

            {/* Step 2: Set credit price */}
            {step === "price" && !priceHash && (
              <button
                type="button"
                onClick={handleSetPrice}
                disabled={isSettingPrice}
                className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-50 font-semibold text-white transition-colors"
              >
                {isSettingPrice ? "Check your wallet…" : `Set Credit Price: ${form.pricePerCredit} A0GI`}
              </button>
            )}
          </form>
        )}
      </main>
    </div>
  );
}

type StepState = "pending" | "waiting-wallet" | "confirming" | "done";

function StepRow({ state, label, hash }: { state: StepState; label: string; hash?: `0x${string}` }) {
  return (
    <div className="flex items-center gap-3">
      {state === "done" ? (
        <span className="w-4 h-4 flex items-center justify-center text-green-400 text-xs shrink-0">✓</span>
      ) : state === "confirming" || state === "waiting-wallet" ? (
        <span className="w-4 h-4 shrink-0">
          <span className="block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        </span>
      ) : (
        <span className="w-4 h-4 rounded-full border border-zinc-600 shrink-0" />
      )}
      <div className="flex items-center gap-2 text-sm">
        <span className={
          state === "done" ? "text-zinc-400 line-through" :
          state === "confirming" || state === "waiting-wallet" ? "text-zinc-100" :
          "text-zinc-500"
        }>
          {state === "waiting-wallet" ? "Waiting for wallet…" :
           state === "confirming" ? `Confirming — ${label}` :
           label}
        </span>
        {hash && (state === "confirming" || state === "done") && (
          <TxLink hash={hash} />
        )}
      </div>
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
