"use client";

import { TranscriptViewer } from "./TranscriptViewer";

type TranscriptEntry = {
  speaker: "agent" | "supplier";
  text: string;
  timestamp: number;
};

interface QuoteCardProps {
  quoteId: bigint;
  supplierLabel: string;
  unitPriceWei: bigint;
  moq: bigint;
  leadTimeDays: bigint;
  quoteDataURI: string;
  transcript?: TranscriptEntry[];
}

/**
 * Convert unitPriceWei back to USD.
 * The agent stores prices as: ethers.parseUnits(usd.toFixed(6), 15)
 * So 1 USD = 1e15 wei. To reverse: divide by 1e15.
 */
function weiToUsd(wei: bigint): string {
  const usd = Number(wei) / 1e15;
  return usd.toFixed(2);
}

export function QuoteCard({
  quoteId,
  supplierLabel,
  unitPriceWei,
  moq,
  leadTimeDays,
  quoteDataURI,
  transcript = [],
}: QuoteCardProps) {
  return (
    <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-semibold text-zinc-100">{supplierLabel}</h4>
          <p className="text-xs text-zinc-500 mt-0.5">Quote #{String(quoteId)}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-zinc-100">
            ${weiToUsd(unitPriceWei)}
          </p>
          <p className="text-xs text-zinc-500">per unit</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="text-center p-2 rounded-lg bg-zinc-800/50">
          <p className="text-xs text-zinc-500">MOQ</p>
          <p className="text-sm font-medium text-zinc-200">{String(moq)} units</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-zinc-800/50">
          <p className="text-xs text-zinc-500">Lead Time</p>
          <p className="text-sm font-medium text-zinc-200">{String(leadTimeDays)} days</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-zinc-800/50">
          <p className="text-xs text-zinc-500">0G Storage</p>
          <a
            href={`https://explorer.0g.ai/?hash=${quoteDataURI.replace("0g://", "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 truncate block"
          >
            {quoteDataURI.startsWith("local://") ? "local" : "view"}
          </a>
        </div>
      </div>

      {transcript.length > 0 && (
        <div className="mt-3">
          <TranscriptViewer entries={transcript} supplierLabel={supplierLabel} />
        </div>
      )}
    </div>
  );
}
