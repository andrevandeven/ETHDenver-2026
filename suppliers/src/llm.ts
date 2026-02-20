import OpenAI from "openai";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

// 0G Compute exposes an OpenAI-compatible API.
// Point the SDK at the provider's base URL for decentralized LLM inference.
const ZG_COMPUTE_BASE = process.env.ZG_COMPUTE_BASE_URL ?? "https://api.0g.ai/v1";
const OPENAI_FALLBACK = !!process.env.OPENAI_API_KEY;

let client: OpenAI;

function getClient(): OpenAI {
  if (!client) {
    if (OPENAI_FALLBACK) {
      console.log("[llm] Using OpenAI fallback");
      client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } else {
      console.log("[llm] Using 0G Compute endpoint:", ZG_COMPUTE_BASE);
      client = new OpenAI({
        baseURL: ZG_COMPUTE_BASE,
        apiKey: process.env.ZG_COMPUTE_API_KEY ?? "no-key-needed",
      });
    }
  }
  return client;
}

const MODEL = process.env.LLM_MODEL ?? "meta-llama/Llama-3.3-70B-Instruct";

export type Message = { role: "system" | "user" | "assistant"; content: string };

/**
 * Stream tokens from the LLM back through the WebSocket callback.
 * @param messages Conversation history
 * @param onToken  Called for each text chunk; last=true on final chunk
 */
export async function streamCompletion(
  messages: Message[],
  onToken: (token: string, last: boolean) => void
): Promise<string> {
  const llm = getClient();
  let full = "";

  try {
    const stream = await llm.chat.completions.create({
      model: MODEL,
      messages,
      stream: true,
      max_tokens: 512,
      temperature: 0.7,
    });

    const chunks: string[] = [];
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content ?? "";
      if (token) {
        chunks.push(token);
        full += token;
        const isLast = chunk.choices[0]?.finish_reason != null;
        onToken(token, isLast);
      }
    }
    onToken("", true); // ensure last=true is sent
  } catch (err: unknown) {
    console.error("[llm] streamCompletion error:", err);
    const errMsg = " [LLM unavailable] ";
    onToken(errMsg, true);
    full = errMsg;
  }

  return full;
}

/**
 * Non-streaming chat completion — for one-shot tasks like quote extraction.
 */
export async function chatCompletion(messages: Message[]): Promise<string> {
  const llm = getClient();
  try {
    const resp = await llm.chat.completions.create({
      model: MODEL,
      messages,
      stream: false,
      max_tokens: 512,
      temperature: 0.2,
    });
    return resp.choices[0]?.message?.content ?? "";
  } catch (err: unknown) {
    console.error("[llm] chatCompletion error:", err);
    return "";
  }
}
