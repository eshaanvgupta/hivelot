// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IHivelotTypes.sol";

/**
 * @title SupplierBondVault
 * @notice Holds performance collateral posted by suppliers during auction commitment.
 * Released upon verified fulfillment or forfeited upon contractual breach / default.
 */
contract SupplierBondVault is Ownable, IHivelotTypes {
    using SafeERC20 for IERC20;

    // poolId => supplier => locked bond
    mapping(bytes32 => mapping(address => uint256)) public supplierBonds;
    mapping(bytes32 => address) public poolTokens;
    mapping(address => bool) public authorizedCallers;

    event BondLocked(bytes32 indexed poolId, address indexed supplier, address token, uint256 amount);
    event BondReleased(bytes32 indexed poolId, address indexed supplier, address recipient, uint256 amount);
    event BondForfeited(bytes32 indexed poolId, address indexed supplier, address beneficiary, uint256 amount);
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
     * @notice Deposit and lock a performance bond on behalf of a supplier
     */
    function lockBond(
        bytes32 poolId,
        address supplier,
        address token,
        uint256 amount
    ) external onlyAuthorized {
        if (supplier == address(0) || token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        poolTokens[poolId] = token;
        supplierBonds[poolId][supplier] += amount;

        // Vault pulls the token from caller (SupplierAuction/supplier)
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit BondLocked(poolId, supplier, token, amount);
    }

    /**
     * @notice Release performance bond back to the supplier upon successful fulfillment or non-winning reveal
     */
    function releaseBond(
        bytes32 poolId,
        address supplier,
        address recipient
    ) external onlyAuthorized {
        uint256 amount = supplierBonds[poolId][supplier];
        if (amount == 0) revert NothingToWithdraw();

        supplierBonds[poolId][supplier] = 0;
        address token = poolTokens[poolId];

        IERC20(token).safeTransfer(recipient, amount);

        emit BondReleased(poolId, supplier, recipient, amount);
    }

    /**
     * @notice Forfeit bond to buyer compensation or treasury if supplier defaults
     */
    function forfeitBond(
        bytes32 poolId,
        address supplier,
        address beneficiary
    ) external onlyAuthorized {
        uint256 amount = supplierBonds[poolId][supplier];
        if (amount == 0) revert NothingToWithdraw();

        supplierBonds[poolId][supplier] = 0;
        address token = poolTokens[poolId];

        IERC20(token).safeTransfer(beneficiary, amount);

        emit BondForfeited(poolId, supplier, beneficiary, amount);
    }

    function getBond(bytes32 poolId, address supplier) external view returns (uint256) {
        return supplierBonds[poolId][supplier];
    }
}

