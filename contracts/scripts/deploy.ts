import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

  // 1. NegotiatorINFT
  const NegotiatorINFT = await ethers.getContractFactory("NegotiatorINFT");
  const nft = await NegotiatorINFT.deploy();
  await nft.waitForDeployment();
  const nftAddress = await nft.getAddress();
  console.log("NegotiatorINFT deployed:", nftAddress);

  // 2. UsageCredits
  const UsageCredits = await ethers.getContractFactory("UsageCredits");
  const credits = await UsageCredits.deploy(nftAddress);
  await credits.waitForDeployment();
  const creditsAddress = await credits.getAddress();
  console.log("UsageCredits deployed:", creditsAddress);

  // 3. RFQMarket
  const RFQMarket = await ethers.getContractFactory("RFQMarket");
  const market = await RFQMarket.deploy(nftAddress, creditsAddress);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log("RFQMarket deployed:", marketAddress);

  // 4. Link UsageCredits -> RFQMarket
  const linkTx = await credits.setRFQMarket(marketAddress);
  await linkTx.wait();
  console.log("UsageCredits linked to RFQMarket\n");

  // Write addresses to /shared/addresses.json
  const addresses = {
    negotiatorINFT: nftAddress,
    usageCredits: creditsAddress,
    rfqMarket: marketAddress,
  };

  const sharedDir = path.resolve(__dirname, "../../shared");
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.writeFileSync(
    path.join(sharedDir, "addresses.json"),
    JSON.stringify(addresses, null, 2)
  );
  console.log("Addresses written to /shared/addresses.json");

  // Copy ABIs to /shared/abis/
  const abisDir = path.join(sharedDir, "abis");
  fs.mkdirSync(abisDir, { recursive: true });

  const artifactsBase = path.resolve(__dirname, "../artifacts/contracts");
  const contracts = ["NegotiatorINFT", "UsageCredits", "RFQMarket"];

  for (const name of contracts) {
    const artifactPath = path.join(artifactsBase, `${name}.sol`, `${name}.json`);
    if (fs.existsSync(artifactPath)) {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      fs.writeFileSync(
        path.join(abisDir, `${name}.json`),
        JSON.stringify(artifact.abi, null, 2)
      );
      console.log(`ABI copied: ${name}.json`);
    } else {
      console.warn(`Artifact not found: ${artifactPath}`);
    }
  }

  console.log("\nDeployment complete.");
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
