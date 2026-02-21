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

  if (rfqDataURI.startsWith("json://")) {
    try {
      const decoded = Buffer.from(rfqDataURI.slice(7), "base64").toString("utf8");
      const d = JSON.parse(decoded) as Record<string, unknown>;
      return {
        item: String(d.item ?? "item"),
        quantity: Number(d.quantity ?? 1000),
        region: String(d.region ?? "US"),
        budget: d.budget ? String(d.budget) : undefined,
      };
    } catch {
      console.warn("[orchestrator] json:// URI decode failed, using defaults");
    }
  }

  if (rfqDataURI.startsWith("local://")) {
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

  const supplierNumber = config.supplierNumber;
  const supplierLabel = "Supplier";

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
    return;
  }

  // Wait for call to complete (up to 5 minutes)
  const { status } = await waitForCall(callSid);
  console.log(`[orchestrator] Call to ${supplierLabel} ended: ${status}`);

  // Gather transcript from agent side
  const allEntries = getAgentTranscript(callSid);
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

