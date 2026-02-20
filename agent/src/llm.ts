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
        const isLast = chunk.choices[0]?.finish_reason != null;
        onToken(token, isLast);
      }
    }
    onToken("", true);
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
  return `You are an AI procurement agent representing a merchant buyer. Your job is to negotiate with suppliers to get the best possible price and terms for your client.

RFQ Details:
- Item: ${rfqDetails.item}
- Quantity needed: ${rfqDetails.quantity} units
- Delivery region: ${rfqDetails.region}
- Budget: ${rfqDetails.budget ?? "flexible, prefer best value"}

Your objectives:
1. Get a clear unit price, minimum order quantity (MOQ), and lead time.
2. Negotiate for better pricing if possible, but remain professional.
3. Once you have a firm offer, confirm it clearly and wrap up the call.
4. Say goodbye after getting the final offer.

Instructions:
- Keep each response under 3 sentences — this is a phone call.
- Be professional, friendly but firm.
- Don't reveal your budget unless necessary.
- When you have the final terms, say: "Thank you, I have your final offer. Goodbye."`;
}
