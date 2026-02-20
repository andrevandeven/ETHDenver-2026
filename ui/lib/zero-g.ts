import { keccak256, toBytes } from "viem";

export type UploadResult = {
  rootHash: `0x${string}`;
  uri: string;
};

/**
 * Upload RFQ data to 0G Storage (browser-side).
 * Falls back to computing a keccak256 hash locally if upload fails or SDK unavailable.
 */
export async function uploadRFQData(data: unknown): Promise<UploadResult> {
  const json = JSON.stringify(data);
  const hash = keccak256(toBytes(json));

  // Attempt 0G Storage upload via the agent server (which has the SDK)
  try {
    const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL ?? "";
    if (agentUrl) {
      const resp = await fetch(`${agentUrl}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      if (resp.ok) {
        const { rootHash, uri } = await resp.json();
        return { rootHash: rootHash as `0x${string}`, uri };
      }
    }
  } catch {
    // Fall through to local hash
  }

  console.log("[zero-g] Using local hash fallback:", hash);
  return {
    rootHash: hash,
    uri: `local://${hash}`,
  };
}
