import twilio from "twilio";
import { config, getAgentPublicUrl } from "./config.js";
import { streamCompletion, buildBuyerSystemPrompt, Message } from "./llm.js";
import { TranscriptEntry } from "./types.js";

// Session store: callSid -> conversation history + transcript
const sessions = new Map<string, {
  history: Message[];
  transcript: TranscriptEntry[];
  rfqDetails: RFQDetails;
}>();

export type RFQDetails = {
  rfqId: string;
  item: string;
  quantity: number;
  region: string;
  budget?: string;
};

export type CallResult = {
  callSid: string;
  agentTranscript: TranscriptEntry[];
  supplierLabel: string;
};

function buildWelcomeGreeting(item: string, quantity: number): string {
  return `Hello, I am an AI procurement agent calling to request a quote for ${quantity} units of ${item}. Could you please share your unit price, minimum order quantity, and lead time?`;
}

let twilioClient: twilio.Twilio | null = null;

function getTwilio(): twilio.Twilio {
  if (!twilioClient) {
    twilioClient = twilio(config.twilioAccountSid, config.twilioAuthToken);
  }
  return twilioClient;
}

/**
 * Initiate a Twilio outbound call to a supplier number.
 * Returns the callSid immediately — use waitForCall() to get the result.
 */
export async function initiateCall(
  supplierNumber: string,
  supplierLabel: string,
  rfqDetails: RFQDetails
): Promise<string> {
  const agentUrl = getAgentPublicUrl();
  const params = new URLSearchParams({
    rfqId: rfqDetails.rfqId,
    supplier: supplierLabel,
    item: rfqDetails.item,
    quantity: String(rfqDetails.quantity),
  });
  const twimlUrl = `${agentUrl}/agent-twiml?${params}`;

  const call = await getTwilio().calls.create({
    from: config.twilioAgentNumber,
    to: supplierNumber,
    url: twimlUrl,
    statusCallback: `${agentUrl}/call-status`,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  });

  console.log(`[caller] Call initiated to ${supplierNumber} callSid=${call.sid}`);

  const welcomeGreeting = buildWelcomeGreeting(rfqDetails.item, rfqDetails.quantity);

  // Pre-register session — include welcomeGreeting as first assistant message
  // so the LLM knows it already said the opening line and doesn't repeat it.
  sessions.set(call.sid, {
    history: [
      { role: "system", content: buildBuyerSystemPrompt(rfqDetails) },
      { role: "assistant", content: welcomeGreeting },
    ],
    transcript: [],
    rfqDetails,
  });

  return call.sid;
}

/**
 * Poll Twilio until the call reaches a terminal status.
 * Returns when call is "completed", "failed", or "no-answer".
 */
