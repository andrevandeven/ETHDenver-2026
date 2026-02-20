"use client";

import { useState } from "react";

type TranscriptEntry = {
  speaker: "agent" | "supplier";
  text: string;
  timestamp: number;
};

interface TranscriptViewerProps {
  entries: TranscriptEntry[];
  supplierLabel?: string;
}

export function TranscriptViewer({ entries, supplierLabel = "Supplier" }: TranscriptViewerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
      >
        {open ? "Hide" : "View"} Transcript ({entries.length} messages)
      </button>

      {open && (
        <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
          {entries.length === 0 ? (
            <p className="text-xs text-zinc-500">No transcript available.</p>
          ) : (
            entries.map((entry, i) => (
              <div
                key={i}
                className={`flex gap-2 text-sm ${
                  entry.speaker === "agent" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    entry.speaker === "agent"
                      ? "bg-indigo-600/20 text-indigo-200"
                      : "bg-zinc-800 text-zinc-300"
                  }`}
                >
                  <p className="text-xs font-medium mb-1 opacity-60">
                    {entry.speaker === "agent" ? "Agent (Buyer)" : supplierLabel}
                  </p>
                  <p className="leading-relaxed">{entry.text}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
