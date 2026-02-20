import { ethers } from "ethers";
import { config } from "./config.js";
import { listenForRFQCreated, getRFQ, commitQuote, getContracts } from "./contracts.js";
import { uploadJSON } from "./storage.js";
import { extractQuote } from "./extractor.js";
import {
  initiateCall,
  waitForCall,
  getAgentTranscript,
  clearSession,
  RFQDetails,
} from "./caller.js";
import { downloadJSON } from "./storage.js";
import { formatTranscript } from "./transcript.js";

const SUPPLIER_NUMBERS: Record<string, string> = {
  valuesource: config.suppliers.valuesource,
  quickship: config.suppliers.quickship,
  bulkdeal: config.suppliers.bulkdeal,
};

const SUPPLIER_LABELS: Record<string, string> = {
  valuesource: "ValueSource",
  quickship: "QuickShip",
  bulkdeal: "BulkDeal",
};

// In-memory transcript store for supplier-side transcripts
// (fetched from supplier server after call ends)
import fetch from "node-fetch";

async function fetchSupplierTranscript(
  callSid: string
): Promise<Array<{ speaker: string; text: string; timestamp: number }>> {
  const base = config.ngrokUrl || "http://localhost:4000";
  try {
    const resp = await fetch(`${base}/transcript/${callSid}`);
    if (!resp.ok) return [];
    return resp.json() as Promise<Array<{ speaker: string; text: string; timestamp: number }>>;
  } catch (err) {
    console.warn(`[orchestrator] Could not fetch supplier transcript for ${callSid}:`, err);
    return [];
  }
}

/**
 * Parse RFQ data from 0G Storage (or fallback to a default structure).
 */
async function parseRFQData(
  rfqDataURI: string,
  signer: ethers.Wallet
): Promise<{ item: string; quantity: number; region: string; budget?: string }> {
  if (rfqDataURI.startsWith("0g://")) {
    const rootHash = rfqDataURI.slice(5);
    const data = await downloadJSON(rootHash, signer);
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      return {
        item: String(d.item ?? "item"),
        quantity: Number(d.quantity ?? 1000),
        region: String(d.region ?? "US"),
        budget: d.budget ? String(d.budget) : undefined,
      };
    }
  }

  if (rfqDataURI.startsWith("local://")) {
    // Can't fetch — use defaults
    console.warn("[orchestrator] local:// URI — cannot retrieve RFQ data, using defaults");
  }

  return { item: "general procurement item", quantity: 1000, region: "US" };
}

/**
 * Handle a single RFQ: call each supplier, get quotes, commit on-chain.
 */
async function handleRFQ(
  rfqId: bigint,
  buyer: string,
  agentId: bigint
): Promise<void> {
  console.log(`\n[orchestrator] === Handling RFQ ${rfqId} for buyer ${buyer} ===`);

  const { signer } = getContracts();
  const rfq = await getRFQ(rfqId);

  // Load RFQ details from 0G Storage
  const rfqDetails = await parseRFQData(rfq.rfqDataURI, signer);
  console.log("[orchestrator] RFQ details:", rfqDetails);

  // Process each supplier sequentially (phone calls can't be parallelized easily)
  const supplierIds = Object.keys(SUPPLIER_NUMBERS).filter(
    (id) => SUPPLIER_NUMBERS[id]
  );

  for (const supplierId of supplierIds) {
    const supplierNumber = SUPPLIER_NUMBERS[supplierId];
    const supplierLabel = SUPPLIER_LABELS[supplierId];

    console.log(`\n[orchestrator] Calling ${supplierLabel} at ${supplierNumber}...`);

    const callRFQDetails: RFQDetails = {
      rfqId: String(rfqId),
      item: rfqDetails.item,
      quantity: rfqDetails.quantity,
      region: rfqDetails.region,
      budget: rfqDetails.budget,
    };

    let callSid: string;
    try {
      callSid = await initiateCall(supplierNumber, supplierLabel, callRFQDetails);
    } catch (err) {
      console.error(`[orchestrator] Failed to initiate call to ${supplierLabel}:`, err);
      continue;
    }

    // Wait for call to complete (up to 5 minutes)
    const { status } = await waitForCall(callSid);
    console.log(`[orchestrator] Call to ${supplierLabel} ended: ${status}`);

    // Gather transcripts
    const agentEntries = getAgentTranscript(callSid);
    const supplierEntries = await fetchSupplierTranscript(callSid);

    // Merge and sort by timestamp
    const allEntries = [...agentEntries, ...supplierEntries].sort(
      (a, b) => a.timestamp - b.timestamp
    );
    const transcriptText = formatTranscript(allEntries);
    console.log(`[orchestrator] Transcript (${allEntries.length} entries):\n${transcriptText}`);

    // Extract quote from transcript
    const extracted = await extractQuote(transcriptText, supplierLabel);
    console.log(`[orchestrator] Extracted quote:`, {
      unitPriceUsd: extracted.unitPriceUsd,
      moq: String(extracted.moq),
      leadTimeDays: String(extracted.leadTimeDays),
    });

    // Build quote packet
    const quotePacket = {
      rfqId: String(rfqId),
      supplier: supplierLabel,
      unitPriceUsd: extracted.unitPriceUsd,
      unitPriceWei: String(extracted.unitPriceWei),
      moq: String(extracted.moq),
      leadTimeDays: String(extracted.leadTimeDays),
      validUntil: extracted.validUntil,
      transcript: allEntries,
      timestamp: Date.now(),
    };

    // Upload to 0G Storage
    const { rootHash, uri } = await uploadJSON(quotePacket, signer);
    const quoteDataHash = rootHash.startsWith("0x")
      ? rootHash
      : `0x${rootHash}`;

    // Commit on-chain
    try {
      const receipt = await commitQuote(
        rfqId,
        quoteDataHash,
        uri,
        extracted.supplierLabel,
        extracted.unitPriceWei,
        extracted.moq,
        extracted.leadTimeDays,
        extracted.validUntil
      );
      console.log(`[orchestrator] QuoteCommitted tx: ${receipt.hash}`);
    } catch (err) {
      console.error(`[orchestrator] commitQuote failed for ${supplierLabel}:`, err);
    }

    clearSession(callSid);
  }

  console.log(`\n[orchestrator] === RFQ ${rfqId} processing complete ===`);
}

/**
 * Start the orchestrator — listens for RFQCreated events and processes each one.
 */
export function startOrchestrator(): void {
  // Only handle RFQs for our agent token
  listenForRFQCreated(async (rfqId, buyer, agentId, _rfqDataHash) => {
    if (agentId !== config.agentTokenId) {
      console.log(`[orchestrator] Ignoring RFQ for agentId=${agentId} (ours=${config.agentTokenId})`);
      return;
    }
    handleRFQ(rfqId, buyer, agentId).catch((err) => {
      console.error(`[orchestrator] Error handling RFQ ${rfqId}:`, err);
    });
  });
}

