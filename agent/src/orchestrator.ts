import { ethers } from "ethers";
import { config } from "./config.js";
import { listenForRFQCreated, getRFQ, commitQuote, getContracts } from "./contracts.js";
import { uploadJSON, downloadJSON } from "./storage.js";
import { extractQuote } from "./extractor.js";
import {
  initiateCall,
  waitForCall,
  getAgentTranscript,
  clearSession,
  RFQDetails,
} from "./caller.js";
import { formatTranscript } from "./transcript.js";
import { loadBrain, recordNegotiation, buildSupplierContext } from "./brain.js";

/**
 * Parse RFQ data — now expects supplierName and supplierPhone in the payload.
 */
async function parseRFQData(
  rfqDataURI: string,
  signer: ethers.Wallet
): Promise<{
  item: string;
  quantity: number;
  region: string;
  budget?: string;
  supplierName: string;
  supplierPhone: string;
}> {
  const defaults = {
    item: "general procurement item",
    quantity: 1000,
    region: "US",
    supplierName: "Supplier",
    supplierPhone: config.supplierNumber,
  };

  let d: Record<string, unknown> = {};

  if (rfqDataURI.startsWith("0g://")) {
    const rootHash = rfqDataURI.slice(5);
    const data = await downloadJSON(rootHash, signer);
    if (data && typeof data === "object") d = data as Record<string, unknown>;
  } else if (rfqDataURI.startsWith("json://")) {
    try {
      const decoded = Buffer.from(rfqDataURI.slice(7), "base64").toString("utf8");
      d = JSON.parse(decoded);
    } catch {
      console.warn("[orchestrator] json:// decode failed, using defaults");
    }
  } else if (rfqDataURI.startsWith("local://")) {
    console.warn("[orchestrator] local:// URI — cannot retrieve data, using defaults");
  }

  return {
    item: String(d.item ?? defaults.item),
    quantity: Number(d.quantity ?? defaults.quantity),
    region: String(d.region ?? defaults.region),
    budget: d.budget ? String(d.budget) : undefined,
    supplierName: String(d.supplierName ?? defaults.supplierName),
    supplierPhone: String(d.supplierPhone ?? defaults.supplierPhone),
  };
}

/**
 * Handle a single RFQ: load brain, call supplier, record result, commit on-chain.
 */
async function handleRFQ(
  rfqId: bigint,
  buyer: string,
  agentId: bigint
): Promise<void> {
  console.log(`\n[orchestrator] === Handling RFQ ${rfqId} for buyer ${buyer} ===`);

  const { signer } = getContracts();
  const rfq = await getRFQ(rfqId);
  const rfqDetails = await parseRFQData(rfq.rfqDataURI, signer);
  console.log("[orchestrator] RFQ details:", rfqDetails);

  // Load the agent's brain and look up this supplier
  const brain = await loadBrain(agentId);
  const { context: brainContext, lowestCompetitorPrice } = buildSupplierContext(brain, rfqDetails.supplierName);
  if (brainContext) {
    console.log(`[orchestrator] Found past intel on "${rfqDetails.supplierName}" — injecting into prompt`);
    if (lowestCompetitorPrice) console.log(`[orchestrator] Lowest competitor price: $${lowestCompetitorPrice}`);
  } else {
    console.log(`[orchestrator] No prior history with "${rfqDetails.supplierName}"`);
  }

  console.log(`\n[orchestrator] Calling ${rfqDetails.supplierName} at ${rfqDetails.supplierPhone}...`);

  const callRFQDetails: RFQDetails = {
    rfqId: String(rfqId),
    item: rfqDetails.item,
    quantity: rfqDetails.quantity,
    region: rfqDetails.region,
    budget: rfqDetails.budget,
    brainContext,
    lowestCompetitorPrice: lowestCompetitorPrice ?? undefined,
  };

  let callSid: string;
  try {
    callSid = await initiateCall(rfqDetails.supplierPhone, rfqDetails.supplierName, callRFQDetails);
  } catch (err) {
    console.error(`[orchestrator] Failed to call ${rfqDetails.supplierName}:`, err);
    return;
  }

  const { status } = await waitForCall(callSid);
  console.log(`[orchestrator] Call ended: ${status}`);

  const allEntries = getAgentTranscript(callSid);
  const transcriptText = formatTranscript(allEntries);
  console.log(`[orchestrator] Transcript (${allEntries.length} entries):\n${transcriptText}`);

  if (allEntries.length === 0) {
    console.warn(`[orchestrator] Call completed with no transcript — WebSocket never connected. Skipping quote commit.`);
    clearSession(callSid);
    return;
  }

  // Extract quote
  const extracted = await extractQuote(transcriptText, rfqDetails.supplierName);
  console.log(`[orchestrator] Extracted quote:`, {
    unitPriceUsd: extracted.unitPriceUsd,
    moq: String(extracted.moq),
    leadTimeDays: String(extracted.leadTimeDays),
  });

  // Record negotiation in brain
  const today = new Date().toISOString().split("T")[0];
  await recordNegotiation(agentId, rfqDetails.supplierName, rfqDetails.supplierPhone, {
    date: today,
    rfqId: String(rfqId),
    item: rfqDetails.item,
    quantity: rfqDetails.quantity,
    unitPriceUsd: extracted.unitPriceUsd,
    moq: Number(extracted.moq),
    leadTimeDays: Number(extracted.leadTimeDays),
    negotiatedDown: false, // TODO: detect from transcript
    openingPriceUsd: undefined,
    savingsPercent: undefined,
  });

  // Upload quote packet to 0G Storage
  const quotePacket = {
    rfqId: String(rfqId),
    supplier: rfqDetails.supplierName,
    supplierPhone: rfqDetails.supplierPhone,
    unitPriceUsd: extracted.unitPriceUsd,
    unitPriceWei: String(extracted.unitPriceWei),
    moq: String(extracted.moq),
    leadTimeDays: String(extracted.leadTimeDays),
    validUntil: extracted.validUntil,
    transcript: allEntries,
    timestamp: Date.now(),
  };

  const { rootHash, uri } = await uploadJSON(quotePacket, signer);
  const quoteDataHash = rootHash.startsWith("0x") ? rootHash : `0x${rootHash}`;

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
    console.error(`[orchestrator] commitQuote failed:`, err);
  }

  clearSession(callSid);
  console.log(`\n[orchestrator] === RFQ ${rfqId} processing complete ===`);
}

// Deduplicate: track RFQ IDs currently being processed so duplicate events
// (ethers polling re-delivery or zombie agent processes) don't cause double commits.
const processingRFQs = new Set<string>();

/**
 * Start the orchestrator — handles all RFQs.
 * Access control is enforced at createRFQ (credit consumption).
 * Anyone who pays credits can use any agent; brain intelligence is owner-only in the UI.
 */
export function startOrchestrator(): void {
  listenForRFQCreated(async (rfqId, buyer, agentId, _rfqDataHash) => {
    const key = String(rfqId);
    if (processingRFQs.has(key)) {
      console.warn(`[orchestrator] RFQ ${rfqId} already in-flight — ignoring duplicate event`);
      return;
    }
    processingRFQs.add(key);
    console.log(`[orchestrator] Processing RFQ ${rfqId} for agentId=${agentId} buyer=${buyer}`);
    handleRFQ(rfqId, buyer, agentId)
      .catch((err) => {
        console.error(`[orchestrator] Error handling RFQ ${rfqId}:`, err);
      })
      .finally(() => {
        processingRFQs.delete(key);
      });
  });
}
