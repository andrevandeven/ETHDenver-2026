// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC7857Lite {
    struct IntelligentData {
        string dataDescription;
        bytes32 dataHash;
    }

    event Authorization(uint256 indexed tokenId, address indexed user);
    event AuthorizationRevoked(uint256 indexed tokenId, address indexed user);
    event MetadataUpdated(uint256 indexed tokenId, bytes32 metadataHash, string encryptedURI);

    function authorizeUsage(uint256 tokenId, address user) external;
    function revokeAuthorization(uint256 tokenId, address user) external;
    function authorizedUsersOf(uint256 tokenId) external view returns (address[] memory);
    function isAuthorized(uint256 tokenId, address user) external view returns (bool);
    function intelligentDataOf(uint256 tokenId) external view returns (IntelligentData memory);
}
