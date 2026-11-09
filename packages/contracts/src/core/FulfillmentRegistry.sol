// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IHivelotTypes.sol";
import "./DemandVault.sol";
import "./ClearingHouse.sol";
import "./SupplierBondVault.sol";
import "./MerchantRegistry.sol";

/**
 * @title FulfillmentRegistry
 * @notice Governs the commercial delivery lifecycle for cleared orders.
 * Manages dispatch commitments, buyer delivery confirmation, evidence hashing,
 * auto-acceptance timeout mechanics, and supplier performance bond resolution.
 */
contract FulfillmentRegistry is Ownable, ReentrancyGuard, IHivelotTypes {
    DemandVault public immutable demandVault;
    ClearingHouse public immutable clearingHouse;
    SupplierBondVault public immutable bondVault;
    MerchantRegistry public immutable merchantRegistry;

    uint256 public constant CHALLENGE_WINDOW = 7 days; // Disclosed post-dispatch acceptance challenge window

    // poolId => buyer => FulfillmentStatus
    mapping(bytes32 => mapping(address => FulfillmentStatus)) public orderStatus;
    // poolId => buyer => dispatch evidence hash
    mapping(bytes32 => mapping(address => bytes32)) public dispatchEvidence;
    // poolId => buyer => dispatch timestamp
    mapping(bytes32 => mapping(address => uint256)) public dispatchTimestamp;

    event OrderDispatched(
        bytes32 indexed poolId,
        address indexed supplier,
        address indexed buyer,
        bytes32 evidenceHash,
        uint256 timestamp
    );
    event OrderDelivered(
        bytes32 indexed poolId,
        address indexed buyer,
        address indexed supplier,
        uint256 releasedAmount,
        uint256 timestamp
    );
    event OrderAutoAccepted(
        bytes32 indexed poolId,
        address indexed buyer,
        address indexed supplier,
        uint256 releasedAmount,
        uint256 timestamp
    );
    event SupplierDefaulted(
        bytes32 indexed poolId,
        address indexed supplier,
        address indexed buyer,
        uint256 refundedAmount,
        uint256 timestamp
    );

    constructor(
        address _demandVault,
        address _clearingHouse,
        address _bondVault,
        address _merchantRegistry
    ) Ownable(msg.sender) {
        if (
            _demandVault == address(0) ||
            _clearingHouse == address(0) ||
            _bondVault == address(0) ||
            _merchantRegistry == address(0)
        ) revert ZeroAddress();

        demandVault = DemandVault(_demandVault);
        clearingHouse = ClearingHouse(_clearingHouse);
        bondVault = SupplierBondVault(_bondVault);
        merchantRegistry = MerchantRegistry(_merchantRegistry);
    }

    /**
     * @notice Winning supplier submits dispatch record with evidence hash for a buyer order
     */
    function recordDispatch(
        bytes32 poolId,
        address buyer,
        bytes32 evidenceHash
    ) external nonReentrant {
        ClearingOutcome memory outcome = clearingHouse.getClearingOutcome(poolId);
        if (outcome.winningSupplier != msg.sender) revert UnauthorizedCaller();
        if (evidenceHash == bytes32(0)) revert InvalidParameters();

        BuyerCommitment memory comm = demandVault.getBuyerCommitment(poolId, buyer);
        if (comm.quantity == 0) revert CommitmentNotFound();

        FulfillmentStatus current = orderStatus[poolId][buyer];
        if (current != FulfillmentStatus.PENDING) revert InvalidParameters();

        orderStatus[poolId][buyer] = FulfillmentStatus.DISPATCHED;
        dispatchEvidence[poolId][buyer] = evidenceHash;
        dispatchTimestamp[poolId][buyer] = block.timestamp;

        emit OrderDispatched(poolId, msg.sender, buyer, evidenceHash, block.timestamp);
    }

    /**
     * @notice Buyer confirms delivery and acceptance; releases order escrow to winning supplier
     */
    function confirmDelivery(bytes32 poolId) external nonReentrant {
        BuyerCommitment memory comm = demandVault.getBuyerCommitment(poolId, msg.sender);
        if (comm.quantity == 0) revert CommitmentNotFound();
        if (comm.deliveryAccepted) revert AlreadyDelivered();

        ClearingOutcome memory outcome = clearingHouse.getClearingOutcome(poolId);
        address supplier = outcome.winningSupplier;

        orderStatus[poolId][msg.sender] = FulfillmentStatus.DELIVERED;

        // Release order escrow to supplier
        uint256 releasedAmount = demandVault.releaseBuyerOrderEscrow(poolId, msg.sender, supplier);

        // Update merchant reputation
        merchantRegistry.recordFulfillmentOutcome(supplier, true);

        // Check if all pool orders are delivered; if so, release supplier bond
        _checkAndReleaseBond(poolId, supplier);

        emit OrderDelivered(poolId, msg.sender, supplier, releasedAmount, block.timestamp);
    }

    /**
     * @notice Supplier triggers auto-acceptance if buyer fails to confirm or dispute within CHALLENGE_WINDOW
     */
    function claimAutoAcceptance(bytes32 poolId, address buyer) external nonReentrant {
        ClearingOutcome memory outcome = clearingHouse.getClearingOutcome(poolId);
        if (outcome.winningSupplier != msg.sender) revert UnauthorizedCaller();

        FulfillmentStatus current = orderStatus[poolId][buyer];
        if (current != FulfillmentStatus.DISPATCHED) revert InvalidParameters();

        uint256 dispatched = dispatchTimestamp[poolId][buyer];
        if (block.timestamp < dispatched + CHALLENGE_WINDOW) revert DeadlineNotPassed();

        orderStatus[poolId][buyer] = FulfillmentStatus.DELIVERED;

        uint256 releasedAmount = demandVault.releaseBuyerOrderEscrow(poolId, buyer, outcome.winningSupplier);

        merchantRegistry.recordFulfillmentOutcome(outcome.winningSupplier, true);
        _checkAndReleaseBond(poolId, outcome.winningSupplier);

        emit OrderAutoAccepted(poolId, buyer, outcome.winningSupplier, releasedAmount, block.timestamp);
    }

    /**
     * @notice Buyer claims refund if supplier failed to dispatch before fulfillment deadline
     */
    function claimSupplierDefault(bytes32 poolId, PoolTerms calldata terms) external nonReentrant {
        if (block.timestamp <= terms.fulfillmentDeadline) revert DeadlineNotPassed();

        FulfillmentStatus current = orderStatus[poolId][msg.sender];
        if (current != FulfillmentStatus.PENDING) revert InvalidParameters();

        ClearingOutcome memory outcome = clearingHouse.getClearingOutcome(poolId);
        address supplier = outcome.winningSupplier;

        orderStatus[poolId][msg.sender] = FulfillmentStatus.REFUNDED;

        // Refund buyer fulfillment escrow
        uint256 refundedAmount = demandVault.refundBuyerOrderEscrow(poolId, msg.sender, msg.sender);

        // Forfeit supplier bond if still present
        if (bondVault.getBond(poolId, supplier) > 0) {
            bondVault.forfeitBond(poolId, supplier, msg.sender);
        }

        merchantRegistry.recordFulfillmentOutcome(supplier, false);

        emit SupplierDefaulted(poolId, supplier, msg.sender, refundedAmount, block.timestamp);
    }

    function _checkAndReleaseBond(bytes32 poolId, address supplier) internal {
        address[] memory buyers = demandVault.getPoolBuyers(poolId);
        bool allDelivered = true;
        for (uint256 i = 0; i < buyers.length; i++) {
            if (orderStatus[poolId][buyers[i]] != FulfillmentStatus.DELIVERED) {
                allDelivered = false;
                break;
            }
        }

        if (allDelivered && bondVault.getBond(poolId, supplier) > 0) {
            bondVault.releaseBond(poolId, supplier, supplier);
        }
    }

    function getOrderStatus(bytes32 poolId, address buyer) external view returns (FulfillmentStatus) {
        return orderStatus[poolId][buyer];
    }
}

