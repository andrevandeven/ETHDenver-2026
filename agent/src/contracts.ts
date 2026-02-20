import { ethers } from "ethers";
import { config } from "./config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.resolve(__dirname, "../../shared");

function loadABI(name: string): ethers.InterfaceAbi {
  const abiPath = path.join(sharedDir, "abis", `${name}.json`);
  if (!fs.existsSync(abiPath)) {
    throw new Error(`ABI not found: ${abiPath}. Run 'npm run deploy:local' first.`);
  }
  return JSON.parse(fs.readFileSync(abiPath, "utf8"));
}

function loadAddresses(): Record<string, string> {
  const addrPath = path.join(sharedDir, "addresses.json");
  if (!fs.existsSync(addrPath)) {
    throw new Error(`addresses.json not found. Run deploy first.`);
  }
  return JSON.parse(fs.readFileSync(addrPath, "utf8"));
}

export type RFQData = {
  rfqId: bigint;
  buyer: string;
  agentId: bigint;
  rfqDataHash: string;
  rfqDataURI: string;
  createdAt: bigint;
  status: number;
};

let provider: ethers.JsonRpcProvider;
let signer: ethers.Wallet;
let rfqMarket: ethers.Contract;
let nft: ethers.Contract;

export function initContracts(): { signer: ethers.Wallet; rfqMarket: ethers.Contract; nft: ethers.Contract } {
  provider = new ethers.JsonRpcProvider(config.rpcUrl);
  signer = new ethers.Wallet(config.privateKey, provider);

  const addresses = loadAddresses();

  rfqMarket = new ethers.Contract(
    addresses.rfqMarket,
    loadABI("RFQMarket"),
    signer
  );

  nft = new ethers.Contract(
    addresses.negotiatorINFT,
    loadABI("NegotiatorINFT"),
    signer
  );

  console.log("[contracts] Initialized — operator:", signer.address);
  console.log("[contracts] RFQMarket:", addresses.rfqMarket);
  console.log("[contracts] NegotiatorINFT:", addresses.negotiatorINFT);

  return { signer, rfqMarket, nft };
}

export function getContracts() {
  if (!rfqMarket) throw new Error("Contracts not initialized — call initContracts() first");
  return { signer, rfqMarket, nft, provider };
}

/**
 * Subscribe to RFQCreated events. Calls `callback` for each new event.
 */
export function listenForRFQCreated(
  callback: (rfqId: bigint, buyer: string, agentId: bigint, rfqDataHash: string) => void
): void {
  const { rfqMarket } = getContracts();
  console.log("[contracts] Listening for RFQCreated events...");

  rfqMarket.on(
    "RFQCreated",
    (rfqId: bigint, buyer: string, agentId: bigint, rfqDataHash: string) => {
      console.log(`[contracts] RFQCreated rfqId=${rfqId} buyer=${buyer} agentId=${agentId}`);
      callback(rfqId, buyer, agentId, rfqDataHash);
    }
  );
}

/**
 * Fetch a single RFQ from the contract.
 */
export async function getRFQ(rfqId: bigint): Promise<RFQData> {
  const { rfqMarket } = getContracts();
  const r = await rfqMarket.getRFQ(rfqId);
  return {
    rfqId,
    buyer: r.buyer,
    agentId: r.agentId,
    rfqDataHash: r.rfqDataHash,
    rfqDataURI: r.rfqDataURI,
    createdAt: r.createdAt,
    status: Number(r.status),
  };
}

/**
 * Commit a supplier quote on-chain.
 */
export async function commitQuote(
  rfqId: bigint,
  quoteDataHash: string,
  quoteDataURI: string,
  supplierLabel: string,
  unitPriceWei: bigint,
  moq: bigint,
  leadTimeDays: bigint,
  validUntil: number
): Promise<ethers.TransactionReceipt> {
  const { rfqMarket } = getContracts();
  const tx = await rfqMarket.commitQuote(
    rfqId,
    quoteDataHash,
    quoteDataURI,
    supplierLabel,
    unitPriceWei,
    moq,
    leadTimeDays,
    validUntil
  );
  console.log(`[contracts] commitQuote tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[contracts] commitQuote confirmed: ${receipt.hash}`);
  return receipt;
}

/**
 * Get agent profile.
 */
export async function getAgentProfile(agentId: bigint) {
  const { nft } = getContracts();
  return nft.getProfile(agentId);
}
