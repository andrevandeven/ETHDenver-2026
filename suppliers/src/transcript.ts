export type TranscriptEntry = {
  speaker: "agent" | "supplier";
  text: string;
  timestamp: number;
};

// In-memory store keyed by callSid
const store = new Map<string, TranscriptEntry[]>();

export function appendEntry(callSid: string, entry: TranscriptEntry): void {
  if (!store.has(callSid)) {
    store.set(callSid, []);
  }
  store.get(callSid)!.push(entry);
}

export function getTranscript(callSid: string): TranscriptEntry[] {
  return store.get(callSid) ?? [];
}

export function deleteTranscript(callSid: string): void {
  store.delete(callSid);
}

export function formatTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => `[${new Date(e.timestamp).toISOString()}] ${e.speaker.toUpperCase()}: ${e.text}`)
    .join("\n");
}
