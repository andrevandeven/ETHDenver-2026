import { ethers } from "ethers";
import { config } from "./config.js";
import fs from "fs";
import os from "os";
import path from "path";

// Attempt to import 0G SDK — it may not be available in all environments
let MemData: typeof import("@0glabs/0g-ts-sdk").MemData | undefined;
let Indexer: typeof import("@0glabs/0g-ts-sdk").Indexer | undefined;

try {
  const sdk = await import("@0glabs/0g-ts-sdk");
  MemData = sdk.MemData;
  Indexer = sdk.Indexer;
  console.log("[storage] 0G Storage SDK loaded (v0.3.x)");
} catch {
  console.warn("[storage] 0G Storage SDK not available — using local fallback");
}

export type UploadResult = {
  rootHash: string;
  uri: string;
  txHash?: string;
};

/**
 * Upload a JSON object to 0G Storage.
 * Falls back to computing a local keccak256 hash if the upload fails.
 */
export async function uploadJSON(
  data: unknown,
  signer?: ethers.Wallet
): Promise<UploadResult> {
  const json = JSON.stringify(data);
  const localHash = ethers.keccak256(ethers.toUtf8Bytes(json));

  if (!MemData || !Indexer || !signer) {
    console.log("[storage] Using inline json:// fallback for upload");
    const encoded = Buffer.from(json, "utf8").toString("base64");
    return { rootHash: localHash, uri: `json://${encoded}` };
  }

  try {
    const bytes = Buffer.from(json, "utf8");
    const file = new MemData(bytes);
    const indexer = new Indexer(config.indexerRpc);

    const [result, uploadErr] = await indexer.upload(file, config.rpcUrl, signer as never);
    if (uploadErr) {
      throw new Error(`upload error: ${uploadErr}`);
    }

    const { rootHash, txHash } = result;
    const uri = `0g://${rootHash}`;
    console.log(`[storage] Uploaded to 0G Storage: rootHash=${rootHash} txHash=${txHash}`);
    return { rootHash, uri, txHash };
  } catch (err) {
    console.error("[storage] 0G upload failed, using inline json:// fallback:", err);
    const encoded = Buffer.from(json, "utf8").toString("base64");
    return { rootHash: localHash, uri: `json://${encoded}` };
  }
}

/**
 * Download a JSON object from 0G Storage by rootHash.
 * Falls back gracefully if SDK unavailable.
 */
export async function downloadJSON(
  rootHash: string,
  _signer?: ethers.Wallet
): Promise<unknown | null> {
  if (!Indexer) {
    console.warn("[storage] Cannot download — SDK unavailable");
    return null;
  }

  const tmpPath = path.join(os.tmpdir(), `zg-dl-${Date.now()}.json`);
  try {
    const indexer = new Indexer(config.indexerRpc);
    const err = await indexer.download(rootHash, tmpPath, true);
    if (err) throw new Error(String(err));

    const content = fs.readFileSync(tmpPath, "utf8");
    try { fs.unlinkSync(tmpPath); } catch {}
    return JSON.parse(content);
  } catch (err) {
    console.error("[storage] download failed:", err);
    try { fs.unlinkSync(tmpPath); } catch {}
    return null;
  }
}
