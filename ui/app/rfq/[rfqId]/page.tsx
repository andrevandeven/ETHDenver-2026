"use client";

import { use, useState, useEffect } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { formatEther } from "viem";
import { ADDRESSES, NEGOTIATOR_INFT_ABI, RFQ_MARKET_ABI } from "@/lib/contracts";
import { Header } from "@/components/Header";
import { StatusBadge } from "@/components/StatusBadge";
import { QuoteCard } from "@/components/QuoteCard";
import { TxLink } from "@/components/TxLink";

type TranscriptEntry = {
  speaker: "agent" | "supplier";
  text: string;
  timestamp: number;
};

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "";

async function fetchTranscriptForQuote(quoteDataURI: string): Promise<TranscriptEntry[]> {
  // Quote packet on 0G Storage contains the transcript
  // For demo: fetch from agent server if local:// URI
  if (!quoteDataURI || quoteDataURI.startsWith("local://")) {
    return [];
  }
  return [];
}

export default function RFQDetailPage({ params }: { params: Promise<{ rfqId: string }> }) {
  const { rfqId } = use(params);
  const rfqIdBn = BigInt(rfqId);
  const { address } = useAccount();

  const { data: rfq, refetch: refetchRFQ } = useReadContract({
    address: ADDRESSES.rfqMarket,
    abi: RFQ_MARKET_ABI,
    functionName: "getRFQ",
    args: [rfqIdBn],
  });

  const { data: quoteIds, refetch: refetchQuotes } = useReadContract({
    address: ADDRESSES.rfqMarket,
    abi: RFQ_MARKET_ABI,
    functionName: "getRFQQuoteIds",
    args: [rfqIdBn],
  });

  const { data: agentFee } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "getFeePerRFQ",
    args: rfq ? [rfq.agentId] : undefined,
    query: { enabled: !!rfq },
  });

  const { writeContract, data: acceptTxHash, isPending: isAccepting } = useWriteContract();
  const { isSuccess: acceptConfirmed } = useWaitForTransactionReceipt({ hash: acceptTxHash });

  // Auto-refresh quotes while status is Open or QuotesReceived
  useEffect(() => {
    const shouldPoll = rfq && (rfq.status === 0 || rfq.status === 1);
    if (!shouldPoll) return;
    const timer = setInterval(() => {
      refetchRFQ();
      refetchQuotes();
    }, 5000);
    return () => clearInterval(timer);
  }, [rfq, refetchRFQ, refetchQuotes]);

  function acceptQuote(quoteId: bigint) {
    writeContract({
      address: ADDRESSES.rfqMarket,
      abi: RFQ_MARKET_ABI,
      functionName: "acceptQuote",
      args: [rfqIdBn, quoteId],
      value: agentFee ?? BigInt(0),
    });
  }

  if (!rfq) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-10">
          <div className="animate-pulse h-8 w-48 bg-zinc-800 rounded" />
        </main>
      </div>
    );
  }

  const isBuyer = address?.toLowerCase() === rfq.buyer.toLowerCase();

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        {/* RFQ Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-zinc-100">RFQ #{rfqId}</h1>
              <StatusBadge status={rfq.status} />
            </div>
            <p className="text-sm text-zinc-500">
              Agent #{String(rfq.agentId)} •{" "}
              {new Date(Number(rfq.createdAt) * 1000).toLocaleString()}
            </p>
          </div>
          <div className="text-right text-sm text-zinc-400">
            <p>Buyer</p>
            <p className="font-mono text-zinc-300">
              {rfq.buyer.slice(0, 8)}…{rfq.buyer.slice(-4)}
            </p>
          </div>
        </div>

        {/* RFQ Data */}
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900">
          <h2 className="text-sm font-medium text-zinc-400 mb-3">RFQ Data (0G Storage)</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Data Hash</span>
              <span className="font-mono text-zinc-300 text-xs">{rfq.rfqDataHash}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">URI</span>
              <span className="font-mono text-zinc-400 text-xs">{rfq.rfqDataURI}</span>
            </div>
          </div>
        </div>

        {/* Status Messages */}
        {rfq.status === 0 && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-blue-500/30 bg-blue-500/5">
            <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full" />
            <p className="text-blue-300 text-sm">
              Agent is calling suppliers… Quotes will appear as calls complete.
            </p>
          </div>
        )}

        {/* Quotes */}
        {quoteIds && quoteIds.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-4">
              Supplier Quotes ({quoteIds.length})
            </h2>

            <div className="space-y-4">
              {quoteIds.map((qId) => (
                <QuoteRow
                  key={String(qId)}
                  quoteId={qId}
                  acceptedQuoteId={rfq.status === 2 ? rfq.acceptedQuoteId : undefined}
                  isBuyer={isBuyer}
                  onAccept={() => acceptQuote(qId)}
                  isAccepting={isAccepting}
                />
              ))}
            </div>
          </div>
        )}

        {/* Accept confirmation */}
        {acceptTxHash && (
          <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
            <p className="text-sm text-zinc-400">
              Accept tx: <TxLink hash={acceptTxHash} />
            </p>
            {acceptConfirmed && (
              <p className="text-green-400 text-sm mt-2">
                Quote accepted! Agent fee paid to owner.
              </p>
            )}
          </div>
        )}

        {/* Agent fee info */}
        {agentFee !== undefined && agentFee > BigInt(0) && rfq.status === 1 && (
          <p className="text-xs text-zinc-500">
            Accepting a quote will pay the agent fee: {formatEther(agentFee)} A0GI
          </p>
        )}
      </main>
    </div>
  );
}

function QuoteRow({
  quoteId,
  acceptedQuoteId,
  isBuyer,
  onAccept,
  isAccepting,
}: {
  quoteId: bigint;
  acceptedQuoteId?: bigint;
  isBuyer: boolean;
  onAccept: () => void;
  isAccepting: boolean;
}) {
  const { data: quote } = useReadContract({
    address: ADDRESSES.rfqMarket,
    abi: RFQ_MARKET_ABI,
    functionName: "getQuote",
    args: [quoteId],
  });

  if (!quote) {
    return <div className="h-24 rounded-xl border border-zinc-800 bg-zinc-900 animate-pulse" />;
  }

  const isAccepted = acceptedQuoteId !== undefined && acceptedQuoteId === quoteId;

  return (
    <QuoteCard
      quoteId={quoteId}
      supplierLabel={quote.supplierLabel}
      unitPriceWei={quote.unitPriceWei}
      moq={quote.moq}
      leadTimeDays={quote.leadTimeDays}
      quoteDataURI={quote.quoteDataURI}
      isAccepted={isAccepted}
      onAccept={isBuyer && !acceptedQuoteId ? onAccept : undefined}
      isAccepting={isAccepting}
    />
  );
}
