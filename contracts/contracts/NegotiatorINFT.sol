// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./interfaces/IERC7857Lite.sol";

/// @title NegotiatorINFT
/// @notice ERC-7857-inspired iNFT that represents an AI procurement negotiation agent.
///         Merchants rent the agent per-run via UsageCredits. The agent's "brain bundle"
///         (system prompt + config) is stored on 0G Storage with the hash committed here.
contract NegotiatorINFT is ERC721Enumerable, Ownable, ReentrancyGuard, IERC7857Lite {
    struct AgentProfile {
        string name;
        string categories;   // comma-separated product categories
        string regions;      // comma-separated geographic regions
        uint256 maxRFQValueWei;
        uint256 feePerRFQWei;
        bytes32 brainBundleHash;
        string brainBundleURI;
        string profileURI;
    }

    uint256 private _nextTokenId;

    mapping(uint256 => AgentProfile) public profiles;

    // ERC-7857 state
    mapping(uint256 => bytes32) private _metadataHashes;
    mapping(uint256 => string) private _encryptedURIs;
    mapping(uint256 => mapping(address => bool)) private _authorizations;
    mapping(uint256 => address[]) private _authorizedUsers;

    event AgentMinted(uint256 indexed tokenId, address indexed owner, string name);
    event BrainBundleUpdated(uint256 indexed tokenId, bytes32 hash, string uri);

    constructor() ERC721("NegotiatorINFT", "NEGOI") {}

    // ─────────────────────────────────────────────────────────────────────────
    // Mint & update
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Mint a new Negotiator iNFT. Caller becomes the token owner.
    function mint(AgentProfile calldata profile) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        profiles[tokenId] = profile;
        _metadataHashes[tokenId] = profile.brainBundleHash;
        _encryptedURIs[tokenId] = profile.brainBundleURI;

        emit AgentMinted(tokenId, msg.sender, profile.name);
        emit MetadataUpdated(tokenId, profile.brainBundleHash, profile.brainBundleURI);

        return tokenId;
    }

    /// @notice Update agent profile metadata. Only token owner.
    function updateProfile(uint256 tokenId, AgentProfile calldata profile) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        profiles[tokenId] = profile;
    }

    /// @notice Update the brain bundle hash and URI (0G Storage root hash). Only token owner.
    function setBrainBundle(uint256 tokenId, bytes32 hash, string calldata uri) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        profiles[tokenId].brainBundleHash = hash;
        profiles[tokenId].brainBundleURI = uri;
        _metadataHashes[tokenId] = hash;
        _encryptedURIs[tokenId] = uri;
        emit BrainBundleUpdated(tokenId, hash, uri);
        emit MetadataUpdated(tokenId, hash, uri);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // IERC7857Lite — authorization
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Grant `user` permission to act as agent operator. Only token owner.
    function authorizeUsage(uint256 tokenId, address user) external override {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(!_authorizations[tokenId][user], "Already authorized");
        _authorizations[tokenId][user] = true;
        _authorizedUsers[tokenId].push(user);
        emit Authorization(tokenId, user);
    }

    /// @notice Revoke operator permission from `user`. Only token owner.
    function revokeAuthorization(uint256 tokenId, address user) external override {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(_authorizations[tokenId][user], "Not authorized");
        _authorizations[tokenId][user] = false;

        address[] storage users = _authorizedUsers[tokenId];
        for (uint256 i = 0; i < users.length; i++) {
            if (users[i] == user) {
                users[i] = users[users.length - 1];
                users.pop();
                break;
            }
        }
        emit AuthorizationRevoked(tokenId, user);
    }

    /// @notice Returns all currently authorized operator addresses.
    function authorizedUsersOf(uint256 tokenId) external view override returns (address[] memory) {
        return _authorizedUsers[tokenId];
    }

    /// @notice Returns true if `user` is an authorized operator or the token owner.
    function isAuthorized(uint256 tokenId, address user) external view override returns (bool) {
        return _authorizations[tokenId][user] || ownerOf(tokenId) == user;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // IERC7857Lite — intelligent data
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Returns the brain bundle as ERC-7857 IntelligentData.
    function intelligentDataOf(uint256 tokenId) external view override returns (IntelligentData memory) {
        return IntelligentData({
            dataDescription: profiles[tokenId].name,
            dataHash: _metadataHashes[tokenId]
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Composability helpers
    // ─────────────────────────────────────────────────────────────────────────

    function getProfile(uint256 tokenId) external view returns (AgentProfile memory) {
        return profiles[tokenId];
    }

    function getFeePerRFQ(uint256 tokenId) external view returns (uint256) {
        return profiles[tokenId].feePerRFQWei;
    }
}
