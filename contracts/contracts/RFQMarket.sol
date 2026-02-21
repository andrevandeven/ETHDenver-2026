// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface INegotiatorINFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function isAuthorized(uint256 tokenId, address user) external view returns (bool);
    function getFeePerRFQ(uint256 tokenId) external view returns (uint256);
}

interface IUsageCredits {
    function consumeCredit(address user, uint256 agentId) external;
}

/// @title RFQMarket
/// @notice On-chain marketplace where merchants post RFQs, authorized agent operators
///         commit supplier quotes obtained via voice negotiation, and merchants accept
///         the best quote paying the agent's fee.
contract RFQMarket is ReentrancyGuard {
    enum RFQStatus { Open, QuotesReceived, Accepted, Cancelled }

    struct RFQ {
        address buyer;
        uint256 agentId;
        bytes32 rfqDataHash;   // keccak256 of RFQ JSON (or 0G Storage Merkle root)
        string rfqDataURI;     // 0G Storage URI or local:// fallback
        uint48 createdAt;
        RFQStatus status;
        uint256 acceptedQuoteId;
    }

    struct Quote {
        uint256 rfqId;
        bytes32 quoteDataHash; // keccak256 of quote+transcript packet on 0G Storage
        string quoteDataURI;
        string supplierLabel;
        uint256 unitPriceWei;  // price in wei (USD * 1e18 / rate, or raw wei for demo)
        uint256 moq;           // minimum order quantity
        uint256 leadTimeDays;
        uint48 validUntil;
    }

    INegotiatorINFT public immutable nft;
    IUsageCredits public immutable creditsContract;

    uint256 public nextRFQId;
    uint256 public nextQuoteId;

    mapping(uint256 => RFQ) public rfqs;
    mapping(uint256 => Quote) public quotes;
    mapping(uint256 => uint256[]) public rfqQuoteIds;

    event RFQCreated(
        uint256 indexed rfqId,
        address indexed buyer,
        uint256 indexed agentId,
        bytes32 rfqDataHash
    );
    event QuoteCommitted(
        uint256 indexed quoteId,
        uint256 indexed rfqId,
        string supplierLabel,
        uint256 unitPriceWei
    );
    event QuoteAccepted(uint256 indexed rfqId, uint256 indexed quoteId, address buyer);
    event AgentPaid(uint256 indexed rfqId, address indexed agentOwner, uint256 amount);

    constructor(address _nft, address _credits) {
        nft = INegotiatorINFT(_nft);
        creditsContract = IUsageCredits(_credits);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Merchant actions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Post a new RFQ. Consumes one credit from the caller for the chosen agent.
    /// @param agentId    Token ID of the NegotiatorINFT to fulfil this RFQ.
    /// @param rfqDataHash keccak256 hash of the RFQ JSON stored on 0G Storage.
    /// @param rfqDataURI  0G Storage URI (or local:// fallback).
    function createRFQ(
        uint256 agentId,
        bytes32 rfqDataHash,
        string calldata rfqDataURI
    ) external returns (uint256) {
        // Burns one credit — reverts if caller has none
        creditsContract.consumeCredit(msg.sender, agentId);

        uint256 rfqId = nextRFQId++;
        rfqs[rfqId] = RFQ({
            buyer: msg.sender,
            agentId: agentId,
            rfqDataHash: rfqDataHash,
            rfqDataURI: rfqDataURI,
            createdAt: uint48(block.timestamp),
            status: RFQStatus.Open,
            acceptedQuoteId: 0
        });

        emit RFQCreated(rfqId, msg.sender, agentId, rfqDataHash);
        return rfqId;
    }

    /// @notice Accept a quote and pay the agent's fee to the NFT owner.
    /// @dev msg.value must equal nft.getFeePerRFQ(agentId).
    function acceptQuote(uint256 rfqId, uint256 quoteId) external payable nonReentrant {
        RFQ storage rfq = rfqs[rfqId];
        require(rfq.buyer == msg.sender, "Not buyer");
        require(
            rfq.status == RFQStatus.Open || rfq.status == RFQStatus.QuotesReceived,
            "RFQ not active"
        );
        require(quotes[quoteId].rfqId == rfqId, "Quote not for this RFQ");

        uint256 fee = nft.getFeePerRFQ(rfq.agentId);
        require(msg.value == fee, "Incorrect fee");

        rfq.status = RFQStatus.Accepted;
        rfq.acceptedQuoteId = quoteId;

        if (fee > 0) {
            address agentOwner = nft.ownerOf(rfq.agentId);
            (bool ok, ) = agentOwner.call{value: fee}("");
            require(ok, "Fee transfer failed");
            emit AgentPaid(rfqId, agentOwner, fee);
        }

        emit QuoteAccepted(rfqId, quoteId, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Agent operator actions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Commit a supplier quote obtained through voice negotiation.
    ///         Open to any operator — access is gated by credit purchase in createRFQ.
    function commitQuote(
        uint256 rfqId,
        bytes32 quoteDataHash,
        string calldata quoteDataURI,
        string calldata supplierLabel,
        uint256 unitPriceWei,
        uint256 moq,
        uint256 leadTimeDays,
        uint48 validUntil
    ) external returns (uint256) {
        RFQ storage rfq = rfqs[rfqId];
        require(rfq.buyer != address(0), "RFQ not found");
        require(
            rfq.status == RFQStatus.Open || rfq.status == RFQStatus.QuotesReceived,
            "RFQ not open"
        );

        uint256 quoteId = nextQuoteId++;
        quotes[quoteId] = Quote({
            rfqId: rfqId,
            quoteDataHash: quoteDataHash,
            quoteDataURI: quoteDataURI,
            supplierLabel: supplierLabel,
            unitPriceWei: unitPriceWei,
            moq: moq,
            leadTimeDays: leadTimeDays,
            validUntil: validUntil
        });

        rfqQuoteIds[rfqId].push(quoteId);
        if (rfq.status == RFQStatus.Open) {
            rfq.status = RFQStatus.QuotesReceived;
        }

        emit QuoteCommitted(quoteId, rfqId, supplierLabel, unitPriceWei);
        return quoteId;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Views
    // ─────────────────────────────────────────────────────────────────────────

    function getRFQ(uint256 rfqId) external view returns (RFQ memory) {
        return rfqs[rfqId];
    }

    function getQuote(uint256 quoteId) external view returns (Quote memory) {
        return quotes[quoteId];
    }

    function getRFQQuoteIds(uint256 rfqId) external view returns (uint256[] memory) {
        return rfqQuoteIds[rfqId];
    }
}
