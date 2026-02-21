import { chatCompletion, Message } from "./llm.js";
import { ethers } from "ethers";

export type ExtractedQuote = {
  supplierLabel: string;
  unitPriceWei: bigint;
  unitPriceUsd: number;
  moq: bigint;
  leadTimeDays: bigint;
  validUntil: number; // unix timestamp (7 days from now)
};

const EXTRACTION_PROMPT = `Extract the final agreed procurement quote from this negotiation transcript.
Return ONLY a JSON object with these exact fields (no markdown, no explanation):
{
  "unitPriceUsd": number — the LAST agreed price per unit in USD (a plain number like 4.80),
  "moq": number — minimum order quantity (a plain integer),
  "leadTimeDays": number — delivery lead time in days (a plain integer)
}

Rules:
- unitPriceUsd must be a number that actually appears in the transcript
- If no price was agreed, use the lowest price mentioned
- Do NOT invent numbers that are not in the transcript`;

/**
 * Extract a structured quote from a negotiation transcript using 0G Compute LLM.
 * Falls back to regex parsing if LLM fails.
 */
export async function extractQuote(
  transcript: string,
  supplierLabel: string
): Promise<ExtractedQuote> {
  const messages: Message[] = [
    { role: "system", content: EXTRACTION_PROMPT },
    { role: "user", content: `Transcript:\n\n${transcript}` },
  ];

  let extracted: Partial<{
    supplierLabel: string;
    unitPriceUsd: number;
    moq: number;
    leadTimeDays: number;
  }> = {};

  const response = await chatCompletion(messages);

  // Try to parse LLM JSON response
  try {
    // Strip markdown code fences if present
    const clean = response.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
    extracted = JSON.parse(clean);
  } catch {
    console.warn("[extractor] LLM JSON parse failed, falling back to regex");
    extracted = regexExtract(transcript);
  }

  // Validate and apply defaults
  const unitPriceUsd = extracted.unitPriceUsd ?? regexPrice(transcript) ?? 5.0;
  const moq = extracted.moq ?? regexMoq(transcript) ?? 100;
  const leadTimeDays = extracted.leadTimeDays ?? regexLeadTime(transcript) ?? 14;

  // Convert USD to wei (using 1 USD = 1e18 wei for demo simplicity)
  // In production you'd use a price oracle. For hackathon: price * 1e15 = price in milli-ETH
  const unitPriceWei = ethers.parseUnits(unitPriceUsd.toFixed(6), 15); // 1 USD ~ 0.001 ETH

  const sevenDays = Math.floor(Date.now() / 1000) + 7 * 86400;

  return {
    supplierLabel, // always use the known supplier name, never trust LLM to extract it
    unitPriceWei,
    unitPriceUsd,
    moq: BigInt(Math.round(moq)),
    leadTimeDays: BigInt(Math.round(leadTimeDays)),
    validUntil: sevenDays,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Regex fallbacks
// ─────────────────────────────────────────────────────────────────────────────

function regexExtract(text: string): Partial<{
  supplierLabel: string;
  unitPriceUsd: number;
  moq: number;
  leadTimeDays: number;
}> {
  return {
    unitPriceUsd: regexPrice(text),
    moq: regexMoq(text),
    leadTimeDays: regexLeadTime(text),
  };
}

function regexPrice(text: string): number | undefined {
  const m = text.match(/\$(\d+(?:\.\d{1,2})?)\s*(?:per\s+unit|\/unit)?/i);
  return m ? parseFloat(m[1]) : undefined;
}

function regexMoq(text: string): number | undefined {
  const m = text.match(/(?:MOQ|minimum\s+order(?:\s+quantity)?)[^\d]*(\d+)/i);
  return m ? parseInt(m[1], 10) : undefined;
}

function regexLeadTime(text: string): number | undefined {
  const m = text.match(/(\d+)[- ]day(?:s)?\s+(?:lead\s+time|delivery)/i);
  return m ? parseInt(m[1], 10) : undefined;
}
