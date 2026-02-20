Plan to implement                                                                                                                                     │
│                                                                                                                                                       │
│ Procurement Negotiator iNFT - Implementation Plan                                                                                                     │
│                                                                                                                                                       │
│ Context                                                                                                                                               │
│                                                                                                                                                       │
│ Building a hackathon project for the ETHDenver 2026 "Best use of on-chain AI agents using 0G's iNFT primitives" bounty ($7k). The repo is currently   │
│ empty. The project is an ownable iNFT agent on 0G Chain that merchants "rent" per-run via credits to source supplier quotes. The agent negotiates     │
│ with suppliers via Twilio Voice phone calls powered by 0G Compute LLM inference - two AI agents talking to each other on a real phone call.           │
│ Transcripts and quotes are stored on 0G Storage, committed on-chain, and settled with payout.                                                         │
│                                                                                                                                                       │
│ Key Changes from Original Spec                                                                                                                        │
│                                                                                                                                                       │
│ 1. Twilio Voice + 0G Compute negotiation replaces mock HTTP supplier bots. The agent iNFT literally calls supplier phone numbers and negotiates via   │
│ voice, powered by 0G's decentralized LLM inference. Suppliers are also AI-powered Twilio endpoints.                                                   │
│ 2. Agent operator authorization via ERC-7857's authorizeUsage() instead of a separate agentOperator address on RFQMarket. More composable.            │
│ 3. Global quote IDs (nextQuoteId++) instead of per-RFQ arrays.                                                                                        │
│ 4. uint48 for timestamps instead of uint256 - cheaper gas.                                                                                            │
│ 5. 0G Storage fallback - hash always committed on-chain; 0G upload best-effort.                                                                       │
│ 6. Also qualifies for "Best Use of AI Inference" bounty ($7k) since we use 0G Compute for the negotiation LLM.                                        │
│                                                                                                                                                       │
│ Architecture Overview                                                                                                                                 │
│                                                                                                                                                       │
│ User (UI) ──> createRFQ() on-chain ──> RFQCreated event                                                                                               │
│                                             │                                                                                                         │
│                                             ▼                                                                                                         │
│                                    Agent Orchestrator                                                                                                 │
│                                             │                                                                                                         │
│                     ┌───────────────────────┼───────────────────────┐                                                                                 │
│                     ▼                       ▼                       ▼                                                                                 │
│             Twilio Call to           Twilio Call to           Twilio Call to                                                                          │
│             SupplierA number         SupplierB number         SupplierC number                                                                        │
│                     │                       │                       │                                                                                 │
│             ┌───────┴───────┐       ┌───────┴───────┐       ┌───────┴───────┐                                                                         │
│             │ ConvRelay WS  │       │ ConvRelay WS  │       │ ConvRelay WS  │                                                                         │
│             │ Agent ←→ 0G   │       │ Agent ←→ 0G   │       │ Agent ←→ 0G   │                                                                         │
│             │ Compute LLM   │       │ Compute LLM   │       │ Compute LLM   │                                                                         │
│             └───────┬───────┘       └───────┬───────┘       └───────┬───────┘                                                                         │
│                     │                       │                       │                                                                                 │
│                     ▼                       ▼                       ▼                                                                                 │
│             Transcript + Quote      Transcript + Quote      Transcript + Quote                                                                        │
│                     │                       │                       │                                                                                 │
│                     └───────────────────────┼───────────────────────┘                                                                                 │
│                                             │                                                                                                         │
│                                     Upload to 0G Storage                                                                                              │
│                                             │                                                                                                         │
│                                     commitQuote() on-chain (x3)                                                                                       │
│                                             │                                                                                                         │
│                                             ▼                                                                                                         │
│                               User sees quotes in UI, accepts one                                                                                     │
│                                             │                                                                                                         │
│                                     acceptQuote() + payout                                                                                            │
│                                                                                                                                                       │
│ ---                                                                                                                                                   │
│ Phase 0: Project Scaffolding                                                                                                                          │
│                                                                                                                                                       │
│ Step 0.1: Root project setup                                                                                                                          │
│                                                                                                                                                       │
│ Create:                                                                                                                                               │
│ - package.json (npm workspaces: contracts, agent, suppliers, ui)                                                                                      │
│ - .gitignore (node_modules, .env, artifacts, cache, .next, typechain-types)                                                                           │
│ - .env.example with all required env vars (see below)                                                                                                 │
│                                                                                                                                                       │
│ Required env vars:                                                                                                                                    │
│ # Blockchain                                                                                                                                          │
│ PRIVATE_KEY=                                                                                                                                          │
│ RPC_URL=https://evmrpc-testnet.0g.ai                                                                                                                  │
│ INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai                                                                                               │
│                                                                                                                                                       │
│ # Contract addresses (after deploy)                                                                                                                   │
│ NEGOTIATOR_INFT_ADDRESS=                                                                                                                              │
│ USAGE_CREDITS_ADDRESS=                                                                                                                                │
│ RFQ_MARKET_ADDRESS=                                                                                                                                   │
│                                                                                                                                                       │
│ # Twilio                                                                                                                                              │
│ TWILIO_ACCOUNT_SID=                                                                                                                                   │
│ TWILIO_AUTH_TOKEN=                                                                                                                                    │
│ TWILIO_AGENT_NUMBER=        # Agent's outbound phone number                                                                                           │
│ TWILIO_SUPPLIER_A_NUMBER=   # SupplierA's Twilio number                                                                                               │
│ TWILIO_SUPPLIER_B_NUMBER=   # SupplierB's Twilio number                                                                                               │
│ TWILIO_SUPPLIER_C_NUMBER=   # SupplierC's Twilio number                                                                                               │
│ NGROK_URL=                  # Public URL for Twilio webhooks                                                                                          │
│                                                                                                                                                       │
│ # 0G Compute                                                                                                                                          │
│ ZG_COMPUTE_PROVIDER_ADDRESS=  # 0G Compute provider for LLM inference                                                                                 │
│                                                                                                                                                       │
│ # UI                                                                                                                                                  │
│ NEXT_PUBLIC_WC_PROJECT_ID=    # WalletConnect project ID                                                                                              │
│                                                                                                                                                       │
│ Step 0.2: Hardhat project (/contracts)                                                                                                                │
│                                                                                                                                                       │
│ - hardhat.config.ts - Solidity 0.8.19, evmVersion "cancun", 0g-testnet network (chainId 16602, RPC https://evmrpc-testnet.0g.ai)                      │
│ - package.json - hardhat, @nomicfoundation/hardhat-toolbox, @openzeppelin/contracts ^4.9.6                                                            │
│ - tsconfig.json                                                                                                                                       │
│                                                                                                                                                       │
│ Step 0.3: Agent project (/agent)                                                                                                                      │
│                                                                                                                                                       │
│ - package.json - ethers v6, @0glabs/0g-ts-sdk, openai (for 0G Compute OpenAI-compat calls), twilio, fastify, @fastify/websocket, dotenv, tsx          │
│ - tsconfig.json                                                                                                                                       │
│                                                                                                                                                       │
│ Step 0.4: Suppliers project (/suppliers)                                                                                                              │
│                                                                                                                                                       │
│ - package.json - fastify, @fastify/websocket, openai (for 0G Compute), twilio, dotenv, tsx                                                            │
│ - tsconfig.json                                                                                                                                       │
│                                                                                                                                                       │
│ Step 0.5: Next.js UI (/ui)                                                                                                                            │
│                                                                                                                                                       │
│ - Create via npx create-next-app@latest with App Router + Tailwind + TypeScript                                                                       │
│ - Add wagmi v2, viem, @rainbow-me/rainbowkit, @tanstack/react-query                                                                                   │
│                                                                                                                                                       │
│ Step 0.6: Shared ABI/address directory (/shared)                                                                                                      │
│                                                                                                                                                       │
│ - addresses.json (populated after deploy)                                                                                                             │
│ - abis/ (populated from artifacts after compile)                                                                                                      │
│                                                                                                                                                       │
│ ---                                                                                                                                                   │
│ Phase 1: Smart Contracts                                                                                                                              │
│                                                                                                                                                       │
│ (Unchanged from before - contracts are the same regardless of how suppliers are contacted)                                                            │
│                                                                                                                                                       │
│ Step 1.1: contracts/contracts/interfaces/IERC7857Lite.sol                                                                                             │
│                                                                                                                                                       │
│ Simplified ERC-7857 interface with:                                                                                                                   │
│ - IntelligentData struct (dataDescription, dataHash)                                                                                                  │
│ - authorizeUsage(tokenId, user), revokeAuthorization(tokenId, user)                                                                                   │
│ - authorizedUsersOf(tokenId) view                                                                                                                     │
│ - intelligentDataOf(tokenId) view                                                                                                                     │
│ - Events: Authorization, AuthorizationRevoked, MetadataUpdated                                                                                        │
│                                                                                                                                                       │
│ Step 1.2: contracts/contracts/NegotiatorINFT.sol                                                                                                      │
│                                                                                                                                                       │
│ ERC721Enumerable + Ownable + ReentrancyGuard + IERC7857Lite:                                                                                          │
│ - AgentProfile struct: name, categories, regions, maxRFQValueWei, feePerRFQWei, brainBundleHash, brainBundleURI, profileURI                           │
│ - _nextTokenId counter, mapping(uint256 => AgentProfile) profiles                                                                                     │
│ - ERC-7857 state: _metadataHashes, _encryptedURIs, _authorizations, _authorizedUsers                                                                  │
│ - mint(AgentProfile) - mints token, stores profile, emits AgentMinted + MetadataUpdated                                                               │
│ - updateProfile(tokenId, AgentProfile) - onlyOwner                                                                                                    │
│ - setBrainBundle(tokenId, hash, uri) - onlyOwner, emits BrainBundleUpdated                                                                            │
│ - authorizeUsage(tokenId, user) / revokeAuthorization(tokenId, user) - onlyOwner                                                                      │
│ - isAuthorized(tokenId, user) view - used by RFQMarket for operator check                                                                             │
│ - intelligentDataOf(tokenId) view - returns brain bundle as IntelligentData                                                                           │
│ - getProfile(tokenId), getFeePerRFQ(tokenId) views - composability                                                                                    │
│                                                                                                                                                       │
│ Step 1.3: contracts/contracts/UsageCredits.sol                                                                                                        │
│                                                                                                                                                       │
│ ReentrancyGuard:                                                                                                                                      │
│ - State: credits[user][agentId], pricePerCredit[agentId], immutable nft ref, rfqMarket address                                                        │
│ - setRFQMarket(address) - one-time link                                                                                                               │
│ - setPrice(agentId, price) - onlyAgentOwner                                                                                                           │
│ - buyCredits(agentId, amount) payable - validates payment, forwards ETH to agent owner, increments credits                                            │
│ - consumeCredit(user, agentId) - onlyRFQMarket, decrements                                                                                            │
│ - getCredits(user, agentId) view                                                                                                                      │
│                                                                                                                                                       │
│ Step 1.4: contracts/contracts/RFQMarket.sol                                                                                                           │
│                                                                                                                                                       │
│ ReentrancyGuard:                                                                                                                                      │
│ - RFQStatus enum: Open, QuotesReceived, Accepted, Cancelled                                                                                           │
│ - RFQ struct: buyer, agentId, rfqDataHash (bytes32), rfqDataURI, createdAt (uint48), status, acceptedQuoteId                                          │
│ - Quote struct: rfqId, quoteDataHash (bytes32), quoteDataURI, supplierLabel, unitPriceWei, moq, leadTimeDays, validUntil (uint48)                     │
│ - State: immutable nft + creditsContract refs, nextRFQId, nextQuoteId, mappings for rfqs/quotes/rfqQuotes                                             │
│ - createRFQ(agentId, rfqDataHash, rfqDataURI) - consumes 1 credit, emits RFQCreated                                                                   │
│ - commitQuote(rfqId, ...) - requires nft.isAuthorized(agentId, msg.sender) OR nft.ownerOf(agentId) == msg.sender, emits QuoteCommitted                │
│ - acceptQuote(rfqId, quoteId) payable - requires buyer, requires msg.value == agentFee, pays owner, emits QuoteAccepted + AgentPaid                   │
│ - View functions: getRFQ, getQuote, getRFQQuoteIds                                                                                                    │
│                                                                                                                                                       │
│ Step 1.5: contracts/scripts/deploy.ts                                                                                                                 │
│                                                                                                                                                       │
│ Sequential deploy: NegotiatorINFT -> UsageCredits(nft) -> RFQMarket(nft, credits) -> credits.setRFQMarket(market)                                     │
│ Writes addresses to /shared/addresses.json and copies ABIs to /shared/abis/.                                                                          │
│                                                                                                                                                       │
│ Step 1.6: contracts/test/integration.test.ts                                                                                                          │
│                                                                                                                                                       │
│ Full lifecycle test:                                                                                                                                  │
│ 1. Mint agent with profile                                                                                                                            │
│ 2. Set credit price                                                                                                                                   │
│ 3. Authorize operator address                                                                                                                         │
│ 4. User buys credits (verify owner receives ETH)                                                                                                      │
│ 5. User creates RFQ (verify credit consumed)                                                                                                          │
│ 6. Operator commits 3 quotes                                                                                                                          │
│ 7. User accepts best quote with fee (verify owner receives fee)                                                                                       │
│ 8. Verify final statuses                                                                                                                              │
│                                                                                                                                                       │
│ Plus unit tests per contract for edge cases.                                                                                                          │
│                                                                                                                                                       │
│ ---                                                                                                                                                   │
│ Phase 2: Supplier Voice Bots (Twilio + 0G Compute)                                                                                                    │
│                                                                                                                                                       │
│ Each "supplier" is a Twilio phone number that answers calls with an LLM-powered voice bot. When the agent calls, the supplier bot negotiates from its │
│  persona.                                                                                                                                             │
│                                                                                                                                                       │
│ Step 2.1: suppliers/src/llm.ts - 0G Compute LLM Client                                                                                                │
│                                                                                                                                                       │
│ - Use OpenAI Node.js SDK with baseURL pointed to 0G Compute provider endpoint                                                                         │
│ - Discover provider endpoint at startup via 0G service registry (or hardcode for hackathon)                                                           │
│ - Function: chatCompletion(messages[], stream: boolean) -> text/stream                                                                                │
│ - Fallback: if 0G Compute unreachable, fall back to OpenAI API (env flag)                                                                             │
│                                                                                                                                                       │
│ Step 2.2: Supplier system prompts                                                                                                                     │
│                                                                                                                                                       │
│ Each supplier has a distinct LLM persona defined as a system prompt:                                                                                  │
│                                                                                                                                                       │
│ suppliers/src/personas.ts                                                                                                                             │
│ - SupplierA "ValueSource": Budget-friendly supplier. Offers $5/unit base, willing to negotiate down to $4/unit for large orders (>2000). Slow         │
│ shipping (21-28 days). MOQ 100. Personality: friendly, accommodating on price.                                                                        │
│ - SupplierB "QuickShip": Premium fast supplier. $8.50/unit firm, 7-day delivery anywhere. MOQ 10. Personality: professional, firm on price,           │
│ emphasizes speed.                                                                                                                                     │
│ - SupplierC "BulkDeal": Bulk discount specialist. $12/unit for small orders, drops to $3.50/unit for 1000+. 14-day lead. MOQ 500. Personality:        │
│ direct, pushes for larger orders.                                                                                                                     │
│                                                                                                                                                       │
│ Each prompt includes instructions to:                                                                                                                 │
│ - State their name and company                                                                                                                        │
│ - Ask about quantity and delivery requirements                                                                                                        │
│ - Provide a quote with unitPrice, MOQ, leadTime                                                                                                       │
│ - Negotiate if pushed, within their persona bounds                                                                                                    │
│ - End by confirming the final offer clearly                                                                                                           │
│                                                                                                                                                       │
│ Step 2.3: suppliers/src/index.ts - Fastify Server with WebSocket                                                                                      │
│                                                                                                                                                       │
│ Single server handling all 3 supplier personas. Runs on port 4000.                                                                                    │
│                                                                                                                                                       │
│ HTTP Routes (Twilio webhooks):                                                                                                                        │
│ - GET /twiml/valuesource - Returns TwiML with ConversationRelay pointing to wss://{NGROK}/ws/valuesource                                              │
│ - GET /twiml/quickship - Returns TwiML with ConversationRelay pointing to wss://{NGROK}/ws/quickship                                                  │
│ - GET /twiml/bulkdeal - Returns TwiML with ConversationRelay pointing to wss://{NGROK}/ws/bulkdeal                                                    │
│ - GET /health                                                                                                                                         │
│                                                                                                                                                       │
│ TwiML format for each:                                                                                                                                │
│ <Response>                                                                                                                                            │
│   <Connect>                                                                                                                                           │
│     <ConversationRelay                                                                                                                                │
│       url="wss://{NGROK_URL}/ws/{supplier}"                                                                                                           │
│       welcomeGreeting="{supplier-specific greeting}"                                                                                                  │
│       ttsProvider="Google"                                                                                                                            │
│       transcriptionProvider="Deepgram"                                                                                                                │
│       interruptible="any"                                                                                                                             │
│     />                                                                                                                                                │
│   </Connect>                                                                                                                                          │
│ </Response>                                                                                                                                           │
│                                                                                                                                                       │
│ WebSocket Routes:                                                                                                                                     │
│ - GET /ws/valuesource - WebSocket handler with ValueSource persona                                                                                    │
│ - GET /ws/quickship - WebSocket handler with QuickShip persona                                                                                        │
│ - GET /ws/bulkdeal - WebSocket handler with BulkDeal persona                                                                                          │
│                                                                                                                                                       │
│ WebSocket handler pattern (shared logic, different system prompt):                                                                                    │
│ on "setup" message:                                                                                                                                   │
│   - Initialize conversation with supplier system prompt                                                                                               │
│   - Store session by callSid                                                                                                                          │
│                                                                                                                                                       │
│ on "prompt" message:                                                                                                                                  │
│   - Add user speech (voicePrompt) to conversation history                                                                                             │
│   - Call 0G Compute LLM (streaming)                                                                                                                   │
│   - Stream tokens back via { type: "text", token, last }                                                                                              │
│   - Record transcript                                                                                                                                 │
│                                                                                                                                                       │
│ on "close":                                                                                                                                           │
│   - Save transcript to in-memory store (keyed by callSid)                                                                                             │
│   - Expose transcript via GET /transcript/{callSid}                                                                                                   │
│                                                                                                                                                       │
│ Step 2.4: suppliers/src/transcript.ts - Transcript Store                                                                                              │
│                                                                                                                                                       │
│ - In-memory Map<callSid, TranscriptEntry[]>                                                                                                           │
│ - GET /transcript/:callSid endpoint to retrieve after call ends                                                                                       │
│ - Each entry: { speaker: "agent"|"supplier", text: string, timestamp: number }                                                                        │
│                                                                                                                                                       │
│ Step 2.5: Twilio Phone Number Setup                                                                                                                   │
│                                                                                                                                                       │
│ - Purchase 3 Twilio phone numbers (or use 1 number with different TwiML apps)                                                                         │
│ - Configure each number's voice webhook to point to https://{NGROK}/twiml/{supplier}                                                                  │
│ - Use ngrok for local development: ngrok http 4000                                                                                                    │
│                                                                                                                                                       │
│ ---                                                                                                                                                   │
│ Phase 3: Agent Orchestrator (Twilio Caller + 0G Compute + 0G Storage)                                                                                 │
│                                                                                                                                                       │
│ The orchestrator is the "brain" of the iNFT. It detects RFQ events, calls suppliers via Twilio Voice, negotiates using 0G Compute LLM, extracts       │
│ quotes from transcripts, stores everything on 0G Storage, and commits quotes on-chain.                                                                │
│                                                                                                                                                       │
│ Step 3.1: agent/src/config.ts                                                                                                                         │
│                                                                                                                                                       │
│ Load all env vars: RPC, keys, contract addresses, Twilio creds, supplier phone numbers, 0G endpoints.                                                 │
│                                                                                                                                                       │
│ Step 3.2: agent/src/storage.ts - 0G Storage Wrapper                                                                                                   │
│                                                                                                                                                       │
│ Using @0glabs/0g-ts-sdk:                                                                                                                              │
│ - initStorage() - create Indexer + signer                                                                                                             │
│ - uploadJSON(data) -> { rootHash, txHash } - write JSON to temp file, upload via ZgFile                                                               │
│ - downloadJSON(rootHash) -> parsed object                                                                                                             │
│ - Fallback: if 0G upload fails, compute keccak256 locally and use local://{hash} URI                                                                  │
│                                                                                                                                                       │
│ Step 3.3: agent/src/contracts.ts - On-chain Interaction                                                                                               │
│                                                                                                                                                       │
│ Ethers v6 contract wrappers:                                                                                                                          │
│ - Load ABIs from /shared/abis/, addresses from /shared/addresses.json                                                                                 │
│ - listenForRFQCreated(callback) - event subscription                                                                                                  │
│ - commitQuote(rfqId, ...) - send transaction                                                                                                          │
│ - getRFQ(rfqId), getAgentProfile(agentId) - read calls                                                                                                │
│                                                                                                                                                       │
│ Step 3.4: agent/src/llm.ts - 0G Compute LLM Client                                                                                                    │
│                                                                                                                                                       │
│ Same pattern as suppliers:                                                                                                                            │
│ - OpenAI SDK with 0G Compute baseURL                                                                                                                  │
│ - Function to extract structured quote from transcript text                                                                                           │
│ - Agent negotiation system prompt (buyer persona)                                                                                                     │
│                                                                                                                                                       │
│ Step 3.5: agent/src/caller.ts - Twilio Voice Call Manager                                                                                             │
│                                                                                                                                                       │
│ Outbound call flow:                                                                                                                                   │
│ 1. callSupplier(supplierNumber, rfqData) -> Promise<{ callSid, transcript, quote }>                                                                   │
│ 2. Initiate Twilio outbound call:                                                                                                                     │
│    - from: TWILIO_AGENT_NUMBER                                                                                                                        │
│    - to: supplierNumber                                                                                                                               │
│    - url: https://{NGROK}/agent-twiml?rfqId={id}&supplier={name}                                                                                      │
│ 3. Agent-side TwiML returns ConversationRelay pointing to agent's own WS                                                                              │
│ 4. Agent WS negotiates using 0G Compute LLM with buyer system prompt                                                                                  │
│ 5. After call ends, fetch supplier transcript from supplier server                                                                                    │
│ 6. Merge agent + supplier transcripts into full conversation record                                                                                   │
│                                                                                                                                                       │
│ Agent-side Fastify server (runs on port 3001):                                                                                                        │
│ - GET /agent-twiml - Returns TwiML with ConversationRelay for the agent/buyer side                                                                    │
│ - GET /ws/agent - WebSocket handler with buyer/negotiation system prompt                                                                              │
│                                                                                                                                                       │
│ Agent system prompt includes:                                                                                                                         │
│ - The RFQ details (item, qty, region, budget) injected per-call                                                                                       │
│ - Instructions to negotiate for best price                                                                                                            │
│ - Instructions to get a clear final offer with unitPrice, MOQ, leadTime                                                                               │
│ - Instructions to say goodbye and end the call when a final offer is received                                                                         │
│                                                                                                                                                       │
│ Step 3.6: agent/src/extractor.ts - Quote Extraction                                                                                                   │
│                                                                                                                                                       │
│ After each call completes:                                                                                                                            │
│ - Takes the full transcript text                                                                                                                      │
│ - Calls 0G Compute LLM with extraction prompt:                                                                                                        │
│ "Extract from this negotiation transcript: supplierLabel, unitPriceUsd, moq, leadTimeDays. Return JSON."                                              │
│ - Parses the structured response into a Quote object                                                                                                  │
│ - Falls back to regex extraction if LLM extraction fails                                                                                              │
│                                                                                                                                                       │
│ Step 3.7: agent/src/orchestrator.ts - Main Logic                                                                                                      │
│                                                                                                                                                       │
│ On RFQCreated event:                                                                                                                                  │
│ 1. Download RFQ data from 0G Storage                                                                                                                  │
│ 2. For each supplier (sequentially - phone calls can't be parallelized easily):                                                                       │
│    a. Initiate Twilio call to supplier number                                                                                                         │
│    b. Wait for call to complete (poll Twilio call status)                                                                                             │
│    c. Retrieve transcript from supplier server                                                                                                        │
│    d. Extract structured quote via LLM                                                                                                                │
│    e. Build quote packet: { rfqId, supplier, quote, transcript, timestamp }                                                                           │
│    f. Upload quote packet to 0G Storage -> get rootHash                                                                                               │
│    g. Call commitQuote() on-chain                                                                                                                     │
│ 3. Log all tx hashes and quote summaries                                                                                                              │
│                                                                                                                                                       │
│ Call completion detection:                                                                                                                            │
│ - Poll twilioClient.calls(callSid).fetch() until status is "completed"                                                                                │
│ - Or use Twilio status callback webhook: POST /call-status on agent server                                                                            │
│                                                                                                                                                       │
│ Step 3.8: agent/src/index.ts                                                                                                                          │
│                                                                                                                                                       │
│ Entry point:                                                                                                                                          │
│ - Init 0G Storage                                                                                                                                     │
│ - Start Fastify server (port 3001) for agent-side TwiML/WebSocket                                                                                     │
│ - Start RFQCreated event listener                                                                                                                     │
│ - Log status                                                                                                                                          │
│                                                                                                                                                       │
│ ---                                                                                                                                                   │
│ Phase 4: Web UI (Next.js)                                                                                                                             │
│                                                                                                                                                       │
│ Step 4.1: Core setup                                                                                                                                  │
│                                                                                                                                                       │
│ - ui/lib/wagmi.ts - Define 0G Galileo testnet chain (id 16602), configure wagmi + RainbowKit                                                          │
│ - ui/app/providers.tsx - WagmiProvider + RainbowKitProvider + QueryClientProvider                                                                     │
│ - ui/app/layout.tsx - Root layout wrapping Providers, dark theme                                                                                      │
│ - ui/lib/contracts.ts - ABIs, addresses, typed hook helpers                                                                                           │
│ - ui/lib/ethers-adapter.ts - useEthersSigner() hook (viem wallet -> ethers signer for 0G SDK)                                                         │
│                                                                                                                                                       │
│ Step 4.2: Shared components                                                                                                                           │
│                                                                                                                                                       │
│ - ui/components/Header.tsx - Nav + ConnectButton                                                                                                      │
│ - ui/components/TxLink.tsx - Renders tx hash as link to chainscan-galileo.0g.ai/tx/{hash}                                                             │
│ - ui/components/AgentCard.tsx - Agent summary card                                                                                                    │
│ - ui/components/QuoteCard.tsx - Quote display with accept button                                                                                      │
│ - ui/components/StatusBadge.tsx - Colored badge for RFQ status                                                                                        │
│ - ui/components/TranscriptViewer.tsx - Displays negotiation transcript with speaker labels                                                            │
│                                                                                                                                                       │
│ Step 4.3: Pages                                                                                                                                       │
│                                                                                                                                                       │
│ ui/app/page.tsx - Home/Dashboard                                                                                                                      │
│ - Lists all minted agents (totalSupply + tokenByIndex)                                                                                                │
│ - "Mint New Agent" CTA                                                                                                                                │
│                                                                                                                                                       │
│ ui/app/mint/page.tsx - Mint Agent                                                                                                                     │
│ - Form: name, categories, regions, feePerRFQ, maxRFQValue, pricePerCredit                                                                             │
│ - Calls nft.mint(profile) then credits.setPrice(tokenId, price)                                                                                       │
│ - Shows tx hash links on success                                                                                                                      │
│                                                                                                                                                       │
│ ui/app/agent/[tokenId]/page.tsx - Agent Profile                                                                                                       │
│ - Displays full profile, intelligentDataOf(), authorized users                                                                                        │
│ - Owner actions: update profile, set brain bundle, authorize operator, set credit price                                                               │
│ - Shows credit price + "Buy Credits" inline form                                                                                                      │
│                                                                                                                                                       │
│ ui/app/rfq/new/page.tsx - Create RFQ                                                                                                                  │
│ - Select agent, enter item desc/qty/region/budget                                                                                                     │
│ - Uploads RFQ JSON to 0G Storage, computes hash                                                                                                       │
│ - Calls market.createRFQ(agentId, hash, uri)                                                                                                          │
│ - Shows tx + "Agent is now calling suppliers..."                                                                                                      │
│                                                                                                                                                       │
│ ui/app/rfq/page.tsx - RFQ Inbox                                                                                                                       │
│ - Lists user's RFQs with status badges                                                                                                                │
│ - Links to detail pages                                                                                                                               │
│                                                                                                                                                       │
│ ui/app/rfq/[rfqId]/page.tsx - RFQ Detail (demo centerpiece)                                                                                           │
│ - Shows RFQ info + data hash                                                                                                                          │
│ - Real-time status: "Calling SupplierA...", "Calling SupplierB...", "All quotes received"                                                             │
│ - Lists all quotes in comparison table (supplier, price, MOQ, lead time)                                                                              │
│ - "View Transcript" button on each quote - shows the full voice negotiation transcript                                                                │
│ - "Accept Quote" button -> calls market.acceptQuote{value}(rfqId, quoteId)                                                                            │
│ - Shows AgentPaid event confirmation + tx links                                                                                                       │
│ - Link to 0G Storage data for each quote (verifiable)                                                                                                 │
│                                                                                                                                                       │
│ Step 4.4: ui/lib/zero-g.ts                                                                                                                            │
│                                                                                                                                                       │
│ Browser-side 0G Storage upload for RFQ data using Blob API from @0glabs/0g-ts-sdk.                                                                    │
│                                                                                                                                                       │
│ ---                                                                                                                                                   │
│ Phase 5: Integration & Deployment                                                                                                                     │
│                                                                                                                                                       │
│ Step 5.1: Local integration test                                                                                                                      │
│                                                                                                                                                       │
│ 1. npx hardhat node (local chain)                                                                                                                     │
│ 2. Deploy contracts to localhost                                                                                                                      │
│ 3. Start ngrok: ngrok http 4000 (for Twilio webhooks)                                                                                                 │
│ 4. Start supplier bots: cd suppliers && npm start (port 4000)                                                                                         │
│ 5. Start agent orchestrator: cd agent && npm start (port 3001, also needs ngrok or same tunnel)                                                       │
│ 6. Start UI: cd ui && npm run dev                                                                                                                     │
│ 7. Walk through full demo flow in browser                                                                                                             │
│                                                                                                                                                       │
│ Step 5.2: Deploy to 0G Testnet                                                                                                                        │
│                                                                                                                                                       │
│ 1. Get A0GI from faucet.0g.ai                                                                                                                         │
│ 2. npx hardhat run scripts/deploy.ts --network 0g-testnet                                                                                             │
│ 3. Update /shared/addresses.json                                                                                                                      │
│ 4. Point agent + UI at testnet                                                                                                                        │
│                                                                                                                                                       │
│ Step 5.3: Verify contracts                                                                                                                            │
│                                                                                                                                                       │
│ npx hardhat verify on chainscan-galileo.0g.ai                                                                                                         │
│                                                                                                                                                       │
│ Step 5.4: Ngrok setup for demo                                                                                                                        │
│                                                                                                                                                       │
│ - Single ngrok tunnel with path-based routing, or two tunnels (suppliers:4000, agent:3001)                                                            │
│ - Configure all Twilio phone number webhooks to use ngrok URLs                                                                                        │
│ - Test end-to-end with real Twilio calls                                                                                                              │
│                                                                                                                                                       │
│ ---                                                                                                                                                   │
│ Phase 6: Polish & Demo Prep                                                                                                                           │
│                                                                                                                                                       │
│ Step 6.1: README.md                                                                                                                                   │
│                                                                                                                                                       │
│ - Architecture diagram showing voice call flow                                                                                                        │
│ - How it uses 0G: iNFT (ERC-7857), 0G Storage (Merkle proofs), 0G Compute (LLM inference)                                                             │
│ - Setup instructions (Twilio account, 0G testnet, ngrok, env vars)                                                                                    │
│ - Demo walkthrough                                                                                                                                    │
│                                                                                                                                                       │
│ Step 6.2: Demo Script (90 seconds)                                                                                                                    │
│                                                                                                                                                       │
│ 1. Show minted agent on 0G explorer - "This is our Negotiator iNFT"                                                                                   │
│ 2. Buy credits - show tx                                                                                                                              │
│ 3. Create RFQ for "1000 units of packaging material"                                                                                                  │
│ 4. Show the agent making real phone calls to 3 supplier numbers (this is the wow moment)                                                              │
│ 5. Show real-time quotes appearing as calls complete                                                                                                  │
│ 6. Show negotiation transcripts - "The agent negotiated $4.20/unit down from $5.00"                                                                   │
│ 7. Compare quotes side-by-side                                                                                                                        │
│ 8. Accept best quote - show payout to agent owner                                                                                                     │
│ 9. Show 0G Storage data (transcript + quote packet) - "All verifiable on-chain"                                                                       │
│                                                                                                                                                       │
│ Step 6.3: Visual Polish                                                                                                                               │
│                                                                                                                                                       │
│ - Dark theme, loading states                                                                                                                          │
│ - Live call status indicators (phone icon spinning while agent is on a call)                                                                          │
│ - Toast notifications for events                                                                                                                      │
│ - Transcript viewer with alternating speaker bubbles                                                                                                  │
│                                                                                                                                                       │
│ ---                                                                                                                                                   │
│ Implementation Order (Critical Path)                                                                                                                  │
│                                                                                                                                                       │
│ Phase 0 (scaffolding, 30min)                                                                                                                          │
│   ├─> Phase 1 (contracts + tests, 2.5hr) ──> Phase 5.2 (testnet deploy)                                                                               │
│   │     └─> Phase 3 (agent orchestrator + voice caller, 3hr) ─┐                                                                                       │
│   ├─> Phase 2 (supplier voice bots, 2hr) ─────────────────────┤                                                                                       │
│   └─> Phase 4 (UI, 2.5hr) ───────────────────────────────────>├─> Phase 5.1 (integration)                                                             │
│                                                                └─> Phase 6 (polish, 1hr)                                                              │
│                                                                                                                                                       │
│ - Phase 1 and Phase 2 can run in parallel (contracts don't depend on supplier bots)                                                                   │
│ - Phase 4 (UI) can start as soon as ABI shapes are known (same time as Phase 1)                                                                       │
│ - Phase 3 requires Phase 1 ABIs + Phase 2 running (agent calls suppliers)                                                                             │
│ - Phase 5 integration requires all of 1-4                                                                                                             │
│                                                                                                                                                       │
│ If running short on time, priorities in order:                                                                                                        │
│ 1. Contracts (must have)                                                                                                                              │
│ 2. Supplier voice bots with at least 1 supplier (must have for demo)                                                                                  │
│ 3. Agent orchestrator with Twilio calling (must have for demo)                                                                                        │
│ 4. UI core pages (mint, create RFQ, RFQ detail)                                                                                                       │
│ 5. 0G Storage integration                                                                                                                             │
│ 6. 0G Compute integration (can fall back to OpenAI if 0G Compute unreliable)                                                                          │
│ 7. Remaining UI pages + polish                                                                                                                        │
│ 8. Browser-side 0G upload                                                                                                                             │
│                                                                                                                                                       │
│ ---                                                                                                                                                   │
│ Verification                                                                                                                                          │
│                                                                                                                                                       │
│ 1. Contracts: cd contracts && npx hardhat test - all tests pass                                                                                       │
│ 2. Supplier bots: Call each Twilio supplier number from a real phone, hear the AI respond in character                                                │
│ 3. Agent: Start orchestrator, create RFQ via UI, see 3 phone calls initiated, transcripts captured, QuoteCommitted events on-chain                    │
│ 4. 0G Compute: Verify LLM responses come from 0G provider endpoint (log baseURL in console)                                                           │
│ 5. 0G Storage: Verify quote packet uploaded, rootHash matches on-chain bytes32                                                                        │
│ 6. UI: Walk full demo script - every action shows tx hash linking to explorer, transcripts viewable                                                   │
│ 7. End-to-end on testnet: Complete demo flow on 0G Galileo testnet with real Twilio calls + real transactions                                         │
│                                                                                                                                                       │
│ ---                                                                                                                                                   │
│ Judging Criteria Alignment                                                                                                                            │
│                                                                                                                                                       │
│ 0G Utilization (30%)                                                                                                                                  │
│                                                                                                                                                       │
│ - ERC-7857-inspired iNFT with intelligentDataOf(), authorizeUsage(), encrypted metadata                                                               │
│ - 0G Storage for RFQ packets, quote packets, and negotiation transcripts                                                                              │
│ - 0G Compute for LLM inference powering both agent and supplier voice bots                                                                            │
│ - Brain bundle stored on 0G Storage, hash on-chain                                                                                                    │
│                                                                                                                                                       │
│ User Value (25%)                                                                                                                                      │
│                                                                                                                                                       │
│ - Real procurement workflow with voice-based AI negotiation (not just form filling)                                                                   │
│ - Credit system for pay-per-use access                                                                                                                │
│ - Transparent transcripts show exactly how the agent negotiated                                                                                       │
│                                                                                                                                                       │
│ Composability (20%)                                                                                                                                   │
│                                                                                                                                                       │
│ - All state accessible via public view functions                                                                                                      │
│ - IERC7857Lite interface reusable by other iNFTs                                                                                                      │
│ - RFQMarket uses nft.isAuthorized() - composable authorization                                                                                        │
│ - Events richly indexed for off-chain systems                                                                                                         │
│                                                                                                                                                       │
│ Technical Correctness (15%)                                                                                                                           │
│                                                                                                                                                       │
│ - ReentrancyGuard on payments, access control on mutations                                                                                            │
│ - Comprehensive test suite                                                                                                                            │
│ - Clean separation: contracts / agent / suppliers / UI                                                                                                │
│                                                                                                                                                       │
│ Polish & Clarity (10%)                                                                                                                                │
│                                                                                                                                                       │
│ - Live phone calls during demo = massive wow factor                                                                                                   │
│ - Transcript viewer shows the negotiation                                                                                                             │
│ - Tx links throughout UI                                                                                                                              │
│ - Clean dark theme