export async function waitForCall(
  callSid: string,
  timeoutMs = 300_000
): Promise<{ status: string }> {
  const client = getTwilio();
  const start = Date.now();
  const POLL_MS = 3000;

  while (Date.now() - start < timeoutMs) {
    const call = await client.calls(callSid).fetch();
    console.log(`[caller] callSid=${callSid} status=${call.status}`);

    if (["completed", "failed", "no-answer", "canceled"].includes(call.status)) {
      return { status: call.status };
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  return { status: "timeout" };
}

/**
 * Retrieve the agent-side transcript for a completed call.
 */
export function getAgentTranscript(callSid: string): TranscriptEntry[] {
  return sessions.get(callSid)?.transcript ?? [];
}

/**
 * Clean up session after processing.
 */
export function clearSession(callSid: string): void {
  sessions.delete(callSid);
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent-side Fastify server (handles TwiML + ConversationRelay WebSocket)
// ─────────────────────────────────────────────────────────────────────────────

import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";

let _server: ReturnType<typeof Fastify> | null = null;

export async function startAgentServer(): Promise<void> {
  _server = Fastify({ logger: false });

  // Accept form-encoded bodies from Twilio
  _server.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    const params: Record<string, string> = {};
    for (const pair of String(body).split("&")) {
      const [k, v] = pair.split("=");
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
    }
    done(null, params);
  });

  // ── TwiML for agent side of outbound call ──────────────────────────────────
  _server.route({
    method: ["GET", "POST"],
    url: "/agent-twiml",
    handler: async (req, reply) => {
      const query = req.query as Record<string, string>;
      const rfqId = query.rfqId ?? "";
      const supplier = query.supplier ?? "";
      const item = query.item ?? "the requested items";
      const quantity = parseInt(query.quantity ?? "0") || 0;
      const agentUrl = getAgentPublicUrl();
      const wsUrl = `wss://${agentUrl.replace(/^https?:\/\//, "")}/ws/agent?rfqId=${rfqId}&amp;supplier=${encodeURIComponent(supplier)}`;
      const greeting = buildWelcomeGreeting(item, quantity);

      reply.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${wsUrl}"
      ttsProvider="Google"
      transcriptionProvider="Deepgram"
      interruptible="any"
      welcomeGreeting="${greeting}"
    />
  </Connect>
</Response>`);
    },
  });

  // ── Status callback from Twilio ────────────────────────────────────────────
  _server.post("/call-status", async (req, _reply) => {
    const body = req.body as Record<string, string>;
    console.log(`[agent-server] call-status callSid=${body.CallSid} status=${body.CallStatus}`);
    return { ok: true };
  });

  // Start Fastify first so _server.server (Node http.Server) is available
  await _server.listen({ port: config.agentPort, host: "0.0.0.0" });
  console.log(`[agent-server] Listening on port ${config.agentPort}`);

  // ── Agent WebSocket (buyer side ConversationRelay) ─────────────────────────
  // Use standalone ws.WebSocketServer attached to Fastify's http.Server so that
  // socket.on("message") reliably fires (avoids @fastify/websocket buffering issues).
  const wss = new WebSocketServer({ server: _server.server, path: "/ws/agent" });

  wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
    const rawUrl = req.url ?? "";
    const urlParams = new URLSearchParams(rawUrl.includes("?") ? rawUrl.split("?")[1] : "");
    const rfqId = urlParams.get("rfqId") ?? "";
    const supplierName = decodeURIComponent(urlParams.get("supplier") ?? "");

    let callSid = `agent-${Date.now()}`;
    let session = sessions.get(callSid);

    console.log(`[agent-server] ws connection rfqId=${rfqId} supplier=${supplierName}`);

    socket.on("message", async (raw: Buffer) => {
      const rawStr = raw.toString();
      console.log(`[ws-msg] ${rawStr.slice(0, 400)}`);

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawStr);
      } catch {
        console.log(`[ws-msg] parse failed`);
        return;
      }

      const type = msg.type as string;

      if (type === "setup") {
        callSid = (msg.callSid as string) ?? callSid;
        if (!sessions.has(callSid)) {
          const fallbackItem = "procurement item";
          const fallbackQty = 1000;
          sessions.set(callSid, {
            history: [
              {
                role: "system",
                content: buildBuyerSystemPrompt({
                  item: fallbackItem,
                  quantity: fallbackQty,
                  region: "US",
                }),
              },
              { role: "assistant", content: buildWelcomeGreeting(fallbackItem, fallbackQty) },
            ],
            transcript: [],
            rfqDetails: {
              rfqId,
              item: "procurement item",
              quantity: 1000,
              region: "US",
            },
          });
        }
        session = sessions.get(callSid)!;
        console.log(`[agent-server] ws setup callSid=${callSid} rfqId=${rfqId} supplier=${supplierName}`);
        return;
      }

      if (type === "prompt") {
        const supplierText = (msg.voicePrompt as string) ?? "";
        console.log(`[agent-server] prompt from supplier: "${supplierText}"`);
        if (!supplierText.trim() || !session) return;

        // Record supplier speech
        session.transcript.push({
          speaker: "supplier",
          text: supplierText,
          timestamp: Date.now(),
        });
        session.history.push({ role: "user", content: supplierText });

        let agentResponse = "";
        await streamCompletion(session.history, (token, last) => {
          agentResponse += token;
          socket.send(JSON.stringify({ type: "text", token, last }));
        });

        if (agentResponse.trim()) {
          session.transcript.push({
            speaker: "agent",
            text: agentResponse.trim(),
            timestamp: Date.now(),
          });
          session.history.push({ role: "assistant", content: agentResponse.trim() });
        }

        // If agent said goodbye, hang up
        if (
          agentResponse.toLowerCase().includes("goodbye") ||
          agentResponse.toLowerCase().includes("thank you, i have your final offer")
        ) {
          socket.send(JSON.stringify({ type: "end" }));
        }
        return;
      }

      if (type === "close") {
        console.log(`[agent-server] ws close callSid=${callSid}`);
        socket.close();
        return;
      }
    });

    socket.on("error", (err: Error) => {
      console.error("[agent-server] ws error:", err.message);
    });

    socket.on("close", (code: number, reason: Buffer) => {
      console.log(`[agent-server] ws disconnected callSid=${callSid} code=${code} reason=${reason.toString()}`);
    });
  });

  console.log(`[agent-server] WebSocket ready on /ws/agent`);
}
