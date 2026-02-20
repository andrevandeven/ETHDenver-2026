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
  });
  const twimlUrl = `${agentUrl}/agent-twiml?${params}`;

  const call = await getTwilio().calls.create({
    from: config.twilioAgentNumber,
    to: supplierNumber,
    url: twimlUrl,
    statusCallback: `${agentUrl}/call-status`,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["completed", "failed", "no-answer"],
  });

  console.log(`[caller] Call initiated to ${supplierNumber} callSid=${call.sid}`);

  // Pre-register session
  sessions.set(call.sid, {
    history: [
      { role: "system", content: buildBuyerSystemPrompt(rfqDetails) },
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
import fwsPlugin from "@fastify/websocket";

let _server: ReturnType<typeof Fastify> | null = null;

export async function startAgentServer(): Promise<void> {
  _server = Fastify({ logger: false });
  await _server.register(fwsPlugin);

  // ── TwiML for agent side of outbound call ──────────────────────────────────
  _server.get("/agent-twiml", async (req, reply) => {
    const query = req.query as Record<string, string>;
    const rfqId = query.rfqId ?? "";
    const supplier = query.supplier ?? "";
    const agentUrl = getAgentPublicUrl();
    const wsUrl = `wss://${agentUrl.replace(/^https?:\/\//, "")}/ws/agent?rfqId=${rfqId}&supplier=${encodeURIComponent(supplier)}`;

    reply.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${wsUrl}"
      ttsProvider="Google"
      transcriptionProvider="Deepgram"
      interruptible="any"
    />
  </Connect>
</Response>`);
  });

  // ── Status callback from Twilio ────────────────────────────────────────────
  _server.post("/call-status", async (req, _reply) => {
    const body = req.body as Record<string, string>;
    console.log(`[agent-server] call-status callSid=${body.CallSid} status=${body.CallStatus}`);
    return { ok: true };
  });

  // ── Agent WebSocket (buyer side ConversationRelay) ─────────────────────────
  _server.get(
    "/ws/agent",
    { websocket: true },
    (socket, req) => {
      const query = (req as unknown as { query: Record<string, string> }).query;
      const rfqId = query.rfqId ?? "";
      const supplierName = decodeURIComponent(query.supplier ?? "");

      let callSid = `agent-${Date.now()}`;
      let session = sessions.get(callSid);

      socket.on("message", async (raw: Buffer) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        const type = msg.type as string;

        if (type === "setup") {
          callSid = (msg.callSid as string) ?? callSid;
          // Find session by rfqId if not pre-seeded
          if (!sessions.has(callSid)) {
            // Create a minimal session
            sessions.set(callSid, {
              history: [
                {
                  role: "system",
                  content: buildBuyerSystemPrompt({
                    rfqId,
                    item: "procurement item",
                    quantity: 1000,
                    region: "US",
                  }),
                },
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
    }
  );

  await _server.listen({ port: config.agentPort, host: "0.0.0.0" });
  console.log(`[agent-server] Listening on port ${config.agentPort}`);
}
