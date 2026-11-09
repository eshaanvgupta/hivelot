// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockQUSDC
 * @notice Standard 6-decimal settlement token for local testing and QIE testnet deployment.
 * Emulates the canonical QUSDC token on QIE Mainnet (0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5).
 */
contract MockQUSDC is ERC20, Ownable {
    uint8 private immutable _decimals;

    constructor() ERC20("QIE USD Coin", "QUSDC") Ownable(msg.sender) {
        _decimals = 6;
        // Mint initial supply for testing
        _mint(msg.sender, 10_000_000 * 10 ** 6); // 10 Million QUSDC
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Public testnet faucet function to allow buyers and merchants to acquire test tokens.
     */
    function faucet(address to, uint256 amount) external {
        require(amount <= 10_000 * 10 ** 6, "Exceeds faucet limit per request");
        _mint(to, amount);
    }

    /**
     * @notice Admin mint for setting up integration environments.
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

