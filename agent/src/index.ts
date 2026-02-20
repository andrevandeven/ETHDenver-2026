import { initContracts } from "./contracts.js";
import { startAgentServer } from "./caller.js";
import { startOrchestrator } from "./orchestrator.js";
import { config } from "./config.js";

console.log("===========================================");
console.log(" Procurement Negotiator iNFT — Agent");
console.log("===========================================");
console.log(`Agent token ID : ${config.agentTokenId}`);
console.log(`RPC URL        : ${config.rpcUrl}`);
console.log(`Agent port     : ${config.agentPort}`);
console.log(`Public URL     : ${config.agentPublicUrl || config.ngrokUrl || "(not set)"}`);
console.log();

// 1. Initialize blockchain contracts
initContracts();

// 2. Start agent-side HTTP / WebSocket server (for Twilio ConversationRelay)
await startAgentServer();

// 3. Start event listener + orchestration loop
startOrchestrator();

console.log("\n[agent] Ready — waiting for RFQCreated events...");
