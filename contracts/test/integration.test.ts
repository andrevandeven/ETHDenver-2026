import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  NegotiatorINFT,
  UsageCredits,
  RFQMarket,
} from "../typechain-types";

const ZERO_HASH = ethers.ZeroHash;

describe("Procurement Negotiator iNFT - Integration", () => {
  let nft: NegotiatorINFT;
  let credits: UsageCredits;
  let market: RFQMarket;

  let owner: HardhatEthersSigner;
  let buyer: HardhatEthersSigner;
  let operator: HardhatEthersSigner;
  let stranger: HardhatEthersSigner;

  const FEE_PER_RFQ = ethers.parseEther("0.001");
  const PRICE_PER_CREDIT = ethers.parseEther("0.0005");

  const defaultProfile = {
    name: "TestAgent",
    categories: "electronics,packaging",
    regions: "US,EU",
    maxRFQValueWei: ethers.parseEther("10"),
    feePerRFQWei: FEE_PER_RFQ,
    brainBundleHash: ethers.keccak256(ethers.toUtf8Bytes("brain-bundle-v1")),
    brainBundleURI: "0g://abc123",
    profileURI: "https://example.com/agent/0",
  };

  beforeEach(async () => {
    [owner, buyer, operator, stranger] = await ethers.getSigners();

    const NegotiatorINFT = await ethers.getContractFactory("NegotiatorINFT");
    nft = await NegotiatorINFT.deploy();
    await nft.waitForDeployment();

    const UsageCredits = await ethers.getContractFactory("UsageCredits");
    credits = await UsageCredits.deploy(await nft.getAddress());
    await credits.waitForDeployment();

    const RFQMarket = await ethers.getContractFactory("RFQMarket");
    market = await RFQMarket.deploy(
      await nft.getAddress(),
      await credits.getAddress()
    );
    await market.waitForDeployment();

    await credits.setRFQMarket(await market.getAddress());
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Full lifecycle test
  // ─────────────────────────────────────────────────────────────────────────

  describe("Full lifecycle", () => {
    it("completes the happy path end-to-end", async () => {
      // 1. Owner mints agent
      const mintTx = await nft.connect(owner).mint(defaultProfile);
      const receipt = await mintTx.wait();
      const agentId = 0n;

      // Verify mint events
      await expect(mintTx)
        .to.emit(nft, "AgentMinted")
        .withArgs(agentId, owner.address, "TestAgent");
      await expect(mintTx)
        .to.emit(nft, "MetadataUpdated")
        .withArgs(agentId, defaultProfile.brainBundleHash, "0g://abc123");

      expect(await nft.ownerOf(agentId)).to.equal(owner.address);

      // 2. Verify intelligentDataOf
      const intelligentData = await nft.intelligentDataOf(agentId);
      expect(intelligentData.dataDescription).to.equal("TestAgent");
      expect(intelligentData.dataHash).to.equal(defaultProfile.brainBundleHash);

      // 3. Set credit price
      await expect(credits.connect(owner).setPrice(agentId, PRICE_PER_CREDIT))
        .to.emit(credits, "PriceSet")
        .withArgs(agentId, PRICE_PER_CREDIT);

      // 4. Authorize operator
      await expect(nft.connect(owner).authorizeUsage(agentId, operator.address))
        .to.emit(nft, "Authorization")
        .withArgs(agentId, operator.address);

      expect(await nft.isAuthorized(agentId, operator.address)).to.be.true;
      expect(await nft.authorizedUsersOf(agentId)).to.include(operator.address);

      // 5. Buyer purchases credits — owner should receive ETH
      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
      await expect(
        credits
          .connect(buyer)
          .buyCredits(agentId, 3, { value: PRICE_PER_CREDIT * 3n })
      )
        .to.emit(credits, "CreditsPurchased")
        .withArgs(buyer.address, agentId, 3, PRICE_PER_CREDIT * 3n);

      expect(await credits.getCredits(buyer.address, agentId)).to.equal(3);
      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(PRICE_PER_CREDIT * 3n);

      // 6. Buyer creates RFQ — credit consumed
      const rfqHash = ethers.keccak256(ethers.toUtf8Bytes('{"item":"packaging","qty":1000}'));
      const rfqTx = await market.connect(buyer).createRFQ(agentId, rfqHash, "0g://rfq1");

      await expect(rfqTx)
        .to.emit(market, "RFQCreated")
        .withArgs(0n, buyer.address, agentId, rfqHash);
      await expect(rfqTx).to.emit(credits, "CreditConsumed").withArgs(buyer.address, agentId);

      expect(await credits.getCredits(buyer.address, agentId)).to.equal(2);

      const rfq = await market.getRFQ(0n);
      expect(rfq.buyer).to.equal(buyer.address);
      expect(rfq.rfqDataHash).to.equal(rfqHash);
      expect(rfq.status).to.equal(0); // Open

      // 7. Operator commits 3 quotes
      const validUntil = Math.floor(Date.now() / 1000) + 7 * 86400;

      const q1Hash = ethers.keccak256(ethers.toUtf8Bytes("quote-valuesource"));
      await expect(
        market
          .connect(operator)
          .commitQuote(
            0n, q1Hash, "0g://q1",
            "ValueSource", ethers.parseEther("4.2"), 100n, 21n, validUntil
          )
      )
        .to.emit(market, "QuoteCommitted")
        .withArgs(0n, 0n, "ValueSource", ethers.parseEther("4.2"));

      const q2Hash = ethers.keccak256(ethers.toUtf8Bytes("quote-quickship"));
      await market
        .connect(operator)
        .commitQuote(
          0n, q2Hash, "0g://q2",
          "QuickShip", ethers.parseEther("8.5"), 10n, 7n, validUntil
        );

      const q3Hash = ethers.keccak256(ethers.toUtf8Bytes("quote-bulkdeal"));
      await market
        .connect(operator)
        .commitQuote(
          0n, q3Hash, "0g://q3",
          "BulkDeal", ethers.parseEther("3.5"), 1000n, 14n, validUntil
        );

      // 3 quotes attached to RFQ 0
      const quoteIds = await market.getRFQQuoteIds(0n);
      expect(quoteIds.length).to.equal(3);

      // RFQ status should be QuotesReceived
      const rfqAfter = await market.getRFQ(0n);
      expect(rfqAfter.status).to.equal(1); // QuotesReceived

      // 8. Buyer accepts best quote (ValueSource @ 4.2) — pays fee to agent owner
      const ownerBefore2 = await ethers.provider.getBalance(owner.address);
      const acceptTx = await market
        .connect(buyer)
        .acceptQuote(0n, 0n, { value: FEE_PER_RFQ });

      await expect(acceptTx)
        .to.emit(market, "QuoteAccepted")
        .withArgs(0n, 0n, buyer.address);
      await expect(acceptTx)
        .to.emit(market, "AgentPaid")
        .withArgs(0n, owner.address, FEE_PER_RFQ);

      const ownerAfter2 = await ethers.provider.getBalance(owner.address);
      expect(ownerAfter2 - ownerBefore2).to.equal(FEE_PER_RFQ);

      // 9. Verify final state
      const finalRFQ = await market.getRFQ(0n);
      expect(finalRFQ.status).to.equal(2); // Accepted
      expect(finalRFQ.acceptedQuoteId).to.equal(0n);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // NegotiatorINFT unit tests
  // ─────────────────────────────────────────────────────────────────────────

  describe("NegotiatorINFT", () => {
    let tokenId: bigint;

    beforeEach(async () => {
      await nft.connect(owner).mint(defaultProfile);
      tokenId = 0n;
    });

    it("owner is implicitly authorized", async () => {
      expect(await nft.isAuthorized(tokenId, owner.address)).to.be.true;
    });

    it("stranger is not authorized", async () => {
      expect(await nft.isAuthorized(tokenId, stranger.address)).to.be.false;
    });

    it("revokes authorization and removes from array", async () => {
      await nft.connect(owner).authorizeUsage(tokenId, operator.address);
      expect(await nft.isAuthorized(tokenId, operator.address)).to.be.true;

      await nft.connect(owner).revokeAuthorization(tokenId, operator.address);
      expect(await nft.isAuthorized(tokenId, operator.address)).to.be.false;
      expect(await nft.authorizedUsersOf(tokenId)).to.not.include(operator.address);
    });

    it("non-owner cannot authorizeUsage", async () => {
      await expect(
        nft.connect(stranger).authorizeUsage(tokenId, stranger.address)
      ).to.be.revertedWith("Not token owner");
    });

    it("setBrainBundle updates hash and emits events", async () => {
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("brain-v2"));
      await expect(nft.connect(owner).setBrainBundle(tokenId, newHash, "0g://v2"))
        .to.emit(nft, "BrainBundleUpdated")
        .withArgs(tokenId, newHash, "0g://v2")
        .and.to.emit(nft, "MetadataUpdated")
        .withArgs(tokenId, newHash, "0g://v2");

      const data = await nft.intelligentDataOf(tokenId);
      expect(data.dataHash).to.equal(newHash);
    });

    it("supports ERC721Enumerable", async () => {
      expect(await nft.totalSupply()).to.equal(1);
      expect(await nft.tokenByIndex(0)).to.equal(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // UsageCredits unit tests
  // ─────────────────────────────────────────────────────────────────────────

  describe("UsageCredits", () => {
    beforeEach(async () => {
      await nft.connect(owner).mint(defaultProfile);
      await credits.connect(owner).setPrice(0n, PRICE_PER_CREDIT);
    });

    it("rejects buyCredits when price not set for a different agent", async () => {
      // Agent 1 doesn't exist yet (price = 0)
      await expect(
        credits.connect(buyer).buyCredits(1n, 1, { value: PRICE_PER_CREDIT })
      ).to.be.revertedWith("Price not set");
    });

    it("rejects incorrect payment", async () => {
      await expect(
        credits.connect(buyer).buyCredits(0n, 2, { value: PRICE_PER_CREDIT })
      ).to.be.revertedWith("Incorrect payment");
    });

    it("setRFQMarket can only be called once", async () => {
      await expect(
        credits.connect(owner).setRFQMarket(stranger.address)
      ).to.be.revertedWith("Already set");
    });

    it("consumeCredit only callable by rfqMarket", async () => {
      await expect(
        credits.connect(stranger).consumeCredit(buyer.address, 0n)
      ).to.be.revertedWith("Only RFQMarket");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RFQMarket unit tests
  // ─────────────────────────────────────────────────────────────────────────

  describe("RFQMarket", () => {
    let agentId: bigint;

    beforeEach(async () => {
      await nft.connect(owner).mint(defaultProfile);
      agentId = 0n;
      await credits.connect(owner).setPrice(agentId, PRICE_PER_CREDIT);
      await credits
        .connect(buyer)
        .buyCredits(agentId, 2, { value: PRICE_PER_CREDIT * 2n });
    });

    it("reverts createRFQ with insufficient credits", async () => {
      // Use both credits first
      const hash = ethers.keccak256(ethers.toUtf8Bytes("rfq"));
      await market.connect(buyer).createRFQ(agentId, hash, "uri");
      await market.connect(buyer).createRFQ(agentId, hash, "uri");
      // Third should fail
      await expect(
        market.connect(buyer).createRFQ(agentId, hash, "uri")
      ).to.be.revertedWith("Insufficient credits");
    });

    it("reverts commitQuote from unauthorized address", async () => {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("rfq"));
      await market.connect(buyer).createRFQ(agentId, hash, "uri");

      const validUntil = Math.floor(Date.now() / 1000) + 86400;
      await expect(
        market
          .connect(stranger)
          .commitQuote(0n, ZERO_HASH, "uri", "Stranger Inc", 100n, 10n, 7n, validUntil)
      ).to.be.revertedWith("Not authorized agent operator");
    });

    it("reverts acceptQuote with wrong fee", async () => {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("rfq"));
      await market.connect(buyer).createRFQ(agentId, hash, "uri");

      const validUntil = Math.floor(Date.now() / 1000) + 86400;
      await market
        .connect(owner)
        .commitQuote(0n, ZERO_HASH, "uri", "OwnerCo", 100n, 10n, 7n, validUntil);

      // Correct fee is FEE_PER_RFQ, passing 0 should fail
      await expect(
        market.connect(buyer).acceptQuote(0n, 0n, { value: 0 })
      ).to.be.revertedWith("Incorrect fee");
    });

    it("reverts acceptQuote from non-buyer", async () => {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("rfq"));
      await market.connect(buyer).createRFQ(agentId, hash, "uri");

      const validUntil = Math.floor(Date.now() / 1000) + 86400;
      await market
        .connect(owner)
        .commitQuote(0n, ZERO_HASH, "uri", "OwnerCo", 100n, 10n, 7n, validUntil);

      await expect(
        market.connect(stranger).acceptQuote(0n, 0n, { value: FEE_PER_RFQ })
      ).to.be.revertedWith("Not buyer");
    });

    it("owner can commitQuote without explicit authorization", async () => {
      const hash = ethers.keccak256(ethers.toUtf8Bytes("rfq"));
      await market.connect(buyer).createRFQ(agentId, hash, "uri");

      const validUntil = Math.floor(Date.now() / 1000) + 86400;
      await expect(
        market
          .connect(owner)
          .commitQuote(0n, ZERO_HASH, "uri", "OwnerCo", 100n, 10n, 7n, validUntil)
      )
        .to.emit(market, "QuoteCommitted")
        .withArgs(0n, 0n, "OwnerCo", 100n);
    });
  });
});
