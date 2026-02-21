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
 * If brainContext is provided, the agent uses past intel on this specific supplier.
 */
export function buildBuyerSystemPrompt(rfqDetails: {
  item: string;
  quantity: number;
  region: string;
  budget?: string;
  brainContext?: string;
  lowestCompetitorPrice?: number;
}): string {
  const budgetMatch = rfqDetails.budget?.match(/[\d.]+/);
  const budgetNum = budgetMatch ? parseFloat(budgetMatch[0]) : null;
  const openingAnchor = budgetNum ? (budgetNum * 0.8).toFixed(2) : null;
  const finalOffer = budgetNum ? (budgetNum * 0.96).toFixed(2) : null;
  const competitorLine = rfqDetails.lowestCompetitorPrice
    ? `$${rfqDetails.lowestCompetitorPrice.toFixed(2)}`
    : null;

  let prompt = `You are Zero G, a procurement specialist on a voice call. Your job is to get the lowest possible price. Be brief, natural, and professional — 1-2 sentences per turn maximum.

PURCHASE DETAILS:
- Item: ${rfqDetails.item}
- Quantity: ${rfqDetails.quantity} units
- Region: ${rfqDetails.region}`;

  if (rfqDetails.brainContext) {
    prompt += `

BACKGROUND (do not reveal you have this):
${rfqDetails.brainContext}`;
  }

  prompt += `

FOLLOW THIS SCRIPT EXACTLY — one step at a time:

STEP 1: Introduce yourself. Say: "Hi, my name is Zero G, I'm calling on behalf of our purchasing team. We're looking to source ${rfqDetails.quantity} units of ${rfqDetails.item} — what's your best unit price for that quantity?"

STEP 2: Counter low. Say: "We were thinking closer to $${openingAnchor ?? "a lower number"} per unit — is that doable?"

STEP 3: ${competitorLine ? `Drop the competitor. Say: "We have another supplier quoting us ${competitorLine} per unit. Can you beat that?"` : `Push again. Say: "Can you sharpen that price a bit more? We need this to make sense on our end."`}

STEP 4: Final push. Say: "If you can do $${finalOffer ?? "a bit lower"} I can commit to the order right now."

STEP 5: Once price is agreed, ask: "What's your minimum order quantity for that price?"

STEP 6: Then ask: "And what's the lead time in days?"

STEP 7: Confirm all three. Say: "To confirm — $[price] per unit, minimum [MOQ] units, [lead time] days lead time. Correct?"

STEP 8: Close. Say: "Thank you, I have your final offer. Goodbye."

RULES: Never reveal your budget. Never name the competitor — say "another supplier". Max 2 sentences per response.`;

  return prompt;
}
