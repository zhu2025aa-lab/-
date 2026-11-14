// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AgentIdRegistry
 * @notice SPACE ID / Binance AI Agent ID compatible registry exposing `handleOf(address)`.
 *         Checks locally registered handles first and falls back to the official
 *         BSC Mainnet SPACE ID Agent ID registry (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`)
 *         when present on-chain, enabling both existing `.ai` holders and AI bots via `register()`.
 */
contract AgentIdRegistry is Ownable {
    address public constant OFFICIAL_SPACE_ID_AGENT_REGISTRY =
        0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    uint256 public totalAgents;

    mapping(address => string) private _handles;
    mapping(bytes32 => address) public walletOfHandleHash;

    event HandleRegistered(address indexed account, string handle);

    constructor() Ownable(msg.sender) {}

    /// @notice Official SPACE ID / Binance AI Agent ID interface (`handleOf`).
    function handleOf(address account) external view returns (string memory) {
        return _resolveHandle(account);
    }

    function isAgentWallet(address account) external view returns (bool) {
        return bytes(_resolveHandle(account)).length > 0;
    }

    function agentIdOf(address account) external view returns (string memory) {
        return _resolveHandle(account);
    }

    function _resolveHandle(address account) internal view returns (string memory) {
        string memory local = _handles[account];
        if (bytes(local).length > 0) {
            return local;
        }
        if (OFFICIAL_SPACE_ID_AGENT_REGISTRY.code.length > 0) {
            (bool ok, bytes memory data) = OFFICIAL_SPACE_ID_AGENT_REGISTRY.staticcall(
                abi.encodeWithSignature("handleOf(address)", account)
            );
            if (ok && data.length >= 64) {
                return abi.decode(data, (string));
            }
        }
        return "";
    }

    /// @notice 1-click testnet self-registration for `.ai` Agent handles.
    function register(string calldata handle) external {
        require(bytes(_handles[msg.sender]).length == 0, "already registered");
        _assign(msg.sender, handle);
    }

    /// @notice Batch pre-seed handles for known test / demo wallets.
    function setHandlesBatch(
        address[] calldata accounts,
        string[] calldata handles
    ) external onlyOwner {
        require(accounts.length == handles.length, "length mismatch");
        for (uint256 i = 0; i < accounts.length; i++) {
            _assign(accounts[i], handles[i]);
        }
    }

    function _assign(address account, string calldata handle) internal {
        require(account != address(0), "zero address");
        bytes calldata raw = bytes(handle);
        require(raw.length >= 2 && raw.length <= 32, "invalid handle length");

        bytes32 hHash = keccak256(raw);
        address currentOwner = walletOfHandleHash[hHash];
        require(currentOwner == address(0) || currentOwner == account, "handle taken");

        string memory prev = _handles[account];
        if (bytes(prev).length > 0) {
            walletOfHandleHash[keccak256(bytes(prev))] = address(0);
        } else {
            totalAgents += 1;
        }

        _handles[account] = handle;
        walletOfHandleHash[hHash] = account;
        emit HandleRegistered(account, handle);
    }
}
