import { type Address } from "viem";

// ─────────────────────────────────────────────────────────────────────────────
// Contract addresses — set via NEXT_PUBLIC_ env vars after deploy
// ─────────────────────────────────────────────────────────────────────────────

export const ADDRESSES = {
  negotiatorINFT: (process.env.NEXT_PUBLIC_NEGOTIATOR_INFT_ADDRESS ?? "") as Address,
  usageCredits: (process.env.NEXT_PUBLIC_USAGE_CREDITS_ADDRESS ?? "") as Address,
  rfqMarket: (process.env.NEXT_PUBLIC_RFQ_MARKET_ADDRESS ?? "") as Address,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ABIs (minimal — only functions used by the UI)
// ─────────────────────────────────────────────────────────────────────────────

export const NEGOTIATOR_INFT_ABI = [
  // ERC721Enumerable
  { name: "totalSupply", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "tokenByIndex", type: "function", stateMutability: "view", inputs: [{ name: "index", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "tokenOfOwnerByIndex", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "index", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "ownerOf", type: "function", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  // Profile
  {
    name: "getProfile", type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{
      type: "tuple", components: [
        { name: "name", type: "string" },
        { name: "categories", type: "string" },
        { name: "regions", type: "string" },
        { name: "maxRFQValueWei", type: "uint256" },
        { name: "feePerRFQWei", type: "uint256" },
        { name: "brainBundleHash", type: "bytes32" },
        { name: "brainBundleURI", type: "string" },
        { name: "profileURI", type: "string" },
      ]
    }]
  },
  { name: "getFeePerRFQ", type: "function", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  {
    name: "intelligentDataOf", type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "tuple", components: [{ name: "dataDescription", type: "string" }, { name: "dataHash", type: "bytes32" }] }]
  },
  { name: "isAuthorized", type: "function", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }, { name: "user", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "authorizedUsersOf", type: "function", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address[]" }] },
  // Write
  {
    name: "mint", type: "function", stateMutability: "nonpayable",
    inputs: [{
      name: "profile", type: "tuple", components: [
        { name: "name", type: "string" },
        { name: "categories", type: "string" },
        { name: "regions", type: "string" },
        { name: "maxRFQValueWei", type: "uint256" },
        { name: "feePerRFQWei", type: "uint256" },
        { name: "brainBundleHash", type: "bytes32" },
        { name: "brainBundleURI", type: "string" },
        { name: "profileURI", type: "string" },
      ]
    }],
    outputs: [{ type: "uint256" }]
  },
  { name: "authorizeUsage", type: "function", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }, { name: "user", type: "address" }], outputs: [] },
  { name: "revokeAuthorization", type: "function", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }, { name: "user", type: "address" }], outputs: [] },
  { name: "setBrainBundle", type: "function", stateMutability: "nonpayable", inputs: [{ name: "tokenId", type: "uint256" }, { name: "hash", type: "bytes32" }, { name: "uri", type: "string" }], outputs: [] },
  // Events
  { name: "AgentMinted", type: "event", inputs: [{ name: "tokenId", type: "uint256", indexed: true }, { name: "owner", type: "address", indexed: true }, { name: "name", type: "string" }] },
] as const;

export const USAGE_CREDITS_ABI = [
  { name: "getCredits", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }, { name: "agentId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "pricePerCredit", type: "function", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { name: "buyCredits", type: "function", stateMutability: "payable", inputs: [{ name: "agentId", type: "uint256" }, { name: "amount", type: "uint256" }], outputs: [] },
  { name: "setPrice", type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentId", type: "uint256" }, { name: "price", type: "uint256" }], outputs: [] },
] as const;

export const RFQ_MARKET_ABI = [
  // Views
  {
    name: "getRFQ", type: "function", stateMutability: "view",
    inputs: [{ name: "rfqId", type: "uint256" }],
    outputs: [{
      type: "tuple", components: [
        { name: "buyer", type: "address" },
        { name: "agentId", type: "uint256" },
        { name: "rfqDataHash", type: "bytes32" },
        { name: "rfqDataURI", type: "string" },
        { name: "createdAt", type: "uint48" },
        { name: "status", type: "uint8" },
        { name: "acceptedQuoteId", type: "uint256" },
      ]
    }]
  },
  {
    name: "getQuote", type: "function", stateMutability: "view",
    inputs: [{ name: "quoteId", type: "uint256" }],
    outputs: [{
      type: "tuple", components: [
        { name: "rfqId", type: "uint256" },
        { name: "quoteDataHash", type: "bytes32" },
        { name: "quoteDataURI", type: "string" },
        { name: "supplierLabel", type: "string" },
        { name: "unitPriceWei", type: "uint256" },
        { name: "moq", type: "uint256" },
        { name: "leadTimeDays", type: "uint256" },
        { name: "validUntil", type: "uint48" },
      ]
    }]
  },
  { name: "getRFQQuoteIds", type: "function", stateMutability: "view", inputs: [{ name: "rfqId", type: "uint256" }], outputs: [{ type: "uint256[]" }] },
  { name: "nextRFQId", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { name: "nextQuoteId", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  // Write
  { name: "createRFQ", type: "function", stateMutability: "nonpayable", inputs: [{ name: "agentId", type: "uint256" }, { name: "rfqDataHash", type: "bytes32" }, { name: "rfqDataURI", type: "string" }], outputs: [{ type: "uint256" }] },
  { name: "acceptQuote", type: "function", stateMutability: "payable", inputs: [{ name: "rfqId", type: "uint256" }, { name: "quoteId", type: "uint256" }], outputs: [] },
  // Events
  { name: "RFQCreated", type: "event", inputs: [{ name: "rfqId", type: "uint256", indexed: true }, { name: "buyer", type: "address", indexed: true }, { name: "agentId", type: "uint256", indexed: true }, { name: "rfqDataHash", type: "bytes32" }] },
  { name: "QuoteCommitted", type: "event", inputs: [{ name: "quoteId", type: "uint256", indexed: true }, { name: "rfqId", type: "uint256", indexed: true }, { name: "supplierLabel", type: "string" }, { name: "unitPriceWei", type: "uint256" }] },
  { name: "QuoteAccepted", type: "event", inputs: [{ name: "rfqId", type: "uint256", indexed: true }, { name: "quoteId", type: "uint256", indexed: true }, { name: "buyer", type: "address" }] },
  { name: "AgentPaid", type: "event", inputs: [{ name: "rfqId", type: "uint256", indexed: true }, { name: "agentOwner", type: "address", indexed: true }, { name: "amount", type: "uint256" }] },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// RFQ status helpers
// ─────────────────────────────────────────────────────────────────────────────

export const RFQ_STATUS: Record<number, string> = {
  0: "Open",
  1: "Quotes Received",
  2: "Accepted",
  3: "Cancelled",
};

// Explorer link
export function explorerTxUrl(txHash: string): string {
  return `https://chainscan-galileo.0g.ai/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `https://chainscan-galileo.0g.ai/address/${address}`;
}
