// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IHivelotTypes.sol";

/**
 * @title DemandVault
 * @notice Safeguards all buyer funds committed to procurement pools.
 * Guarantees exact token conservation, individual balances, refund accounting, and fulfillment escrow.
 */
contract DemandVault is Ownable, ReentrancyGuard, IHivelotTypes {
    using SafeERC20 for IERC20;

    // poolId => buyer => BuyerCommitment
    mapping(bytes32 => mapping(address => BuyerCommitment)) public commitments;
    // poolId => list of buyer addresses
    mapping(bytes32 => address[]) private _poolBuyers;
    // poolId => total units committed
    mapping(bytes32 => uint256) public totalCommittedUnits;
    // poolId => total escrow deposited
    mapping(bytes32 => uint256) public totalDepositedEscrow;
    // poolId => total price-adjustment refunds allocated
    mapping(bytes32 => uint256) public totalAllocatedRefunds;
    // poolId => total fulfillment escrow retained
    mapping(bytes32 => uint256) public totalFulfillmentEscrow;
    // poolId => token address
    mapping(bytes32 => address) public poolTokens;

    mapping(address => bool) public authorizedCallers;

    event DemandCommitted(
        bytes32 indexed poolId,
        address indexed buyer,
        uint256 quantity,
        uint256 depositAmount,
        uint256 aggregateQuantity
    );
    event DemandCancelled(
        bytes32 indexed poolId,
        address indexed buyer,
        uint256 quantity,
        uint256 refundAmount
    );
    event PriceAdjustmentAllocated(
        bytes32 indexed poolId,
        address indexed buyer,
        uint256 refundAmount,
        uint256 finalLiability
    );
    event RefundWithdrawn(
        bytes32 indexed poolId,
        address indexed buyer,
        uint256 amount
    );
    event EscrowReleased(
        bytes32 indexed poolId,
        address indexed recipient,
        uint256 amount
    );
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
     * @notice Records buyer deposit and commits purchasing demand
     */
    function recordDeposit(
        bytes32 poolId,
        address buyer,
        address token,
        uint256 quantity,
        uint256 maxUnitPrice
    ) external onlyAuthorized nonReentrant {
        if (buyer == address(0) || token == address(0)) revert ZeroAddress();
        if (quantity == 0 || maxUnitPrice == 0) revert ZeroAmount();

        uint256 depositRequired = quantity * maxUnitPrice;

        BuyerCommitment storage commitment = commitments[poolId][buyer];
        if (commitment.quantity == 0) {
            _poolBuyers[poolId].push(buyer);
            poolTokens[poolId] = token;
        }

        commitment.quantity += quantity;
        commitment.depositAmount += depositRequired;
        commitment.fulfillmentStatus = FulfillmentStatus.PENDING;

        totalCommittedUnits[poolId] += quantity;
        totalDepositedEscrow[poolId] += depositRequired;

        // Pull payment from user via caller/router
        IERC20(token).safeTransferFrom(msg.sender, address(this), depositRequired);

        emit DemandCommitted(poolId, buyer, quantity, depositRequired, totalCommittedUnits[poolId]);
    }

    /**
     * @notice Allows a buyer to cancel and withdraw escrow before pool demand is locked or if pool cancelled
     */
    function processCancellation(
        bytes32 poolId,
        address buyer
    ) external onlyAuthorized nonReentrant returns (uint256 refundAmount) {
        BuyerCommitment storage commitment = commitments[poolId][buyer];
        if (commitment.quantity == 0) revert CommitmentNotFound();
        if (commitment.depositAmount == 0) revert NothingToWithdraw();

        refundAmount = commitment.depositAmount;
        uint256 qty = commitment.quantity;

        totalCommittedUnits[poolId] -= qty;
        totalDepositedEscrow[poolId] -= refundAmount;

        commitment.quantity = 0;
        commitment.depositAmount = 0;
        commitment.finalLiability = 0;
        commitment.refundAmount = 0;
        commitment.fulfillmentStatus = FulfillmentStatus.REFUNDED;

        address token = poolTokens[poolId];
        IERC20(token).safeTransfer(buyer, refundAmount);

        emit DemandCancelled(poolId, buyer, qty, refundAmount);
    }

    /**
     * @notice Called during market clearing to fix final liabilities and assign price-adjustment refunds
     */
    function applyClearingPrice(
        bytes32 poolId,
        uint256 clearingPrice,
        uint256 maxUnitPrice
    ) external onlyAuthorized {
        if (clearingPrice > maxUnitPrice) revert PriceExceedsMaximum(clearingPrice, maxUnitPrice);

        address[] memory buyers = _poolBuyers[poolId];
        uint256 totalRefunds = 0;
        uint256 totalEscrow = 0;

        for (uint256 i = 0; i < buyers.length; i++) {
            address buyer = buyers[i];
            BuyerCommitment storage commitment = commitments[poolId][buyer];
            if (commitment.quantity == 0) continue;

            uint256 liability = commitment.quantity * clearingPrice;
            uint256 refund = commitment.quantity * (maxUnitPrice - clearingPrice);

            commitment.finalLiability = liability;
            commitment.refundAmount = refund;
            commitment.refundWithdrawn = false;

            totalEscrow += liability;
            totalRefunds += refund;

            emit PriceAdjustmentAllocated(poolId, buyer, refund, liability);
        }

        totalAllocatedRefunds[poolId] = totalRefunds;
        totalFulfillmentEscrow[poolId] = totalEscrow;

        // Conservation invariant check: totalDepositedEscrow == totalAllocatedRefunds + totalFulfillmentEscrow
        assert(totalDepositedEscrow[poolId] == totalRefunds + totalEscrow);
    }

    /**
     * @notice Buyer withdraws their price-adjustment refund after successful clearing
     */
    function withdrawRefund(bytes32 poolId, address buyer) external nonReentrant returns (uint256 amount) {
        BuyerCommitment storage commitment = commitments[poolId][buyer];
        if (commitment.refundAmount == 0) revert NothingToWithdraw();
        if (commitment.refundWithdrawn) revert RefundAlreadyWithdrawn();

        amount = commitment.refundAmount;
        commitment.refundWithdrawn = true;

        address token = poolTokens[poolId];
        IERC20(token).safeTransfer(buyer, amount);

        emit RefundWithdrawn(poolId, buyer, amount);
    }

    /**
     * @notice Releases fulfillment escrow for a specific buyer's completed order to winning supplier
     */
    function releaseBuyerOrderEscrow(
        bytes32 poolId,
        address buyer,
        address recipient
    ) external onlyAuthorized nonReentrant returns (uint256 amount) {
        BuyerCommitment storage commitment = commitments[poolId][buyer];
        if (commitment.finalLiability == 0) revert NothingToWithdraw();
        if (commitment.deliveryAccepted) revert AlreadyDelivered();

        amount = commitment.finalLiability;
        commitment.deliveryAccepted = true;
        commitment.fulfillmentStatus = FulfillmentStatus.DELIVERED;

        totalFulfillmentEscrow[poolId] -= amount;

        address token = poolTokens[poolId];
        IERC20(token).safeTransfer(recipient, amount);

        emit EscrowReleased(poolId, recipient, amount);
    }

    /**
     * @notice Emergency / Dispute refund of fulfillment escrow back to buyer
     */
    function refundBuyerOrderEscrow(
        bytes32 poolId,
        address buyer,
        address recipient
    ) external onlyAuthorized nonReentrant returns (uint256 amount) {
        BuyerCommitment storage commitment = commitments[poolId][buyer];
        if (commitment.finalLiability == 0) revert NothingToWithdraw();

        amount = commitment.finalLiability;
        commitment.finalLiability = 0;
        commitment.fulfillmentStatus = FulfillmentStatus.REFUNDED;

        totalFulfillmentEscrow[poolId] -= amount;

        address token = poolTokens[poolId];
        IERC20(token).safeTransfer(recipient, amount);

        emit EscrowReleased(poolId, recipient, amount);
    }

    // --- View Functions ---
    function getBuyerCommitment(bytes32 poolId, address buyer) external view returns (BuyerCommitment memory) {
        return commitments[poolId][buyer];
    }

    function getPoolBuyers(bytes32 poolId) external view returns (address[] memory) {
        return _poolBuyers[poolId];
    }

    function getBuyerCount(bytes32 poolId) external view returns (uint256) {
        return _poolBuyers[poolId].length;
    }
}

