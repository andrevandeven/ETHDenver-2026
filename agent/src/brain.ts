import { ethers } from "ethers";
import { uploadJSON, downloadJSON } from "./storage.js";
import { getContracts } from "./contracts.js";
import fs from "fs";
import path from "path";

const BRAIN_DIR = path.join(process.cwd(), ".brains");
if (!fs.existsSync(BRAIN_DIR)) fs.mkdirSync(BRAIN_DIR, { recursive: true });

// Load the deployed NFT contract address to namespace brain files per deployment.
// This prevents stale brain files from a previous deploy polluting a fresh one.
function getContractTag(): string {
  try {
    const addrPath = path.resolve(process.cwd(), "../shared/addresses.json");
    const addrs = JSON.parse(fs.readFileSync(addrPath, "utf8"));
    return (addrs.negotiatorINFT as string).slice(2, 10).toLowerCase(); // 4-byte prefix
  } catch {
    return "local";
  }
}
const CONTRACT_TAG = getContractTag();

function localPath(agentId: string) {
  return path.join(BRAIN_DIR, `agent-${CONTRACT_TAG}-${agentId}.json`);
}

function saveLocal(agentId: string, brain: BrainData) {
  try {
    fs.writeFileSync(localPath(agentId), JSON.stringify(brain, null, 2));
  } catch (err) {
    console.warn(`[brain] Failed to save local brain for agent ${agentId}:`, err);
  }
}

