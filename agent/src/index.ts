import { initContracts } from "./contracts.js";
import { startAgentServer } from "./caller.js";
import { startOrchestrator } from "./orchestrator.js";
import { config } from "./config.js";

// Prevent Node.js GC-related FileHandle errors (from 0G SDK) from crashing the process
process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
  if (err.code === "ERR_INVALID_STATE") return; // suppress ZgFile GC warnings
  console.error("[agent] Uncaught exception:", err);
  process.exit(1); // don't leave zombie processes listening to events
});

console.log("===========================================");
console.log(" Procurement Negotiator iNFT — Agent");
console.log("===========================================");
console.log(`RPC URL        : ${config.rpcUrl}`);
console.log(`Agent port     : ${config.agentPort}`);
console.log(`Public URL     : ${config.agentPublicUrl || config.ngrokUrl || "(not set)"}`);
console.log(`Supplier #     : ${config.supplierNumber}`);
console.log(`LLM model      : ${config.llmModel}`);
console.log();

// 1. Initialize blockchain contracts
initContracts();

// 2. Start agent-side HTTP / WebSocket server (for Twilio ConversationRelay)
await startAgentServer();

// 3. Start event listener + orchestration loop
startOrchestrator();

console.log("\n[agent] Ready — waiting for RFQCreated events...");
