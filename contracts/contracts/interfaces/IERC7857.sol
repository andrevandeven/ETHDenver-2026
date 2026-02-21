// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title IERC7857 — 0G Intelligent NFT (iNFT) Standard (Simplified)
/// @notice Simplified implementation of ERC-7857 as defined by 0G Labs.
///         Full spec includes encrypted metadata re-encryption via TEE/ZKP oracles
///         for secure ownership transfers. This version implements the core primitives:
///         intelligent metadata, authorized usage, and on-chain brain bundle hashing.
/// @dev See https://docs.0g.ai/developer-hub/building-on-0g/inft/erc7857
interface IERC7857 {
    /// @notice Represents the intelligent data (AI model/brain) attached to a token.
    struct IntelligentData {
        string dataDescription;
        bytes32 dataHash;
    }

    /// @notice Emitted when an address is authorized to use a token's AI capabilities.
    event Authorization(uint256 indexed tokenId, address indexed user);
    /// @notice Emitted when authorization is revoked.
    event AuthorizationRevoked(uint256 indexed tokenId, address indexed user);
    /// @notice Emitted when the token's intelligent metadata (brain bundle) is updated.
    event MetadataUpdated(uint256 indexed tokenId, bytes32 metadataHash, string encryptedURI);

    /// @notice Grant `user` permission to use this iNFT's AI capabilities.
    function authorizeUsage(uint256 tokenId, address user) external;

    /// @notice Revoke usage permission from `user`.
    function revokeAuthorization(uint256 tokenId, address user) external;

    /// @notice Returns all addresses authorized to use this iNFT.
    function authorizedUsersOf(uint256 tokenId) external view returns (address[] memory);

    /// @notice Returns whether `user` is authorized (includes owner check).
    function isAuthorized(uint256 tokenId, address user) external view returns (bool);

    /// @notice Returns the intelligent data (brain bundle) for a token.
    function intelligentDataOf(uint256 tokenId) external view returns (IntelligentData memory);
}
