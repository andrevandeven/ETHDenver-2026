import { TranscriptEntry } from "./types.js";

export function formatTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map(
      (e) =>
        `[${new Date(e.timestamp).toISOString()}] ${e.speaker.toUpperCase()}: ${e.text}`
    )
    .join("\n");
}
