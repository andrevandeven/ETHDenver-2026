// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface INFTOwner {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title UsageCredits
/// @notice Merchants buy per-run credits for a specific agent. RFQMarket consumes one
///         credit per createRFQ(). Revenue flows directly to the agent NFT owner.
contract UsageCredits is ReentrancyGuard {
    INFTOwner public immutable nft;
    address public rfqMarket;

    /// @notice credits[user][agentId] = remaining runs
    mapping(address => mapping(uint256 => uint256)) public credits;
    /// @notice pricePerCredit[agentId] = wei per credit
    mapping(uint256 => uint256) public pricePerCredit;

    event CreditsPurchased(address indexed user, uint256 indexed agentId, uint256 amount, uint256 paid);
    event CreditConsumed(address indexed user, uint256 indexed agentId);
    event PriceSet(uint256 indexed agentId, uint256 price);
    event RFQMarketSet(address market);

    constructor(address _nft) {
        nft = INFTOwner(_nft);
    }

    /// @notice Link the RFQMarket contract. Can only be called once.
    function setRFQMarket(address _market) external {
        require(rfqMarket == address(0), "Already set");
        rfqMarket = _market;
        emit RFQMarketSet(_market);
    }

    /// @notice Agent owner sets the credit price. Must be called before users can buy.
    function setPrice(uint256 agentId, uint256 price) external {
        require(nft.ownerOf(agentId) == msg.sender, "Not agent owner");
        pricePerCredit[agentId] = price;
        emit PriceSet(agentId, price);
    }

    /// @notice Purchase `amount` credits for `agentId`. msg.value must equal price * amount.
    ///         Payment is forwarded immediately to the agent NFT owner.
    function buyCredits(uint256 agentId, uint256 amount) external payable nonReentrant {
        require(amount > 0, "Amount must be > 0");
        uint256 price = pricePerCredit[agentId];
        require(price > 0, "Price not set");
        require(msg.value == price * amount, "Incorrect payment");

        credits[msg.sender][agentId] += amount;

        address agentOwner = nft.ownerOf(agentId);
        (bool ok, ) = agentOwner.call{value: msg.value}("");
        require(ok, "Transfer failed");

        emit CreditsPurchased(msg.sender, agentId, amount, msg.value);
    }

    /// @notice Consume one credit from `user` for `agentId`. Only callable by RFQMarket.
    function consumeCredit(address user, uint256 agentId) external {
        require(msg.sender == rfqMarket, "Only RFQMarket");
        require(credits[user][agentId] > 0, "Insufficient credits");
        credits[user][agentId]--;
        emit CreditConsumed(user, agentId);
    }

    function getCredits(address user, uint256 agentId) external view returns (uint256) {
        return credits[user][agentId];
    }
}
