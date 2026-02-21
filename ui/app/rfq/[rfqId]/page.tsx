"use client";

import { use, useEffect } from "react";
import { useReadContract } from "wagmi";
import { ADDRESSES, RFQ_MARKET_ABI, NEGOTIATOR_INFT_ABI } from "@/lib/contracts";
import { Header } from "@/components/Header";
import { StatusBadge } from "@/components/StatusBadge";
import { QuoteCard } from "@/components/QuoteCard";

export default function RFQDetailPage({ params }: { params: Promise<{ rfqId: string }> }) {
  const { rfqId } = use(params);
  const rfqIdBn = BigInt(rfqId);

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

  const { data: agentProfile } = useReadContract({
    address: ADDRESSES.negotiatorINFT,
    abi: NEGOTIATOR_INFT_ABI,
    functionName: "getProfile",
    args: [rfq?.agentId ?? 0n],
    query: { enabled: rfq !== undefined },
  });

  // Auto-refresh while waiting for quotes
  useEffect(() => {
    const shouldPoll = rfq && rfq.status === 0;
    if (!shouldPoll) return;
    const timer = setInterval(() => {
      refetchRFQ();
      refetchQuotes();
    }, 5000);
    return () => clearInterval(timer);
  }, [rfq, refetchRFQ, refetchQuotes]);

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
              {agentProfile?.name ?? `Agent #${String(rfq.agentId)}`} &middot;{" "}
              {new Date(Number(rfq.createdAt) * 1000).toLocaleString()}
            </p>
          </div>
          <div className="text-right text-sm text-zinc-400">
            <p>Buyer</p>
            <p className="font-mono text-zinc-300">
              {rfq.buyer.slice(0, 8)}&hellip;{rfq.buyer.slice(-4)}
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
            <div className="flex justify-between text-sm gap-4">
              <span className="text-zinc-500 shrink-0">URI</span>
              <span className="font-mono text-zinc-400 text-xs truncate" title={rfq.rfqDataURI}>
                {rfq.rfqDataURI.length > 60 ? `${rfq.rfqDataURI.slice(0, 60)}…` : rfq.rfqDataURI}
              </span>
            </div>
          </div>
        </div>

        {/* Status: Calling */}
        {rfq.status === 0 && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-blue-500/30 bg-blue-500/5">
            <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full" />
            <p className="text-blue-300 text-sm">
              Agent is calling the supplier&hellip; Quote will appear when the call completes.
            </p>
          </div>
        )}

        {/* Quotes */}
        {quoteIds && quoteIds.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-4">
              Quotes Received ({quoteIds.length})
            </h2>
            <div className="space-y-4">
              {quoteIds.map((qId) => (
                <QuoteRow key={String(qId)} quoteId={qId} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function QuoteRow({ quoteId }: { quoteId: bigint }) {
  const { data: quote } = useReadContract({
    address: ADDRESSES.rfqMarket,
    abi: RFQ_MARKET_ABI,
    functionName: "getQuote",
    args: [quoteId],
  });

  if (!quote) {
    return <div className="h-24 rounded-xl border border-zinc-800 bg-zinc-900 animate-pulse" />;
  }

  return (
    <QuoteCard
      quoteId={quoteId}
      supplierLabel={quote.supplierLabel}
      unitPriceWei={quote.unitPriceWei}
      moq={quote.moq}
      leadTimeDays={quote.leadTimeDays}
      quoteDataURI={quote.quoteDataURI}
    />
  );
}
