import { ethers } from "ethers";
import { config } from "./config.js";
import fs from "fs";
import os from "os";
import path from "path";

// Attempt to import 0G SDK — it may not be available in all environments
let ZgFile: typeof import("@0glabs/0g-ts-sdk").ZgFile | undefined;
let Indexer: typeof import("@0glabs/0g-ts-sdk").Indexer | undefined;

try {
  const sdk = await import("@0glabs/0g-ts-sdk");
  ZgFile = sdk.ZgFile;
  Indexer = sdk.Indexer;
  console.log("[storage] 0G Storage SDK loaded");
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

  if (!ZgFile || !Indexer || !signer) {
    console.log("[storage] Using local hash fallback for upload");
    return {
      rootHash: localHash,
      uri: `local://${localHash}`,
    };
  }

  // Write to temp file
  const tmpPath = path.join(os.tmpdir(), `zg-${Date.now()}.json`);
  try {
    fs.writeFileSync(tmpPath, json, "utf8");
    const file = await (ZgFile as typeof import("@0glabs/0g-ts-sdk").ZgFile).fromFilePath(tmpPath);
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr || !tree) {
      throw new Error(`merkleTree error: ${treeErr}`);
    }

    const rootHash = tree.rootHash();
    const indexer = new (Indexer as typeof import("@0glabs/0g-ts-sdk").Indexer)(
      config.indexerRpc
    );

    const [tx, uploadErr] = await indexer.upload(file, config.rpcUrl, signer);
    if (uploadErr) {
      throw new Error(`upload error: ${uploadErr}`);
    }

    const uri = `0g://${rootHash}`;
    console.log(`[storage] Uploaded to 0G Storage: rootHash=${rootHash} tx=${tx}`);
    return { rootHash, uri, txHash: tx as string };
  } catch (err) {
    console.error("[storage] 0G upload failed, using local fallback:", err);
    return {
      rootHash: localHash,
      uri: `local://${localHash}`,
    };
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
  }
}

/**
 * Download a JSON object from 0G Storage by rootHash.
 * Falls back gracefully if SDK unavailable.
 */
export async function downloadJSON(
  rootHash: string,
  signer?: ethers.Wallet
): Promise<unknown | null> {
  if (!Indexer || !signer) {
    console.warn("[storage] Cannot download — SDK unavailable or no signer");
    return null;
  }

  try {
    const indexer = new (Indexer as typeof import("@0glabs/0g-ts-sdk").Indexer)(
      config.indexerRpc
    );
    const tmpPath = path.join(os.tmpdir(), `zg-dl-${Date.now()}.json`);
    const [, err] = await (indexer as unknown as {
      download: (hash: string, path: string, verify: boolean) => Promise<[unknown, string]>;
    }).download(rootHash, tmpPath, true);
    if (err) throw new Error(String(err));
    const content = fs.readFileSync(tmpPath, "utf8");
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    return JSON.parse(content);
  } catch (err) {
    console.error("[storage] download failed:", err);
    return null;
  }
}
