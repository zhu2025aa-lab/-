// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title AgentWalletRegistry
 * @notice BSC-only registry gating participation to wallets that have activated a `.ai` Agent ID
 *         (or signed by the official Binance Agentic Wallet verifier when requireSignature = true).
 */
contract AgentWalletRegistry is Ownable, EIP712 {
    bytes32 public constant ACTIVATE_TYPEHASH = keccak256(
        "ActivateAgent(address wallet,bytes32 agentIdHash,uint256 nonce,uint256 deadline)"
    );

    address public verifierSigner;
    bool public requireSignature;
    uint256 public totalAgents;

    mapping(address => string) public agentIdOf;
    mapping(bytes32 => address) public walletOfIdHash;
    mapping(address => uint256) public nonces;

    event AgentWalletActivated(address indexed wallet, string agentId, bool sigVerified);
    event VerifierConfigUpdated(address indexed signer, bool requireSignature);

    constructor(address _verifierSigner, bool _requireSignature)
        Ownable(msg.sender)
        EIP712("AgentWalletRegistry", "1")
    {
        require(
            block.chainid == 56 || block.chainid == 97 || block.chainid == 31337,
            "BSC chain only"
        );
        verifierSigner = _verifierSigner;
        requireSignature = _requireSignature;
    }

    function isAgentWallet(address account) external view returns (bool) {
        return bytes(agentIdOf[account]).length > 0;
    }

    function activateAgentWallet(
        string calldata agentId,
        uint256 deadline,
        bytes calldata sig
    ) external {
        require(bytes(agentIdOf[msg.sender]).length == 0, "already activated");
        require(_hasAiSuffix(agentId), "must end with .ai");

        bytes32 idHash = keccak256(bytes(agentId));
        require(walletOfIdHash[idHash] == address(0), "agentId taken");

        bool sigVerified = false;
        if (requireSignature || (sig.length > 0 && verifierSigner != address(0))) {
            require(verifierSigner != address(0), "verifier not set");
            require(block.timestamp <= deadline, "expired");
            uint256 nonce = nonces[msg.sender]++;
            bytes32 structHash = keccak256(
                abi.encode(ACTIVATE_TYPEHASH, msg.sender, idHash, nonce, deadline)
            );
            address recovered = ECDSA.recover(_hashTypedDataV4(structHash), sig);
            require(recovered == verifierSigner, "bad agent sig");
            sigVerified = true;
        }

        agentIdOf[msg.sender] = agentId;
        walletOfIdHash[idHash] = msg.sender;
        totalAgents += 1;

        emit AgentWalletActivated(msg.sender, agentId, sigVerified);
    }

    function setVerifierConfig(address _signer, bool _requireSignature) external onlyOwner {
        verifierSigner = _signer;
        requireSignature = _requireSignature;
        emit VerifierConfigUpdated(_signer, _requireSignature);
    }

    function _hasAiSuffix(string calldata s) internal pure returns (bool) {
        bytes calldata b = bytes(s);
        if (b.length < 4 || b.length > 32) return false;
        return (
            b[b.length - 3] == 0x2e && // '.'
            (b[b.length - 2] == 0x61 || b[b.length - 2] == 0x41) && // 'a' or 'A'
            (b[b.length - 1] == 0x69 || b[b.length - 1] == 0x49)    // 'i' or 'I'
        );
    }
}
