import Fastify from "fastify";
import websocket from "@fastify/websocket";
import * as dotenv from "dotenv";
import path from "path";
import { PERSONAS, SupplierPersona } from "./personas.js";
import { streamCompletion, Message } from "./llm.js";
import { appendEntry, getTranscript } from "./transcript.js";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const PORT = parseInt(process.env.SUPPLIER_PORT ?? "4000", 10);
const NGROK_URL = (process.env.NGROK_URL ?? "").replace(/\/$/, "");

const app = Fastify({ logger: false });
await app.register(websocket);

// ─────────────────────────────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────────────────────────────

app.get("/health", async () => ({ status: "ok", suppliers: Object.keys(PERSONAS) }));

// ─────────────────────────────────────────────────────────────────────────────
// TwiML webhooks — one per supplier
// ─────────────────────────────────────────────────────────────────────────────

function buildTwiML(persona: SupplierPersona): string {
  const wsUrl = `wss://${NGROK_URL.replace(/^https?:\/\//, "")}/ws/${persona.id}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${wsUrl}"
      welcomeGreeting="${persona.greeting}"
      ttsProvider="Google"
      transcriptionProvider="Deepgram"
      interruptible="any"
    />
  </Connect>
</Response>`;
}

for (const [id, persona] of Object.entries(PERSONAS)) {
  app.get(`/twiml/${id}`, async (_req, reply) => {
    reply.type("text/xml").send(buildTwiML(persona));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Transcript retrieval
// ─────────────────────────────────────────────────────────────────────────────

app.get<{ Params: { callSid: string } }>("/transcript/:callSid", async (req, reply) => {
  const entries = getTranscript(req.params.callSid);
  if (entries.length === 0) {
    return reply.status(404).send({ error: "No transcript found" });
  }
  return entries;
});

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket handlers — one per supplier
// ─────────────────────────────────────────────────────────────────────────────

function registerSupplierWS(persona: SupplierPersona): void {
  app.get(
    `/ws/${persona.id}`,
    { websocket: true },
    (socket, _req) => {
      const history: Message[] = [
        { role: "system", content: persona.systemPrompt },
      ];
      let callSid = `unknown-${Date.now()}`;

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
          console.log(`[${persona.label}] call started callSid=${callSid}`);
          // No need to send anything — Twilio will use welcomeGreeting
          return;
        }

        if (type === "prompt") {
          const userText = (msg.voicePrompt as string) ?? "";
          if (!userText.trim()) return;

          // Record agent speech in transcript
          appendEntry(callSid, {
            speaker: "agent",
            text: userText,
            timestamp: Date.now(),
          });

          history.push({ role: "user", content: userText });

          let supplierResponse = "";

          await streamCompletion(history, (token, last) => {
            supplierResponse += token;
            socket.send(
              JSON.stringify({ type: "text", token, last })
            );
          });

          // Record supplier response in transcript
          if (supplierResponse.trim()) {
            appendEntry(callSid, {
              speaker: "supplier",
              text: supplierResponse.trim(),
              timestamp: Date.now(),
            });
            history.push({ role: "assistant", content: supplierResponse.trim() });
          }
          return;
        }

        if (type === "interrupt") {
          // Twilio tells us the speech was interrupted — nothing to do
          return;
        }

        if (type === "close") {
          console.log(`[${persona.label}] call ended callSid=${callSid}`);
          // Transcript stays in store for orchestrator to fetch
          socket.close();
          return;
        }
      });

      socket.on("close", () => {
        console.log(`[${persona.label}] WS closed callSid=${callSid}`);
      });

      socket.on("error", (err: Error) => {
        console.error(`[${persona.label}] WS error:`, err.message);
      });
    }
  );
}

for (const persona of Object.values(PERSONAS)) {
  registerSupplierWS(persona);
}

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

await app.listen({ port: PORT, host: "0.0.0.0" });
console.log(`Supplier server running on port ${PORT}`);
console.log(`TwiML endpoints: ${Object.keys(PERSONAS).map((id) => `/twiml/${id}`).join(", ")}`);
console.log(`WS endpoints:    ${Object.keys(PERSONAS).map((id) => `/ws/${id}`).join(", ")}`);