function loadLocal(agentId: string): BrainData | null {
  try {
    const raw = fs.readFileSync(localPath(agentId), "utf8");
    return JSON.parse(raw) as BrainData;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Brain schema — accumulated supplier intelligence that makes each iNFT valuable
// ─────────────────────────────────────────────────────────────────────────────

export type NegotiationRecord = {
  date: string;
  rfqId: string;
  item: string;
  quantity: number;
  unitPriceUsd: number;
  moq: number;
  leadTimeDays: number;
  negotiatedDown: boolean;
  openingPriceUsd?: number;
  savingsPercent?: number;
};

export type SupplierProfile = {
  name: string;
  phone: string;
  totalCalls: number;
  bestPriceUsd: number;
  avgPriceUsd: number;
  categories: string[];
  willingnessToNegotiate: "low" | "medium" | "high";
  lastContactedAt: number;
  negotiations: NegotiationRecord[];
  tacticsLog: string[];
};

export type BrainData = {
  version: number;
  updatedAt: number;
  agentId: string;
  suppliers: Record<string, SupplierProfile>; // keyed by supplier name (lowercased)
  totalNegotiations: number;
  totalSavingsPercent: number;
};

// In-memory brain, keyed by agentId
const brains = new Map<string, BrainData>();

function emptyBrain(agentId: string): BrainData {
  return {
    version: 1,
    updatedAt: Date.now(),
    agentId,
    suppliers: {},
    totalNegotiations: 0,
    totalSavingsPercent: 0,
  };
}

/**
 * Load brain from 0G Storage using the on-chain brainBundleURI.
 */
export async function loadBrain(agentId: bigint): Promise<BrainData> {
  const key = String(agentId);
  if (brains.has(key)) return brains.get(key)!;

  const { nft, signer } = getContracts();

  // 1. Try on-chain URI (0g:// or json://)
  try {
    const profile = await nft.getProfile(agentId);
    const uri: string = profile.brainBundleURI;

    if (uri && uri.startsWith("0g://")) {
      const rootHash = uri.slice(5);
      const data = await downloadJSON(rootHash, signer);
      if (data && typeof data === "object" && (data as BrainData).version) {
        const brain = data as BrainData;
        brains.set(key, brain);
        saveLocal(key, brain);
        console.log(`[brain] Loaded brain for agent ${key} from 0G Storage: ${brain.totalNegotiations} negotiations`);
        return brain;
      }
    } else if (uri && uri.startsWith("json://")) {
      const decoded = Buffer.from(uri.slice(7), "base64").toString("utf8");
      const data = JSON.parse(decoded);
      if (data && typeof data === "object" && (data as BrainData).version) {
        const brain = data as BrainData;
        brains.set(key, brain);
        saveLocal(key, brain);
        console.log(`[brain] Loaded brain for agent ${key} from on-chain json:// URI: ${brain.totalNegotiations} negotiations`);
        return brain;
      }
    }
  } catch (err) {
    console.warn(`[brain] Could not load from on-chain URI for agent ${key}:`, err);
  }

  // 2. Fall back to local file
  const local = loadLocal(key);
  if (local) {
    brains.set(key, local);
    console.log(`[brain] Loaded brain for agent ${key} from local file: ${local.totalNegotiations} negotiations`);
    return local;
  }

  const brain = emptyBrain(key);
  brains.set(key, brain);
  console.log(`[brain] Initialized empty brain for agent ${key}`);
  return brain;
}

/**
 * Get brain (in-memory). Returns undefined if not loaded yet.
 */
export function getBrain(agentId: string): BrainData | undefined {
  return brains.get(agentId);
}

/**
 * Look up a supplier by name in the brain. Case-insensitive match.
 */
export function findSupplier(brain: BrainData, supplierName: string): SupplierProfile | undefined {
  return brain.suppliers[supplierName.toLowerCase()];
}

/**
 * Record a completed negotiation and persist the updated brain.
 */
export async function recordNegotiation(
  agentId: bigint,
  supplierName: string,
  supplierPhone: string,
  record: NegotiationRecord
): Promise<void> {
  const key = String(agentId);
  const brain = brains.get(key) ?? emptyBrain(key);
  const supplierKey = supplierName.toLowerCase();

  let supplier = brain.suppliers[supplierKey];
  if (!supplier) {
    supplier = {
      name: supplierName,
      phone: supplierPhone,
      totalCalls: 0,
      bestPriceUsd: Infinity,
      avgPriceUsd: 0,
      categories: [],
      willingnessToNegotiate: "medium",
      lastContactedAt: Date.now(),
      negotiations: [],
      tacticsLog: [],
    };
  }

  supplier.totalCalls++;
  supplier.lastContactedAt = Date.now();
  supplier.phone = supplierPhone; // keep phone up to date
  supplier.negotiations.push(record);

  // Pricing stats
  const prices = supplier.negotiations.map((n) => n.unitPriceUsd);
  supplier.bestPriceUsd = Math.min(...prices);
  supplier.avgPriceUsd = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Categories
  const itemLower = record.item.toLowerCase();
  if (!supplier.categories.includes(itemLower)) {
    supplier.categories.push(itemLower);
  }

  // Willingness
  const negotiated = supplier.negotiations.filter((n) => n.negotiatedDown);
  const ratio = supplier.negotiations.length > 0 ? negotiated.length / supplier.negotiations.length : 0.5;
  supplier.willingnessToNegotiate = ratio > 0.6 ? "high" : ratio > 0.3 ? "medium" : "low";

  // Tactics
  if (record.negotiatedDown && record.savingsPercent && record.savingsPercent > 0) {
    supplier.tacticsLog.push(
      `${record.date}: Got ${record.savingsPercent.toFixed(1)}% off on ${record.item} (qty ${record.quantity})`
    );
    if (supplier.tacticsLog.length > 10) {
      supplier.tacticsLog = supplier.tacticsLog.slice(-10);
    }
  }

  brain.suppliers[supplierKey] = supplier;

  // Global stats
  brain.totalNegotiations++;
  const allRecords = Object.values(brain.suppliers).flatMap((s) => s.negotiations);
  const withSavings = allRecords.filter((n) => n.savingsPercent != null && n.savingsPercent > 0);
  brain.totalSavingsPercent =
    withSavings.length > 0
      ? withSavings.reduce((a, b) => a + (b.savingsPercent ?? 0), 0) / withSavings.length
      : 0;

  brain.updatedAt = Date.now();
  brains.set(key, brain);
  saveLocal(key, brain); // always save locally first

  await persistBrain(agentId, brain);
}

/**
 * Upload brain to 0G Storage and update on-chain brainBundleHash.
 */
async function persistBrain(agentId: bigint, brain: BrainData): Promise<void> {
  const { nft, signer } = getContracts();

  try {
    const { rootHash, uri } = await uploadJSON(brain, signer);
    const hashBytes = rootHash.startsWith("0x") ? rootHash : `0x${rootHash}`;
    const bytes32Hash = ethers.zeroPadValue(hashBytes, 32);

    const tx = await nft.setBrainBundle(agentId, bytes32Hash, uri);
    console.log(`[brain] setBrainBundle tx: ${tx.hash}`);
    await tx.wait();
    console.log(`[brain] Brain persisted — ${brain.totalNegotiations} negotiations, uri=${uri}`);
  } catch (err) {
    console.error("[brain] Failed to persist brain:", err);
  }
}

/**
 * Build context string for the system prompt — only for the specific supplier being called.
 */
export function buildSupplierContext(brain: BrainData, supplierName: string): string {
  const supplier = findSupplier(brain, supplierName);
  if (!supplier) return "";

  const lines: string[] = [];
  lines.push(`\nYou have called "${supplier.name}" ${supplier.totalCalls} time(s) before.`);
  lines.push(`Best price you've gotten from them: $${supplier.bestPriceUsd.toFixed(2)}/unit`);
  lines.push(`Their average price: $${supplier.avgPriceUsd.toFixed(2)}/unit`);
  lines.push(`Willingness to negotiate: ${supplier.willingnessToNegotiate}`);

  if (supplier.tacticsLog.length > 0) {
    lines.push(`What's worked with this supplier before:`);
    supplier.tacticsLog.slice(-3).forEach((t) => lines.push(`  - ${t}`));
  }

  const lastNeg = supplier.negotiations[supplier.negotiations.length - 1];
  if (lastNeg) {
    lines.push(`Last deal: $${lastNeg.unitPriceUsd.toFixed(2)}/unit for ${lastNeg.item} (${lastNeg.date})`);
    lines.push(`Push for a price at or below $${supplier.bestPriceUsd.toFixed(2)}/unit.`);
  }

  return lines.join("\n");
}
