// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IHivelotTypes.sol";

/**
 * @title ProtocolTreasury
 * @notice Collects and manages transparent platform fees from settled procurement pools.
 * Completely partitioned from buyer escrow and supplier performance collateral.
 */
contract ProtocolTreasury is Ownable, IHivelotTypes {
    using SafeERC20 for IERC20;

    mapping(address => uint256) public totalCollectedFees;
    mapping(address => bool) public authorizedCallers;

    uint256 public constant MAX_FEE_BPS = 500; // Hard protocol fee ceiling: 5.0%

    event FeeCollected(bytes32 indexed poolId, address indexed token, uint256 amount);
    event FeesWithdrawn(address indexed token, address indexed recipient, uint256 amount);
    event AuthorizedCallerUpdated(address indexed caller, bool authorized);

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender] && msg.sender != owner()) revert UnauthorizedCaller();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        authorizedCallers[caller] = authorized;
        emit AuthorizedCallerUpdated(caller, authorized);
    }

    /**
     * @notice Records incoming fee allocation from settled pool
     */
    function recordFee(bytes32 poolId, address token, uint256 amount) external onlyAuthorized {
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) return;

        totalCollectedFees[token] += amount;
        emit FeeCollected(poolId, token, amount);
    }

    /**
     * @notice Withdraw collected protocol revenue to designated treasury wallet
     */
    function withdrawFees(address token, address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > totalCollectedFees[token]) revert InsufficientDeposit();

        totalCollectedFees[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);

        emit FeesWithdrawn(token, recipient, amount);
    }

    function getCollectedFees(address token) external view returns (uint256) {
        return totalCollectedFees[token];
    }
}

