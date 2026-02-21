import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  // Blockchain
  privateKey: required("PRIVATE_KEY"),
  rpcUrl: optional("RPC_URL", "https://evmrpc-testnet.0g.ai"),
  indexerRpc: optional("INDEXER_RPC", "https://indexer-storage-testnet-turbo.0g.ai"),

  // Contract addresses (populated after deploy)
  negotiatorINFTAddress: optional("NEGOTIATOR_INFT_ADDRESS"),
  usageCreditsAddress: optional("USAGE_CREDITS_ADDRESS"),
  rfqMarketAddress: optional("RFQ_MARKET_ADDRESS"),

  // Twilio
  twilioAccountSid: optional("TWILIO_ACCOUNT_SID"),
  twilioAuthToken: optional("TWILIO_AUTH_TOKEN"),
  twilioAgentNumber: optional("TWILIO_AGENT_NUMBER"),
  supplierNumber: optional("TWILIO_SUPPLIER_A_NUMBER", "+14802088823"),

  // Public URLs
  ngrokUrl: optional("NGROK_URL"),           // suppliers server base URL
  agentPublicUrl: optional("AGENT_PUBLIC_URL"), // agent server base URL (falls back to NGROK_URL)

  // 0G Compute
  zgComputeBaseUrl: optional("ZG_COMPUTE_BASE_URL", "https://api.0g.ai/v1"),
  zgComputeApiKey: optional("ZG_COMPUTE_API_KEY", "no-key-needed"),
  llmModel: optional("LLM_MODEL", "meta-llama/Llama-3.3-70B-Instruct"),

  // Agent server port
  agentPort: parseInt(optional("AGENT_PORT", "3001"), 10),
} as const;

// The public URL the agent server is reachable at (for Twilio to call back)
export function getAgentPublicUrl(): string {
  return (config.agentPublicUrl || config.ngrokUrl).replace(/\/$/, "");
}
