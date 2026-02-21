import OpenAI from "openai";
import { config } from "./config.js";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const useOpenAI = !!process.env.OPENAI_API_KEY;
    if (useOpenAI) {
      console.log("[agent/llm] Using OpenAI fallback");
      _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } else {
      console.log("[agent/llm] Using 0G Compute endpoint:", config.zgComputeBaseUrl);
      _client = new OpenAI({
        baseURL: config.zgComputeBaseUrl,
        apiKey: config.zgComputeApiKey,
      });
    }
  }
  return _client;
}

export type Message = { role: "system" | "user" | "assistant"; content: string };

/**
 * Stream LLM response tokens, calling `onToken` for each chunk.
 */
export async function streamCompletion(
  messages: Message[],
  onToken: (token: string, last: boolean) => void
): Promise<string> {
  const llm = getClient();
  let full = "";

  try {
    const stream = await llm.chat.completions.create({
      model: config.llmModel,
      messages,
      stream: true,
      max_tokens: 512,
      temperature: 0.7,
    });

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? "";
      if (token) {
        full += token;
        onToken(token, false); // always false during streaming
      }
    }
    onToken("", true); // single last:true signal at the very end
  } catch (err) {
    console.error("[agent/llm] streamCompletion error:", err);
    const msg = " [LLM unavailable] ";
    onToken(msg, true);
    full = msg;
  }

  return full;
}

/**
 * Non-streaming completion.
 */
export async function chatCompletion(messages: Message[]): Promise<string> {
  const llm = getClient();
  try {
    const resp = await llm.chat.completions.create({
      model: config.llmModel,
      messages,
      stream: false,
      max_tokens: 512,
      temperature: 0.2,
    });
    return resp.choices[0]?.message?.content ?? "";
  } catch (err) {
    console.error("[agent/llm] chatCompletion error:", err);
    return "";
  }
}

/**
 * The agent's buyer persona system prompt — injected with RFQ details per-call.
 */
export function buildBuyerSystemPrompt(rfqDetails: {
  item: string;
  quantity: number;
  region: string;
  budget?: string;
}): string {
  const targetLine = rfqDetails.budget
    ? `- Target price: ${rfqDetails.budget} (push to reach this — do not reveal it upfront)`
    : `- Target price: negotiate as low as possible`;

  return `You are an AI procurement agent representing a merchant buyer on a voice call with a supplier. Your job is to negotiate the best price and terms.

RFQ Details:
- Item: ${rfqDetails.item}
- Quantity needed: ${rfqDetails.quantity} units
- Delivery region: ${rfqDetails.region}
${targetLine}

Negotiation rules:
1. Collect all three required terms: unit price, MOQ (minimum order quantity), and lead time in days.
2. Do NOT end the call until you have all three. Ask for any missing piece.
3. Negotiate the price down — make up to 3 attempts to get a lower price before accepting:
   - Attempt 1: Ask if they can do better given the volume.
   - Attempt 2: Push harder — mention competitor pricing or a tighter budget.
   - Attempt 3: Final ask — offer to commit quickly in exchange for a discount.
   - After 3 attempts or if they firmly hold their price, accept and move on.
4. Once you have all three terms, summarize them clearly and ask for confirmation:
   "Just to confirm — that's [price] per unit, minimum order [MOQ] units, and [lead time] days delivery. Is that correct?"
5. After they confirm, say exactly: "Thank you, I have your final offer. Goodbye."

Voice call instructions:
- Keep each response to 1-2 short sentences. Do not use lists or bullet points.
- Be professional, friendly, and firm.
- Never reveal the target budget unless the supplier asks directly.`;
}
