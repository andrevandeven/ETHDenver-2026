# Procurement Negotiator iNFT

An AI procurement agent minted as an ERC-721 iNFT on [0G Chain](https://0g.ai). The agent negotiates supplier prices via **real Twilio voice calls**, powered by **0G Compute LLM inference**. Transcripts and quotes are stored on **0G Storage** and committed on-chain.

Built for ETHDenver 2026 — targeting the *Best Use of On-Chain AI Agents using 0G's iNFT Primitives* and *Best Use of AI Inference* bounties.

---

## How It Works

```
User (UI) ──► createRFQ() on-chain
                      │
                      ▼
             Agent Orchestrator listens
             for RFQCreated events
                      │
                      ▼
         Twilio outbound call to supplier
                      │
              ┌───────┴───────┐
              │ ConversationRelay WS  │
              │  Agent ◄──► 0G LLM   │
              └───────┬───────┘
                      │
              Transcript + Quote
                      │
              Upload to 0G Storage
                      │
         commitQuote() on-chain
                      │
                      ▼
         User compares quotes, accepts one
                      │
         acceptQuote() + payout to agent owner
```

1. **Create RFQ** — User submits a request for quote (item, quantity, region, budget) via the UI. The RFQ payload is uploaded to 0G Storage and committed on-chain.
2. **Agent calls supplier** — The agent listens for `RFQCreated` events and initiates a Twilio outbound call to the supplier phone number specified in the RFQ.
3. **Voice negotiation** — Twilio ConversationRelay connects the call to the agent's WebSocket server. The agent uses 0G Compute (Qwen/Llama via OpenAI-compatible API) to negotiate in real time — introducing itself, anchoring on a low price, dropping competitor quotes, and pushing for a final offer.
4. **Brain memory** — After each call the agent records the result in its *brain* (a JSON document stored on 0G Storage, hash committed on-chain). On future calls to the same supplier it injects past intel and competitor pricing into the system prompt.
5. **Quote committed** — The full quote packet (price, MOQ, lead time, transcript) is uploaded to 0G Storage and committed on-chain via `commitQuote()`.
6. **Accept & pay** — The buyer picks the best quote in the UI and calls `acceptQuote()`, which pays the agent owner's fee.

---

## Architecture

| Component | Stack | Port |
|-----------|-------|------|
| Smart Contracts | Solidity 0.8.19, Hardhat, OpenZeppelin | — |
| Agent / Orchestrator | TypeScript, Fastify, Twilio, ethers v6 | 3001 |
| Web UI | Next.js 16, React 19, Wagmi v2, RainbowKit | 3000 |

**Smart contracts (0G Testnet):**

| Contract | Address |
|----------|---------|
| NegotiatorINFT | `0xaC81054c8235a61892f3F17Dc60446B9F7498013` |
| UsageCredits | `0xE20786d2a69AF57b33C32C0E3b80A52900521Fc6` |
| RFQMarket | `0x3380A683C9f82cD27C26a4e0eDf276c7e7A3c1F2` |

---

## Prerequisites

- Node.js 20+
- A [Twilio](https://twilio.com) account with:
  - One phone number for the agent (outbound caller)
  - A supplier phone number that answers calls (can be another Twilio number, a real phone, or an AI voice bot)
- [ngrok](https://ngrok.com) (or any HTTPS tunnel) to expose the agent server to Twilio
- A 0G Testnet wallet with A0GI (get from [faucet.0g.ai](https://faucet.0g.ai))
- 0G Compute API key (from [0G Compute Network](https://compute.0g.ai))

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd ETHDenver-2026
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

```env
# Blockchain
PRIVATE_KEY=<your-wallet-private-key>
RPC_URL=https://evmrpc-testnet.0g.ai
INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai

# Contract addresses (after deploy, or use the ones above)
NEGOTIATOR_INFT_ADDRESS=0xaC81054c8235a61892f3F17Dc60446B9F7498013
USAGE_CREDITS_ADDRESS=0xE20786d2a69AF57b33C32C0E3b80A52900521Fc6
RFQ_MARKET_ADDRESS=0x3380A683C9f82cD27C26a4e0eDf276c7e7A3c1F2

# Twilio
TWILIO_ACCOUNT_SID=<your-account-sid>
TWILIO_AUTH_TOKEN=<your-auth-token>
TWILIO_AGENT_NUMBER=<agent-outbound-number>   # e.g. +15551234567
TWILIO_SUPPLIER_A_NUMBER=<supplier-number>    # number the agent will call

# Public URL (ngrok tunnel pointing at port 3001)
NGROK_URL=https://<your-ngrok-id>.ngrok-free.app
AGENT_PUBLIC_URL=https://<your-ngrok-id>.ngrok-free.app

# 0G Compute
ZG_COMPUTE_BASE_URL=https://compute-network-6.integratenetwork.work/v1/proxy
ZG_COMPUTE_API_KEY=<your-0g-compute-api-key>
LLM_MODEL=qwen/qwen-2.5-7b-instruct

# Agent server port
AGENT_PORT=3001

# UI
NEXT_PUBLIC_WC_PROJECT_ID=<walletconnect-project-id>
NEXT_PUBLIC_NEGOTIATOR_INFT_ADDRESS=0xaC81054c8235a61892f3F17Dc60446B9F7498013
NEXT_PUBLIC_USAGE_CREDITS_ADDRESS=0xE20786d2a69AF57b33C32C0E3b80A52900521Fc6
NEXT_PUBLIC_RFQ_MARKET_ADDRESS=0x3380A683C9f82cD27C26a4e0eDf276c7e7A3c1F2
NEXT_PUBLIC_AGENT_URL=https://<your-ngrok-id>.ngrok-free.app
```

> **Important:** `NGROK_URL` / `AGENT_PUBLIC_URL` must be updated every time ngrok restarts. Restart the agent after updating these values.

---

## Running

Open three terminal windows.

### Terminal 1 — ngrok tunnel

Expose the agent server so Twilio can reach it:

```bash
ngrok http 3001
```

Copy the HTTPS URL (e.g. `https://abc123.ngrok-free.app`) into `.env` as both `NGROK_URL` and `AGENT_PUBLIC_URL`.

### Terminal 2 — Agent

```bash
npm run agent
# or: npm start -w agent
```

The agent will:
- Start an HTTP/WebSocket server on port 3001 (Twilio ConversationRelay endpoint)
- Start listening for `RFQCreated` events on-chain
- Print `[agent] Ready — waiting for RFQCreated events...` when ready

### Terminal 3 — UI

```bash
npm run ui
# or: npm run dev -w ui
```

Open [http://localhost:3000](http://localhost:3000).

---

## Demo Flow

1. **Connect wallet** — Click "Connect Wallet" in the top right (MetaMask or any EVM wallet on 0G Testnet / chainId 16602).

2. **Mint an agent** — Go to `/mint`. Fill in the agent name, fee per RFQ, and credit price, then submit. This mints a NegotiatorINFT to your wallet.

3. **Buy credits** — On the agent detail page (`/agent/<tokenId>`), buy at least 1 usage credit for the agent you just minted.

4. **Create an RFQ** — Go to `/rfq/new`. Select the agent, enter the item description, quantity, region, budget, and the supplier phone number to call. Submit.

5. **Watch the call** — The agent server logs show the Twilio call being initiated. The supplier phone rings. The AI agent introduces itself as "Zero G" and negotiates the price through multiple rounds.

6. **View the quote** — After the call completes, the RFQ detail page (`/rfq/<id>`) shows the extracted quote (unit price, MOQ, lead time) and the full voice negotiation transcript.

7. **Accept the quote** — Click "Accept Quote" to pay the agent fee and finalize the order on-chain.

---

## Deploying Contracts (optional)

The contracts are already deployed on 0G Testnet. To redeploy:

```bash
npm run deploy:testnet
```

This compiles the contracts, deploys them in order (NegotiatorINFT → UsageCredits → RFQMarket), and writes the new addresses to `shared/addresses.json`. Update `.env` with the new addresses afterwards.

---

## 0G Technology Used

| 0G Product | How It's Used |
|------------|---------------|
| **0G Chain (iNFT / ERC-7857)** | `NegotiatorINFT` is an ERC-721 with `intelligentDataOf()`, `authorizeUsage()`, and `setBrainBundle()` — storing the agent's accumulated negotiation intelligence on-chain |
| **0G Storage** | RFQ payloads, quote packets (price + transcript), and agent brain data are all uploaded to 0G Storage; Merkle root hashes are committed on-chain for verifiability |
| **0G Compute** | LLM inference for the agent's voice negotiation — every turn of the phone call is powered by a model served through 0G's decentralized compute network |

---

## Project Structure

```
├── contracts/          Solidity smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── NegotiatorINFT.sol     ERC-721 iNFT with brain bundle
│   │   ├── RFQMarket.sol          RFQ creation and quote commitment
│   │   └── UsageCredits.sol       Pay-per-use credit system
│   └── scripts/deploy.ts
│
├── agent/              TypeScript agent orchestrator
│   └── src/
│       ├── index.ts               Entry point
│       ├── orchestrator.ts        RFQ event handler
│       ├── caller.ts              Twilio call manager + WS server
│       ├── llm.ts                 0G Compute LLM client + system prompts
│       ├── extractor.ts           Quote extraction from transcripts
│       ├── brain.ts               Agent memory (0G Storage)
│       ├── storage.ts             0G Storage upload/download
│       └── contracts.ts           On-chain interaction
│
├── ui/                 Next.js frontend
│   └── app/
│       ├── page.tsx               Home — agent list
│       ├── mint/page.tsx          Mint agent NFT
│       ├── agent/[tokenId]/       Agent profile + credits
│       └── rfq/
│           ├── page.tsx           My RFQs
│           ├── new/page.tsx       Create RFQ
│           └── [rfqId]/page.tsx   RFQ detail + quotes + transcript
│
└── shared/
    ├── addresses.json             Deployed contract addresses
    └── abis/                      Contract ABIs
```
