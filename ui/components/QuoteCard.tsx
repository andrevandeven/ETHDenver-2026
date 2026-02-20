"use client";

import { formatEther } from "viem";
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
  isAccepted?: boolean;
  onAccept?: () => void;
  isAccepting?: boolean;
}

export function QuoteCard({
  quoteId,
  supplierLabel,
  unitPriceWei,
  moq,
  leadTimeDays,
  quoteDataURI,
  transcript = [],
  isAccepted = false,
  onAccept,
  isAccepting = false,
}: QuoteCardProps) {
  return (
    <div
      className={`p-5 rounded-xl border ${
        isAccepted
          ? "border-green-500/50 bg-green-500/5"
          : "border-zinc-800 bg-zinc-900"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-zinc-100">{supplierLabel}</h4>
            {isAccepted && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/30">
                Accepted
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">Quote #{String(quoteId)}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-zinc-100">
            {formatEther(unitPriceWei)} A0GI
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

      <div className="mt-3 flex items-center justify-between">
        <TranscriptViewer entries={transcript} supplierLabel={supplierLabel} />
        {onAccept && !isAccepted && (
          <button
            onClick={onAccept}
            disabled={isAccepting}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white transition-colors"
          >
            {isAccepting ? "Accepting…" : "Accept Quote"}
          </button>
        )}
      </div>
    </div>
  );
}
